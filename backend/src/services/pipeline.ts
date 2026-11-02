import prisma from '../lib/db.js';
import { getState, setState } from '../lib/state.js';
import { primaryUserId } from '../lib/user.js';
import { getAIService, type TriageJob } from './ai.js';
import { fetchLinkedInJobPage } from './jobSources/linkedinPage.js';
import { escapeHtml, sendMail } from './mailer.js';

// Auto-tailoring pipeline. Each run, for the primary user's newest CV:
//   1. screen   - score unscreened jobs in batches from title/company/location/salary only
//   2. describe - fetch full descriptions from public LinkedIn pages for jobs that scored well
//   3. tailor   - tailored CV + match score + cover letter for the best jobs, up to a daily limit
//   4. notify   - at most one email a day listing applications that are ready
// Nothing is ever submitted: "ready" jobs wait in the queue for the user to apply.
//
// Job pipelineStatus: null (not screened) -> screened_out | needs_description | queued
//   -> tailoring -> ready | failed;  the user then moves ready jobs to applied | skipped.

const TRIAGE_BATCH_SIZE = 25;
const TRIAGE_PER_RUN = 100;
const FETCHES_PER_RUN = 15;
const FETCH_DELAY_MS = 4000;
const MAX_FETCH_ATTEMPTS = 2;
// Anything shorter is a snippet, not a description worth tailoring against
export const MIN_DESCRIPTION_LENGTH = 300;
const DIGEST_INTERVAL_MS = 20 * 60 * 60 * 1000;

const minScore = () => parseInt(process.env.PIPELINE_MIN_SCORE || '70');
const dailyTailorLimit = () => parseInt(process.env.PIPELINE_DAILY_TAILOR_LIMIT || '10');

export function isPipelineEnabled(): boolean {
  if (process.env.PIPELINE_ENABLED === 'false') return false;
  try {
    getAIService();
    return true;
  } catch {
    return false;
  }
}

async function latestCv(userId: string) {
  return prisma.baseCv.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

function hasDescription(description: string | null): boolean {
  return (description?.length ?? 0) >= MIN_DESCRIPTION_LENGTH;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function screenJobs(userId: string, cvText: string): Promise<number> {
  const jobs = await prisma.savedJob.findMany({
    where: { userId, pipelineStatus: null },
    orderBy: { savedAt: 'desc' },
    take: TRIAGE_PER_RUN
  });

  let screened = 0;
  for (let i = 0; i < jobs.length; i += TRIAGE_BATCH_SIZE) {
    const batch = jobs.slice(i, i + TRIAGE_BATCH_SIZE);
    const listings: TriageJob[] = batch.map(job => ({
      id: job.id,
      title: job.title,
      company: job.company || '',
      location: job.location || '',
      ...(job.salary && { salary: job.salary })
    }));

    const results = await getAIService().triageJobs(cvText, process.env.PIPELINE_PREFERENCES || '', listings);

    for (const job of batch) {
      // Jobs the model skipped stay unscreened and are retried next run
      const result = results.find(r => r.id === job.id);
      if (!result) continue;

      const status = result.score < minScore() ? 'screened_out'
        : hasDescription(job.description) ? 'queued'
        : 'needs_description';

      await prisma.savedJob.update({
        where: { id: job.id },
        data: { triageScore: result.score, triageReason: result.reason, pipelineStatus: status }
      });
      screened++;
    }
  }
  return screened;
}

async function fetchDescriptions(userId: string): Promise<number> {
  const jobs = await prisma.savedJob.findMany({
    where: {
      userId,
      pipelineStatus: 'needs_description',
      source: 'linkedin-email',
      descriptionFetchAttempts: { lt: MAX_FETCH_ATTEMPTS }
    },
    orderBy: { triageScore: 'desc' },
    take: FETCHES_PER_RUN
  });

  let fetched = 0;
  for (const [index, job] of jobs.entries()) {
    if (index > 0) await sleep(FETCH_DELAY_MS);

    const page = job.sourceId ? await fetchLinkedInJobPage(job.sourceId).catch(() => null) : null;
    if (page && hasDescription(page.description)) {
      await prisma.savedJob.update({
        where: { id: job.id },
        data: {
          description: page.description,
          pipelineStatus: 'queued',
          descriptionFetchAttempts: { increment: 1 },
          ...(!job.salary && page.salary && {
            salary: page.salary.text,
            salaryMin: page.salary.min ?? null,
            salaryMax: page.salary.max ?? null
          })
        }
      });
      fetched++;
    } else {
      // After MAX_FETCH_ATTEMPTS the job waits for the user to paste the description
      await prisma.savedJob.update({
        where: { id: job.id },
        data: { descriptionFetchAttempts: { increment: 1 } }
      });
    }
  }
  return fetched;
}

function todayKey(): string {
  return `pipeline.tailored.${new Date().toISOString().slice(0, 10)}`;
}

// Tailors one job. Safe to call while a scheduled run is going: the status update claims the
// job, so two callers can't tailor it twice.
export async function tailorJob(jobId: string): Promise<boolean> {
  const claimed = await prisma.savedJob.updateMany({
    where: { id: jobId, pipelineStatus: { in: ['queued', 'failed'] } },
    data: { pipelineStatus: 'tailoring', pipelineError: null }
  });
  if (claimed.count === 0) return false;

  const job = await prisma.savedJob.findUniqueOrThrow({ where: { id: jobId } });
  try {
    const cv = await latestCv(job.userId);
    if (!cv) throw new Error('Upload a CV first');
    if (!hasDescription(job.description)) throw new Error('Job description is missing');

    const ai = getAIService();
    const cvText = JSON.stringify(JSON.parse(cv.parsedData), null, 2);
    const jobText = `${job.title} at ${job.company || 'the company'}\n\n${job.description}`;

    const [tailoredCv, matchScore, coverLetter] = await Promise.all([
      ai.tailorCV(cvText, jobText),
      ai.calculateMatchScore(cvText, jobText),
      ai.generateCoverLetter(cvText, jobText, job.company || 'the company')
    ]);

    await prisma.cvCustomization.create({
      data: { userId: job.userId, baseCvId: cv.id, jobId: job.id, customizedData: tailoredCv, matchScore, coverLetter }
    });
    await prisma.savedJob.update({ where: { id: job.id }, data: { pipelineStatus: 'ready' } });

    const count = parseInt((await getState(todayKey())) || '0');
    await setState(todayKey(), String(count + 1));
    return true;
  } catch (error) {
    await prisma.savedJob.update({
      where: { id: job.id },
      data: { pipelineStatus: 'failed', pipelineError: (error as Error).message }
    });
    throw error;
  }
}

async function tailorQueued(userId: string): Promise<number> {
  const remaining = dailyTailorLimit() - parseInt((await getState(todayKey())) || '0');
  if (remaining <= 0) return 0;

  const jobs = await prisma.savedJob.findMany({
    where: { userId, pipelineStatus: 'queued' },
    orderBy: { triageScore: 'desc' },
    take: remaining
  });

  let tailored = 0;
  // tailorJob throws on failure, which ends this run: failures are usually a missing key or a
  // usage limit, and would otherwise mark every queued job as failed
  for (const job of jobs) {
    if (await tailorJob(job.id)) tailored++;
  }
  return tailored;
}

async function sendDigest(userId: string): Promise<boolean> {
  const lastSent = await getState('pipeline.lastDigestAt');
  if (lastSent && Date.now() - new Date(lastSent).getTime() < DIGEST_INTERVAL_MS) return false;

  const ready = await prisma.savedJob.findMany({
    where: { userId, pipelineStatus: 'ready' },
    orderBy: { triageScore: 'desc' }
  });
  if (ready.length === 0) return false;

  const recipient = process.env.ALERT_EMAIL_TO || process.env.MAIL_USER;
  if (!recipient) return false;

  const queueUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/queue`;
  const rows = ready.map(job => `
    <li style="margin-bottom: 8px;">
      <strong>${escapeHtml(job.title)}</strong> - ${escapeHtml(job.company || '')}
      ${job.salary ? `<span style="color: green;">${escapeHtml(job.salary)}</span>` : ''}
    </li>`).join('');

  const sent = await sendMail(
    recipient,
    `${ready.length} tailored application${ready.length === 1 ? '' : 's'} ready to review`,
    `<div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2 style="color: #4F46E5;">Ready to apply</h2>
      <ul>${rows}</ul>
      <p><a href="${queueUrl}" style="color: #4F46E5;">Review and apply in JobFlow →</a></p>
    </div>`
  );
  if (sent) await setState('pipeline.lastDigestAt', new Date().toISOString());
  return sent;
}

export interface PipelineResult {
  skipped?: string;
  screened: number;
  descriptionsFetched: number;
  tailored: number;
  digestSent: boolean;
}

export async function runPipeline(): Promise<PipelineResult> {
  const result: PipelineResult = { screened: 0, descriptionsFetched: 0, tailored: 0, digestSent: false };
  const userId = await primaryUserId();

  const cv = await latestCv(userId);
  if (!cv) return { ...result, skipped: 'no CV uploaded' };
  const cvText = JSON.stringify(JSON.parse(cv.parsedData), null, 2);

  result.screened = await screenJobs(userId, cvText);
  result.descriptionsFetched = await fetchDescriptions(userId);
  result.tailored = await tailorQueued(userId);
  result.digestSent = await sendDigest(userId);
  return result;
}

let running: Promise<PipelineResult> | null = null;

export function isPipelineRunning(): boolean {
  return running !== null;
}

// Starts a run, or joins the one already in progress (scheduler and "Run now" share this)
export function triggerPipeline(): Promise<PipelineResult> {
  if (!running) {
    running = runPipeline().finally(() => {
      running = null;
    });
  }
  return running;
}

import prisma from '../lib/db.js';
import { deduplicateJobs, enabledSourceIds, searchSources, type NormalizedJob } from './jobSources/index.js';
import { matchesKeywords, matchesLocation } from './jobSources/util.js';
import { escapeHtml, sendMail } from './mailer.js';

export interface AlertCriteria {
  keywords: string;
  location: string;
  remote: boolean;
}

const EMAIL_SOURCES = ['linkedin-email', 'indeed-email'];
const PLACEHOLDER_EMAIL = 'local@example.com';

// Jobs from the search APIs plus jobs ingested from alert emails, newer than `since`
export async function findMatchingJobs(userId: string, criteria: AlertCriteria, since: Date | null): Promise<NormalizedJob[]> {
  const cutoff = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const { jobs: apiJobs } = await searchSources(enabledSourceIds(), criteria);
  const freshApiJobs = apiJobs.filter(job => !job.postedAt || job.postedAt > cutoff);

  const emailRows = await prisma.savedJob.findMany({
    where: { userId, source: { in: EMAIL_SOURCES }, savedAt: { gt: cutoff } }
  });
  const emailJobs: NormalizedJob[] = emailRows
    .map(row => ({
      source: row.source,
      sourceId: row.sourceId || row.id,
      title: row.title,
      company: row.company || '',
      location: row.location || '',
      description: row.description || '',
      url: row.url || '',
      postedAt: row.postedAt,
      remote: row.remote
    }))
    .filter(job => matchesKeywords(criteria.keywords, job.title) && matchesLocation(criteria, job.location, job.remote));

  return deduplicateJobs([...emailJobs, ...freshApiJobs]);
}

function alertRecipient(userEmail: string): string | null {
  if (userEmail && userEmail !== PLACEHOLDER_EMAIL) return userEmail;
  return process.env.ALERT_EMAIL_TO || process.env.MAIL_USER || null;
}

function renderAlertEmail(alertName: string, jobs: NormalizedJob[]): string {
  const jobList = jobs.slice(0, 20).map(job => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <strong>${escapeHtml(job.title)}</strong><br>
        <span style="color: #666;">${escapeHtml(job.company)}</span>${job.location ? ` • ${escapeHtml(job.location)}` : ''}
        <br><span style="color: #999; font-size: 12px;">via ${escapeHtml(job.source)}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
        ${job.remote ? '<span style="color: green;">Remote</span>' : ''}
        ${job.url ? `<a href="${escapeHtml(job.url)}" style="color: #4F46E5;">View →</a>` : ''}
      </td>
    </tr>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">New Jobs Matching: ${escapeHtml(alertName)}</h2>
      <p style="color: #666;">Found ${jobs.length} matching job${jobs.length !== 1 ? 's' : ''}</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        ${jobList}
      </table>

      <p style="color: #999; font-size: 12px;">
        You received this email because you have a JobFlow alert set up.<br>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/alerts" style="color: #666;">
          Manage your alerts
        </a>
      </p>
    </div>
  `;
}

export async function runDueAlerts() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const alertsToCheck = await prisma.jobAlert.findMany({
    where: {
      active: true,
      OR: [
        { lastSentAt: null },
        { frequency: 'daily', lastSentAt: { lte: oneDayAgo } },
        { frequency: 'weekly', lastSentAt: { lte: oneWeekAgo } }
      ]
    },
    include: { user: true }
  });

  const results = [];

  for (const alert of alertsToCheck) {
    let matched = 0;
    try {
      const criteria: AlertCriteria = JSON.parse(alert.criteria);
      const alertName = alert.name || criteria.keywords;
      const matchingJobs = await findMatchingJobs(alert.userId, criteria, alert.lastSentAt);
      matched = matchingJobs.length;
      const recipient = alertRecipient(alert.user.email);

      let sent = false;
      if (matchingJobs.length > 0) {
        if (!recipient) throw new Error('No recipient: set ALERT_EMAIL_TO or MAIL_USER');
        sent = await sendMail(
          recipient,
          `Job Alert: ${matchingJobs.length} new jobs matching "${alertName}"`,
          renderAlertEmail(alertName, matchingJobs)
        );
        // Leave lastSentAt alone so these jobs are included once email is configured
        if (!sent) throw new Error('Email transport not configured');
      }

      await prisma.jobAlert.update({ where: { id: alert.id }, data: { lastSentAt: now } });
      results.push({ alertId: alert.id, matched, sent });
    } catch (error) {
      console.error(`Failed to process alert ${alert.id}:`, error);
      results.push({ alertId: alert.id, matched, sent: false, error: (error as Error).message });
    }
  }

  return { processed: alertsToCheck.length, results };
}

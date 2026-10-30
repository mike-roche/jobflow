import prisma from '../../lib/db.js';
import type { JobSource, NormalizedJob, SearchQuery } from './types.js';
import { jooble } from './jooble.js';
import { indeed } from './indeed.js';
import { adzuna } from './adzuna.js';
import { remotive } from './remotive.js';
import { remoteok } from './remoteok.js';
import { arbeitnow } from './arbeitnow.js';

export type { JobSource, NormalizedJob, SearchQuery } from './types.js';

export const JOB_SOURCES: JobSource[] = [remotive, remoteok, arbeitnow, adzuna, jooble, indeed];

export const SOURCE_IDS = JOB_SOURCES.map(s => s.id) as [string, ...string[]];

export function enabledSourceIds(): string[] {
  return JOB_SOURCES.filter(s => s.isEnabled()).map(s => s.id);
}

export async function searchSources(
  sourceIds: string[],
  query: SearchQuery
): Promise<{ jobs: NormalizedJob[]; errors: string[] }> {
  const selected = JOB_SOURCES.filter(s => sourceIds.includes(s.id) && s.isEnabled());
  const errors: string[] = [];

  const results = await Promise.all(
    selected.map(source =>
      source.search(query).catch(error => {
        console.error(`${source.name} search error:`, error);
        errors.push(`${source.name} search failed`);
        return [] as NormalizedJob[];
      })
    )
  );

  return { jobs: deduplicateJobs(results.flat()), errors };
}

export function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    const key = `${job.source}:${job.sourceId}`;

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      if (!existing.description && job.description) existing.description = job.description;
      if (!existing.url && job.url) existing.url = job.url;
      if (!existing.postedAt && job.postedAt) existing.postedAt = job.postedAt;
    } else {
      seen.set(key, job);
    }
  }

  // The same posting often appears on several aggregators; keep the most detailed copy
  const titleCompanyMap = new Map<string, NormalizedJob>();
  for (const job of seen.values()) {
    const normalizedTitle = job.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedCompany = (job.company || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = `${normalizedTitle}:${normalizedCompany}`;

    const existing = titleCompanyMap.get(key);
    if (!existing || existing.description.length < job.description.length) {
      titleCompanyMap.set(key, job);
    }
  }

  return Array.from(titleCompanyMap.values());
}

function toJobRecord(job: NormalizedJob) {
  return {
    title: job.title,
    company: job.company || null,
    location: job.location || null,
    remote: job.remote || false,
    description: job.description || null,
    url: job.url || null,
    salaryMin: job.salaryMin || null,
    salaryMax: job.salaryMax || null,
    postedAt: job.postedAt || null
  };
}

export async function upsertJobs(userId: string, jobs: NormalizedJob[]): Promise<void> {
  await Promise.all(
    jobs.map(job =>
      prisma.savedJob.upsert({
        where: { userId_source_sourceId: { userId, source: job.source, sourceId: job.sourceId } },
        update: toJobRecord(job),
        create: { userId, source: job.source, sourceId: job.sourceId, ...toJobRecord(job) }
      }).catch(() => null)
    )
  );
}

// Inserts jobs that aren't stored yet and leaves existing rows untouched; returns how many were new
export async function insertNewJobs(userId: string, jobs: NormalizedJob[]): Promise<number> {
  let created = 0;
  for (const job of jobs) {
    const existing = await prisma.savedJob.findUnique({
      where: { userId_source_sourceId: { userId, source: job.source, sourceId: job.sourceId } }
    });
    if (existing) continue;
    await prisma.savedJob.create({
      data: { userId, source: job.source, sourceId: job.sourceId, ...toJobRecord(job) }
    });
    created++;
  }
  return created;
}

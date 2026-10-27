import type { JobSource } from './types.js';
import { fetchJson, matchesKeywords, matchesLocation, stripHtml } from './util.js';

// Free, no key, no server-side search (returns the latest ~100 jobs, filtered here).
// Terms: link back to the Remote OK URL and credit Remote OK as the source.
export const remoteok: JobSource = {
  id: 'remoteok',
  name: 'Remote OK',
  docs: 'https://remoteok.com/api',
  isEnabled: () => true,

  async search(query) {
    const data = await fetchJson('https://remoteok.com/api');

    return (Array.isArray(data) ? data : [])
      .filter((job: any) => job.id && job.position)
      .filter((job: any) => matchesKeywords(query.keywords, job.position))
      .filter((job: any) => matchesLocation(query, job.location || '', true))
      .map((job: any) => ({
        source: 'remoteok',
        sourceId: String(job.id),
        title: job.position,
        company: (job.company || 'Unknown Company').trim(),
        location: job.location || 'Remote',
        description: stripHtml(job.description),
        salaryMin: job.salary_min || undefined,
        salaryMax: job.salary_max || undefined,
        url: job.url || '',
        postedAt: job.date ? new Date(job.date) : null,
        remote: true
      }));
  }
};

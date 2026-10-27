import type { JobSource } from './types.js';
import { fetchJson, matchesKeywords, matchesLocation, stripHtml } from './util.js';

// Free, no key, no server-side search (latest jobs, mostly Europe/Germany, filtered here)
export const arbeitnow: JobSource = {
  id: 'arbeitnow',
  name: 'Arbeitnow',
  docs: 'https://www.arbeitnow.com/blog/job-board-api',
  isEnabled: () => true,

  async search(query) {
    const data = await fetchJson('https://www.arbeitnow.com/api/job-board-api');

    return (data.data || [])
      .filter((job: any) => matchesKeywords(query.keywords, job.title || ''))
      .filter((job: any) => matchesLocation(query, job.location || '', !!job.remote))
      .map((job: any) => ({
        source: 'arbeitnow',
        sourceId: String(job.slug),
        title: job.title || 'Unknown Title',
        company: job.company_name || 'Unknown Company',
        location: job.location || (job.remote ? 'Remote' : 'Not specified'),
        description: stripHtml(job.description),
        url: job.url || '',
        postedAt: job.created_at ? new Date(job.created_at * 1000) : null,
        remote: !!job.remote
      }));
  }
};

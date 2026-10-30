import type { JobSource } from './types.js';
import { fetchJson, stripHtml } from './util.js';

export const jooble: JobSource = {
  id: 'jooble',
  name: 'Jooble',
  docs: 'https://jooble.org/api/about',
  isEnabled: () => !!process.env.JOOBLE_API_KEY,

  async search({ keywords, location, remote }) {
    const body: Record<string, string> = { keywords, location, page: '1' };
    if (remote) body.remoteFilter = 'true';

    const data = await fetchJson(`https://jooble.org/api/${process.env.JOOBLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    return (data.jobs || []).map((job: any) => ({
      source: 'jooble',
      sourceId: String(job.id || job.link),
      title: job.title || 'Unknown Title',
      company: job.company || 'Unknown Company',
      location: job.location || location || 'Not specified',
      description: stripHtml(job.snippet || job.description),
      salary: job.salary || '',
      url: job.link || job.url || '',
      postedAt: job.updated || job.posted ? new Date(job.updated || job.posted) : null,
      remote: remote || job.remote === true
    }));
  }
};

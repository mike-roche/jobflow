import type { JobSource } from './types.js';
import { fetchJson, matchesKeywords, matchesLocation, stripHtml } from './util.js';

// Free, no key. Terms: link back to the Remotive URL and credit Remotive as the source.
export const remotive: JobSource = {
  id: 'remotive',
  name: 'Remotive',
  docs: 'https://remotive.com/api-documentation',
  isEnabled: () => true,

  async search(query) {
    const params = new URLSearchParams({ search: query.keywords, limit: '50' });
    const data = await fetchJson(`https://remotive.com/api/remote-jobs?${params}`);

    return (data.jobs || [])
      // Remotive's search also matches descriptions, which is too loose
      .filter((job: any) => matchesKeywords(query.keywords, job.title || ''))
      .filter((job: any) => matchesLocation(query, job.candidate_required_location || '', true))
      .map((job: any) => ({
        source: 'remotive',
        sourceId: String(job.id),
        title: job.title || 'Unknown Title',
        company: job.company_name || 'Unknown Company',
        location: job.candidate_required_location || 'Remote',
        description: stripHtml(job.description),
        salary: job.salary || '',
        url: job.url || '',
        postedAt: job.publication_date ? new Date(job.publication_date) : null,
        remote: true
      }));
  }
};

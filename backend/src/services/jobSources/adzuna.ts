import type { JobSource } from './types.js';
import { fetchJson, stripHtml } from './util.js';

export const adzuna: JobSource = {
  id: 'adzuna',
  name: 'Adzuna',
  docs: 'https://developer.adzuna.com',
  isEnabled: () => !!(process.env.ADZUNA_API_KEY && process.env.ADZUNA_APP_ID),

  async search({ keywords, location, remote }) {
    const lowerLocation = location.toLowerCase();
    const country = process.env.ADZUNA_COUNTRY
      || (lowerLocation.includes('uk') || lowerLocation.includes('london') ? 'gb' : 'us');

    const params = new URLSearchParams({
      app_id: process.env.ADZUNA_APP_ID!,
      app_key: process.env.ADZUNA_API_KEY!,
      what: remote ? `${keywords} remote` : keywords,
      results_per_page: '20'
    });
    if (location) params.append('where', location);

    const data = await fetchJson(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`);

    return (data.results || []).map((job: any) => ({
      source: 'adzuna',
      sourceId: String(job.id),
      title: stripHtml(job.title) || 'Unknown Title',
      company: job.company?.display_name || job.company?.name || 'Unknown',
      location: job.location?.display_name || location || 'Not specified',
      description: stripHtml(job.description),
      salaryMin: job.salary_min,
      salaryMax: job.salary_max,
      url: job.redirect_url || '',
      postedAt: job.created ? new Date(job.created) : null,
      remote
    }));
  }
};

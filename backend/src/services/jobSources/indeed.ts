import type { JobSource } from './types.js';
import { fetchJson, stripHtml } from './util.js';

// Unofficial Indeed mirror on RapidAPI; Indeed has no public search API
export const indeed: JobSource = {
  id: 'indeed',
  name: 'Indeed (RapidAPI)',
  docs: 'https://rapidapi.com/search/indeed',
  isEnabled: () => !!process.env.INDEED_API_KEY,

  async search({ keywords, location, remote }) {
    const params = new URLSearchParams({ query: keywords, location, page_size: '20' });
    if (remote) params.append('remote', 'true');

    const data = await fetchJson(`https://indeed44.p.rapidapi.com/jobs?${params}`, {
      headers: {
        'X-RapidAPI-Key': process.env.INDEED_API_KEY!,
        'X-RapidAPI-Host': 'indeed44.p.rapidapi.com'
      }
    });

    return (data.jobs || []).map((job: any) => ({
      source: 'indeed',
      sourceId: String(job.job_id || job.link),
      title: job.title || 'Unknown Title',
      company: job.company_name || 'Unknown Company',
      location: job.location || location || 'Not specified',
      description: stripHtml(job.job_description || job.snippet),
      salaryMin: job.salary?.min ? parseInt(String(job.salary.min).replace(/[^0-9]/g, '')) : undefined,
      salaryMax: job.salary?.max ? parseInt(String(job.salary.max).replace(/[^0-9]/g, '')) : undefined,
      url: job.job_url || job.link || '',
      postedAt: job.posted_date ? new Date(job.posted_date) : null,
      remote: remote || job.remote === true
    }));
  }
};

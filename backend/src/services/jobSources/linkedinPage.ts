import * as cheerio from 'cheerio';
import { parseSalary, type ParsedSalary } from './util.js';

// Reads a job's public LinkedIn page (the one anyone can open without logging in) to get the
// full description that alert emails leave out. Called sparingly by the pipeline: only for
// jobs that already scored well, a few seconds apart, identifying itself honestly.

export interface LinkedInJobPage {
  description: string;
  salary: ParsedSalary | null;
}

function htmlToText($: cheerio.CheerioAPI, html: string): string {
  const doc = cheerio.load(html);
  doc('br').replaceWith('\n');
  doc('li').each((_, li) => {
    doc(li).prepend('• ').append('\n');
  });
  doc('p, h1, h2, h3, h4, ul, ol, div').append('\n');
  return doc.root().text()
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function fetchLinkedInJobPage(jobId: string): Promise<LinkedInJobPage | null> {
  const response = await fetch(`https://www.linkedin.com/jobs/view/${jobId}/`, {
    headers: { 'User-Agent': 'JobFlow/1.0 (personal job tracker)' },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) return null;

  const $ = cheerio.load(await response.text());
  const markup = $('.description__text .show-more-less-html__markup').first().html();
  if (!markup) return null;

  const criteria = $('.description__job-criteria-item')
    .map((_, item) => `${$(item).find('h3').text().trim()}: ${$(item).find('span').text().trim()}`)
    .get()
    .join('\n');

  const compensation = $('.compensation__salary').first().text().trim();

  return {
    description: [htmlToText($, markup), criteria].filter(Boolean).join('\n\n'),
    salary: compensation ? parseSalary(compensation) : null
  };
}

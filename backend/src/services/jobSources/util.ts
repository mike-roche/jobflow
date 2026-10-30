import * as cheerio from 'cheerio';
import type { SearchQuery } from './types.js';

export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return cheerio.load(html).text().replace(/\s+/g, ' ').trim();
}

export async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': 'JobFlow/1.0', ...(init?.headers || {}) },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
}

// For sources without precise server-side search: every keyword must appear in the title
export function matchesKeywords(keywords: string, haystack: string): boolean {
  const words = tokenize(keywords);
  const text = haystack.toLowerCase();
  return words.every(word => text.includes(word));
}

const ANYWHERE = /worldwide|anywhere|global/i;

export function matchesLocation(query: SearchQuery, jobLocation: string, jobRemote: boolean): boolean {
  if (query.remote && !jobRemote) return false;
  if (!query.location.trim()) return true;
  if (!jobLocation || ANYWHERE.test(jobLocation)) return true;
  return jobLocation.toLowerCase().includes(query.location.trim().toLowerCase());
}

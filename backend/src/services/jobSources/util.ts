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

export interface ParsedSalary {
  text: string;
  min?: number;
  max?: number;
}

const HOURS_PER_YEAR = 2080;
const SALARY_PATTERN =
  /([$£€])\s?(\d[\d,.]*)\s?([kK])?(?:\s?(?:-|–|to)\s?[$£€]?\s?(\d[\d,.]*)\s?([kK])?)?(?:\s*(?:\/\s?|an?\s|per\s)(year|yr|annum|hour|hr|month|mo|week|wk)\b)?/;

function amount(digits: string, thousands: string | undefined): number {
  return parseFloat(digits.replace(/,/g, '')) * (thousands ? 1000 : 1);
}

// Finds a pay range like "$181K-$226K / year" or "$55 - $65 an hour"; min/max are annualized
export function parseSalary(text: string): ParsedSalary | null {
  const match = text.match(SALARY_PATTERN);
  if (!match) return null;

  const [whole, , low, lowK, high, highK, period = 'year'] = match;
  if (amount(low, lowK) === 0) return null;
  const multiplier = /^(hour|hr)/.test(period) ? HOURS_PER_YEAR
    : /^(month|mo)/.test(period) ? 12
    : /^(week|wk)/.test(period) ? 52
    : 1;

  // "$120-$150K" means both ends are in thousands
  const min = amount(low, lowK || (!high ? undefined : highK)) * multiplier;
  const max = high ? amount(high, highK) * multiplier : undefined;

  // Implausible yearly figures (e.g. "$220-$350 / year" typos) keep the text but no numbers
  const plausible = min >= 10_000 && min < 5_000_000;
  return {
    text: whole.trim(),
    min: plausible ? Math.round(min) : undefined,
    max: plausible && max ? Math.round(max) : undefined
  };
}

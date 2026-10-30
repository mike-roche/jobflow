import * as cheerio from 'cheerio';
import type { NormalizedJob } from '../jobSources/types.js';

// Job-alert emails are built from nested tables and change layout often, so instead of
// matching exact markup we find every link to a job posting, take the smallest enclosing
// block that mentions only that job (its "card"), and read the text lines inside it.

type Cheerio = ReturnType<cheerio.CheerioAPI>;

const BLOCK_TAGS = new Set([
  'p', 'div', 'td', 'th', 'tr', 'table', 'tbody', 'li', 'ul', 'ol', 'br',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer'
]);
const SKIP_TAGS = new Set(['style', 'script', 'head', 'title']);

const NOISE = [
  /^[·•|\-–—]$/,
  /actively recruiting|easy apply|promoted|early applicant|connections?\b|alumni|\balum\b/i,
  /^(apply|apply now|view job|view|see more|new|just posted|save)$/i,
  /\b(minutes?|hours?|days?|weeks?) ago\b/i,
  /responds? (within|quickly)|urgently hiring|hiring multiple/i
];

function isNoise(text: string): boolean {
  return NOISE.some(pattern => pattern.test(text));
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Text lines of an element: inline tags are joined, block tags start a new line
function textLines($: cheerio.CheerioAPI, root: Cheerio): string[] {
  const lines: string[] = [];
  let buffer = '';
  const flush = () => {
    const line = clean(buffer);
    if (line) lines.push(line);
    buffer = '';
  };

  const walk = (nodes: Cheerio) => {
    nodes.each((_, node) => {
      if (node.type === 'text') {
        buffer += ` ${node.data}`;
      } else if (node.type === 'tag') {
        if (SKIP_TAGS.has(node.name)) return;
        const isBlock = BLOCK_TAGS.has(node.name);
        if (isBlock) flush();
        walk($(node).contents());
        if (isBlock) flush();
      }
    });
  };

  walk(root.contents());
  flush();
  return lines;
}

function jobIdsIn($: cheerio.CheerioAPI, element: Cheerio, idFromHref: (href: string) => string | null): Set<string> {
  const ids = new Set<string>();
  element.find('a[href]').each((_, a) => {
    const id = idFromHref($(a).attr('href') || '');
    if (id) ids.add(id);
  });
  return ids;
}

interface JobCard {
  id: string;
  title: string;
  details: string[];
}

// Outlook "Safe Links" rewrites every link to safelinks.protection.outlook.com/?url=<original>
export function unwrapSafeLink(href: string): string {
  try {
    const url = new URL(href);
    if (url.hostname.endsWith('safelinks.protection.outlook.com')) {
      return url.searchParams.get('url') || href;
    }
  } catch {
    // Not an absolute URL; match it as-is
  }
  return href;
}

function extractJobCards(html: string, matchId: (href: string) => string | null): JobCard[] {
  const idFromHref = (href: string) => matchId(unwrapSafeLink(href));
  const $ = cheerio.load(html);
  const anchorsById = new Map<string, Cheerio[]>();

  $('a[href]').each((_, a) => {
    const id = idFromHref($(a).attr('href') || '');
    if (!id) return;
    if (!anchorsById.has(id)) anchorsById.set(id, []);
    anchorsById.get(id)!.push($(a));
  });

  const cards: JobCard[] = [];

  for (const [id, anchors] of anchorsById) {
    // The first link with meaningful text is the title (the logo link before it has none)
    let title = '';
    let titleAnchor: Cheerio | null = null;
    for (const anchor of anchors) {
      const first = textLines($, anchor).find(line => !isNoise(line));
      if (first) {
        title = first;
        titleAnchor = anchor;
        break;
      }
    }
    if (!titleAnchor) continue;

    let card = titleAnchor;
    let parent = card.parent();
    while (parent.length && parent[0].type === 'tag' && parent[0].name !== 'body') {
      if (jobIdsIn($, parent, idFromHref).size > 1) break;
      card = parent;
      parent = card.parent();
    }

    const lines = textLines($, card);
    const titleIndex = lines.indexOf(title);
    const details = lines.slice(titleIndex + 1).filter(line => !isNoise(line));

    cards.push({ id, title, details });
  }

  return cards;
}

function companyAndLocation(details: string[]): { company: string; location: string } {
  const [first = '', second = ''] = details;
  const separator = first.match(/\s[·•|]\s/);
  if (separator) {
    const [company, ...rest] = first.split(separator[0]);
    return { company: company.trim(), location: rest.join(', ').trim() };
  }
  // A salary line is not a location
  const location = /^[$£€]|\d+\s*(k|\/yr|\/hr|an hour|a year)/i.test(second) ? '' : second;
  return { company: first, location };
}

function toJob(source: string, card: JobCard, url: string, receivedAt: Date | null): NormalizedJob {
  const { company, location } = companyAndLocation(card.details);
  return {
    source,
    sourceId: card.id,
    title: card.title,
    company: company || 'Unknown Company',
    location: location || 'Not specified',
    description: '',
    url,
    postedAt: receivedAt,
    remote: /remote/i.test(location)
  };
}

export function linkedInJobId(href: string): string | null {
  const match = href.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i);
  return match ? match[1] : null;
}

export function parseLinkedInAlert(html: string, receivedAt: Date | null = null): NormalizedJob[] {
  return extractJobCards(html, linkedInJobId).map(card =>
    toJob('linkedin-email', card, `https://www.linkedin.com/jobs/view/${card.id}/`, receivedAt)
  );
}

export function indeedJobKey(href: string): string | null {
  // Indeed wraps links in click-tracking redirects, sometimes URL-encoded more than once
  let decoded = href;
  for (let i = 0; i < 3; i++) {
    const match = decoded.match(/[?&]jk=([0-9a-f]{16})/i);
    if (match) return match[1].toLowerCase();
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return null;
}

export function parseIndeedAlert(html: string, receivedAt: Date | null = null): NormalizedJob[] {
  return extractJobCards(html, indeedJobKey).map(card =>
    toJob('indeed-email', card, `https://www.indeed.com/viewjob?jk=${card.id}`, receivedAt)
  );
}

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import prisma, { DEFAULT_USER_ID } from '../../lib/db.js';
import { getState, setState } from '../../lib/state.js';
import { insertNewJobs, type NormalizedJob } from '../jobSources/index.js';
import { getMicrosoftAccessToken, isMicrosoftConfigured } from './microsoftAuth.js';
import { parseIndeedAlert, parseLinkedInAlert } from './parsers.js';

const LAST_RUN_KEY = 'emailIngest.lastRunAt';

// Read-only: messages are fetched without being marked as read, and nothing is moved or deleted
const PARSERS: { senderDomain: string; parse: (html: string, receivedAt: Date | null) => NormalizedJob[] }[] = [
  { senderDomain: 'linkedin.com', parse: parseLinkedInAlert },
  { senderDomain: 'indeed.com', parse: parseIndeedAlert }
];

export function isEmailIngestConfigured(): boolean {
  return !!process.env.MAIL_USER && (isMicrosoftConfigured() || !!process.env.IMAP_PASSWORD);
}

async function imapAuth(): Promise<{ user: string; accessToken: string } | { user: string; pass: string }> {
  const user = process.env.MAIL_USER!;
  if (process.env.IMAP_PASSWORD) {
    return { user, pass: process.env.IMAP_PASSWORD };
  }
  return { user, accessToken: await getMicrosoftAccessToken() };
}

// Ingested jobs go to JOBFLOW_USER_EMAIL's account, or the built-in local user
async function targetUserId(): Promise<string> {
  const email = process.env.JOBFLOW_USER_EMAIL;
  if (!email) return DEFAULT_USER_ID;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`JOBFLOW_USER_EMAIL=${email} does not match any JobFlow account`);
  }
  return user.id;
}

export interface IngestResult {
  messagesScanned: number;
  jobsFound: number;
  jobsAdded: number;
}

// `full` ignores the last-run cursor and rescans the whole lookback window (e.g. after a parser fix)
export async function runEmailIngest({ full = false }: { full?: boolean } = {}): Promise<IngestResult> {
  if (!isEmailIngestConfigured()) {
    throw new Error('Email ingest is not configured (set MAIL_USER and MAIL_PROVIDER/MS_CLIENT_ID or IMAP_PASSWORD)');
  }

  const startedAt = new Date();
  const lastRun = full ? null : await getState(LAST_RUN_KEY);
  const lookbackDays = parseInt(process.env.EMAIL_INGEST_LOOKBACK_DAYS || '14');
  // IMAP SINCE only has day precision; re-reading a day of overlap is harmless since inserts are idempotent
  const since = lastRun
    ? new Date(new Date(lastRun).getTime() - 24 * 60 * 60 * 1000)
    : new Date(startedAt.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  const folders = (process.env.EMAIL_INGEST_FOLDERS || 'INBOX').split(',').map(f => f.trim()).filter(Boolean);
  const userId = await targetUserId();

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'outlook.office365.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: await imapAuth(),
    logger: false
  });

  const jobs: NormalizedJob[] = [];
  let messagesScanned = 0;

  await client.connect();
  try {
    for (const folder of folders) {
      const lock = await client.getMailboxLock(folder, { readOnly: true });
      try {
        const uids = await client.search(
          { since, or: PARSERS.map(p => ({ from: p.senderDomain })) },
          { uid: true }
        );
        if (!uids || uids.length === 0) continue;

        for await (const message of client.fetch(uids, { source: true, envelope: true }, { uid: true })) {
          if (!message.source) continue;
          messagesScanned++;

          const from = message.envelope?.from?.[0]?.address?.toLowerCase() || '';
          const parser = PARSERS.find(p => from.endsWith(p.senderDomain) || from.endsWith(`.${p.senderDomain}`));
          if (!parser) continue;

          const parsed = await simpleParser(message.source);
          if (!parsed.html) continue;
          jobs.push(...parser.parse(parsed.html, parsed.date || null));
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  const jobsAdded = await insertNewJobs(userId, jobs);
  await setState(LAST_RUN_KEY, startedAt.toISOString());

  return { messagesScanned, jobsFound: jobs.length, jobsAdded };
}

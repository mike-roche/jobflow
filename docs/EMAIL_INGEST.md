# Importing LinkedIn & Indeed jobs from alert emails

LinkedIn has no public job-search API, and Indeed closed theirs. Both will still email you
job alerts, though. JobFlow can read those emails from your mailbox and add each job
(title, company, location, link) to your saved jobs. Your existing job alerts then include them too.

What it does and doesn't do:

- It opens your mailbox **read-only**. Messages aren't marked as read, moved, or deleted.
- It only looks at mail from `linkedin.com` and `indeed.com` senders.
- It doesn't log in to LinkedIn or Indeed, and it doesn't apply to anything.
- Alert emails don't include the full job description, so open the link, or paste the
  description, before tailoring your CV.

## 0. Prerequisites (once)

If you haven't run `./setup.sh`, do these steps from the repo root:

```bash
ln -s ../.env backend/.env   # the backend and the mail scripts read .env from backend/
npm run db:push              # creates the table that stores the Outlook sign-in and ingest progress
```

If you've already set up JobFlow, still run `npm run db:push` once after pulling this change.

## 1. Turn on job alerts

- **LinkedIn:** Jobs → search for a role → **Set alert** → choose email, daily.
- **Indeed:** search for a role → **Get new jobs for this search by email**.

## 2. Enable IMAP in Outlook.com

Outlook.com → Settings → Mail → **Forwarding and IMAP** → turn on **Let devices and apps use POP / IMAP**.

## 3. Register an app with Microsoft (one time, free)

Outlook.com and Hotmail no longer accept passwords from third-party apps. Apps have to sign
in with OAuth, and that requires your own app registration:

1. Go to <https://entra.microsoft.com> (or the Azure portal) and sign in with your Microsoft account.
   If it asks, create a free directory/tenant.
2. **App registrations** → **New registration**
   - Name: `JobFlow`
   - Supported account types: **Personal Microsoft accounts only**
   - Redirect URI: leave empty
3. On the app's **Authentication** page, set **Allow public client flows** to **Yes** and save.
4. Copy the **Application (client) ID** from the Overview page.

## 4. Configure `.env`

```bash
MAIL_PROVIDER=outlook
MAIL_USER=you@hotmail.com
MS_CLIENT_ID=<application client id>
# If a rule files alerts into a folder, list it (comma-separated), e.g. INBOX,Job Alerts
EMAIL_INGEST_FOLDERS=INBOX
```

## 5. Sign in once

```bash
npm run mail:login
```

This prints a code. Enter it at <https://microsoft.com/link>, sign in, and approve access to
**IMAP** (to read alerts) and **SMTP send** (to email you alert digests). The refresh token is
stored in the JobFlow database, and the backend renews it automatically.

## 6. Check it works

```bash
npm run mail:check
# Scanned 12 alert emails, found 87 job links, added 64 new jobs
```

After that, the backend scans every `EMAIL_INGEST_INTERVAL_MINUTES` (default 30) while `npm run dev` is running.
The imported jobs appear under **Saved jobs** with a "LinkedIn alert" or "Indeed alert" badge.

## Other mailboxes

For Gmail, iCloud, Fastmail and similar, skip the Microsoft steps and use an app password instead:

```bash
MAIL_PROVIDER=
MAIL_USER=you@gmail.com
IMAP_HOST=imap.gmail.com
IMAP_PASSWORD=<app password>
```

## Troubleshooting

- **"Not signed in to Outlook" or "token refresh failed":** run `npm run mail:login` again.
- **Jobs found but company/location look wrong:** the email layouts change from time to time.
  Save one alert email as `.eml` and adjust `backend/src/services/emailIngest/parsers.ts`.
- **Nothing found:** check that the alerts land in one of the folders listed in `EMAIL_INGEST_FOLDERS`
  (Junk counts as a separate folder). Also note the first run only looks back `EMAIL_INGEST_LOOKBACK_DAYS` days (default 14).

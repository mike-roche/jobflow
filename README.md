# JobFlow

**Opensource job search and application preparation tool.**

JobFlow helps you discover jobs across multiple aggregators, customize your CV with AI, and track your applications — all with manual apply (no automated submissions to LinkedIn/Indeed/Glassdoor).

## Features

- **CV Upload & Parsing** — Upload PDF/DOCX, AI extracts structured data
- **Job Search** — Remotive, Remote OK, Arbeitnow (no keys needed), plus optional Adzuna, Jooble, Indeed, with smart deduplication
- **LinkedIn & Indeed alert import** — Reads your LinkedIn/Indeed job-alert emails (read-only) and adds the jobs to your list ([setup](docs/EMAIL_INGEST.md))
- **AI Customization** — Tailor CV and generate cover letters for any job
- **4 CV Templates** — Modern, Classic, Creative, Minimal
- **Application Tracker** — Kanban board with drag-and-drop + Analytics dashboard
- **Job Alerts** — Daily/weekly email digests with matching jobs, run by the built-in scheduler
- **Browser Extension** — Auto-fill job application forms on company career pages

## Quick Start

### Setup (one time)
```bash
./setup.sh
```

This installs dependencies, creates `.env` from `.env.example` if you don't have one, links it into `backend/`, and creates the database. It doesn't start the app or install the browser extension. Edit `.env` (at least one AI provider key), then start the app. Re-running it is safe and won't overwrite your `.env`.

### Start (one command)
```bash
npm run dev
```

This starts both backend (port 4000) and frontend (port 3000).

### Manual Setup

**1. Install dependencies:**
```bash
npm install
cd backend && npm install && cd ../frontend && npm install
```

**2. Copy and edit environment:**
```bash
cp .env.example .env
# Edit .env - add at least one AI provider key
```

**3. Setup database:**
```bash
ln -s ../.env backend/.env   # the backend reads .env from backend/
npm run db:push
```

**4. Start services:**
```bash
# Backend + Frontend
npm run dev

# Or individually:
npm run dev:backend  # http://localhost:4000
npm run dev:frontend # http://localhost:3000
```

### Browser Extension

```bash
# Load as unpacked extension in Chrome:
1. Go to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the extension/ folder
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite: `file:./jobflow.db` |
| `JWT_SECRET` | Yes | Secret for JWT tokens |
| `OPENAI_API_KEY` | One required | OpenAI GPT-4 |
| `ANTHROPIC_API_KEY` | One required | Anthropic Claude API key |
| `ANTHROPIC_MODEL` | Optional | Claude model id (defaults to `claude-sonnet-4-5`) |
| `CORS_ORIGINS` | Optional | Comma-separated extra origins (e.g. LAN IP for remote dev) |
| `MINIMAX_API_KEY` | One required | MiniMax |
| `OPENROUTER_API_KEY` | Optional | Fallback aggregator |
| `JOOBLE_API_KEY` | Optional | Jooble job search |
| `INDEED_API_KEY` | Optional | Indeed via RapidAPI (unofficial) |
| `ADZUNA_API_KEY` | Optional | Adzuna job search |
| `ADZUNA_APP_ID` | Optional | Adzuna app ID |
| `MAIL_PROVIDER` | Optional | `outlook` to sign in to Outlook/Hotmail with OAuth |
| `MAIL_USER` | Optional | Mailbox that receives LinkedIn/Indeed job alerts |
| `MS_CLIENT_ID` | Optional | Azure app client ID for Outlook OAuth ([setup](docs/EMAIL_INGEST.md)) |
| `IMAP_HOST` / `IMAP_PASSWORD` | Optional | Non-Outlook mailboxes with an app password |
| `EMAIL_INGEST_FOLDERS` | Optional | Folders to scan (default `INBOX`) |
| `JOBFLOW_USER_EMAIL` | Optional | JobFlow account that receives ingested jobs |
| `SCHEDULER_ENABLED` | Optional | `false` disables the in-process scheduler |
| `CRON_SECRET` | Optional | Enables `POST /api/alerts/check-all` for external cron |
| `ALERT_EMAIL_TO` | Optional | Alert recipient for the built-in local user (defaults to `MAIL_USER`) |
| `SMTP_HOST` | Optional | For job alert emails (not needed with Outlook OAuth) |
| `SMTP_USER` | Optional | SMTP username |
| `SMTP_PASS` | Optional | SMTP password |
| `EMAIL_FROM` | Optional | From address for emails (defaults to `MAIL_USER`) |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Next.js Frontend (Port 3000)              │
│  - Dashboard                               │
│  - CV management                            │
│  - Job search UI                           │
│  - Application tracker                      │
└────────────────┬────────────────────────────┘
                 │ REST API
┌────────────────▼────────────────────────────┐
│  Express Backend (Port 4000)               │
│  - Auth (JWT)                               │
│  - Job aggregation (Remotive, Adzuna, ...) │
│  - Alert-email ingest (IMAP) + scheduler   │
│  - AI services (OpenAI, Anthropic, MiniMax) │
│  - Application tracking                      │
│  - Job alerts (SMTP)                        │
└────────────────┬────────────────────────────┘
                 │
     ┌──────────▼───────────┐
     │  SQLite Database      │
     │  (file-based)          │
     └────────────────────────┘

┌─────────────────────────────────────────────┐
│  Browser Extension                         │
│  - Form detection (content.js)             │
│  - Popup UI (popup/)                       │
│  - Background service worker               │
└─────────────────────────────────────────────┘
```

## Tech Stack

- **Frontend:** Next.js 15, React 19, Tailwind CSS, Zustand
- **Backend:** Express, TypeScript, Prisma ORM
- **Database:** SQLite (opensource), PostgreSQL (hosted)
- **AI:** OpenAI, Anthropic, MiniMax, OpenRouter
- **Job Sources:** Remotive, Remote OK, Arbeitnow, Adzuna, Jooble, Indeed APIs; LinkedIn/Indeed alert emails via IMAP
- **Browser Extension:** Vanilla JS, Manifest V3

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Login
- `GET /api/auth/me` — Get current user

### CV
- `POST /api/cv/upload` — Upload + parse CV (PDF/DOCX)
- `GET /api/cv` — List user's CVs
- `GET /api/cv/:id` — Get specific CV
- `PUT /api/cv/:id` — Update parsed CV data
- `GET /api/cv/fill-data` — Get CV data for browser extension

### Jobs
- `GET /api/jobs/search` — Search jobs (query: keywords, location, remote, sources)
- `POST /api/jobs/save` — Save job to list
- `GET /api/jobs/saved` — Get saved jobs
- `DELETE /api/jobs/saved/:id` — Remove saved job
- `GET /api/jobs/sources` — List search sources and whether each is configured

### AI
- `POST /api/ai/tailor` — Generate customized CV
- `POST /api/ai/cover-letter` — Generate cover letter
- `GET /api/ai/match-score` — Calculate CV-job match percentage

### Applications
- `POST /api/applications` — Create application
- `GET /api/applications` — List applications
- `PATCH /api/applications/:id` — Update status/notes
- `GET /api/applications/stats` — Get application analytics

### Alerts
- `GET /api/alerts` — List job alerts
- `POST /api/alerts` — Create alert
- `PATCH /api/alerts/:id` — Update alert
- `DELETE /api/alerts/:id` — Delete alert
- `POST /api/alerts/:id/test` — Preview matching jobs
- `POST /api/alerts/check-all` — Send due alerts (requires `x-cron-secret` header = `CRON_SECRET`)

### Export
- `POST /api/export/docx` — Generate DOCX (body: cvData, template?)
- `POST /api/export/pdf` — Generate HTML for printing

## Opensource vs Hosted

| Feature | Opensource | Hosted |
|---------|------------|--------|
| Database | SQLite (file) | PostgreSQL (Neon) |
| Storage | Local filesystem | S3/R2 |
| AI Keys | Bring your own | Provided |
| Job APIs | Bring your own | Provided |
| Job Alerts | SMTP setup | Built-in |
| Payments | N/A | Paddle |

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

MIT
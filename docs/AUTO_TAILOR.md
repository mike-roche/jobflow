# Auto-tailoring pipeline

JobFlow can prepare applications for you automatically. It never submits anything; you
review each one and apply yourself.

Every 30 minutes, right after importing alert emails, it:

1. **Screens** new jobs in batches of 25, scoring each 0-100 from its title, company,
   location and salary against your newest CV and `PIPELINE_PREFERENCES`. Jobs below
   `PIPELINE_MIN_SCORE` (default 70) are set aside.
2. **Gets the full description** for jobs that passed. Jobs from search sources already have one.
   For LinkedIn alert jobs, JobFlow reads the public job page (no login, a few seconds apart,
   at most 15 per run). Indeed blocks automated reads, so those wait for you to paste the description.
3. **Tailors** the best-scoring jobs, up to `PIPELINE_DAILY_TAILOR_LIMIT` per day (default 10).
   Each one gets a tailored CV, a match score against the full description, and a cover letter.
4. **Emails you** at most once a day when applications are ready.

Open **Ready to Apply** in the dashboard to download the CV (DOCX), copy the cover letter,
open the job, then click **Applied**, which adds the job to your application tracker, or **Skip**.
**Run now** starts a pass without waiting for the schedule.

## Choosing the AI: subscription or API key

| `AI_PROVIDER` | Uses | Setup |
|---|---|---|
| `claude-code` | Your Claude Pro/Max subscription | Install Claude Code and log in once with `claude`. JobFlow runs `claude -p` for each AI task, counted against your plan's usage limits. |
| `anthropic` | Pay-as-you-go API | Set `ANTHROPIC_API_KEY` from console.anthropic.com. |

Set `AI_FALLBACK_PROVIDER` to use the other one when the main one fails, for example
`AI_PROVIDER=claude-code` with `AI_FALLBACK_PROVIDER=anthropic` keeps working on the API after
you hit your subscription limit.

With `claude-code`, JobFlow runs Claude Code with no tools, no MCP servers, no project or user
settings, and without saving sessions. It also removes `ANTHROPIC_API_KEY` from Claude Code's
environment, because in `claude -p` an API key always takes priority over your subscription login.

## Tuning

- **Too many good jobs screened out?** Lower `PIPELINE_MIN_SCORE` (e.g. 60). Screening only sees
  what the alert shows, so a role that's remote but doesn't say so in its title can score low.
- **Preferences:** `PIPELINE_PREFERENCES="Remote or Florida; $120k+; no contract roles"`.
- **Turn it off:** `PIPELINE_ENABLED=false`.

Rough usage per pass: screening costs one AI call per 25 jobs; each tailored job costs three
(CV, match score, cover letter).

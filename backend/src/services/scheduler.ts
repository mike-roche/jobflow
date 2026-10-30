import { runDueAlerts } from './alerts.js';
import { isEmailIngestConfigured, runEmailIngest } from './emailIngest/index.js';

const MINUTE = 60 * 1000;

// Runs `task` every `intervalMinutes`, skipping a tick if the previous run is still going
function every(name: string, intervalMinutes: number, task: () => Promise<unknown>) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await task();
      console.log(`[scheduler] ${name}:`, JSON.stringify(result));
    } catch (error) {
      console.error(`[scheduler] ${name} failed:`, (error as Error).message);
    } finally {
      running = false;
    }
  };

  setTimeout(tick, 15_000);
  setInterval(tick, intervalMinutes * MINUTE);
}

export function startScheduler() {
  if (process.env.SCHEDULER_ENABLED === 'false') {
    console.log('[scheduler] disabled (SCHEDULER_ENABLED=false)');
    return;
  }

  if (isEmailIngestConfigured()) {
    every('email ingest', parseInt(process.env.EMAIL_INGEST_INTERVAL_MINUTES || '30'), runEmailIngest);
  } else {
    console.log('[scheduler] email ingest not configured; skipping');
  }

  // Each alert has its own daily/weekly cadence; this only controls how often we look for due ones
  every('job alerts', parseInt(process.env.ALERT_CHECK_INTERVAL_MINUTES || '60'), runDueAlerts);
}

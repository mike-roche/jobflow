import 'dotenv/config';
import prisma from '../lib/db.js';
import { runEmailIngest } from '../services/emailIngest/index.js';

// Runs one email ingest pass now instead of waiting for the scheduler
try {
  const result = await runEmailIngest();
  console.log(
    `Scanned ${result.messagesScanned} alert emails, found ${result.jobsFound} job links, added ${result.jobsAdded} new jobs`
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

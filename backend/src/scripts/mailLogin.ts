import 'dotenv/config';
import prisma from '../lib/db.js';
import { deviceCodeLogin } from '../services/emailIngest/microsoftAuth.js';

// Signs in to Outlook/Hotmail once; the backend refreshes the token from then on
try {
  await deviceCodeLogin();
  console.log('Signed in. JobFlow can now read job-alert emails and send alert digests from', process.env.MAIL_USER);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

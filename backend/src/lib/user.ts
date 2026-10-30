import prisma, { DEFAULT_USER_ID } from './db.js';

// The account background jobs (email ingest, pipeline) work for: JOBFLOW_USER_EMAIL's account,
// or the built-in local user
export async function primaryUserId(): Promise<string> {
  const email = process.env.JOBFLOW_USER_EMAIL;
  if (!email) return DEFAULT_USER_ID;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`JOBFLOW_USER_EMAIL=${email} does not match any JobFlow account`);
  }
  return user.id;
}

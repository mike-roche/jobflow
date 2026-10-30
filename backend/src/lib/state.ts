import prisma from './db.js';

export async function getState(key: string): Promise<string | null> {
  const row = await prisma.integrationState.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setState(key: string, value: string): Promise<void> {
  await prisma.integrationState.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });
}

import db from './db';

export async function getConfig(key: string, fallback: string): Promise<string> {
  const row = await db.systemConfig.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function getAllConfig(): Promise<Record<string, string>> {
  const rows = await db.systemConfig.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setConfig(key: string, value: string): Promise<void> {
  await db.systemConfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

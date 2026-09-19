/**
 * 主要画面の疎通確認。
 * ログイン済みセッションを発行し、各画面が 200 を返すか、
 * 画面内に想定した文言が出ているかを確認する。
 */

import { PrismaClient } from '@prisma/client';
import { createToken, SESSION_COOKIE, type Role } from '../src/lib/auth';

const prisma = new PrismaClient();
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';

let failures = 0;

async function check(
  path: string,
  cookie: string | null,
  expect: { status?: number; contains?: string[]; missing?: string[] } = {}
) {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });

  const expectedStatus = expect.status ?? 200;
  const okStatus = response.status === expectedStatus;
  const body = response.status < 400 ? await response.text() : '';

  const missingText = (expect.contains ?? []).filter((t) => !body.includes(t));
  const leakedText = (expect.missing ?? []).filter((t) => body.includes(t));

  const ok = okStatus && missingText.length === 0 && leakedText.length === 0;
  if (!ok) failures++;

  const detail: string[] = [];
  if (!okStatus) detail.push(`status ${response.status} (期待 ${expectedStatus})`);
  if (missingText.length) detail.push(`未検出: ${missingText.join(', ')}`);
  if (leakedText.length) detail.push(`出てはいけない文字列: ${leakedText.join(', ')}`);

  console.log(`  ${ok ? 'OK  ' : 'NG  '} ${path}${detail.length ? ` — ${detail.join(' / ')}` : ''}`);
}

async function main() {
  const users = await prisma.user.findMany();
  const admin = users.find((u) => u.role === 'ADMIN')!;
  const staff = users.find((u) => u.role === 'STAFF')!;

  const cookieFor = (u: typeof admin) =>
    `${SESSION_COOKIE}=${createToken({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      role: u.role as Role,
      doctorId: u.doctorId,
    })}`;

  const adminCookie = cookieFor(admin);
  const staffCookie = cookieFor(staff);

  const samplePatient = await prisma.booking.findFirst({ where: { status: { not: 'CANCELLED' } } });

  console.log('\n[未ログイン]');
  await check('/login', null, { contains: ['院内スタッフ用サインイン'] });
  await check('/', null, { status: 307 });
  await check('/search', null, { status: 307 });
  await check('/schedule', null, { contains: ['手術予定表'] });
  if (samplePatient) {
    await check('/schedule', null, { missing: [samplePatient.patientName, samplePatient.patientId] });
  }

  console.log('\n[管理者でログイン]');
  await check('/', adminCookie, { contains: ['ダッシュボード', '次の手術'] });
  await check('/calendar', adminCookie, { contains: ['手術スケジュール'] });
  await check('/search', adminCookie, { contains: ['空き枠検索', '最短'] });
  await check('/bookings', adminCookie, { contains: ['予約管理'] });
  await check('/admin/doctors', adminCookie, { contains: ['医師管理'] });
  await check('/admin/surgeries', adminCookie, { contains: ['手術管理'] });
  await check('/admin/rooms', adminCookie, { contains: ['手術室管理'] });
  await check('/admin/schedules', adminCookie, { contains: ['定例枠'] });
  await check('/admin/exceptions', adminCookie, { contains: ['例外日'] });
  await check('/admin/settings', adminCookie, { contains: ['設定'] });

  console.log('\n[スタッフでログイン: 管理画面は不可]');
  await check('/', staffCookie, { contains: ['ダッシュボード'] });
  await check('/search', staffCookie, { contains: ['空き枠検索'] });
  await check('/admin/doctors', staffCookie, { status: 307 });

  console.log('\n[改ざんしたセッション]');
  await check('/', `${SESSION_COOKIE}=tampered.value`, { status: 307 });

  console.log(failures === 0 ? '\nすべての疎通確認に成功しました。\n' : `\n${failures} 件失敗しました。\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

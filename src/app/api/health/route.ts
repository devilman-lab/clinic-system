import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { formatDateJa } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * デプロイ直後の状態確認用。認証なしで到達できるため、
 * 接続文字列や鍵の値そのものは返さず、設定の有無と疎通結果だけを返す。
 */
export async function GET() {
  const now = new Date();
  const checks = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    sessionSecret: Boolean(process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET),
    timezone: process.env.TZ ?? '(未設定)',
    // サーバーが「今」をどの日付・時刻として扱っているか。日本時間と一致していれば正常
    serverNow: `${formatDateJa(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    database: 'unknown' as 'ok' | 'unreachable' | 'no-tables' | 'unknown',
    seeded: false,
    detail: null as string | null,
  };

  try {
    const [users, doctors, bookings] = await Promise.all([
      db.user.count(),
      db.doctor.count(),
      db.booking.count(),
    ]);
    checks.database = 'ok';
    checks.seeded = users > 0 && doctors > 0;
    checks.detail = `users=${users} doctors=${doctors} bookings=${bookings}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // P2021 = テーブルが存在しない（db:push 未実行）
    checks.database = message.includes('P2021') || /does not exist/i.test(message) ? 'no-tables' : 'unreachable';
    checks.detail = checks.database === 'no-tables'
      ? 'テーブルがありません。npm run db:push を実行してください。'
      : 'データベースに接続できません。DATABASE_URL を確認してください。';
  }

  const ok = checks.databaseUrl && checks.sessionSecret && checks.database === 'ok' && checks.seeded;

  return NextResponse.json(
    {
      ok,
      ...checks,
      nextSteps: [
        !checks.databaseUrl &&
          'Vercel の環境変数 DATABASE_URL が空です。Settings → Environment Variables で値を確認し、Redeploy する',
        !checks.sessionSecret && 'Vercel の環境変数に SESSION_SECRET を設定して Redeploy する',
        checks.databaseUrl &&
          checks.database === 'unreachable' &&
          'DATABASE_URL の値が正しいか（Neon の接続文字列か）を確認し、Redeploy する',
        checks.database === 'no-tables' && 'ローカルから npm run db:push を実行する',
        checks.database === 'ok' && !checks.seeded && 'ローカルから npm run db:seed を実行する',
      ].filter(Boolean),
    },
    { status: ok ? 200 : 503 }
  );
}

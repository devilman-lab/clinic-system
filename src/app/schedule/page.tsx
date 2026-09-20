import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getCalendarData } from '@/lib/calendar';
import { getAllConfig } from '@/lib/config';
import { dateKey, startOfDay } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * 患者向けの公開予約表。
 *
 * 認証なしで閲覧できるため、ここで扱ってよいのは
 * 「日付・時間帯・手術の種類・空き状況」だけ。
 * 患者名・患者ID・生年月日・院内メモ・担当医の割り当ては一切渡さない。
 */

function parseMonth(value: string | undefined): Date {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default async function PublicSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const [config, session] = await Promise.all([getAllConfig(), getSession()]);

  // 院内スタッフが「患者にどう見えるか」を確認しに来た場合だけ、戻り先を出す
  const staffBar = session && (
    <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
      <span className="text-brand-900">
        <span className="font-semibold">{session.displayName}</span>
        としてログイン中。この画面は患者向けの表示です（患者名・IDは出ません）。
      </span>
      <Link
        href="/"
        className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
      >
        管理画面へ戻る
      </Link>
    </div>
  );

  if (config.public_schedule_enabled === 'false') {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        {staffBar}
        <h1 className="text-lg font-semibold text-slate-900">手術予定表</h1>
        <p className="mt-3 text-sm text-slate-600">
          現在、予定表は公開されていません。お手数ですが受付までお問い合わせください。
        </p>
      </main>
    );
  }

  const params = await searchParams;
  const month = parseMonth(params.month);
  const first = month;
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const data = await getCalendarData(first, last);
  const today = startOfDay(new Date());

  // 患者が見るのはこれからの予定なので、過去日と枠のない日は並べない
  const todayKey = dateKey(today);
  const days = data.days.filter((day) => day.slots.length > 0 && day.dateKey >= todayKey);
  const clinicName = config.clinic_name ?? 'クリニック';

  const prev = monthKey(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  const next = monthKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      {staffBar}
      <header className="mb-6">
        <p className="text-sm text-slate-500">{clinicName}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">手術予定表</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          手術が予定されている日時と、現在ご案内できる空き枠の目安です。
          ご予約・ご変更は受付までお問い合わせください。
        </p>
      </header>

      <nav className="no-print mb-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <Link
          href={`/schedule?month=${prev}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          ← 前の月
        </Link>
        <p className="text-base font-semibold tabular-nums text-slate-900">
          {month.getFullYear()}年{month.getMonth() + 1}月
        </p>
        <Link
          href={`/schedule?month=${next}`}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          次の月 →
        </Link>
      </nav>

      {days.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          この月に公開されている今後の手術予定はありません。
        </p>
      ) : (
        <ol className="space-y-3">
          {days.map((day) => {
            const freeMinutes = day.freeGaps.reduce((sum, gap) => sum + gap.minutes, 0);

            return (
              <li
                key={day.dateKey}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p
                    className={`text-base font-semibold ${
                      day.dayOfWeek === 0
                        ? 'text-red-600'
                        : day.dayOfWeek === 6
                          ? 'text-blue-600'
                          : 'text-slate-900'
                    }`}
                  >
                    {day.dateKey.slice(5).replace('-', '/')}（{day.weekday}）
                  </p>
                  {freeMinutes > 0 ? (
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                      空き枠あり
                    </span>
                  ) : (
                    <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      満枠
                    </span>
                  )}
                </div>

                {day.blocks.length > 0 && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                    {day.blocks.map((b) => b.reason).join(' / ')}
                  </p>
                )}

                {day.bookings.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">この日の手術予定はまだありません。</p>
                ) : (
                  <ul className="mt-2.5 divide-y divide-slate-100">
                    {day.bookings.map((booking) => (
                      <li key={booking.id} className="flex items-baseline gap-4 py-1.5">
                        <span className="w-20 shrink-0 text-sm font-medium tabular-nums text-slate-900">
                          {booking.startTime}〜
                        </span>
                        <span className="text-sm text-slate-700">{booking.surgeryName}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <footer className="mt-8 border-t border-slate-200 pt-5">
        <p className="text-xs leading-relaxed text-slate-500">
          この予定表には患者さまの氏名・ID などの個人情報は一切含まれません。
          内容は変更になる場合があります。最新の予定は受付までご確認ください。
        </p>
        {!session && (
          <Link
            href="/login"
            className="no-print mt-4 inline-block text-xs text-slate-400 underline-offset-4 hover:underline"
          >
            院内スタッフの方はこちら
          </Link>
        )}
      </footer>
    </main>
  );
}

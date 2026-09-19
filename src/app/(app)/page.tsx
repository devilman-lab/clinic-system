import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Badge, Card, CardTitle, EmptyState, StatTile } from '@/components/ui';
import { palette } from '@/lib/colors';
import { getDashboardData } from '@/lib/dashboard';
import { statusOf } from '@/lib/status';
import { formatDateJa } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const now = new Date();
  const data = await getDashboardData(now);

  const focusNoun = data.isToday ? '本日' : data.focusLabel;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">ダッシュボード</h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatDateJa(now)} 現在
            {!data.isToday && (
              <span className="ml-2 text-slate-500">
                — 本日は手術枠がないため、次の手術日（{data.focusLabel}）を表示しています
              </span>
            )}
          </p>
        </div>
        <Link
          href={`/calendar?view=day&date=${data.focusKey}`}
          className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          手術スケジュールを開く →
        </Link>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2.5">
          <Icons.clock className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">
            {data.isToday ? '次の手術' : `次の手術（${data.focusLabel}）`}
          </p>
        </div>

        {data.next ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-5">
            <div>
              <p className="text-4xl font-semibold tabular-nums text-slate-900">
                {data.next.startTime}
              </p>
              <p className="mt-0.5 text-sm text-slate-500">〜 {data.next.endTime}</p>
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900">{data.next.surgeryName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={palette(data.next.doctorColorToken).chip}>
                  {data.next.doctorName}
                </Badge>
                <Badge>{data.next.roomName}</Badge>
                <Badge>
                  患者：{data.next.patientName}（{data.next.patientId}）
                </Badge>
              </div>
            </div>
          </div>
        ) : (
          <div className="px-5 py-6">
            <p className="text-sm text-slate-500">
              {data.isToday
                ? '本日の残りの手術予定はありません。'
                : 'この日の手術予定はまだ入っていません。'}
            </p>
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`${focusNoun}の手術`} value={data.focusCount} unit="件" tone="brand" />
        <StatTile
          label={data.nextDayLabel ? `次の手術日（${data.nextDayLabel}）` : '次の手術日'}
          value={data.nextDayCount}
          unit="件"
        />
        <StatTile
          label={`${focusNoun}の空き枠`}
          value={data.freeSlotCount}
          unit="枠"
          sub={`空き時間 合計 ${data.freeMinutes}分`}
        />
        <StatTile
          label="未確定予約"
          value={data.tentativeCount}
          unit="件"
          tone={data.tentativeCount > 0 ? 'warning' : 'default'}
          sub={data.tentativeCount > 0 ? '確定処理が必要です' : '確定待ちはありません'}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardTitle description={`${focusNoun}開いている手術枠に対する予約の埋まり具合`}>
            手術室の稼働率
          </CardTitle>

          {data.rooms.every((r) => r.openMinutes === 0) ? (
            <EmptyState title="この日は手術枠が設定されていません" />
          ) : (
            <ul className="space-y-4">
              {data.rooms.map((room) => (
                <li key={room.roomId}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{room.roomName}</span>
                    <span className="text-sm tabular-nums text-slate-600">
                      <span className="text-lg font-semibold text-slate-900">{room.rate}</span>%
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${Math.min(room.rate, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    開放 {room.openMinutes}分中 {room.bookedMinutes}分が予約済み
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle
            description="開始時刻順に表示しています"
            action={
              <Link
                href="/bookings"
                className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                予約管理へ
              </Link>
            }
          >
            {focusNoun}の手術予定
          </CardTitle>

          {data.timeline.length === 0 ? (
            <EmptyState
              title="手術予定はありません"
              description="空き枠検索から新しい予約を登録できます。"
            />
          ) : (
            <ol className="thin-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1">
              {data.timeline.map((item) => {
                const status = statusOf(item.status);
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-slate-200 px-3.5 py-2.5"
                  >
                    <span className="w-24 shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                      {item.startTime}〜{item.endTime}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{item.surgeryName}</span>
                    <Badge className={palette(item.doctorColorToken).chip}>{item.doctorName}</Badge>
                    <Badge>{item.roomName}</Badge>
                    {item.status !== 'CONFIRMED' && (
                      <Badge className={status.chip}>{status.label}</Badge>
                    )}
                    <span className="ml-auto text-xs text-slate-500">{item.patientName}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

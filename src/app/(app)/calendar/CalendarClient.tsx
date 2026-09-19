'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BookingDetail, BookingDetailModal } from '@/components/BookingDetailModal';
import { BookingDraft, BookingModal } from '@/components/BookingModal';
import { Badge, Button, Card, EmptyState, cn } from '@/components/ui';
import type { CalendarData, CalendarDay } from '@/lib/calendar';
import { palette } from '@/lib/colors';
import type { Masters } from '@/lib/masters';
import { statusOf } from '@/lib/status';
import { addDays, dateKey, fromDateKey, toMinutes } from '@/lib/time';

type View = 'day' | 'week' | 'month';
type Axis = 'room' | 'doctor';

const VIEW_LABELS: Record<View, string> = { day: '日', week: '週', month: '月' };

interface Resource {
  id: string;
  label: string;
  colorToken?: string;
}

export function CalendarClient({
  data,
  masters,
  view,
  anchor,
}: {
  data: CalendarData;
  masters: Masters;
  view: View;
  anchor: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [axis, setAxis] = useState<Axis>('room');
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [draft, setDraft] = useState<BookingDraft | null>(null);

  const navigate = (next: { view?: View; date?: string }) => {
    const q = new URLSearchParams(params.toString());
    if (next.view) q.set('view', next.view);
    if (next.date) q.set('date', next.date);
    router.push(`/calendar?${q.toString()}`);
  };

  const shift = (direction: 1 | -1) => {
    const base = fromDateKey(anchor);
    if (view === 'day') return navigate({ date: dateKey(addDays(base, direction)) });
    if (view === 'week') return navigate({ date: dateKey(addDays(base, direction * 7)) });
    return navigate({
      date: dateKey(new Date(base.getFullYear(), base.getMonth() + direction, 1)),
    });
  };

  const resources: Resource[] =
    axis === 'room'
      ? masters.rooms.map((r) => ({ id: r.id, label: r.name }))
      : masters.doctors.map((d) => ({ id: d.id, label: d.displayName, colorToken: d.colorToken }));

  const openDetail = (day: CalendarDay, bookingId: string) => {
    const booking = day.bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    setDetail({
      id: booking.id,
      dateKey: day.dateKey,
      startTime: booking.startTime,
      endTime: booking.endTime,
      surgeryId: booking.surgeryId,
      surgeryName: booking.surgeryName,
      doctorId: booking.doctorId,
      operatingRoomId: booking.operatingRoomId,
      patientId: booking.patientId,
      patientName: booking.patientName,
      patientBirth: booking.patientBirth,
      status: booking.status,
      notes: booking.notes,
    });
  };

  const openGap = (
    dayKey: string,
    doctorId: string,
    operatingRoomId: string,
    startTime: string,
    minutes: number
  ) => {
    const doctor = masters.doctors.find((d) => d.id === doctorId);
    // その医師が対応でき、かつ空き時間に収まる手術をあらかじめ選んでおく
    const fitting = masters.surgeries.find(
      (s) => doctor?.surgeryIds.includes(s.id) && s.requiredSlotDuration <= minutes
    );
    setDraft({
      patientId: '',
      patientName: '',
      patientBirth: '',
      surgeryId: fitting?.id ?? '',
      doctorId,
      operatingRoomId,
      dateKey: dayKey,
      startTime,
      notes: '',
    });
  };

  const periodLabel = () => {
    const base = fromDateKey(anchor);
    if (view === 'day') return data.days[0]?.dateKey ?? anchor;
    if (view === 'month') return `${base.getFullYear()}年${base.getMonth() + 1}月`;
    const first = data.days[0];
    const last = data.days[data.days.length - 1];
    return first && last ? `${first.dateKey} 〜 ${last.dateKey}` : anchor;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">手術スケジュール</h1>
        <p className="mt-1 text-sm text-slate-600">
          定例枠・例外枠・予約済み・空き枠を重ねて表示します。空き枠をタップするとその場で予約できます。
        </p>
      </div>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
              <button
                key={v}
                type="button"
                data-touch-target
                onClick={() => navigate({ view: v })}
                className={cn(
                  'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                  view === v ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => shift(-1)} aria-label="前へ">
              ←
            </Button>
            <Button size="sm" onClick={() => navigate({ date: dateKey(new Date()) })}>
              今日
            </Button>
            <Button size="sm" onClick={() => shift(1)} aria-label="次へ">
              →
            </Button>
          </div>

          <p className="text-sm font-semibold tabular-nums text-slate-800">{periodLabel()}</p>

          {view !== 'month' && (
            <div className="ml-auto flex rounded-lg border border-slate-300 p-0.5">
              {(
                [
                  ['room', '手術室別'],
                  ['doctor', '医師別'],
                ] as [Axis, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  data-touch-target
                  onClick={() => setAxis(value)}
                  className={cn(
                    'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                    axis === value ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Legend />

        {view === 'month' ? (
          <MonthGrid data={data} onPickDay={(key) => navigate({ view: 'day', date: key })} />
        ) : (
          <div className="divide-y divide-slate-200">
            {data.days.map((day) => (
              <DayTimeline
                key={day.dateKey}
                day={day}
                resources={resources}
                axis={axis}
                axisStart={data.axisStart}
                axisEnd={data.axisEnd}
                masters={masters}
                compact={view === 'week'}
                onBookingClick={(id) => openDetail(day, id)}
                onGapClick={openGap}
              />
            ))}
          </div>
        )}
      </Card>

      <BookingDetailModal
        booking={detail}
        masters={masters}
        onClose={() => setDetail(null)}
        onEdit={(booking) => {
          setDetail(null);
          setDraft({
            id: booking.id,
            patientId: booking.patientId,
            patientName: booking.patientName,
            patientBirth: booking.patientBirth,
            surgeryId: booking.surgeryId,
            doctorId: booking.doctorId,
            operatingRoomId: booking.operatingRoomId,
            dateKey: booking.dateKey,
            startTime: booking.startTime,
            notes: booking.notes ?? '',
          });
        }}
      />

      <BookingModal
        open={draft !== null}
        onClose={() => setDraft(null)}
        draft={draft}
        masters={masters}
      />
    </div>
  );
}

function Legend() {
  const items = [
    { className: 'border-brand-300 bg-brand-50', label: '定例枠' },
    { className: 'border-amber-400 bg-amber-50', label: '例外・臨時枠' },
    { className: 'border-slate-400 bg-white', label: '予約済み' },
    { className: 'border-dashed border-slate-300 bg-slate-50', label: '空き（タップで予約）' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 bg-slate-50/60 px-4 py-2">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className={cn('h-3 w-5 rounded border', item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function DayTimeline({
  day,
  resources,
  axis,
  axisStart,
  axisEnd,
  masters,
  compact,
  onBookingClick,
  onGapClick,
}: {
  day: CalendarDay;
  resources: Resource[];
  axis: Axis;
  axisStart: number;
  axisEnd: number;
  masters: Masters;
  compact: boolean;
  onBookingClick: (bookingId: string) => void;
  onGapClick: (
    dayKey: string,
    doctorId: string,
    operatingRoomId: string,
    startTime: string,
    minutes: number
  ) => void;
}) {
  const total = axisEnd - axisStart;
  const pct = (minutes: number) => ((minutes - axisStart) / total) * 100;
  const span = (start: number, end: number) => ((end - start) / total) * 100;

  const hours: number[] = [];
  for (let m = axisStart; m <= axisEnd; m += 60) hours.push(m);

  const matches = (resourceId: string, doctorId: string, roomId: string) =>
    axis === 'room' ? roomId === resourceId : doctorId === resourceId;

  const activeResources = resources.filter((r) =>
    day.slots.some((s) => matches(r.id, s.doctorId, s.operatingRoomId))
  );

  const trackHeight = compact ? 'h-14' : 'h-20';

  return (
    <div className="px-4 py-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p
          className={cn(
            'text-sm font-semibold',
            day.isToday ? 'text-brand-700' : 'text-slate-800',
            day.dayOfWeek === 0 && 'text-red-600',
            day.dayOfWeek === 6 && 'text-blue-600'
          )}
        >
          {day.dateKey}（{day.weekday}）
        </p>
        {day.isToday && <Badge className="border-brand-200 bg-brand-100 text-brand-800">本日</Badge>}
        {day.bookings.length > 0 && (
          <span className="text-xs text-slate-500">手術 {day.bookings.length}件</span>
        )}
        {day.blocks.map((block, i) => (
          <Badge key={i} className="border-red-200 bg-red-50 text-red-700">
            {block.reason}
            {block.startTime && `（${block.startTime}〜${block.endTime}）`}
          </Badge>
        ))}
      </div>

      {activeResources.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
          この日は手術枠が設定されていません。
        </p>
      ) : (
        <div className="thin-scrollbar overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="flex">
              <div className="sticky left-0 z-10 w-24 shrink-0 bg-white" />
              <div className="relative h-5 flex-1">
                {hours.map((m, i) => (
                  <span
                    key={m}
                    className={cn(
                      'absolute text-[11px] tabular-nums text-slate-400',
                      i === 0 && 'translate-x-0',
                      i === hours.length - 1 && '-translate-x-full',
                      i > 0 && i < hours.length - 1 && '-translate-x-1/2'
                    )}
                    style={{ left: `${pct(m)}%` }}
                  >
                    {String(Math.floor(m / 60)).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
            </div>

            {activeResources.map((resource) => {
              const slots = day.slots.filter((s) =>
                matches(resource.id, s.doctorId, s.operatingRoomId)
              );
              const bookings = day.bookings.filter((b) =>
                matches(resource.id, b.doctorId, b.operatingRoomId)
              );
              const gaps = day.freeGaps.filter((g) =>
                matches(resource.id, g.doctorId, g.operatingRoomId)
              );

              return (
                <div key={resource.id} className="flex items-stretch border-t border-slate-100">
                  <div className="sticky left-0 z-10 flex w-24 shrink-0 items-center gap-1.5 bg-white pr-2 text-xs font-medium text-slate-700">
                    {resource.colorToken && (
                      <span className={cn('h-2 w-2 rounded-full', palette(resource.colorToken).dot)} />
                    )}
                    <span className="truncate">{resource.label}</span>
                  </div>

                  <div className={cn('relative flex-1 py-1.5', trackHeight)}>
                    {hours.map((m) => (
                      <span
                        key={m}
                        className="absolute inset-y-0 w-px bg-slate-100"
                        style={{ left: `${pct(m)}%` }}
                      />
                    ))}

                    {slots.map((slot, i) => (
                      <div
                        key={`slot-${i}`}
                        title={slot.label ?? undefined}
                        className={cn(
                          'absolute inset-y-1 rounded border',
                          slot.sourceType === 'EXCEPTION'
                            ? 'border-amber-400 bg-amber-50'
                            : 'border-brand-200 bg-brand-50/70'
                        )}
                        style={{
                          left: `${pct(toMinutes(slot.startTime))}%`,
                          width: `${span(toMinutes(slot.startTime), toMinutes(slot.endTime))}%`,
                        }}
                      >
                        {!compact && (
                          <span className="block truncate px-1.5 pt-0.5 text-[10px] text-slate-500">
                            {slot.label ??
                              (axis === 'room'
                                ? masters.doctors.find((d) => d.id === slot.doctorId)?.displayName
                                : masters.rooms.find((r) => r.id === slot.operatingRoomId)?.name)}
                          </span>
                        )}
                      </div>
                    ))}

                    {gaps.map((gap, i) => (
                      <button
                        key={`gap-${i}`}
                        type="button"
                        onClick={() =>
                          onGapClick(
                            day.dateKey,
                            gap.doctorId,
                            gap.operatingRoomId,
                            gap.startTime,
                            gap.minutes
                          )
                        }
                        title={`${gap.startTime}〜${gap.endTime}（${gap.minutes}分の空き）`}
                        className="absolute inset-y-2 rounded border border-dashed border-slate-300 bg-slate-50/80 text-[10px] text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                        style={{
                          left: `${pct(toMinutes(gap.startTime))}%`,
                          width: `${span(toMinutes(gap.startTime), toMinutes(gap.endTime))}%`,
                        }}
                      >
                        + {gap.minutes}分
                      </button>
                    ))}

                    {bookings.map((booking) => {
                      const doctor = masters.doctors.find((d) => d.id === booking.doctorId);
                      const tone = palette(doctor?.colorToken);
                      const status = statusOf(booking.status);
                      return (
                        <button
                          key={booking.id}
                          type="button"
                          onClick={() => onBookingClick(booking.id)}
                          title={`${booking.startTime}〜${booking.endTime} ${booking.surgeryName} / ${doctor?.displayName ?? ''} / ${booking.patientName}`}
                          className={cn(
                            'absolute inset-y-1.5 overflow-hidden rounded-md border-l-4 border-y border-r px-1.5 text-left shadow-sm transition-shadow hover:shadow-md',
                            tone.card,
                            booking.status === 'TENTATIVE' && 'border-dashed',
                            booking.status === 'COMPLETED' && 'opacity-60'
                          )}
                          style={{
                            left: `${pct(toMinutes(booking.startTime))}%`,
                            width: `${span(toMinutes(booking.startTime), toMinutes(booking.endTime))}%`,
                          }}
                        >
                          <span className="block truncate text-[11px] font-semibold leading-tight text-slate-900">
                            {compact && `${booking.startTime} `}
                            {booking.surgeryName}
                          </span>
                          <span className="block truncate text-[10px] leading-tight text-slate-600">
                            {compact
                              ? axis === 'room'
                                ? doctor?.displayName
                                : masters.rooms.find((r) => r.id === booking.operatingRoomId)?.name
                              : `${booking.startTime}〜${booking.endTime}`}
                          </span>
                          {!compact && (
                            <>
                              <span className="block truncate text-[10px] leading-tight text-slate-600">
                                {axis === 'room'
                                  ? doctor?.displayName
                                  : masters.rooms.find((r) => r.id === booking.operatingRoomId)?.name}
                                ／{booking.patientName}
                              </span>
                              <span
                                className={cn(
                                  'mt-0.5 inline-block rounded border px-1 text-[9px]',
                                  status.chip
                                )}
                              >
                                {status.label}
                              </span>
                            </>
                          )}
                          {compact && booking.status !== 'CONFIRMED' && (
                            <span
                              className={cn(
                                'absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full',
                                booking.status === 'TENTATIVE' ? 'bg-amber-500' : 'bg-slate-400'
                              )}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  data,
  onPickDay,
}: {
  data: CalendarData;
  onPickDay: (dateKey: string) => void;
}) {
  if (data.days.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title="表示する期間がありません" />
      </div>
    );
  }

  const leading = data.days[0].dayOfWeek;
  const cells: (CalendarDay | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...data.days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-px rounded-lg bg-slate-200">
        {['日', '月', '火', '水', '木', '金', '土'].map((label, i) => (
          <div
            key={label}
            className={cn(
              'bg-slate-50 py-1.5 text-center text-xs font-semibold',
              i === 0 && 'text-red-600',
              i === 6 && 'text-blue-600',
              i > 0 && i < 6 && 'text-slate-600'
            )}
          >
            {label}
          </div>
        ))}

        {cells.map((day, i) =>
          day === null ? (
            <div key={`empty-${i}`} className="min-h-24 bg-slate-50/50" />
          ) : (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => onPickDay(day.dateKey)}
              className={cn(
                'min-h-24 bg-white p-1.5 text-left align-top transition-colors hover:bg-brand-50',
                day.isToday && 'ring-2 ring-inset ring-brand-500'
              )}
            >
              <span
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  day.dayOfWeek === 0 && 'text-red-600',
                  day.dayOfWeek === 6 && 'text-blue-600',
                  day.dayOfWeek > 0 && day.dayOfWeek < 6 && 'text-slate-700'
                )}
              >
                {day.dayNumber}
              </span>

              {day.slots.length === 0 ? (
                <span className="mt-1 block text-[10px] text-slate-300">枠なし</span>
              ) : (
                <>
                  <span className="mt-1 block text-[10px] text-slate-600">
                    手術 {day.bookings.length}件
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    空き {day.freeGaps.reduce((sum, g) => sum + g.minutes, 0)}分
                  </span>
                  {day.slots.some((s) => s.sourceType === 'EXCEPTION') && (
                    <span className="mt-1 inline-block rounded border border-amber-300 bg-amber-50 px-1 text-[9px] text-amber-800">
                      例外枠
                    </span>
                  )}
                  {day.blocks.length > 0 && (
                    <span className="mt-1 inline-block rounded border border-red-200 bg-red-50 px-1 text-[9px] text-red-700">
                      休診あり
                    </span>
                  )}
                </>
              )}
            </button>
          )
        )}
      </div>
    </div>
  );
}

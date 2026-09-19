'use client';

import { useMemo, useState, useTransition } from 'react';
import { searchSlotsAction } from '@/app/actions/bookings';
import { BookingDraft, BookingModal } from '@/components/BookingModal';
import { Icons } from '@/components/icons';
import { Alert, Badge, Button, Card, EmptyState, Field, Select, cn } from '@/components/ui';
import type { AvailableSlot, SearchResult } from '@/lib/availability/engine';
import { palette } from '@/lib/colors';
import type { Masters } from '@/lib/masters';
import { addDays, dateKey } from '@/lib/time';

const RANGE_PRESETS = [
  { label: '2週間', days: 14 },
  { label: '1か月', days: 30 },
  { label: '3か月', days: 90 },
];

/** 同じ連続枠から 30 分ずつずらしただけの候補は、代表 1 件にまとめて見せる。 */
function blockKey(slot: AvailableSlot): string {
  return `${slot.dateKey}|${slot.doctorId}|${slot.operatingRoomId}|${slot.sourceRange.startTime}`;
}

export function SearchClient({ masters }: { masters: Masters }) {
  const today = dateKey(new Date());

  const [surgeryId, setSurgeryId] = useState(masters.surgeries[0]?.id ?? '');
  const [doctorIds, setDoctorIds] = useState<string[]>([]);
  const [roomId, setRoomId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(dateKey(addDays(new Date(), 14)));
  const [showAllStarts, setShowAllStarts] = useState(false);

  const [result, setResult] = useState<SearchResult | null>(null);
  const [formError, setFormError] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<BookingDraft | null>(null);

  const surgery = masters.surgeries.find((s) => s.id === surgeryId);
  const capableDoctorIds = new Set(surgery?.doctorIds ?? []);

  const search = () => {
    setFormError([]);
    startTransition(async () => {
      const response = await searchSlotsAction({
        surgeryId,
        doctorIds: doctorIds.length > 0 ? doctorIds : undefined,
        operatingRoomIds: roomId ? [roomId] : undefined,
        startDate,
        endDate,
        limit: 200,
      });

      if (!response.ok || !response.data) {
        setFormError(response.errors);
        setResult(null);
        return;
      }
      setResult(response.data);
    });
  };

  const toggleDoctor = (id: string) => {
    setDoctorIds((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));
  };

  const visibleSlots = useMemo(() => {
    if (!result) return [];
    if (showAllStarts) return result.slots;
    const seen = new Set<string>();
    return result.slots.filter((slot) => {
      const key = blockKey(slot);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [result, showAllStarts]);

  const best = visibleSlots[0];
  const others = visibleSlots.slice(1);

  const openBooking = (slot: AvailableSlot) => {
    setDraft({
      patientId: '',
      patientName: '',
      patientBirth: '',
      surgeryId: slot.surgeryId,
      doctorId: slot.doctorId,
      operatingRoomId: slot.operatingRoomId,
      dateKey: slot.dateKey,
      startTime: slot.startTime,
      notes: '',
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">空き枠検索</h1>
        <p className="mt-1 text-sm text-slate-600">
          手術を選ぶだけで、対応できる医師・定例枠・手術室・既存予約を横断して、予約できる日時を探します。
        </p>
      </div>

      <Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="手術" required hint={surgery && `執刀 ${surgery.standardDuration}分 ／ 確保する枠 ${surgery.requiredSlotDuration}分`}>
            <Select
              data-testid="surgery-select"
              value={surgeryId}
              onChange={(e) => setSurgeryId(e.target.value)}
            >
              {masters.surgeries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}（{s.standardDuration}分 / 枠{s.requiredSlotDuration}分）
                </option>
              ))}
            </Select>
          </Field>

          <Field label="手術室">
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">指定なし（すべての手術室）</option>
              {masters.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-slate-700">希望医師</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-touch-target
              onClick={() => setDoctorIds([])}
              className={cn(
                'rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                doctorIds.length === 0
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              )}
            >
              指定なし
            </button>

            {masters.doctors.map((doctor) => {
              const capable = capableDoctorIds.has(doctor.id);
              const selected = doctorIds.includes(doctor.id);
              return (
                <button
                  key={doctor.id}
                  type="button"
                  data-touch-target
                  disabled={!capable}
                  onClick={() => toggleDoctor(doctor.id)}
                  title={capable ? undefined : `${doctor.displayName}はこの手術に対応していません`}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                    !capable && 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
                    capable && selected && 'border-brand-600 bg-brand-600 text-white',
                    capable && !selected && 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      selected ? 'bg-white' : palette(doctor.colorToken).dot,
                      !capable && 'bg-slate-300'
                    )}
                  />
                  {doctor.displayName}
                  {!capable && <span className="text-[11px]">対応不可</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            複数選べます。指定なしの場合はこの手術に対応できる医師（
            {surgery ? masters.doctors.filter((d) => capableDoctorIds.has(d.id)).map((d) => d.displayName).join('、') : '—'}
            ）を横断して探します。
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr]">
          <Field label="開始日">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30"
            />
          </Field>
          <Field label="終了日">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline-2 focus:outline-brand-500/30"
            />
          </Field>
          <div className="flex items-end gap-2">
            {RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                size="sm"
                onClick={() => {
                  setStartDate(today);
                  setEndDate(dateKey(addDays(new Date(), preset.days)));
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <Button variant="primary" size="lg" onClick={search} disabled={pending || !surgeryId}>
            <Icons.search className="h-5 w-5" />
            {pending ? '検索中…' : '空き枠を検索'}
          </Button>
          {result && (
            <p className="text-sm text-slate-600">
              {result.totalFound.toLocaleString()} 件の候補が見つかりました
              {!showAllStarts && result.totalFound > visibleSlots.length && (
                <span className="text-slate-500">（連続枠ごとに代表 {visibleSlots.length} 件を表示）</span>
              )}
            </p>
          )}
        </div>
      </Card>

      {formError.length > 0 && (
        <Alert tone="error" title="検索できませんでした">
          <ul className="mt-1 list-disc pl-4">
            {formError.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      {result && result.slots.length === 0 && (
        <Card>
          <EmptyState
            title="条件を満たす空き枠が見つかりませんでした"
            description={
              <div className="space-y-3 text-left">
                <Alert tone="warning">{result.diagnostics.message}</Alert>
                <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="inline font-semibold text-slate-600">対応可能な医師：</dt>
                    <dd className="inline text-slate-600">
                      {result.diagnostics.capableDoctorNames.join('、') || 'なし'}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-slate-600">必要な枠：</dt>
                    <dd className="inline text-slate-600">{result.diagnostics.requiredMinutes}分</dd>
                  </div>
                  {result.diagnostics.longestFreeMinutes > 0 && (
                    <div>
                      <dt className="inline font-semibold text-slate-600">期間内の最長の空き：</dt>
                      <dd className="inline text-slate-600">{result.diagnostics.longestFreeMinutes}分</dd>
                    </div>
                  )}
                </dl>
              </div>
            }
          />
        </Card>
      )}

      {best && (
        <section
          data-testid="best-slot"
          data-slot-key={`${best.dateKey}|${best.startTime}|${best.doctorId}|${best.operatingRoomId}`}
          className="overflow-hidden rounded-2xl border-2 border-brand-500 bg-white shadow-md"
        >
            <div className="flex items-center gap-2 bg-brand-600 px-5 py-2.5 text-white">
              <Icons.bolt className="h-4 w-4" />
              <p className="text-sm font-semibold tracking-wide">最短予約可能枠</p>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="text-sm font-medium text-slate-500">{best.dateLabel}</p>
                <p className="mt-0.5 text-3xl font-semibold tabular-nums text-slate-900">
                  {best.startTime} <span className="text-xl text-slate-400">〜</span> {best.endTime}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Badge className={palette(best.doctorColorToken).chip}>{best.doctorName}</Badge>
                  <Badge>{best.operatingRoomName}</Badge>
                  <Badge>
                    {best.surgeryName}／枠 {best.slotDuration}分
                  </Badge>
                  {best.sourceType === 'EXCEPTION' && (
                    <Badge className="border-amber-300 bg-amber-100 text-amber-900">例外枠</Badge>
                  )}
                </div>
              </div>

              <ul className="space-y-1.5">
                {best.checks.map((check) => (
                  <li key={check} className="flex items-start gap-2 text-sm text-slate-700">
                    <Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    {check}
                  </li>
                ))}
              </ul>

              <Button variant="primary" size="lg" onClick={() => openBooking(best)}>
                この枠を予約
              </Button>
            </div>
        </section>
      )}

      {others.length > 0 && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">その他の候補</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showAllStarts}
                onChange={(e) => setShowAllStarts(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              同じ枠内の他の開始時刻も表示する
            </label>
          </div>

          <ol className="space-y-2">
            {others.map((slot, index) => (
              <li
                key={`${slot.dateKey}-${slot.startTime}-${slot.doctorId}-${slot.operatingRoomId}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <span className="w-8 shrink-0 text-sm font-semibold text-slate-400">
                  {index + 2}位
                </span>
                <div className="min-w-[9rem]">
                  <p className="text-sm font-medium text-slate-900">{slot.dateLabel}</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900">
                    {slot.startTime}〜{slot.endTime}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={palette(slot.doctorColorToken).chip}>{slot.doctorName}</Badge>
                  <Badge>{slot.operatingRoomName}</Badge>
                  {slot.sourceType === 'EXCEPTION' && (
                    <Badge className="border-amber-300 bg-amber-100 text-amber-900">例外枠</Badge>
                  )}
                  <span className="text-xs text-slate-500">
                    枠 {slot.sourceRange.startTime}〜{slot.sourceRange.endTime}
                  </span>
                </div>
                <Button className="ml-auto" size="sm" onClick={() => openBooking(slot)}>
                  この枠を予約
                </Button>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <BookingModal
        open={draft !== null}
        onClose={() => setDraft(null)}
        draft={draft}
        masters={masters}
        onSaved={search}
      />
    </div>
  );
}

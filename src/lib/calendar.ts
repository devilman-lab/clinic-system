import { loadSnapshot, resolveSlotsForDate } from './availability';
import db from './db';
import {
  addDays,
  dateKey,
  eachDay,
  startOfDay,
  subtractRanges,
  toMinutes,
  toTimeString,
  weekdayLabel,
} from './time';

export interface CalendarSlot {
  doctorId: string;
  operatingRoomId: string;
  startTime: string;
  endTime: string;
  sourceType: 'REGULAR' | 'EXCEPTION';
  label: string | null;
}

export interface CalendarBooking {
  id: string;
  doctorId: string;
  operatingRoomId: string;
  surgeryId: string;
  startTime: string;
  endTime: string;
  patientId: string;
  patientName: string;
  patientBirth: string;
  surgeryName: string;
  status: string;
  notes: string | null;
}

export interface CalendarFreeGap {
  doctorId: string;
  operatingRoomId: string;
  startTime: string;
  endTime: string;
  minutes: number;
}

export interface CalendarDay {
  dateKey: string;
  weekday: string;
  dayOfWeek: number;
  dayNumber: number;
  isToday: boolean;
  slots: CalendarSlot[];
  bookings: CalendarBooking[];
  freeGaps: CalendarFreeGap[];
  blocks: { startTime: string | null; endTime: string | null; reason: string }[];
}

export interface CalendarData {
  days: CalendarDay[];
  /** 週内に実際に枠がある時間帯。時間軸の描画範囲に使う。 */
  axisStart: number;
  axisEnd: number;
}

const DEFAULT_AXIS_START = 9 * 60;
const DEFAULT_AXIS_END = 18 * 60;

export async function getCalendarData(from: Date, to: Date): Promise<CalendarData> {
  const snapshot = await loadSnapshot(from, to);
  const todayKey = dateKey(new Date());

  const bookings = await db.booking.findMany({
    where: {
      date: { gte: startOfDay(from), lt: addDays(startOfDay(to), 1) },
      status: { not: 'CANCELLED' },
    },
    include: { surgery: true },
    orderBy: { startTime: 'asc' },
  });

  const bookingsByDate = new Map<string, CalendarBooking[]>();
  for (const b of bookings) {
    const key = dateKey(b.date);
    const list = bookingsByDate.get(key) ?? [];
    list.push({
      id: b.id,
      doctorId: b.doctorId,
      operatingRoomId: b.operatingRoomId,
      surgeryId: b.surgeryId,
      startTime: b.startTime,
      endTime: b.endTime,
      patientId: b.patientId,
      patientName: b.patientName,
      patientBirth: dateKey(b.patientBirth),
      surgeryName: b.surgery.displayName,
      status: b.status,
      notes: b.notes,
    });
    bookingsByDate.set(key, list);
  }

  let axisStart = Number.POSITIVE_INFINITY;
  let axisEnd = Number.NEGATIVE_INFINITY;

  const days: CalendarDay[] = eachDay(from, to).map((date) => {
    const key = dateKey(date);
    const effective = resolveSlotsForDate(snapshot, date);
    const dayBookings = bookingsByDate.get(key) ?? [];

    const slots: CalendarSlot[] = effective.map((s) => ({
      doctorId: s.doctorId,
      operatingRoomId: s.operatingRoomId,
      startTime: toTimeString(s.range.start),
      endTime: toTimeString(s.range.end),
      sourceType: s.sourceType,
      label: s.label,
    }));

    for (const slot of slots) {
      axisStart = Math.min(axisStart, toMinutes(slot.startTime));
      axisEnd = Math.max(axisEnd, toMinutes(slot.endTime));
    }

    const freeGaps: CalendarFreeGap[] = [];
    for (const slot of effective) {
      const blockers = dayBookings
        .filter((b) => b.doctorId === slot.doctorId || b.operatingRoomId === slot.operatingRoomId)
        .map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));

      for (const gap of subtractRanges(slot.range, blockers)) {
        const minutes = gap.end - gap.start;
        if (minutes < 30) continue;
        freeGaps.push({
          doctorId: slot.doctorId,
          operatingRoomId: slot.operatingRoomId,
          startTime: toTimeString(gap.start),
          endTime: toTimeString(gap.end),
          minutes,
        });
      }
    }

    return {
      dateKey: key,
      weekday: weekdayLabel(date),
      dayOfWeek: date.getDay(),
      dayNumber: date.getDate(),
      isToday: key === todayKey,
      slots,
      bookings: dayBookings,
      freeGaps,
      blocks: snapshot.exceptions
        .filter((e) => e.dateKey === key && e.type === 'BLOCK')
        .map((e) => ({ startTime: e.startTime, endTime: e.endTime, reason: e.reason })),
    };
  });

  if (!Number.isFinite(axisStart) || !Number.isFinite(axisEnd)) {
    axisStart = DEFAULT_AXIS_START;
    axisEnd = DEFAULT_AXIS_END;
  }

  // 時間軸は 1 時間単位に丸めて目盛りを読みやすくする
  return {
    days,
    axisStart: Math.floor(axisStart / 60) * 60,
    axisEnd: Math.ceil(axisEnd / 60) * 60,
  };
}

/**
 * 手術枠のない日（土日など）に開いたとき、次に枠がある日を初期表示にするための解決。
 * 日付が明示されていない場合にだけ使う。
 */
export async function resolveDefaultAnchor(from: Date, lookaheadDays = 21): Promise<Date> {
  const start = startOfDay(from);
  const snapshot = await loadSnapshot(start, addDays(start, lookaheadDays));

  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const date = addDays(start, offset);
    if (resolveSlotsForDate(snapshot, date).length > 0) return date;
  }
  return start;
}

export function rangeForView(view: 'day' | 'week' | 'month', anchor: Date): { from: Date; to: Date } {
  const base = startOfDay(anchor);

  if (view === 'day') return { from: base, to: base };

  if (view === 'week') {
    const from = addDays(base, -base.getDay());
    return { from, to: addDays(from, 6) };
  }

  const from = new Date(base.getFullYear(), base.getMonth(), 1);
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { from, to };
}

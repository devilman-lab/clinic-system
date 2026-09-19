import { loadSnapshot, resolveSlotsForDate } from './availability';
import { SLOT_GRANULARITY_MINUTES } from './availability/engine';
import db from './db';
import { addDays, dateKey, formatDateJa, startOfDay, subtractRanges, toMinutes } from './time';

export interface RoomUtilization {
  roomId: string;
  roomName: string;
  openMinutes: number;
  bookedMinutes: number;
  rate: number;
}

export interface TimelineEntry {
  id: string;
  startTime: string;
  endTime: string;
  surgeryName: string;
  doctorName: string;
  doctorColorToken: string;
  roomName: string;
  patientName: string;
  patientId: string;
  status: string;
}

export interface DashboardData {
  /** 集計対象の日。土日など手術枠がない日は、次に枠がある日へ自動的にずらす。 */
  focusKey: string;
  focusLabel: string;
  isToday: boolean;
  focusCount: number;
  nextDayKey: string | null;
  nextDayLabel: string | null;
  nextDayCount: number;
  tentativeCount: number;
  freeSlotCount: number;
  freeMinutes: number;
  rooms: RoomUtilization[];
  next: TimelineEntry | null;
  timeline: TimelineEntry[];
}

const LOOKAHEAD_DAYS = 21;

export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const today = startOfDay(now);
  const horizon = addDays(today, LOOKAHEAD_DAYS);
  const snapshot = await loadSnapshot(today, horizon);

  // 手術枠がある日だけを集計対象の候補にする
  const operatingDays: Date[] = [];
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset++) {
    const date = addDays(today, offset);
    if (resolveSlotsForDate(snapshot, date).length > 0) operatingDays.push(date);
  }

  const focusDate = operatingDays[0] ?? today;
  const focusKey = dateKey(focusDate);
  const isToday = focusKey === dateKey(today);
  const nextDate = operatingDays[1] ?? null;

  const slots = resolveSlotsForDate(snapshot, focusDate);

  const openByRoom = new Map<string, number>();
  const bookedByRoom = new Map<string, number>();
  let freeMinutes = 0;

  for (const slot of slots) {
    const minutes = slot.range.end - slot.range.start;
    openByRoom.set(slot.operatingRoomId, (openByRoom.get(slot.operatingRoomId) ?? 0) + minutes);

    const blockers = snapshot.bookings
      .filter(
        (b) =>
          b.dateKey === focusKey &&
          (b.doctorId === slot.doctorId || b.operatingRoomId === slot.operatingRoomId)
      )
      .map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));

    const freeInSlot = subtractRanges(slot.range, blockers).reduce(
      (sum, r) => sum + (r.end - r.start),
      0
    );
    freeMinutes += freeInSlot;
    bookedByRoom.set(
      slot.operatingRoomId,
      (bookedByRoom.get(slot.operatingRoomId) ?? 0) + (minutes - freeInSlot)
    );
  }

  const rooms: RoomUtilization[] = snapshot.rooms.map((room) => {
    const open = openByRoom.get(room.id) ?? 0;
    const booked = bookedByRoom.get(room.id) ?? 0;
    return {
      roomId: room.id,
      roomName: room.name,
      openMinutes: open,
      bookedMinutes: booked,
      rate: open === 0 ? 0 : Math.round((booked / open) * 100),
    };
  });

  const [focusBookings, nextDayCount, tentativeCount] = await Promise.all([
    db.booking.findMany({
      where: {
        date: { gte: focusDate, lt: addDays(focusDate, 1) },
        status: { not: 'CANCELLED' },
      },
      include: { surgery: true, doctor: true, operatingRoom: true },
      orderBy: { startTime: 'asc' },
    }),
    nextDate
      ? db.booking.count({
          where: { date: { gte: nextDate, lt: addDays(nextDate, 1) }, status: { not: 'CANCELLED' } },
        })
      : Promise.resolve(0),
    db.booking.count({ where: { status: 'TENTATIVE', date: { gte: today } } }),
  ]);

  const timeline: TimelineEntry[] = focusBookings.map((b) => ({
    id: b.id,
    startTime: b.startTime,
    endTime: b.endTime,
    surgeryName: b.surgery.displayName,
    doctorName: b.doctor.displayName,
    doctorColorToken: b.doctor.colorToken,
    roomName: b.operatingRoom.name,
    patientName: b.patientName,
    patientId: b.patientId,
    status: b.status,
  }));

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = isToday
    ? (timeline.find((b) => toMinutes(b.endTime) > nowMinutes) ?? null)
    : (timeline[0] ?? null);

  return {
    focusKey,
    focusLabel: formatDateJa(focusDate),
    isToday,
    focusCount: timeline.length,
    nextDayKey: nextDate ? dateKey(nextDate) : null,
    nextDayLabel: nextDate ? formatDateJa(nextDate) : null,
    nextDayCount,
    tentativeCount,
    freeSlotCount: Math.floor(freeMinutes / SLOT_GRANULARITY_MINUTES),
    freeMinutes,
    rooms,
    next,
    timeline,
  };
}

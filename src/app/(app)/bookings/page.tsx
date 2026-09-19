import { Prisma } from '@prisma/client';
import db from '@/lib/db';
import { getMasters } from '@/lib/masters';
import { addDays, dateKey, fromDateKey, startOfDay, weekdayLabel } from '@/lib/time';
import { BookingsClient, type BookingRow } from './BookingsClient';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 200;

function parseDate(value: string | undefined): Date | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? fromDateKey(value) : null;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;

  const from = parseDate(params.from) ?? startOfDay(new Date());
  const to = parseDate(params.to);
  const doctorId = params.doctorId ?? '';
  const status = params.status ?? '';
  const keyword = (params.keyword ?? '').trim();

  const where: Prisma.BookingWhereInput = {
    date: { gte: from, ...(to ? { lt: addDays(to, 1) } : {}) },
    ...(doctorId ? { doctorId } : {}),
    ...(status ? { status } : { status: { not: 'CANCELLED' } }),
    ...(keyword
      ? {
          OR: [{ patientName: { contains: keyword } }, { patientId: { contains: keyword } }],
        }
      : {}),
  };

  const [bookings, total, masters] = await Promise.all([
    db.booking.findMany({
      where,
      include: { surgery: true, doctor: true, operatingRoom: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: PAGE_SIZE,
    }),
    db.booking.count({ where }),
    getMasters(),
  ]);

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    dateKey: dateKey(b.date),
    weekday: weekdayLabel(b.date),
    startTime: b.startTime,
    endTime: b.endTime,
    surgeryId: b.surgeryId,
    surgeryName: b.surgery.displayName,
    doctorId: b.doctorId,
    doctorName: b.doctor.displayName,
    doctorColorToken: b.doctor.colorToken,
    operatingRoomId: b.operatingRoomId,
    operatingRoomName: b.operatingRoom.name,
    patientId: b.patientId,
    patientName: b.patientName,
    patientBirth: dateKey(b.patientBirth),
    status: b.status,
    notes: b.notes,
  }));

  return (
    <BookingsClient
      rows={rows}
      masters={masters}
      total={total}
      filters={{
        from: params.from ?? dateKey(from),
        to: params.to ?? '',
        doctorId,
        status,
        keyword,
      }}
    />
  );
}

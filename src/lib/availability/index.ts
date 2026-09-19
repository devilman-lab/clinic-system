/**
 * エンジンと DB の橋渡し。
 * 検索に必要なデータを一度にまとめて読み込み、純粋エンジンへ渡す。
 * （日付 × 医師 × 手術室ごとに問い合わせる N+1 を避けるため）
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import db from '../db';
import { addDays, dateKey, startOfDay } from '../time';
import {
  ConflictCheckInput,
  ConflictResult,
  EngineSurgery,
  ScheduleSnapshot,
  SearchResult,
  checkBookingConflicts,
  findAvailableSlots,
} from './engine';

export * from './engine';

/**
 * トランザクション中は必ずそのトランザクションのクライアントを渡すこと。
 * 外側のクライアントを使うと、SQLite では書き込みロックと競合して
 * トランザクションがタイムアウトする。
 */
export type DbClient = PrismaClient | Prisma.TransactionClient;

export async function loadSnapshot(
  from: Date,
  to: Date,
  client: DbClient = db
): Promise<ScheduleSnapshot> {
  const rangeStart = startOfDay(from);
  const rangeEnd = addDays(startOfDay(to), 1);

  const [doctors, rooms, schedules, exceptions, bookings] = await Promise.all([
    client.doctor.findMany({
      where: { isActive: true },
      include: { surgeryTypes: { select: { id: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    client.operatingRoom.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    client.dailySchedule.findMany({ where: { isActive: true } }),
    client.scheduleException.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
    }),
    client.booking.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd }, status: { not: 'CANCELLED' } },
    }),
  ]);

  return {
    doctors: doctors.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      colorToken: d.colorToken,
      surgeryIds: d.surgeryTypes.map((s) => s.id),
    })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    schedules: schedules.map((s) => ({
      id: s.id,
      doctorId: s.doctorId,
      operatingRoomId: s.operatingRoomId,
      dayOfWeek: s.dayOfWeek,
      weekOfMonth: s.weekOfMonth,
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label,
    })),
    exceptions: exceptions.map((e) => ({
      id: e.id,
      dateKey: dateKey(e.date),
      type: e.type === 'ADD' ? ('ADD' as const) : ('BLOCK' as const),
      doctorId: e.doctorId,
      operatingRoomId: e.operatingRoomId,
      startTime: e.startTime,
      endTime: e.endTime,
      reason: e.reason,
    })),
    bookings: bookings.map((b) => ({
      id: b.id,
      dateKey: dateKey(b.date),
      doctorId: b.doctorId,
      operatingRoomId: b.operatingRoomId,
      startTime: b.startTime,
      endTime: b.endTime,
    })),
  };
}

export interface SearchRequest {
  surgeryId: string;
  doctorIds?: string[];
  operatingRoomIds?: string[];
  startDate: Date;
  endDate: Date;
  limit?: number;
}

export async function searchAvailability(request: SearchRequest): Promise<SearchResult> {
  const surgery = await db.surgery.findUnique({ where: { id: request.surgeryId } });

  if (!surgery || !surgery.isActive) {
    return {
      slots: [],
      totalFound: 0,
      diagnostics: {
        capableDoctorNames: [],
        consideredDoctorNames: [],
        doctorsWithSlotsNames: [],
        longestFreeMinutes: 0,
        requiredMinutes: 0,
        code: 'NO_CAPABLE_DOCTOR',
        message: '指定された手術が見つからないか、無効化されています。',
      },
    };
  }

  const engineSurgery: EngineSurgery = {
    id: surgery.id,
    displayName: surgery.displayName,
    standardDuration: surgery.standardDuration,
    requiredSlotDuration: surgery.requiredSlotDuration,
  };

  const snapshot = await loadSnapshot(request.startDate, request.endDate);

  return findAvailableSlots(snapshot, {
    surgery: engineSurgery,
    doctorIds: request.doctorIds,
    operatingRoomIds: request.operatingRoomIds,
    startDate: request.startDate,
    endDate: request.endDate,
    limit: request.limit,
  });
}

export async function validateBooking(input: ConflictCheckInput): Promise<ConflictResult> {
  const date = new Date(
    Number(input.dateKey.slice(0, 4)),
    Number(input.dateKey.slice(5, 7)) - 1,
    Number(input.dateKey.slice(8, 10))
  );
  const snapshot = await loadSnapshot(date, date);
  return checkBookingConflicts(snapshot, input);
}

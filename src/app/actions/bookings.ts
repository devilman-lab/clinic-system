'use server';

import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AuthorizationError, requireRole, requireUser } from '@/lib/auth';
import db from '@/lib/db';
import { checkBookingConflicts, loadSnapshot, searchAvailability, type SearchResult } from '@/lib/availability';
import { getBookingProvider } from '@/lib/external/booking-provider';
import { fromDateKey, toMinutes, toTimeString } from '@/lib/time';

export interface ActionResult<T = undefined> {
  ok: boolean;
  errors: string[];
  data?: T;
}

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません。');
const TIME = z.string().regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません。');

type BookingWithRelations = Prisma.BookingGetPayload<{
  include: { surgery: true; doctor: true; operatingRoom: true };
}>;

type TxResult =
  | { kind: 'conflict'; errors: string[] }
  | { kind: 'created'; booking: BookingWithRelations };

function fail(error: unknown): ActionResult<never> {
  if (error instanceof AuthorizationError) return { ok: false, errors: [error.message] };
  console.error(error);
  return { ok: false, errors: ['処理中にエラーが発生しました。時間をおいて再度お試しください。'] };
}

/* ---------------- 空き枠検索 ---------------- */

const SearchSchema = z.object({
  surgeryId: z.string().min(1, '手術を選択してください。'),
  doctorIds: z.array(z.string()).optional(),
  operatingRoomIds: z.array(z.string()).optional(),
  startDate: DATE_KEY,
  endDate: DATE_KEY,
  limit: z.number().int().positive().max(500).optional(),
});

export type SearchInput = z.infer<typeof SearchSchema>;

export async function searchSlotsAction(
  input: SearchInput
): Promise<ActionResult<SearchResult>> {
  try {
    await requireUser();
    const parsed = SearchSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
    }

    const startDate = fromDateKey(parsed.data.startDate);
    const endDate = fromDateKey(parsed.data.endDate);

    if (endDate < startDate) {
      return { ok: false, errors: ['終了日は開始日以降を指定してください。'] };
    }

    const result = await searchAvailability({
      surgeryId: parsed.data.surgeryId,
      doctorIds: parsed.data.doctorIds,
      operatingRoomIds: parsed.data.operatingRoomIds,
      startDate,
      endDate,
      limit: parsed.data.limit ?? 60,
    });

    return { ok: true, errors: [], data: result };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 予約登録 ---------------- */

const BookingSchema = z.object({
  patientId: z.string().trim().min(1, '患者IDを入力してください。').max(32),
  patientName: z.string().trim().min(1, '患者名を入力してください。').max(64),
  patientBirth: DATE_KEY,
  surgeryId: z.string().min(1, '手術を選択してください。'),
  doctorId: z.string().min(1, '担当医を選択してください。'),
  operatingRoomId: z.string().min(1, '手術室を選択してください。'),
  dateKey: DATE_KEY,
  startTime: TIME,
  notes: z.string().trim().max(500).optional(),
});

export type BookingInput = z.infer<typeof BookingSchema>;

/**
 * 予約枠の終了時刻は手術種類から導出する。
 * 画面から送られた値を信用すると、枠時間を偽装した予約が作れてしまうため。
 */
async function resolveEndTime(surgeryId: string, startTime: string): Promise<string | null> {
  const surgery = await db.surgery.findUnique({ where: { id: surgeryId } });
  if (!surgery || !surgery.isActive) return null;
  return toTimeString(toMinutes(startTime) + surgery.requiredSlotDuration);
}

export async function createBookingAction(
  input: BookingInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole('ADMIN', 'STAFF');

    const parsed = BookingSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
    }
    const data = parsed.data;

    const endTime = await resolveEndTime(data.surgeryId, data.startTime);
    if (!endTime) return { ok: false, errors: ['指定された手術が見つかりません。'] };

    // 検証と登録の間に他端末が同じ枠を押さえる余地を残さないよう、同一トランザクションで行う
    const result = await db.$transaction(async (tx): Promise<TxResult> => {
      const snapshot = await loadSnapshot(fromDateKey(data.dateKey), fromDateKey(data.dateKey), tx);
      const check = checkBookingConflicts(snapshot, {
        dateKey: data.dateKey,
        doctorId: data.doctorId,
        operatingRoomId: data.operatingRoomId,
        startTime: data.startTime,
        endTime,
        surgeryId: data.surgeryId,
      });

      if (!check.ok) return { kind: 'conflict', errors: check.errors };

      const booking = await tx.booking.create({
        data: {
          patientId: data.patientId,
          patientName: data.patientName,
          patientBirth: fromDateKey(data.patientBirth),
          surgeryId: data.surgeryId,
          doctorId: data.doctorId,
          operatingRoomId: data.operatingRoomId,
          date: fromDateKey(data.dateKey),
          startTime: data.startTime,
          endTime,
          status: 'CONFIRMED',
          notes: data.notes || null,
        },
        include: { surgery: true, doctor: true, operatingRoom: true },
      });

      return { kind: 'created', booking };
    });

    if (result.kind === 'conflict') return { ok: false, errors: result.errors };

    const { booking } = result;
    await getBookingProvider().create({
      bookingId: booking.id,
      patientId: booking.patientId,
      surgeryName: booking.surgery.displayName,
      doctorName: booking.doctor.displayName,
      roomName: booking.operatingRoom.name,
      date: data.dateKey,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });

    revalidateBookingViews();
    return { ok: true, errors: [], data: { id: booking.id } };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 予約変更 ---------------- */

const UpdateSchema = BookingSchema.extend({ id: z.string().min(1) });

export type UpdateBookingInput = z.infer<typeof UpdateSchema>;

export async function updateBookingAction(
  input: UpdateBookingInput
): Promise<ActionResult> {
  try {
    await requireRole('ADMIN', 'STAFF');

    const parsed = UpdateSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
    }
    const data = parsed.data;

    const endTime = await resolveEndTime(data.surgeryId, data.startTime);
    if (!endTime) return { ok: false, errors: ['指定された手術が見つかりません。'] };

    const result = await db.$transaction(async (tx): Promise<TxResult> => {
      const existing = await tx.booking.findUnique({ where: { id: data.id } });
      if (!existing) return { kind: 'conflict', errors: ['対象の予約が見つかりません。'] };
      if (existing.status === 'CANCELLED') {
        return { kind: 'conflict', errors: ['キャンセル済みの予約は変更できません。'] };
      }

      const snapshot = await loadSnapshot(fromDateKey(data.dateKey), fromDateKey(data.dateKey), tx);
      const check = checkBookingConflicts(snapshot, {
        dateKey: data.dateKey,
        doctorId: data.doctorId,
        operatingRoomId: data.operatingRoomId,
        startTime: data.startTime,
        endTime,
        surgeryId: data.surgeryId,
        excludeBookingId: data.id,
      });

      if (!check.ok) return { kind: 'conflict', errors: check.errors };

      const booking = await tx.booking.update({
        where: { id: data.id },
        data: {
          patientId: data.patientId,
          patientName: data.patientName,
          patientBirth: fromDateKey(data.patientBirth),
          surgeryId: data.surgeryId,
          doctorId: data.doctorId,
          operatingRoomId: data.operatingRoomId,
          date: fromDateKey(data.dateKey),
          startTime: data.startTime,
          endTime,
          notes: data.notes || null,
        },
        include: { surgery: true, doctor: true, operatingRoom: true },
      });

      return { kind: 'created', booking };
    });

    if (result.kind === 'conflict') return { ok: false, errors: result.errors };

    const { booking } = result;
    await getBookingProvider().update({
      bookingId: booking.id,
      patientId: booking.patientId,
      surgeryName: booking.surgery.displayName,
      doctorName: booking.doctor.displayName,
      roomName: booking.operatingRoom.name,
      date: data.dateKey,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });

    revalidateBookingViews();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 予約キャンセル ---------------- */

export async function cancelBookingAction(id: string): Promise<ActionResult> {
  try {
    await requireRole('ADMIN', 'STAFF');

    const existing = await db.booking.findUnique({ where: { id } });
    if (!existing) return { ok: false, errors: ['対象の予約が見つかりません。'] };

    // 監査の観点から物理削除はせず、状態をキャンセルに変える
    await db.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
    await getBookingProvider().cancel(id);

    revalidateBookingViews();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

function revalidateBookingViews() {
  revalidatePath('/');
  revalidatePath('/calendar');
  revalidatePath('/bookings');
  revalidatePath('/schedule');
}

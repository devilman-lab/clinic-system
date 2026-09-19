'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AuthorizationError, requireRole } from '@/lib/auth';
import { setConfig } from '@/lib/config';
import db from '@/lib/db';
import { fromDateKey, toMinutes } from '@/lib/time';
import type { ActionResult } from './bookings';

const DATE_KEY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付の形式が正しくありません。');
const TIME = z.string().regex(/^\d{2}:\d{2}$/, '時刻の形式が正しくありません。');

function fail(error: unknown): ActionResult<never> {
  if (error instanceof AuthorizationError) return { ok: false, errors: [error.message] };
  console.error(error);
  return { ok: false, errors: ['処理中にエラーが発生しました。'] };
}

function issues(error: z.ZodError): ActionResult<never> {
  return { ok: false, errors: error.issues.map((i) => i.message) };
}

function revalidateMasters() {
  revalidatePath('/', 'layout');
}

/* ---------------- 医師 ---------------- */

const DoctorSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().trim().min(1, '表示名を入力してください。').max(32),
  name: z.string().trim().min(1, '氏名を入力してください。').max(64),
  colorToken: z.string().min(1),
  surgeryIds: z.array(z.string()),
  isActive: z.boolean(),
});

export type DoctorInput = z.infer<typeof DoctorSchema>;

export async function saveDoctorAction(input: DoctorInput): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const parsed = DoctorSchema.safeParse(input);
    if (!parsed.success) return issues(parsed.error);
    const { id, surgeryIds, ...rest } = parsed.data;

    if (id) {
      await db.doctor.update({
        where: { id },
        data: { ...rest, surgeryTypes: { set: surgeryIds.map((s) => ({ id: s })) } },
      });
    } else {
      const count = await db.doctor.count();
      await db.doctor.create({
        data: {
          ...rest,
          sortOrder: count,
          surgeryTypes: { connect: surgeryIds.map((s) => ({ id: s })) },
        },
      });
    }

    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteDoctorAction(id: string): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const bookings = await db.booking.count({ where: { doctorId: id, status: { not: 'CANCELLED' } } });
    if (bookings > 0) {
      return {
        ok: false,
        errors: [
          `この医師には予約が${bookings}件あるため削除できません。無効化して新規予約の対象から外してください。`,
        ],
      };
    }
    await db.doctor.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 手術 ---------------- */

const SurgerySchema = z
  .object({
    id: z.string().optional(),
    displayName: z.string().trim().min(1, '手術名を入力してください。').max(32),
    standardDuration: z.number().int().min(5, '標準手術時間は5分以上で指定してください。').max(600),
    requiredSlotDuration: z
      .number()
      .int()
      .min(30, '予約枠は30分以上で指定してください。')
      .max(600),
    doctorIds: z.array(z.string()),
    isActive: z.boolean(),
  })
  .refine((v) => v.requiredSlotDuration >= v.standardDuration, {
    message: '予約枠時間は標準手術時間以上にしてください。',
    path: ['requiredSlotDuration'],
  })
  .refine((v) => v.requiredSlotDuration % 30 === 0, {
    message: '予約枠時間は最低予約単位（30分）の倍数にしてください。',
    path: ['requiredSlotDuration'],
  });

export type SurgeryInput = z.infer<typeof SurgerySchema>;

export async function saveSurgeryAction(input: SurgeryInput): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const parsed = SurgerySchema.safeParse(input);
    if (!parsed.success) return issues(parsed.error);
    const { id, doctorIds, displayName, ...rest } = parsed.data;

    if (id) {
      await db.surgery.update({
        where: { id },
        data: { ...rest, displayName, doctors: { set: doctorIds.map((d) => ({ id: d })) } },
      });
    } else {
      const count = await db.surgery.count();
      await db.surgery.create({
        data: {
          ...rest,
          displayName,
          name: displayName,
          sortOrder: count,
          doctors: { connect: doctorIds.map((d) => ({ id: d })) },
        },
      });
    }

    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSurgeryAction(id: string): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const bookings = await db.booking.count({ where: { surgeryId: id, status: { not: 'CANCELLED' } } });
    if (bookings > 0) {
      return {
        ok: false,
        errors: [`この手術には予約が${bookings}件あるため削除できません。無効化してください。`],
      };
    }
    await db.surgery.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 手術室 ---------------- */

const RoomSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, '手術室名を入力してください。').max(32),
  number: z.number().int().min(1, '番号は1以上で指定してください。').max(99),
  isActive: z.boolean(),
});

export type RoomInput = z.infer<typeof RoomSchema>;

export async function saveRoomAction(input: RoomInput): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const parsed = RoomSchema.safeParse(input);
    if (!parsed.success) return issues(parsed.error);
    const { id, ...rest } = parsed.data;

    const duplicate = await db.operatingRoom.findFirst({
      where: { OR: [{ name: rest.name }, { number: rest.number }], NOT: id ? { id } : undefined },
    });
    if (duplicate) {
      return { ok: false, errors: ['同じ名前または番号の手術室がすでに存在します。'] };
    }

    if (id) await db.operatingRoom.update({ where: { id }, data: rest });
    else await db.operatingRoom.create({ data: rest });

    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteRoomAction(id: string): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const bookings = await db.booking.count({
      where: { operatingRoomId: id, status: { not: 'CANCELLED' } },
    });
    if (bookings > 0) {
      return {
        ok: false,
        errors: [`この手術室には予約が${bookings}件あるため削除できません。無効化してください。`],
      };
    }
    await db.operatingRoom.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 定例枠 ---------------- */

const ScheduleSchema = z
  .object({
    id: z.string().optional(),
    doctorId: z.string().min(1, '医師を選択してください。'),
    operatingRoomId: z.string().min(1, '手術室を選択してください。'),
    dayOfWeek: z.number().int().min(0).max(6),
    weekOfMonth: z.number().int().min(1).max(5).nullable(),
    startTime: TIME,
    endTime: TIME,
    label: z.string().trim().max(32).optional(),
    isActive: z.boolean(),
  })
  .refine((v) => toMinutes(v.endTime) > toMinutes(v.startTime), {
    message: '終了時刻は開始時刻より後にしてください。',
    path: ['endTime'],
  })
  .refine((v) => toMinutes(v.endTime) - toMinutes(v.startTime) >= 30, {
    message: '手術枠は30分以上で設定してください。',
    path: ['endTime'],
  });

export type ScheduleInput = z.infer<typeof ScheduleSchema>;

export async function saveScheduleAction(input: ScheduleInput): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const parsed = ScheduleSchema.safeParse(input);
    if (!parsed.success) return issues(parsed.error);
    const { id, label, ...rest } = parsed.data;

    // 同じ手術室の同じ時間帯に別の医師を割り当てると、枠そのものが矛盾する
    const sameRoom = await db.dailySchedule.findMany({
      where: {
        operatingRoomId: rest.operatingRoomId,
        dayOfWeek: rest.dayOfWeek,
        isActive: true,
        NOT: id ? { id } : undefined,
      },
    });

    const conflict = sameRoom.find(
      (s) =>
        (s.weekOfMonth === null || rest.weekOfMonth === null || s.weekOfMonth === rest.weekOfMonth) &&
        toMinutes(s.startTime) < toMinutes(rest.endTime) &&
        toMinutes(rest.startTime) < toMinutes(s.endTime)
    );

    if (conflict) {
      return {
        ok: false,
        errors: [
          `同じ手術室の ${conflict.startTime}〜${conflict.endTime} に別の定例枠がすでに設定されています。`,
        ],
      };
    }

    const data = { ...rest, label: label || null };
    if (id) await db.dailySchedule.update({ where: { id }, data });
    else await db.dailySchedule.create({ data });

    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteScheduleAction(id: string): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    await db.dailySchedule.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- 例外日 ---------------- */

const ExceptionSchema = z
  .object({
    id: z.string().optional(),
    date: DATE_KEY,
    type: z.enum(['ADD', 'BLOCK']),
    doctorId: z.string().nullable(),
    operatingRoomId: z.string().nullable(),
    startTime: TIME.nullable(),
    endTime: TIME.nullable(),
    reason: z.string().trim().min(1, '理由を入力してください。').max(64),
  })
  .refine((v) => v.type !== 'ADD' || (v.doctorId && v.operatingRoomId && v.startTime && v.endTime), {
    message: '追加枠は医師・手術室・開始/終了時刻をすべて指定してください。',
    path: ['type'],
  })
  .refine(
    (v) => !v.startTime || !v.endTime || toMinutes(v.endTime) > toMinutes(v.startTime),
    { message: '終了時刻は開始時刻より後にしてください。', path: ['endTime'] }
  );

export type ExceptionInput = z.infer<typeof ExceptionSchema>;

export async function saveExceptionAction(input: ExceptionInput): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const parsed = ExceptionSchema.safeParse(input);
    if (!parsed.success) return issues(parsed.error);
    const { id, date, ...rest } = parsed.data;

    const data = { ...rest, date: fromDateKey(date) };
    if (id) await db.scheduleException.update({ where: { id }, data });
    else await db.scheduleException.create({ data });

    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteExceptionAction(id: string): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    await db.scheduleException.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

/* ---------------- システム設定 ---------------- */

const SettingsSchema = z.object({
  clinic_name: z.string().trim().min(1, 'クリニック名を入力してください。').max(64),
  public_schedule_enabled: z.enum(['true', 'false']),
});

export type SettingsInput = z.infer<typeof SettingsSchema>;

export async function saveSettingsAction(input: SettingsInput): Promise<ActionResult> {
  try {
    await requireRole('ADMIN');
    const parsed = SettingsSchema.safeParse(input);
    if (!parsed.success) return issues(parsed.error);

    for (const [key, value] of Object.entries(parsed.data)) {
      await setConfig(key, value);
    }

    revalidateMasters();
    return { ok: true, errors: [] };
  } catch (error) {
    return fail(error);
  }
}

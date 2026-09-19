/**
 * 予約可能判定エンジン（純粋関数）。
 *
 * DB に一切触れず、スナップショットを受け取って候補を算出する。
 * これにより「医師 × 手術室 × 時間帯 × 定例枠 × 例外日 × 既存予約」の
 * 判定ロジックだけを単体でテスト・検証できる。
 */

import {
  TimeRange,
  dateKey,
  eachDay,
  formatDateJa,
  mergeRanges,
  overlaps,
  subtractRanges,
  toMinutes,
  toTimeString,
  weekOfMonth,
} from '../time';

/** 最低予約単位（分）。候補の開始時刻はこの刻みで探索する。 */
export const SLOT_GRANULARITY_MINUTES = 30;

export interface EngineDoctor {
  id: string;
  displayName: string;
  colorToken: string;
  surgeryIds: string[];
}

export interface EngineRoom {
  id: string;
  name: string;
}

export interface EngineSurgery {
  id: string;
  displayName: string;
  standardDuration: number;
  requiredSlotDuration: number;
}

export interface EngineSchedule {
  id: string;
  doctorId: string;
  operatingRoomId: string;
  dayOfWeek: number;
  weekOfMonth: number | null;
  startTime: string;
  endTime: string;
  label: string | null;
}

export interface EngineException {
  id: string;
  dateKey: string;
  type: 'ADD' | 'BLOCK';
  doctorId: string | null;
  operatingRoomId: string | null;
  startTime: string | null;
  endTime: string | null;
  reason: string;
}

export interface EngineBooking {
  id: string;
  dateKey: string;
  doctorId: string;
  operatingRoomId: string;
  startTime: string;
  endTime: string;
}

export interface ScheduleSnapshot {
  doctors: EngineDoctor[];
  rooms: EngineRoom[];
  schedules: EngineSchedule[];
  exceptions: EngineException[];
  bookings: EngineBooking[];
}

export interface SearchCriteria {
  surgery: EngineSurgery;
  doctorIds?: string[];
  operatingRoomIds?: string[];
  startDate: Date;
  endDate: Date;
  /** 上限件数。省略時は 50。 */
  limit?: number;
}

export interface AvailableSlot {
  dateKey: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  doctorId: string;
  doctorName: string;
  doctorColorToken: string;
  operatingRoomId: string;
  operatingRoomName: string;
  surgeryId: string;
  surgeryName: string;
  /** 予約枠として確保される時間（手術時間＋入れ替え時間）。 */
  slotDuration: number;
  standardDuration: number;
  /** この枠が属する定例枠／例外枠の範囲。UI で「枠のどこに入るか」を示す。 */
  sourceRange: { startTime: string; endTime: string };
  sourceType: 'REGULAR' | 'EXCEPTION';
  sourceLabel: string | null;
  checks: string[];
}

export type NoResultCode =
  | 'NO_CAPABLE_DOCTOR'
  | 'NO_DOCTOR_IN_FILTER'
  | 'NO_SCHEDULE_IN_PERIOD'
  | 'NO_CONTINUOUS_BLOCK'
  | 'FULLY_BOOKED';

export interface SearchDiagnostics {
  capableDoctorNames: string[];
  consideredDoctorNames: string[];
  /** 期間内に定例枠を持っていた医師名。 */
  doctorsWithSlotsNames: string[];
  /** 見つかった中で最長の連続空き時間（分）。0 なら全て埋まっていた。 */
  longestFreeMinutes: number;
  requiredMinutes: number;
  code: NoResultCode | null;
  message: string | null;
}

export interface SearchResult {
  slots: AvailableSlot[];
  /** limit で切り捨てる前の総件数。 */
  totalFound: number;
  diagnostics: SearchDiagnostics;
}

interface EffectiveSlot {
  doctorId: string;
  operatingRoomId: string;
  range: TimeRange;
  sourceType: 'REGULAR' | 'EXCEPTION';
  label: string | null;
}

/**
 * ある日付に実際に開いている枠を組み立てる。
 * 定例枠 → 例外の追加枠 → 例外の閉鎖枠、の順に適用する（例外が定例に優先する）。
 */
export function resolveSlotsForDate(
  snapshot: ScheduleSnapshot,
  date: Date
): EffectiveSlot[] {
  const key = dateKey(date);
  const dow = date.getDay();
  const wom = weekOfMonth(date);

  const slots: EffectiveSlot[] = [];

  for (const schedule of snapshot.schedules) {
    if (schedule.dayOfWeek !== dow) continue;
    if (schedule.weekOfMonth !== null && schedule.weekOfMonth !== wom) continue;
    slots.push({
      doctorId: schedule.doctorId,
      operatingRoomId: schedule.operatingRoomId,
      range: { start: toMinutes(schedule.startTime), end: toMinutes(schedule.endTime) },
      sourceType: 'REGULAR',
      label: schedule.label,
    });
  }

  const todaysExceptions = snapshot.exceptions.filter((e) => e.dateKey === key);

  for (const exception of todaysExceptions) {
    if (exception.type !== 'ADD') continue;
    if (!exception.doctorId || !exception.operatingRoomId) continue;
    if (!exception.startTime || !exception.endTime) continue;
    slots.push({
      doctorId: exception.doctorId,
      operatingRoomId: exception.operatingRoomId,
      range: { start: toMinutes(exception.startTime), end: toMinutes(exception.endTime) },
      sourceType: 'EXCEPTION',
      label: exception.reason,
    });
  }

  const blocks = todaysExceptions.filter((e) => e.type === 'BLOCK');
  if (blocks.length === 0) return slots;

  const result: EffectiveSlot[] = [];
  for (const slot of slots) {
    const applicable = blocks.filter(
      (b) =>
        (b.doctorId === null || b.doctorId === slot.doctorId) &&
        (b.operatingRoomId === null || b.operatingRoomId === slot.operatingRoomId)
    );
    if (applicable.length === 0) {
      result.push(slot);
      continue;
    }
    const blockRanges = applicable.map((b) => ({
      start: b.startTime ? toMinutes(b.startTime) : 0,
      end: b.endTime ? toMinutes(b.endTime) : 24 * 60,
    }));
    for (const remaining of subtractRanges(slot.range, blockRanges)) {
      result.push({ ...slot, range: remaining });
    }
  }
  return result;
}

/**
 * 既存予約のうち、この枠を塞ぐものを集める。
 *
 * 同じ医師の予約は「手術室が違っても」塞ぐ（医師は分身できない）。
 * 同じ手術室の予約は「医師が違っても」塞ぐ（部屋は共有できない）。
 * この2方向のチェックが、単純な時間の空き判定との決定的な違い。
 */
export function collectBlockers(
  bookings: EngineBooking[],
  key: string,
  doctorId: string,
  operatingRoomId: string,
  excludeBookingId?: string
): TimeRange[] {
  return bookings
    .filter(
      (b) =>
        b.dateKey === key &&
        b.id !== excludeBookingId &&
        (b.doctorId === doctorId || b.operatingRoomId === operatingRoomId)
    )
    .map((b) => ({ start: toMinutes(b.startTime), end: toMinutes(b.endTime) }));
}

export function findAvailableSlots(
  snapshot: ScheduleSnapshot,
  criteria: SearchCriteria
): SearchResult {
  const { surgery } = criteria;
  const required = surgery.requiredSlotDuration;
  const limit = criteria.limit ?? 50;

  const doctorById = new Map(snapshot.doctors.map((d) => [d.id, d]));
  const roomById = new Map(snapshot.rooms.map((r) => [r.id, r]));

  const capableDoctors = snapshot.doctors.filter((d) => d.surgeryIds.includes(surgery.id));

  const consideredDoctors =
    criteria.doctorIds && criteria.doctorIds.length > 0
      ? capableDoctors.filter((d) => criteria.doctorIds!.includes(d.id))
      : capableDoctors;

  const roomFilter =
    criteria.operatingRoomIds && criteria.operatingRoomIds.length > 0
      ? new Set(criteria.operatingRoomIds)
      : null;

  const consideredIds = new Set(consideredDoctors.map((d) => d.id));

  const diagnostics: SearchDiagnostics = {
    capableDoctorNames: capableDoctors.map((d) => d.displayName),
    consideredDoctorNames: consideredDoctors.map((d) => d.displayName),
    doctorsWithSlotsNames: [],
    longestFreeMinutes: 0,
    requiredMinutes: required,
    code: null,
    message: null,
  };

  if (capableDoctors.length === 0) {
    diagnostics.code = 'NO_CAPABLE_DOCTOR';
    diagnostics.message = `${surgery.displayName}を実施できる医師が登録されていません。医師管理から対応可能手術を設定してください。`;
    return { slots: [], totalFound: 0, diagnostics };
  }

  if (consideredDoctors.length === 0) {
    diagnostics.code = 'NO_DOCTOR_IN_FILTER';
    diagnostics.message = `指定された医師は${surgery.displayName}に対応していません。対応可能な医師: ${diagnostics.capableDoctorNames.join(
      '、'
    )}`;
    return { slots: [], totalFound: 0, diagnostics };
  }

  const found: AvailableSlot[] = [];
  const doctorsWithSlots = new Set<string>();

  for (const date of eachDay(criteria.startDate, criteria.endDate)) {
    const key = dateKey(date);
    const dateLabel = formatDateJa(date);

    for (const slot of resolveSlotsForDate(snapshot, date)) {
      if (!consideredIds.has(slot.doctorId)) continue;
      if (roomFilter && !roomFilter.has(slot.operatingRoomId)) continue;

      const doctor = doctorById.get(slot.doctorId);
      const room = roomById.get(slot.operatingRoomId);
      if (!doctor || !room) continue;

      doctorsWithSlots.add(doctor.displayName);

      const blockers = collectBlockers(
        snapshot.bookings,
        key,
        slot.doctorId,
        slot.operatingRoomId
      );

      for (const free of subtractRanges(slot.range, blockers)) {
        const freeMinutes = free.end - free.start;
        if (freeMinutes > diagnostics.longestFreeMinutes) {
          diagnostics.longestFreeMinutes = freeMinutes;
        }
        if (freeMinutes < required) continue;

        // 枠の開始時刻を基準に 30 分刻みで候補を並べる
        const offset = (free.start - slot.range.start) % SLOT_GRANULARITY_MINUTES;
        let cursor = offset === 0 ? free.start : free.start + (SLOT_GRANULARITY_MINUTES - offset);

        while (cursor + required <= free.end) {
          found.push({
            dateKey: key,
            dateLabel,
            startTime: toTimeString(cursor),
            endTime: toTimeString(cursor + required),
            doctorId: doctor.id,
            doctorName: doctor.displayName,
            doctorColorToken: doctor.colorToken,
            operatingRoomId: room.id,
            operatingRoomName: room.name,
            surgeryId: surgery.id,
            surgeryName: surgery.displayName,
            slotDuration: required,
            standardDuration: surgery.standardDuration,
            sourceRange: {
              startTime: toTimeString(slot.range.start),
              endTime: toTimeString(slot.range.end),
            },
            sourceType: slot.sourceType,
            sourceLabel: slot.label,
            checks: [
              `${doctor.displayName}は${surgery.displayName}に対応可能`,
              slot.sourceType === 'EXCEPTION'
                ? `例外枠（${slot.label ?? '臨時枠'}）の範囲内`
                : `定例枠 ${toTimeString(slot.range.start)}〜${toTimeString(slot.range.end)} の範囲内`,
              `${room.name}が空いている`,
              '既存予約との重複なし',
            ],
          });
          cursor += SLOT_GRANULARITY_MINUTES;
        }
      }
    }
  }

  diagnostics.doctorsWithSlotsNames = [...doctorsWithSlots];

  found.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    return a.operatingRoomName.localeCompare(b.operatingRoomName);
  });

  if (found.length === 0) {
    const names = diagnostics.consideredDoctorNames.join('、');
    if (doctorsWithSlots.size === 0) {
      diagnostics.code = 'NO_SCHEDULE_IN_PERIOD';
      diagnostics.message = `${names}は${surgery.displayName}に対応できますが、指定期間内に手術枠がありません。期間を広げるか、定例枠設定を確認してください。`;
    } else if (diagnostics.longestFreeMinutes === 0) {
      diagnostics.code = 'FULLY_BOOKED';
      diagnostics.message = `${names}の手術枠は指定期間内すべて予約で埋まっています。`;
    } else {
      diagnostics.code = 'NO_CONTINUOUS_BLOCK';
      diagnostics.message = `${names}は対応可能ですが、指定期間内に${required}分以上の連続した空き枠がありません（最長の空きは${diagnostics.longestFreeMinutes}分）。`;
    }
  }

  return {
    slots: found.slice(0, limit),
    totalFound: found.length,
    diagnostics,
  };
}

export interface ConflictCheckInput {
  dateKey: string;
  doctorId: string;
  operatingRoomId: string;
  startTime: string;
  endTime: string;
  surgeryId: string;
  excludeBookingId?: string;
}

export interface ConflictResult {
  ok: boolean;
  errors: string[];
}

/** 予約の登録・変更時の検証。検索と同じルールを必ず通す。 */
export function checkBookingConflicts(
  snapshot: ScheduleSnapshot,
  input: ConflictCheckInput
): ConflictResult {
  const errors: string[] = [];
  const doctor = snapshot.doctors.find((d) => d.id === input.doctorId);
  const room = snapshot.rooms.find((r) => r.id === input.operatingRoomId);

  if (!doctor) return { ok: false, errors: ['指定された医師が見つかりません。'] };
  if (!room) return { ok: false, errors: ['指定された手術室が見つかりません。'] };

  if (!doctor.surgeryIds.includes(input.surgeryId)) {
    errors.push(`${doctor.displayName}はこの手術に対応していません。`);
  }

  const requested: TimeRange = {
    start: toMinutes(input.startTime),
    end: toMinutes(input.endTime),
  };

  if (requested.end <= requested.start) {
    errors.push('終了時刻が開始時刻より後になっていません。');
    return { ok: false, errors };
  }

  const date = new Date(
    Number(input.dateKey.slice(0, 4)),
    Number(input.dateKey.slice(5, 7)) - 1,
    Number(input.dateKey.slice(8, 10))
  );

  const slots = resolveSlotsForDate(snapshot, date).filter(
    (s) => s.doctorId === input.doctorId && s.operatingRoomId === input.operatingRoomId
  );

  const covered = mergeRanges(slots.map((s) => s.range)).some(
    (r) => requested.start >= r.start && requested.end <= r.end
  );

  if (!covered) {
    errors.push(
      `${doctor.displayName}は${input.dateKey}の${input.startTime}〜${input.endTime}に${room.name}の手術枠を持っていません。`
    );
  }

  for (const booking of snapshot.bookings) {
    if (booking.dateKey !== input.dateKey) continue;
    if (booking.id === input.excludeBookingId) continue;
    const range = { start: toMinutes(booking.startTime), end: toMinutes(booking.endTime) };
    if (!overlaps(requested, range)) continue;

    if (booking.doctorId === input.doctorId) {
      errors.push(
        `${doctor.displayName}の既存予約（${booking.startTime}〜${booking.endTime}）と重複しています。`
      );
    }
    if (booking.operatingRoomId === input.operatingRoomId) {
      errors.push(
        `${room.name}の既存予約（${booking.startTime}〜${booking.endTime}）と重複しています。`
      );
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

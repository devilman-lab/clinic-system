/**
 * デモデータ投入。
 *
 * 既存予約は手書きせず、判定エンジンが「実際に開いている」と認めた枠にだけ
 * 入れる。これによりシードデータが枠外・重複を含むことが構造的に起きない。
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { resolveSlotsForDate, ScheduleSnapshot } from '../src/lib/availability/engine';
import { addDays, dateKey, startOfDay, toMinutes, toTimeString } from '../src/lib/time';

const prisma = new PrismaClient();

/** 再現性のある擬似乱数。シードを固定してデモ内容を安定させる。 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;

async function main() {
  console.log('データベースを初期化しています...');

  await prisma.booking.deleteMany();
  await prisma.scheduleException.deleteMany();
  await prisma.dailySchedule.deleteMany();
  await prisma.user.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.surgery.deleteMany();
  await prisma.operatingRoom.deleteMany();
  await prisma.systemConfig.deleteMany();

  // ---- 手術室 ----
  const room1 = await prisma.operatingRoom.create({
    data: { name: '手術室1', number: 1 },
  });
  const room2 = await prisma.operatingRoom.create({
    data: { name: '手術室2', number: 2 },
  });

  // ---- 手術種類（標準時間 / 予約枠時間）----
  const surgeryDefs = [
    { name: 'A手術', standardDuration: 15, requiredSlotDuration: 30 },
    { name: 'B手術', standardDuration: 30, requiredSlotDuration: 30 },
    { name: 'C手術', standardDuration: 45, requiredSlotDuration: 60 },
    { name: 'D手術', standardDuration: 60, requiredSlotDuration: 60 },
    { name: 'E手術', standardDuration: 60, requiredSlotDuration: 60 },
    { name: 'F手術', standardDuration: 60, requiredSlotDuration: 60 },
    { name: 'G手術', standardDuration: 60, requiredSlotDuration: 60 },
    { name: 'H手術', standardDuration: 90, requiredSlotDuration: 90 },
  ];

  const surgeries: Record<string, { id: string; requiredSlotDuration: number }> = {};
  for (const [index, def] of surgeryDefs.entries()) {
    const created = await prisma.surgery.create({
      data: {
        name: def.name,
        displayName: def.name,
        standardDuration: def.standardDuration,
        requiredSlotDuration: def.requiredSlotDuration,
        sortOrder: index,
      },
    });
    surgeries[def.name] = {
      id: created.id,
      requiredSlotDuration: created.requiredSlotDuration,
    };
  }

  // ---- 医師と対応可能手術 ----
  const doctorDefs = [
    { key: 'A', displayName: 'A医師', color: 'sky', can: ['A手術', 'B手術', 'C手術', 'D手術', 'E手術', 'F手術', 'G手術', 'H手術'] },
    { key: 'B', displayName: 'B医師', color: 'emerald', can: ['A手術', 'B手術', 'C手術', 'D手術', 'E手術', 'F手術'] },
    { key: 'C', displayName: 'C医師', color: 'violet', can: ['A手術', 'B手術', 'C手術', 'D手術', 'E手術'] },
    { key: 'D', displayName: 'D医師', color: 'amber', can: ['A手術', 'B手術'] },
    { key: 'E', displayName: 'E医師', color: 'rose', can: ['A手術', 'B手術', 'C手術', 'F手術', 'G手術'] },
  ];

  const doctors: Record<string, { id: string; displayName: string; color: string; surgeryIds: string[] }> = {};
  for (const [index, def] of doctorDefs.entries()) {
    const created = await prisma.doctor.create({
      data: {
        name: `doctor_${def.key.toLowerCase()}`,
        displayName: def.displayName,
        colorToken: def.color,
        sortOrder: index,
        surgeryTypes: { connect: def.can.map((n) => ({ id: surgeries[n].id })) },
      },
    });
    doctors[def.key] = {
      id: created.id,
      displayName: created.displayName,
      color: created.colorToken,
      surgeryIds: def.can.map((n) => surgeries[n].id),
    };
  }

  // ---- 定例枠（医師 × 手術室 × 曜日 × 時間帯）----
  // weekOfMonth が null なら毎週。2 / 4 は第2・第4週だけ開く追加枠。
  type SlotDef = {
    doctor: string;
    room: string;
    dayOfWeek: number;
    start: string;
    end: string;
    weekOfMonth?: number;
    label?: string;
  };

  const scheduleDefs: SlotDef[] = [
    // 月曜 午前: 手術室1を A → B で引き継ぐ
    { doctor: 'A', room: '1', dayOfWeek: MON, start: '09:30', end: '11:00', label: '月曜午前' },
    { doctor: 'B', room: '1', dayOfWeek: MON, start: '11:00', end: '12:30', label: '月曜午前' },
    // 月曜 午後: 2列稼働
    { doctor: 'A', room: '1', dayOfWeek: MON, start: '13:30', end: '15:00', label: '月曜午後' },
    { doctor: 'C', room: '1', dayOfWeek: MON, start: '15:00', end: '17:00', label: '月曜午後' },
    { doctor: 'B', room: '2', dayOfWeek: MON, start: '13:30', end: '15:30', label: '月曜午後' },
    { doctor: 'E', room: '2', dayOfWeek: MON, start: '15:30', end: '17:00', label: '月曜午後' },

    // 火曜
    { doctor: 'C', room: '1', dayOfWeek: TUE, start: '09:30', end: '11:00', label: '火曜午前' },
    { doctor: 'A', room: '1', dayOfWeek: TUE, start: '11:00', end: '12:30', label: '火曜午前' },
    { doctor: 'D', room: '1', dayOfWeek: TUE, start: '13:30', end: '15:30', label: '火曜午後' },
    { doctor: 'A', room: '1', dayOfWeek: TUE, start: '15:30', end: '17:00', label: '火曜午後' },
    { doctor: 'E', room: '2', dayOfWeek: TUE, start: '13:30', end: '16:00', label: '火曜午後' },

    // 水曜
    { doctor: 'B', room: '1', dayOfWeek: WED, start: '09:30', end: '12:30', label: '水曜午前' },
    { doctor: 'D', room: '2', dayOfWeek: WED, start: '09:30', end: '11:30', label: '水曜午前' },
    { doctor: 'C', room: '1', dayOfWeek: WED, start: '13:30', end: '17:00', label: '水曜午後' },

    // 木曜
    { doctor: 'E', room: '1', dayOfWeek: THU, start: '09:30', end: '11:00', label: '木曜午前' },
    { doctor: 'C', room: '1', dayOfWeek: THU, start: '11:00', end: '12:30', label: '木曜午前' },
    { doctor: 'A', room: '1', dayOfWeek: THU, start: '13:30', end: '16:00', label: '木曜午後' },
    { doctor: 'B', room: '2', dayOfWeek: THU, start: '13:30', end: '15:30', label: '木曜午後' },

    // 金曜（毎週）
    { doctor: 'A', room: '1', dayOfWeek: FRI, start: '09:30', end: '11:00', label: '金曜午前' },
    { doctor: 'D', room: '1', dayOfWeek: FRI, start: '11:00', end: '12:30', label: '金曜午前' },
    { doctor: 'B', room: '1', dayOfWeek: FRI, start: '13:30', end: '16:00', label: '金曜午後' },

    // 第2金曜だけ開く追加枠
    { doctor: 'C', room: '2', dayOfWeek: FRI, start: '09:30', end: '12:30', weekOfMonth: 2, label: '第2金曜 追加枠' },
    { doctor: 'E', room: '2', dayOfWeek: FRI, start: '13:30', end: '17:00', weekOfMonth: 2, label: '第2金曜 追加枠' },
    { doctor: 'A', room: '1', dayOfWeek: FRI, start: '16:00', end: '18:00', weekOfMonth: 2, label: '第2金曜 延長枠' },

    // 第4金曜だけ開く追加枠
    { doctor: 'E', room: '2', dayOfWeek: FRI, start: '09:30', end: '12:30', weekOfMonth: 4, label: '第4金曜 追加枠' },
    { doctor: 'C', room: '2', dayOfWeek: FRI, start: '13:30', end: '17:00', weekOfMonth: 4, label: '第4金曜 追加枠' },
    { doctor: 'A', room: '1', dayOfWeek: FRI, start: '16:00', end: '18:00', weekOfMonth: 4, label: '第4金曜 延長枠' },
  ];

  const roomIdByKey: Record<string, string> = { '1': room1.id, '2': room2.id };

  for (const def of scheduleDefs) {
    await prisma.dailySchedule.create({
      data: {
        doctorId: doctors[def.doctor].id,
        operatingRoomId: roomIdByKey[def.room],
        dayOfWeek: def.dayOfWeek,
        weekOfMonth: def.weekOfMonth ?? null,
        startTime: def.start,
        endTime: def.end,
        label: def.label ?? null,
      },
    });
  }

  // ---- 例外日 ----
  const today = startOfDay(new Date());
  const blockDate = nextWeekday(addDays(today, 8), WED);
  const addDate = nextWeekday(addDays(today, 15), TUE);

  await prisma.scheduleException.create({
    data: {
      date: blockDate,
      type: 'BLOCK',
      doctorId: null,
      operatingRoomId: null,
      startTime: '13:00',
      endTime: '18:00',
      reason: '院内研修のため午後休診',
    },
  });

  await prisma.scheduleException.create({
    data: {
      date: addDate,
      type: 'ADD',
      doctorId: doctors.A.id,
      operatingRoomId: room2.id,
      startTime: '09:30',
      endTime: '12:30',
      reason: '臨時手術枠（繁忙期対応）',
    },
  });

  // ---- 利用者 ----
  await prisma.user.create({
    data: {
      username: 'admin',
      password: await bcrypt.hash('admin123', 10),
      name: '管理者',
      displayName: '管理者',
      role: 'ADMIN',
    },
  });
  await prisma.user.create({
    data: {
      username: 'staff',
      password: await bcrypt.hash('staff123', 10),
      name: '外来スタッフ',
      displayName: '外来スタッフ',
      role: 'STAFF',
    },
  });
  await prisma.user.create({
    data: {
      username: 'doctor_a',
      password: await bcrypt.hash('doctor123', 10),
      name: 'A医師',
      displayName: 'A医師',
      role: 'DOCTOR',
      doctorId: doctors.A.id,
    },
  });

  await prisma.systemConfig.createMany({
    data: [
      { key: 'clinic_name', value: 'デモ外科クリニック', description: '表示用のクリニック名' },
      { key: 'slot_granularity_minutes', value: '30', description: '最低予約単位（分）' },
      { key: 'public_schedule_enabled', value: 'true', description: '公開予約表を有効にする' },
    ],
  });

  // ---- 既存予約（エンジンの判定を使って矛盾なく配置）----
  const snapshot: ScheduleSnapshot = {
    doctors: Object.values(doctors).map((d) => ({
      id: d.id,
      displayName: d.displayName,
      colorToken: d.color,
      surgeryIds: d.surgeryIds,
    })),
    rooms: [
      { id: room1.id, name: room1.name },
      { id: room2.id, name: room2.name },
    ],
    schedules: scheduleDefs.map((def, i) => ({
      id: `s${i}`,
      doctorId: doctors[def.doctor].id,
      operatingRoomId: roomIdByKey[def.room],
      dayOfWeek: def.dayOfWeek,
      weekOfMonth: def.weekOfMonth ?? null,
      startTime: def.start,
      endTime: def.end,
      label: def.label ?? null,
    })),
    exceptions: [
      {
        id: 'x1',
        dateKey: dateKey(blockDate),
        type: 'BLOCK',
        doctorId: null,
        operatingRoomId: null,
        startTime: '13:00',
        endTime: '18:00',
        reason: '院内研修のため午後休診',
      },
      {
        id: 'x2',
        dateKey: dateKey(addDate),
        type: 'ADD',
        doctorId: doctors.A.id,
        operatingRoomId: room2.id,
        startTime: '09:30',
        endTime: '12:30',
        reason: '臨時手術枠（繁忙期対応）',
      },
    ],
    bookings: [],
  };

  const surgeryIdToName: Record<string, string> = {};
  for (const [name, s] of Object.entries(surgeries)) surgeryIdToName[s.id] = name;

  const random = mulberry32(20260919);
  const patientNames = buildPatients();
  let patientIndex = 0;
  let bookingCount = 0;

  // 過去1週間 + 今後3週間ぶんを埋める
  for (let offset = -7; offset <= 21; offset++) {
    const date = addDays(today, offset);
    const key = dateKey(date);
    const slots = resolveSlotsForDate(snapshot, date);

    for (const slot of slots) {
      const doctor = snapshot.doctors.find((d) => d.id === slot.doctorId)!;
      // 枠の先頭から順に、確率的に埋めていく（全部は埋めない＝空きを残す）
      let cursor = slot.range.start;
      while (cursor < slot.range.end) {
        const fill = random() < 0.55;
        const candidates = doctor.surgeryIds
          .map((id) => ({ id, name: surgeryIdToName[id], dur: surgeries[surgeryIdToName[id]].requiredSlotDuration }))
          .filter((s) => cursor + s.dur <= slot.range.end);

        if (!fill || candidates.length === 0) {
          cursor += 30;
          continue;
        }

        const picked = candidates[Math.floor(random() * candidates.length)];
        const start = cursor;
        const end = cursor + picked.dur;

        // 医師・手術室の二重使用を防ぐ（別の枠で既に入っている可能性がある）
        const conflict = snapshot.bookings.some(
          (b) =>
            b.dateKey === key &&
            (b.doctorId === slot.doctorId || b.operatingRoomId === slot.operatingRoomId) &&
            toMinutes(b.startTime) < end &&
            start < toMinutes(b.endTime)
        );

        if (conflict) {
          cursor += 30;
          continue;
        }

        const patient = patientNames[patientIndex % patientNames.length];
        patientIndex++;

        const created = await prisma.booking.create({
          data: {
            patientId: patient.patientId,
            patientName: patient.name,
            patientBirth: patient.birth,
            surgeryId: picked.id,
            doctorId: slot.doctorId,
            operatingRoomId: slot.operatingRoomId,
            date,
            startTime: toTimeString(start),
            endTime: toTimeString(end),
            // 一部を仮押さえ（未確定）にして、確定待ちの運用をデモできるようにする
            status: offset < 0 ? 'COMPLETED' : random() < 0.06 ? 'TENTATIVE' : 'CONFIRMED',
            notes: null,
          },
        });

        snapshot.bookings.push({
          id: created.id,
          dateKey: key,
          doctorId: slot.doctorId,
          operatingRoomId: slot.operatingRoomId,
          startTime: toTimeString(start),
          endTime: toTimeString(end),
        });

        bookingCount++;
        cursor = end;
      }
    }
  }

  console.log(`手術室 2 / 手術 ${surgeryDefs.length} / 医師 ${doctorDefs.length}`);
  console.log(`定例枠 ${scheduleDefs.length} / 例外日 2 / 予約 ${bookingCount}`);
  console.log('デモデータの投入が完了しました。');
}

function nextWeekday(from: Date, dayOfWeek: number): Date {
  const date = startOfDay(from);
  const diff = (dayOfWeek - date.getDay() + 7) % 7;
  return addDays(date, diff);
}

function buildPatients() {
  const list: { patientId: string; name: string; birth: Date }[] = [];
  for (let i = 1; i <= 60; i++) {
    const id = String(i).padStart(3, '0');
    list.push({
      patientId: `P${id}`,
      name: `デモ患者${id}`,
      birth: new Date(1950 + ((i * 7) % 55), (i * 3) % 12, ((i * 5) % 27) + 1),
    });
  }
  return list;
}

main()
  .catch((error) => {
    console.error('デモデータの投入に失敗しました:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

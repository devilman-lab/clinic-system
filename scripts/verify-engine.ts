/**
 * 判定エンジンの実データ検証スクリプト。
 * `npm run verify` で、デモシナリオ（検索→予約→再検索で枠が消える）を
 * 実際の DB に対して通しで確認する。
 */

import { PrismaClient } from '@prisma/client';
import { searchAvailability, validateBooking } from '../src/lib/availability';
import { addDays, fromDateKey } from '../src/lib/time';

const prisma = new PrismaClient();

let failures = 0;

function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.log(`  NG   ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const surgeryC = await prisma.surgery.findUniqueOrThrow({ where: { name: 'C手術' } });
  const surgeryH = await prisma.surgery.findUniqueOrThrow({ where: { name: 'H手術' } });
  const [docA, docB, docC, docD] = await prisma.doctor.findMany({ orderBy: { sortOrder: 'asc' } });

  const start = new Date();
  const end = addDays(start, 14);

  console.log('\n[1] C手術 × A医師 指定検索');
  const byA = await searchAvailability({
    surgeryId: surgeryC.id,
    doctorIds: [docA.id],
    startDate: start,
    endDate: end,
  });
  assert('候補が見つかる', byA.totalFound > 0);
  assert('全候補がA医師', byA.slots.every((s) => s.doctorId === docA.id));
  assert('全候補が60分枠', byA.slots.every((s) => s.slotDuration === 60));
  byA.slots.slice(0, 3).forEach((s) =>
    console.log(`       ${s.dateLabel} ${s.startTime}-${s.endTime} ${s.doctorName} / ${s.operatingRoomName}`)
  );

  console.log('\n[2] C手術 × A/B/C医師 横断検索');
  const cross = await searchAvailability({
    surgeryId: surgeryC.id,
    doctorIds: [docA.id, docB.id, docC.id],
    startDate: start,
    endDate: end,
  });
  assert('候補が見つかる', cross.totalFound > 0);
  assert('A医師単独より候補が多い', cross.totalFound > byA.totalFound);
  assert(
    '日時の昇順に並んでいる',
    cross.slots.every(
      (s, i) => i === 0 || `${cross.slots[i - 1].dateKey}${cross.slots[i - 1].startTime}` <= `${s.dateKey}${s.startTime}`
    )
  );
  cross.slots.slice(0, 3).forEach((s, i) =>
    console.log(`       ${i + 1}位 ${s.dateLabel} ${s.startTime}-${s.endTime} ${s.doctorName} / ${s.operatingRoomName}`)
  );

  console.log('\n[3] 最短枠を予約 → 同条件で再検索');
  const top = cross.slots[0];
  const preCheck = await validateBooking({
    dateKey: top.dateKey,
    doctorId: top.doctorId,
    operatingRoomId: top.operatingRoomId,
    startTime: top.startTime,
    endTime: top.endTime,
    surgeryId: surgeryC.id,
  });
  assert('予約前の検証が通る', preCheck.ok, preCheck.errors.join(' / '));

  const created = await prisma.booking.create({
    data: {
      patientId: 'P-VERIFY',
      patientName: '検証用デモ患者',
      patientBirth: new Date('1980-01-01'),
      surgeryId: surgeryC.id,
      doctorId: top.doctorId,
      operatingRoomId: top.operatingRoomId,
      date: fromDateKey(top.dateKey),
      startTime: top.startTime,
      endTime: top.endTime,
      status: 'CONFIRMED',
    },
  });

  try {
    const after = await searchAvailability({
      surgeryId: surgeryC.id,
      doctorIds: [docA.id, docB.id, docC.id],
      startDate: start,
      endDate: end,
    });
    const survived = after.slots.some(
      (s) => s.dateKey === top.dateKey && s.startTime === top.startTime && s.doctorId === top.doctorId
    );
    console.log(`       予約した枠: ${top.dateLabel} ${top.startTime} ${top.doctorName} / ${top.operatingRoomName}`);
    assert('予約した枠が候補から消える', !survived);
    assert('候補数が減る', after.totalFound < cross.totalFound);

    const dup = await validateBooking({
      dateKey: top.dateKey,
      doctorId: top.doctorId,
      operatingRoomId: top.operatingRoomId,
      startTime: top.startTime,
      endTime: top.endTime,
      surgeryId: surgeryC.id,
    });
    assert('同じ枠の二重予約が拒否される', !dup.ok);
    console.log(`       理由: ${dup.errors.join(' / ')}`);

    console.log('\n[4] 医師は同時刻に別の手術室へ入れない');
    const otherRoom = await prisma.operatingRoom.findFirst({
      where: { id: { not: top.operatingRoomId } },
    });
    if (otherRoom) {
      const crossRoom = await validateBooking({
        dateKey: top.dateKey,
        doctorId: top.doctorId,
        operatingRoomId: otherRoom.id,
        startTime: top.startTime,
        endTime: top.endTime,
        surgeryId: surgeryC.id,
      });
      assert('別室でも同医師の同時刻は拒否される', !crossRoom.ok);
      console.log(`       理由: ${crossRoom.errors.join(' / ')}`);
    }
  } finally {
    await prisma.booking.delete({ where: { id: created.id } });
  }

  console.log('\n[5] 対応不可の医師を指定した場合');
  const impossible = await searchAvailability({
    surgeryId: surgeryC.id,
    doctorIds: [docD.id],
    startDate: start,
    endDate: end,
  });
  assert('候補が0件', impossible.totalFound === 0);
  assert('理由コードが NO_DOCTOR_IN_FILTER', impossible.diagnostics.code === 'NO_DOCTOR_IN_FILTER');
  console.log(`       ${impossible.diagnostics.message}`);

  console.log('\n[6] 90分手術（H手術）は枠に収まる場所にしか入らない');
  const h = await searchAvailability({
    surgeryId: surgeryH.id,
    startDate: start,
    endDate: end,
  });
  assert('全候補が90分', h.slots.every((s) => s.slotDuration === 90));
  assert('H手術の対応医師はA医師のみ', h.slots.every((s) => s.doctorId === docA.id));
  if (h.totalFound === 0) console.log(`       ${h.diagnostics.message}`);
  else console.log(`       最短: ${h.slots[0].dateLabel} ${h.slots[0].startTime}-${h.slots[0].endTime} ${h.slots[0].doctorName}`);

  console.log('\n[7] 第2・第4金曜の追加枠が効いている');
  const fridays = await searchAvailability({
    surgeryId: surgeryC.id,
    startDate: start,
    endDate: addDays(start, 35),
    limit: 500,
  });
  const room2Fridays = new Set(
    fridays.slots
      .filter((s) => fromDateKey(s.dateKey).getDay() === 5 && s.operatingRoomName === '手術室2')
      .map((s) => s.dateKey)
  );
  const weeks = [...room2Fridays].map((k) => Math.floor((fromDateKey(k).getDate() - 1) / 7) + 1);
  assert('手術室2の金曜枠は第2・第4週だけ', weeks.every((w) => w === 2 || w === 4), `週: ${weeks.join(',')}`);
  console.log(`       手術室2が開く金曜: ${[...room2Fridays].join(', ') || 'なし'}`);

  console.log(failures === 0 ? '\nすべての検証に成功しました。\n' : `\n${failures} 件の検証に失敗しました。\n`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import db from '@/lib/db';
import { dateKey, formatDateJa } from '@/lib/time';
import { ExceptionsClient } from './ExceptionsClient';

export const dynamic = 'force-dynamic';

export default async function ExceptionsPage() {
  const [exceptions, doctors, rooms] = await Promise.all([
    db.scheduleException.findMany({
      orderBy: { date: 'asc' },
      include: {
        doctor: { select: { displayName: true, colorToken: true } },
        operatingRoom: { select: { name: true } },
      },
    }),
    db.doctor.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, displayName: true, colorToken: true, isActive: true },
    }),
    db.operatingRoom.findMany({
      orderBy: { number: 'asc' },
      select: { id: true, name: true, isActive: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">例外日設定</h1>
        <p className="mt-1 text-sm text-slate-600">
          特定の日だけ、定例枠を閉じたり臨時の枠を追加したりします。祝日・学会・急な休診などはここで登録してください。
        </p>
      </div>

      <ExceptionsClient
        exceptions={exceptions.map((e) => ({
          id: e.id,
          dateKey: dateKey(e.date),
          dateLabel: formatDateJa(e.date),
          type: e.type === 'ADD' ? 'ADD' : 'BLOCK',
          doctorId: e.doctorId,
          doctorName: e.doctor?.displayName ?? null,
          doctorColorToken: e.doctor?.colorToken ?? null,
          operatingRoomId: e.operatingRoomId,
          roomName: e.operatingRoom?.name ?? null,
          startTime: e.startTime,
          endTime: e.endTime,
          reason: e.reason,
        }))}
        doctors={doctors}
        rooms={rooms}
        todayKey={dateKey(new Date())}
      />
    </div>
  );
}

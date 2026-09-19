import db from '@/lib/db';
import { SchedulesClient } from './SchedulesClient';

export const dynamic = 'force-dynamic';

export default async function SchedulesPage() {
  const [schedules, doctors, rooms] = await Promise.all([
    db.dailySchedule.findMany({
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      include: {
        doctor: { select: { displayName: true, colorToken: true } },
        operatingRoom: { select: { name: true, number: true } },
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
        <h1 className="text-xl font-semibold text-slate-900">定例枠設定</h1>
        <p className="mt-1 text-sm text-slate-600">
          毎週くり返す手術枠を「曜日 × 時間 × 医師 × 手術室」で登録します。第2・第4金曜だけの追加枠も、週指定を使ってここで設定できます。
        </p>
      </div>

      <SchedulesClient
        schedules={schedules.map((s) => ({
          id: s.id,
          doctorId: s.doctorId,
          doctorName: s.doctor.displayName,
          doctorColorToken: s.doctor.colorToken,
          operatingRoomId: s.operatingRoomId,
          roomName: s.operatingRoom.name,
          roomNumber: s.operatingRoom.number,
          dayOfWeek: s.dayOfWeek,
          weekOfMonth: s.weekOfMonth,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          isActive: s.isActive,
        }))}
        doctors={doctors}
        rooms={rooms}
      />
    </div>
  );
}

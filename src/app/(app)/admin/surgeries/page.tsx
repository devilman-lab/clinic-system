import db from '@/lib/db';
import { SurgeriesClient } from './SurgeriesClient';

export const dynamic = 'force-dynamic';

export default async function SurgeriesPage() {
  const [surgeries, doctors] = await Promise.all([
    db.surgery.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { doctors: { select: { id: true }, orderBy: { sortOrder: 'asc' } } },
    }),
    db.doctor.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, displayName: true, colorToken: true, isActive: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">手術管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          手術の種類ごとに、執刀にかかる時間と予約で確保する枠の長さ、担当できる医師を設定します。
        </p>
      </div>

      <SurgeriesClient
        surgeries={surgeries.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          standardDuration: s.standardDuration,
          requiredSlotDuration: s.requiredSlotDuration,
          isActive: s.isActive,
          doctorIds: s.doctors.map((d) => d.id),
        }))}
        doctors={doctors}
      />
    </div>
  );
}

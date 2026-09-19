import db from '@/lib/db';
import { DoctorsClient } from './DoctorsClient';

export const dynamic = 'force-dynamic';

export default async function DoctorsPage() {
  const [doctors, surgeries] = await Promise.all([
    db.doctor.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { surgeryTypes: { select: { id: true }, orderBy: { sortOrder: 'asc' } } },
    }),
    db.surgery.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, displayName: true, isActive: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">医師管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          医師の登録と、その医師が担当できる手術を設定します。ここで対応手術を追加すると、空き枠検索の候補にもすぐ反映されます。
        </p>
      </div>

      <DoctorsClient
        doctors={doctors.map((d) => ({
          id: d.id,
          name: d.name,
          displayName: d.displayName,
          colorToken: d.colorToken,
          isActive: d.isActive,
          surgeryIds: d.surgeryTypes.map((s) => s.id),
        }))}
        surgeries={surgeries}
      />
    </div>
  );
}

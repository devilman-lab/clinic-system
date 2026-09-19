import db from '@/lib/db';
import { RoomsClient } from './RoomsClient';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const rooms = await db.operatingRoom.findMany({
    orderBy: { number: 'asc' },
    select: { id: true, name: true, number: true, isActive: true },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">手術室管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          予約で使う手術室を登録します。改修などで一時的に使えない部屋は、削除せず「無効」にしてください。
        </p>
      </div>

      <RoomsClient rooms={rooms} />
    </div>
  );
}

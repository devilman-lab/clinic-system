'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelBookingAction } from '@/app/actions/bookings';
import { palette } from '@/lib/colors';
import type { Masters } from '@/lib/masters';
import { statusOf } from '@/lib/status';
import { Modal } from './Modal';
import { Alert, Badge, Button } from './ui';

export interface BookingDetail {
  id: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  surgeryId: string;
  surgeryName: string;
  doctorId: string;
  operatingRoomId: string;
  patientId: string;
  patientName: string;
  patientBirth: string;
  status: string;
  notes: string | null;
}

export function BookingDetailModal({
  booking,
  masters,
  onClose,
  onEdit,
}: {
  booking: BookingDetail | null;
  masters: Masters;
  onClose: () => void;
  onEdit: (booking: BookingDetail) => void;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [cancelled, setCancelled] = useState(false);

  // 一覧の再取得が終わってから閉じる（BookingModal と同じ理由）
  useEffect(() => {
    if (cancelled && !pending) onClose();
  }, [cancelled, pending, onClose]);

  // 別の予約を開いたとき、前回の確認状態やエラーを引き継がない
  const [lastBooking, setLastBooking] = useState(booking);
  if (booking !== lastBooking) {
    setLastBooking(booking);
    setCancelled(false);
    setConfirming(false);
    setErrors([]);
  }

  if (!booking) return null;

  const doctor = masters.doctors.find((d) => d.id === booking.doctorId);
  const room = masters.rooms.find((r) => r.id === booking.operatingRoomId);
  const status = statusOf(booking.status);

  const cancel = () => {
    startTransition(async () => {
      const result = await cancelBookingAction(booking.id);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      router.refresh();
      setCancelled(true);
    });
  };

  const rows: [string, React.ReactNode][] = [
    ['手術日', booking.dateKey],
    ['時間', `${booking.startTime} 〜 ${booking.endTime}`],
    ['手術', booking.surgeryName],
    [
      '担当医',
      doctor ? (
        <Badge key="doctor" className={palette(doctor.colorToken).chip}>
          {doctor.displayName}
        </Badge>
      ) : (
        '—'
      ),
    ],
    ['手術室', room?.name ?? '—'],
    ['患者', `${booking.patientName}（${booking.patientId}）`],
    ['生年月日', booking.patientBirth],
    [
      'ステータス',
      <Badge key="status" className={status.chip}>
        {status.label}
      </Badge>,
    ],
    ['備考', booking.notes || '—'],
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="予約の詳細"
      description="担当医・手術室・日時の変更は編集から行えます。"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            閉じる
          </Button>
          {booking.status !== 'CANCELLED' && (
            <>
              <Button variant="danger" onClick={() => setConfirming(true)} disabled={pending}>
                この予約をキャンセル
              </Button>
              <Button variant="primary" onClick={() => onEdit(booking)} disabled={pending}>
                編集する
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {errors.length > 0 && (
          <Alert tone="error">
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        )}

        {confirming && (
          <Alert tone="warning" title="この予約をキャンセルしますか？">
            <p className="mt-1">
              記録は残したままキャンセル済みに変更します。枠は他の予約に使えるようになります。
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                戻る
              </Button>
              <Button size="sm" variant="danger" onClick={cancel} disabled={pending}>
                {pending ? '処理中…' : 'キャンセルを確定'}
              </Button>
            </div>
          </Alert>
        )}

        <dl className="divide-y divide-slate-100">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-4 py-2.5">
              <dt className="w-24 shrink-0 text-sm text-slate-500">{label}</dt>
              <dd className="text-sm text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}

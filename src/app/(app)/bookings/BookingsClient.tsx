'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { BookingDetail, BookingDetailModal } from '@/components/BookingDetailModal';
import { BookingDraft, BookingModal } from '@/components/BookingModal';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from '@/components/ui';
import { palette } from '@/lib/colors';
import type { Masters } from '@/lib/masters';
import { statusOf } from '@/lib/status';

export interface BookingRow extends BookingDetail {
  operatingRoomName: string;
  doctorName: string;
  doctorColorToken: string;
  weekday: string;
}

export interface BookingFilters {
  from: string;
  to: string;
  doctorId: string;
  status: string;
  keyword: string;
}

export function BookingsClient({
  rows,
  masters,
  filters,
  total,
}: {
  rows: BookingRow[];
  masters: Masters;
  filters: BookingFilters;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState(filters);
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [draft, setDraft] = useState<BookingDraft | null>(null);

  const apply = (next: Partial<BookingFilters>) => {
    const merged = { ...form, ...next };
    setForm(merged);
    const q = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(merged)) {
      if (value) q.set(key, value);
      else q.delete(key);
    }
    router.push(`/bookings?${q.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">予約管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          登録済みの手術予約を絞り込んで確認し、日時・担当医・手術室の変更やキャンセルを行えます。
        </p>
      </div>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="開始日">
            <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </Field>
          <Field label="終了日">
            <Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
          </Field>
          <Field label="担当医">
            <Select value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
              <option value="">すべて</option>
              {masters.doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.displayName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ステータス">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">すべて</option>
              <option value="CONFIRMED">確定</option>
              <option value="TENTATIVE">仮押さえ</option>
              <option value="COMPLETED">実施済</option>
              <option value="CANCELLED">キャンセル</option>
            </Select>
          </Field>
          <Field label="患者ID・患者名">
            <Input
              value={form.keyword}
              placeholder="P001 / デモ患者"
              onChange={(e) => setForm({ ...form, keyword: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply({});
              }}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
          <Button variant="primary" onClick={() => apply({})}>
            絞り込む
          </Button>
          <Button
            onClick={() => {
              const cleared = { from: '', to: '', doctorId: '', status: '', keyword: '' };
              setForm(cleared);
              router.push('/bookings');
            }}
          >
            条件をクリア
          </Button>
          <p className="text-sm text-slate-600">
            {total.toLocaleString()} 件中 {rows.length.toLocaleString()} 件を表示
          </p>
        </div>
      </Card>

      <Card padded={false}>
        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="条件に一致する予約がありません"
              description="期間やステータスの条件を変更してください。"
            />
          </div>
        ) : (
          <div className="p-2">
            <Table head={['手術日', '時間', '手術', '担当医', '手術室', '患者', 'ステータス', '']}>
              {rows.map((row) => {
                const status = statusOf(row.status);
                return (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-800">
                      {row.dateKey}（{row.weekday}）
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-medium text-slate-900">
                      {row.startTime}〜{row.endTime}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">{row.surgeryName}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge className={palette(row.doctorColorToken).chip}>{row.doctorName}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">{row.operatingRoomName}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                      {row.patientName}
                      <span className="ml-1 text-xs text-slate-400">{row.patientId}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Badge className={status.chip}>{status.label}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <Button size="sm" onClick={() => setDetail(row)}>
                        詳細
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
      </Card>

      <BookingDetailModal
        booking={detail}
        masters={masters}
        onClose={() => setDetail(null)}
        onEdit={(booking) => {
          setDetail(null);
          setDraft({
            id: booking.id,
            patientId: booking.patientId,
            patientName: booking.patientName,
            patientBirth: booking.patientBirth,
            surgeryId: booking.surgeryId,
            doctorId: booking.doctorId,
            operatingRoomId: booking.operatingRoomId,
            dateKey: booking.dateKey,
            startTime: booking.startTime,
            notes: booking.notes ?? '',
          });
        }}
      />

      <BookingModal
        open={draft !== null}
        onClose={() => setDraft(null)}
        draft={draft}
        masters={masters}
      />
    </div>
  );
}

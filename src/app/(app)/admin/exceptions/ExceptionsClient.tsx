'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteExceptionAction,
  saveExceptionAction,
  type ExceptionInput,
} from '@/app/actions/masters';
import { Modal } from '@/components/Modal';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardTitle,
  EmptyState,
  Field,
  Input,
  Select,
  Table,
  cn,
} from '@/components/ui';
import { palette } from '@/lib/colors';
import { DeleteConfirm, ErrorList, ModalFooter, RowActions } from '../_shared';

type ExceptionType = 'ADD' | 'BLOCK';

export interface ExceptionRow {
  id: string;
  dateKey: string;
  dateLabel: string;
  type: ExceptionType;
  doctorId: string | null;
  doctorName: string | null;
  doctorColorToken: string | null;
  operatingRoomId: string | null;
  roomName: string | null;
  startTime: string | null;
  endTime: string | null;
  reason: string;
}

export interface DoctorOption {
  id: string;
  displayName: string;
  colorToken: string;
  isActive: boolean;
}

export interface RoomOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface ExceptionForm {
  id?: string;
  date: string;
  type: ExceptionType;
  doctorId: string;
  operatingRoomId: string;
  startTime: string;
  endTime: string;
  reason: string;
}

const TYPE_BADGE: Record<ExceptionType, string> = {
  BLOCK: 'border-red-200 bg-red-50 text-red-800',
  ADD: 'border-brand-200 bg-brand-50 text-brand-800',
};

const TYPE_LABEL: Record<ExceptionType, string> = {
  BLOCK: '枠を閉じる',
  ADD: '臨時枠を追加',
};

function targetLabel(row: ExceptionRow): string {
  const doctor = row.doctorName ?? '全医師';
  const room = row.roomName ?? '全手術室';
  return `${doctor} ／ ${room}`;
}

function timeLabel(row: ExceptionRow): string {
  return row.startTime && row.endTime ? `${row.startTime}〜${row.endTime}` : '終日';
}

function TypeOption({
  active,
  type,
  title,
  description,
  onClick,
}: {
  active: boolean;
  type: ExceptionType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-touch-target
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg border px-4 py-3 text-left transition-colors',
        !active && 'border-slate-300 bg-white hover:bg-slate-50',
        active && type === 'BLOCK' && 'border-red-400 bg-red-50 ring-2 ring-red-200',
        active && type === 'ADD' && 'border-brand-500 bg-brand-50 ring-2 ring-brand-200'
      )}
    >
      <span
        className={cn(
          'block text-sm font-semibold',
          !active && 'text-slate-700',
          active && type === 'BLOCK' && 'text-red-800',
          active && type === 'ADD' && 'text-brand-800'
        )}
      >
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
    </button>
  );
}

export function ExceptionsClient({
  exceptions,
  doctors,
  rooms,
  todayKey,
}: {
  exceptions: ExceptionRow[];
  doctors: DoctorOption[];
  rooms: RoomOption[];
  todayKey: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ExceptionForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ExceptionRow | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const upcoming = exceptions.filter((e) => e.dateKey >= todayKey);
  const past = exceptions.filter((e) => e.dateKey < todayKey);

  const openNew = () => {
    setErrors([]);
    setForm({
      date: todayKey,
      type: 'BLOCK',
      doctorId: '',
      operatingRoomId: '',
      startTime: '',
      endTime: '',
      reason: '',
    });
  };

  const openEdit = (row: ExceptionRow) => {
    setErrors([]);
    setForm({
      id: row.id,
      date: row.dateKey,
      type: row.type,
      doctorId: row.doctorId ?? '',
      operatingRoomId: row.operatingRoomId ?? '',
      startTime: row.startTime ?? '',
      endTime: row.endTime ?? '',
      reason: row.reason,
    });
  };

  const update = (patch: Partial<ExceptionForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setErrors([]);
  };

  const submit = () => {
    if (!form) return;
    const payload: ExceptionInput = {
      id: form.id,
      date: form.date,
      type: form.type,
      doctorId: form.doctorId || null,
      operatingRoomId: form.operatingRoomId || null,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      reason: form.reason,
    };

    startTransition(async () => {
      const result = await saveExceptionAction(payload);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      router.refresh();
      setForm(null);
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteExceptionAction(id);
      if (!result.ok) {
        setDeleteErrors(result.errors);
        return;
      }
      router.refresh();
      setDeleteTarget(null);
    });
  };

  const renderRows = (rows: ExceptionRow[], muted: boolean) =>
    rows.map((row) => (
      <tr key={row.id} className={cn(muted && 'text-slate-400')}>
        <td
          className={cn(
            'whitespace-nowrap border-l-4 px-3 py-3 font-medium',
            row.type === 'BLOCK' ? 'border-l-red-400' : 'border-l-brand-500',
            muted ? 'text-slate-500' : 'text-slate-900'
          )}
        >
          {row.dateLabel}
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          <Badge className={TYPE_BADGE[row.type]}>{TYPE_LABEL[row.type]}</Badge>
        </td>
        <td className="whitespace-nowrap px-3 py-3">
          <span className="flex flex-wrap items-center gap-1.5">
            {row.doctorName ? (
              <Badge className={palette(row.doctorColorToken).chip}>{row.doctorName}</Badge>
            ) : (
              <Badge>全医師</Badge>
            )}
            <Badge>{row.roomName ?? '全手術室'}</Badge>
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-3 tabular-nums">{timeLabel(row)}</td>
        <td className="px-3 py-3">{row.reason}</td>
        <td className="px-3 py-3">
          <RowActions
            onEdit={() => openEdit(row)}
            onDelete={() => {
              setDeleteErrors([]);
              setDeleteTarget(row);
            }}
          />
        </td>
      </tr>
    ));

  const head = ['日付', '種別', '対象', '時間', '理由', ''];

  return (
    <>
      <Card>
        <CardTitle
          description={`今後の予定 ${upcoming.length}件`}
          action={
            <Button variant="primary" onClick={openNew}>
              新規追加
            </Button>
          }
        >
          今後の例外日
        </CardTitle>

        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 border-l-4 border-l-red-400 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-red-800">枠を閉じる</p>
            <p className="mt-0.5 text-xs text-slate-600">
              通常どおりなら開いている定例枠を、その日だけ使えなくします。
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 border-l-4 border-l-brand-500 bg-white px-4 py-3">
            <p className="text-sm font-semibold text-brand-800">臨時枠を追加</p>
            <p className="mt-0.5 text-xs text-slate-600">
              定例枠にはない枠を、その日だけ特別に開きます。
            </p>
          </div>
        </div>

        {upcoming.length === 0 ? (
          <EmptyState
            title="今後の例外日は登録されていません"
            description="登録がない日は、定例枠設定のとおりに枠が開きます。"
            action={
              <Button variant="primary" onClick={openNew}>
                新規追加
              </Button>
            }
          />
        ) : (
          <Table head={head}>{renderRows(upcoming, false)}</Table>
        )}
      </Card>

      {past.length > 0 && (
        <Card>
          <CardTitle description="記録として残しています。予約済みの手術には影響しません。">
            過去の例外日（{past.length}件）
          </CardTitle>
          <Table head={head}>{renderRows(past, true)}</Table>
        </Card>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="lg"
        title={form?.id ? '例外日を編集' : '例外日を追加'}
        description="定例枠のルールより、この設定が優先されます。"
        footer={<ModalFooter onClose={() => setForm(null)} onSubmit={submit} pending={pending} />}
      >
        {form && (
          <div className="space-y-5">
            <ErrorList errors={errors} />

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">種別</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <TypeOption
                  active={form.type === 'BLOCK'}
                  type="BLOCK"
                  title="枠を閉じる"
                  description="休診・学会・設備点検など"
                  onClick={() => update({ type: 'BLOCK' })}
                />
                <TypeOption
                  active={form.type === 'ADD'}
                  type="ADD"
                  title="臨時枠を追加"
                  description="通常はない日・時間に枠を開く"
                  onClick={() => update({ type: 'ADD' })}
                />
              </div>
            </div>

            {form.type === 'ADD' ? (
              <Alert tone="info">
                臨時枠は、医師・手術室・開始/終了時刻をすべて指定してください。
              </Alert>
            ) : (
              <Alert tone="warning">
                医師・手術室・時刻は空欄にできます。すべて空欄にすると、その日は全医師・全手術室が終日休診になります。
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="日付" required>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => update({ date: e.target.value })}
                />
              </Field>

              <Field label="理由" required hint="一覧に表示されます。例：院内研修のため休診">
                <Input
                  value={form.reason}
                  onChange={(e) => update({ reason: e.target.value })}
                  placeholder="院内研修のため休診"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="医師"
                required={form.type === 'ADD'}
                hint={form.type === 'BLOCK' ? '空欄なら全医師が対象です。' : undefined}
              >
                <Select value={form.doctorId} onChange={(e) => update({ doctorId: e.target.value })}>
                  <option value="">
                    {form.type === 'BLOCK' ? '全医師（指定なし）' : '選択してください'}
                  </option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName}
                      {d.isActive ? '' : '（無効）'}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="手術室"
                required={form.type === 'ADD'}
                hint={form.type === 'BLOCK' ? '空欄なら全手術室が対象です。' : undefined}
              >
                <Select
                  value={form.operatingRoomId}
                  onChange={(e) => update({ operatingRoomId: e.target.value })}
                >
                  <option value="">
                    {form.type === 'BLOCK' ? '全手術室（指定なし）' : '選択してください'}
                  </option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isActive ? '' : '（無効）'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="開始時刻"
                required={form.type === 'ADD'}
                hint={form.type === 'BLOCK' ? '空欄なら終日が対象です。' : undefined}
              >
                <Input
                  type="time"
                  step={1800}
                  value={form.startTime}
                  onChange={(e) => update({ startTime: e.target.value })}
                />
              </Field>

              <Field label="終了時刻" required={form.type === 'ADD'}>
                <Input
                  type="time"
                  step={1800}
                  value={form.endTime}
                  onChange={(e) => update({ endTime: e.target.value })}
                />
              </Field>
            </div>

            {form.type === 'BLOCK' && (form.startTime !== '' || form.endTime !== '') && (
              <Button size="sm" onClick={() => update({ startTime: '', endTime: '' })}>
                時刻をクリアして終日にする
              </Button>
            )}
          </div>
        )}
      </Modal>

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        target={
          deleteTarget
            ? `${deleteTarget.dateLabel} ${TYPE_LABEL[deleteTarget.type]}（${targetLabel(deleteTarget)}）`
            : ''
        }
        note="削除すると、この日は定例枠設定どおりの扱いに戻ります。"
        errors={deleteErrors}
        pending={pending}
      />
    </>
  );
}

'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteScheduleAction, saveScheduleAction, type ScheduleInput } from '@/app/actions/masters';
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
import { toMinutes } from '@/lib/time';
import {
  ActiveBadge,
  ActiveToggle,
  ChipToggle,
  DeleteConfirm,
  ErrorList,
  ModalFooter,
  RowActions,
} from '../_shared';

export interface ScheduleRow {
  id: string;
  doctorId: string;
  doctorName: string;
  doctorColorToken: string;
  operatingRoomId: string;
  roomName: string;
  roomNumber: number;
  dayOfWeek: number;
  weekOfMonth: number | null;
  startTime: string;
  endTime: string;
  label: string | null;
  isActive: boolean;
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

interface ScheduleForm {
  id?: string;
  doctorId: string;
  operatingRoomId: string;
  dayOfWeek: number;
  weekOfMonth: string;
  startTime: string;
  endTime: string;
  label: string;
  isActive: boolean;
}

const DAY_SHORT = ['日', '月', '火', '水', '木', '金', '土'];
const DAY_LONG = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
const WEEK_OPTIONS = [
  { value: '', label: '毎週' },
  { value: '1', label: '第1週のみ' },
  { value: '2', label: '第2週のみ' },
  { value: '3', label: '第3週のみ' },
  { value: '4', label: '第4週のみ' },
  { value: '5', label: '第5週のみ' },
];

const EMPTY: ScheduleForm = {
  doctorId: '',
  operatingRoomId: '',
  dayOfWeek: 1,
  weekOfMonth: '',
  startTime: '09:00',
  endTime: '12:00',
  label: '',
  isActive: true,
};

function weekLabel(weekOfMonth: number | null): string {
  return weekOfMonth === null ? '毎週' : `第${weekOfMonth}週のみ`;
}

function durationLabel(start: string, end: string): string {
  const diff = toMinutes(end) - toMinutes(start);
  return diff > 0 ? `${diff}分` : '—';
}

export function SchedulesClient({
  schedules,
  doctors,
  rooms,
}: {
  schedules: ScheduleRow[];
  doctors: DoctorOption[];
  rooms: RoomOption[];
}) {
  const router = useRouter();
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const groups = useMemo(
    () =>
      DAY_LONG.map((label, day) => ({
        day,
        label,
        rows: schedules
          .filter((s) => s.dayOfWeek === day)
          .sort(
            (a, b) =>
              toMinutes(a.startTime) - toMinutes(b.startTime) || a.roomNumber - b.roomNumber
          ),
      })),
    [schedules]
  );

  const visibleGroups = groups.filter(
    (g) => (dayFilter === null || g.day === dayFilter) && g.rows.length > 0
  );
  const visibleCount = visibleGroups.reduce((sum, g) => sum + g.rows.length, 0);

  const openNew = () => {
    setErrors([]);
    setForm({ ...EMPTY, dayOfWeek: dayFilter ?? EMPTY.dayOfWeek });
  };

  const openEdit = (row: ScheduleRow) => {
    setErrors([]);
    setForm({
      id: row.id,
      doctorId: row.doctorId,
      operatingRoomId: row.operatingRoomId,
      dayOfWeek: row.dayOfWeek,
      weekOfMonth: row.weekOfMonth === null ? '' : String(row.weekOfMonth),
      startTime: row.startTime,
      endTime: row.endTime,
      label: row.label ?? '',
      isActive: row.isActive,
    });
  };

  const update = (patch: Partial<ScheduleForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setErrors([]);
  };

  const submit = () => {
    if (!form) return;
    const payload: ScheduleInput = {
      id: form.id,
      doctorId: form.doctorId,
      operatingRoomId: form.operatingRoomId,
      dayOfWeek: form.dayOfWeek,
      weekOfMonth: form.weekOfMonth === '' ? null : Number(form.weekOfMonth),
      startTime: form.startTime,
      endTime: form.endTime,
      label: form.label,
      isActive: form.isActive,
    };

    startTransition(async () => {
      const result = await saveScheduleAction(payload);
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
      const result = await deleteScheduleAction(id);
      if (!result.ok) {
        setDeleteErrors(result.errors);
        return;
      }
      router.refresh();
      setDeleteTarget(null);
    });
  };

  return (
    <>
      <Card>
        <CardTitle
          description={`登録 ${schedules.length}枠（有効 ${schedules.filter((s) => s.isActive).length}枠）`}
          action={
            <Button variant="primary" onClick={openNew}>
              新規追加
            </Button>
          }
        >
          定例枠一覧
        </CardTitle>

        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <ChipToggle selected={dayFilter === null} onClick={() => setDayFilter(null)}>
              全曜日
            </ChipToggle>
            {groups.map((group) => (
              <ChipToggle
                key={group.day}
                selected={dayFilter === group.day}
                onClick={() => setDayFilter(group.day)}
              >
                {DAY_SHORT[group.day]}
                <span className={cn('text-xs', dayFilter === group.day ? 'text-white/80' : 'text-slate-400')}>
                  {group.rows.length}
                </span>
              </ChipToggle>
            ))}
          </div>

          <Alert tone="info">
            第2金曜・第4金曜だけ開く追加枠は、曜日に「金曜日」、週指定に「第2週のみ」「第4週のみ」を選んで2件登録してください。毎週くり返す枠は週指定を「毎週」のままにします。
          </Alert>
        </div>

        {visibleCount === 0 ? (
          <EmptyState
            title={
              dayFilter === null
                ? '定例枠がまだ登録されていません'
                : `${DAY_LONG[dayFilter]}の定例枠はまだありません`
            }
            description="定例枠を登録すると、その時間帯が空き枠検索の対象になります。"
            action={
              <Button variant="primary" onClick={openNew}>
                新規追加
              </Button>
            }
          />
        ) : (
          <Table head={['曜日', '時間', '医師', '手術室', '週指定', 'ラベル', '']}>
            {visibleGroups.map((group) => (
              <Fragment key={group.day}>
                <tr className="bg-slate-50">
                  <th
                    colSpan={7}
                    scope="colgroup"
                    className="px-3 py-2 text-left text-xs font-semibold text-slate-600"
                  >
                    {group.label}
                    <span className="ml-2 font-normal text-slate-400">{group.rows.length}枠</span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.id} className={cn(!row.isActive && 'bg-slate-50/60')}>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge>{DAY_SHORT[row.dayOfWeek]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {row.startTime}〜{row.endTime}
                      </span>
                      <span className="ml-1.5 text-xs text-slate-400">
                        {durationLabel(row.startTime, row.endTime)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge className={palette(row.doctorColorToken).chip}>{row.doctorName}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.roomName}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {row.weekOfMonth === null ? (
                        <span className="text-slate-500">毎週</span>
                      ) : (
                        <Badge className="border-brand-200 bg-brand-50 text-brand-800">
                          {weekLabel(row.weekOfMonth)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <span className="flex flex-wrap items-center gap-2">
                        {row.label ?? <span className="text-slate-300">—</span>}
                        {!row.isActive && <ActiveBadge isActive={false} />}
                      </span>
                    </td>
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
                ))}
              </Fragment>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="lg"
        title={form?.id ? '定例枠を編集' : '定例枠を追加'}
        description="同じ手術室の同じ時間帯に枠が重なっていないか、保存時に確認します。"
        footer={<ModalFooter onClose={() => setForm(null)} onSubmit={submit} pending={pending} />}
      >
        {form && (
          <div className="space-y-5">
            <ErrorList errors={errors} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="医師" required>
                <Select
                  value={form.doctorId}
                  onChange={(e) => update({ doctorId: e.target.value })}
                >
                  <option value="">選択してください</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.displayName}
                      {d.isActive ? '' : '（無効）'}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="手術室" required>
                <Select
                  value={form.operatingRoomId}
                  onChange={(e) => update({ operatingRoomId: e.target.value })}
                >
                  <option value="">選択してください</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.isActive ? '' : '（無効）'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="曜日" required>
                <Select
                  value={String(form.dayOfWeek)}
                  onChange={(e) => update({ dayOfWeek: Number(e.target.value) })}
                >
                  {DAY_LONG.map((label, day) => (
                    <option key={label} value={day}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="開始時刻" required>
                <Input
                  type="time"
                  step={1800}
                  value={form.startTime}
                  onChange={(e) => update({ startTime: e.target.value })}
                />
              </Field>

              <Field
                label="終了時刻"
                required
                hint={`枠の長さ ${durationLabel(form.startTime, form.endTime)}`}
              >
                <Input
                  type="time"
                  step={1800}
                  value={form.endTime}
                  onChange={(e) => update({ endTime: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="週指定"
              required
              hint="「毎週」は毎週くり返す枠、「第2週のみ」などは月に1回だけ開く枠です。"
            >
              <Select
                value={form.weekOfMonth}
                onChange={(e) => update({ weekOfMonth: e.target.value })}
              >
                {WEEK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="ラベル" hint="一覧で見分けるための短いメモ。例：午前枠、内視鏡枠">
              <Input
                value={form.label}
                onChange={(e) => update({ label: e.target.value })}
                placeholder="午前枠"
              />
            </Field>

            <ActiveToggle
              checked={form.isActive}
              onChange={(v) => update({ isActive: v })}
              label="有効（この枠を空き枠検索の対象にする）"
            />
          </div>
        )}
      </Modal>

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        target={
          deleteTarget
            ? `${DAY_LONG[deleteTarget.dayOfWeek]} ${deleteTarget.startTime}〜${deleteTarget.endTime}（${deleteTarget.doctorName}／${deleteTarget.roomName}）`
            : ''
        }
        note="この曜日の枠が今後つくられなくなります。登録済みの予約はそのまま残ります。一時的に止めたいだけなら「無効」にしてください。"
        errors={deleteErrors}
        pending={pending}
      />
    </>
  );
}

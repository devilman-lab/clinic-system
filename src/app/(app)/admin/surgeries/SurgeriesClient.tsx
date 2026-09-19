'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteSurgeryAction, saveSurgeryAction, type SurgeryInput } from '@/app/actions/masters';
import { Modal } from '@/components/Modal';
import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, Table, cn } from '@/components/ui';
import { palette } from '@/lib/colors';
import {
  ActiveBadge,
  ActiveToggle,
  ChipToggle,
  DeleteConfirm,
  ErrorList,
  ModalFooter,
  RowActions,
} from '../_shared';

export interface SurgeryRow {
  id: string;
  displayName: string;
  standardDuration: number;
  requiredSlotDuration: number;
  isActive: boolean;
  doctorIds: string[];
}

export interface DoctorOption {
  id: string;
  displayName: string;
  colorToken: string;
  isActive: boolean;
}

/** 入力途中の空欄を保持したいので、分の項目だけ文字列で持つ。 */
interface SurgeryForm {
  id?: string;
  displayName: string;
  standardDuration: string;
  requiredSlotDuration: string;
  doctorIds: string[];
  isActive: boolean;
}

const EMPTY: SurgeryForm = {
  displayName: '',
  standardDuration: '60',
  requiredSlotDuration: '90',
  doctorIds: [],
  isActive: true,
};

const SLOT_PRESETS = [30, 60, 90, 120, 150, 180];

function minutes(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SurgeriesClient({
  surgeries,
  doctors,
}: {
  surgeries: SurgeryRow[];
  doctors: DoctorOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<SurgeryForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<SurgeryRow | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const doctor = (id: string) => doctors.find((d) => d.id === id);

  const openNew = () => {
    setErrors([]);
    setForm({ ...EMPTY });
  };

  const openEdit = (row: SurgeryRow) => {
    setErrors([]);
    setForm({
      id: row.id,
      displayName: row.displayName,
      standardDuration: String(row.standardDuration),
      requiredSlotDuration: String(row.requiredSlotDuration),
      doctorIds: [...row.doctorIds],
      isActive: row.isActive,
    });
  };

  const update = (patch: Partial<SurgeryForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setErrors([]);
  };

  const toggleDoctor = (id: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            doctorIds: prev.doctorIds.includes(id)
              ? prev.doctorIds.filter((d) => d !== id)
              : [...prev.doctorIds, id],
          }
        : prev
    );
    setErrors([]);
  };

  const submit = () => {
    if (!form) return;
    const payload: SurgeryInput = {
      id: form.id,
      displayName: form.displayName,
      standardDuration: minutes(form.standardDuration),
      requiredSlotDuration: minutes(form.requiredSlotDuration),
      doctorIds: form.doctorIds,
      isActive: form.isActive,
    };

    startTransition(async () => {
      const result = await saveSurgeryAction(payload);
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
      const result = await deleteSurgeryAction(id);
      if (!result.ok) {
        setDeleteErrors(result.errors);
        return;
      }
      router.refresh();
      setDeleteTarget(null);
    });
  };

  const turnover = form ? minutes(form.requiredSlotDuration) - minutes(form.standardDuration) : 0;

  return (
    <>
      <Card>
        <CardTitle
          description={`登録 ${surgeries.length}件（有効 ${surgeries.filter((s) => s.isActive).length}件）`}
          action={
            <Button variant="primary" onClick={openNew}>
              新規追加
            </Button>
          }
        >
          手術一覧
        </CardTitle>

        {surgeries.length === 0 ? (
          <EmptyState
            title="手術がまだ登録されていません"
            description="手術を登録すると、空き枠検索で選べるようになります。"
            action={
              <Button variant="primary" onClick={openNew}>
                新規追加
              </Button>
            }
          />
        ) : (
          <Table head={['手術名', '標準手術時間', '予約枠時間', '対応可能医師', '状態', '']}>
            {surgeries.map((row) => (
              <tr key={row.id} className={cn('align-top', !row.isActive && 'bg-slate-50/60')}>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                  {row.displayName}
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                  {row.standardDuration}分
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                  {row.requiredSlotDuration}分
                  <span className="ml-1.5 text-xs text-slate-400">
                    （入替 {row.requiredSlotDuration - row.standardDuration}分）
                  </span>
                </td>
                <td className="px-3 py-3">
                  {row.doctorIds.length === 0 ? (
                    <span className="text-xs text-amber-700">未設定（検索しても候補が出ません）</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {row.doctorIds.map((id) => {
                        const d = doctor(id);
                        return (
                          <Badge key={id} className={d ? palette(d.colorToken).chip : undefined}>
                            {d?.displayName ?? '（削除済み）'}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <ActiveBadge isActive={row.isActive} />
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
          </Table>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="lg"
        title={form?.id ? '手術を編集' : '手術を追加'}
        description="予約枠時間 ＝ 執刀時間 ＋ 前後の入れ替え時間です。"
        footer={<ModalFooter onClose={() => setForm(null)} onSubmit={submit} pending={pending} />}
      >
        {form && (
          <div className="space-y-5">
            <ErrorList errors={errors} />

            <Field label="手術名" required hint="例：白内障手術">
              <Input
                value={form.displayName}
                onChange={(e) => update({ displayName: e.target.value })}
                placeholder="白内障手術"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="標準手術時間（分）" required hint="実際に執刀している時間の目安">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={600}
                  step={5}
                  value={form.standardDuration}
                  onChange={(e) => update({ standardDuration: e.target.value })}
                />
              </Field>

              <Field
                label="予約枠時間（分）"
                required
                hint="30分の倍数で、標準手術時間以上にしてください。"
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={30}
                  max={600}
                  step={30}
                  value={form.requiredSlotDuration}
                  onChange={(e) => update({ requiredSlotDuration: e.target.value })}
                />
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">予約枠時間のよく使う値</p>
              <div className="flex flex-wrap gap-2">
                {SLOT_PRESETS.map((preset) => (
                  <ChipToggle
                    key={preset}
                    selected={minutes(form.requiredSlotDuration) === preset}
                    onClick={() => update({ requiredSlotDuration: String(preset) })}
                  >
                    {preset}分
                  </ChipToggle>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                予約ではこの長さで手術室と医師を押さえます。前後の入れ替え・器材準備の時間は現在
                <span className="font-semibold text-slate-700">{turnover}分</span>
                です。
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">対応可能医師</p>
                <span className="text-xs text-slate-500">{form.doctorIds.length}名を選択中</span>
              </div>

              {doctors.length === 0 ? (
                <p className="text-sm text-slate-500">医師がまだ登録されていません。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {doctors.map((d) => {
                    const selected = form.doctorIds.includes(d.id);
                    return (
                      <ChipToggle key={d.id} selected={selected} onClick={() => toggleDoctor(d.id)}>
                        <span
                          className={cn(
                            'h-2.5 w-2.5 rounded-full',
                            selected ? 'bg-white' : palette(d.colorToken).dot
                          )}
                        />
                        {d.displayName}
                        {!d.isActive && (
                          <span className={cn('text-[11px]', selected ? 'text-white/80' : 'text-slate-400')}>
                            無効
                          </span>
                        )}
                      </ChipToggle>
                    );
                  })}
                </div>
              )}

              <p className="mt-1.5 text-xs text-slate-500">
                医師管理の「対応可能手術」と同じ設定です。どちらから変更しても構いません。
              </p>
            </div>

            <ActiveToggle checked={form.isActive} onChange={(v) => update({ isActive: v })} />
          </div>
        )}
      </Modal>

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        target={deleteTarget?.displayName ?? ''}
        note="予約が残っている手術は削除できません。その場合は「無効」にして新規予約の対象から外してください。"
        errors={deleteErrors}
        pending={pending}
      />
    </>
  );
}

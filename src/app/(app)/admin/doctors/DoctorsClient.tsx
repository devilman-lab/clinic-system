'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteDoctorAction,
  saveDoctorAction,
  type DoctorInput,
} from '@/app/actions/masters';
import { Modal } from '@/components/Modal';
import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, Table, cn } from '@/components/ui';
import { DOCTOR_COLOR_TOKENS, palette } from '@/lib/colors';
import {
  ActiveBadge,
  ActiveToggle,
  ChipToggle,
  DeleteConfirm,
  ErrorList,
  ModalFooter,
  RowActions,
} from '../_shared';

export interface DoctorRow {
  id: string;
  name: string;
  displayName: string;
  colorToken: string;
  isActive: boolean;
  surgeryIds: string[];
}

export interface SurgeryOption {
  id: string;
  displayName: string;
  isActive: boolean;
}

type ColorToken = (typeof DOCTOR_COLOR_TOKENS)[number];

const COLOR_LABELS: Record<ColorToken, string> = {
  sky: 'スカイ',
  emerald: 'グリーン',
  violet: 'パープル',
  amber: 'アンバー',
  rose: 'ローズ',
  slate: 'グレー',
};

const EMPTY: DoctorInput = {
  displayName: '',
  name: '',
  colorToken: 'sky',
  surgeryIds: [],
  isActive: true,
};

export function DoctorsClient({
  doctors,
  surgeries,
}: {
  doctors: DoctorRow[];
  surgeries: SurgeryOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<DoctorInput | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DoctorRow | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const surgeryName = (id: string) => surgeries.find((s) => s.id === id)?.displayName ?? '（削除済み）';

  const openNew = () => {
    setErrors([]);
    setForm({ ...EMPTY });
  };

  const openEdit = (row: DoctorRow) => {
    setErrors([]);
    setForm({
      id: row.id,
      displayName: row.displayName,
      name: row.name,
      colorToken: row.colorToken,
      surgeryIds: [...row.surgeryIds],
      isActive: row.isActive,
    });
  };

  const update = (patch: Partial<DoctorInput>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setErrors([]);
  };

  const toggleSurgery = (id: string) => {
    setForm((prev) =>
      prev
        ? {
            ...prev,
            surgeryIds: prev.surgeryIds.includes(id)
              ? prev.surgeryIds.filter((s) => s !== id)
              : [...prev.surgeryIds, id],
          }
        : prev
    );
    setErrors([]);
  };

  const submit = () => {
    if (!form) return;
    startTransition(async () => {
      const result = await saveDoctorAction(form);
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
      const result = await deleteDoctorAction(id);
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
          description={`登録 ${doctors.length}名（有効 ${doctors.filter((d) => d.isActive).length}名）`}
          action={
            <Button variant="primary" onClick={openNew}>
              新規追加
            </Button>
          }
        >
          医師一覧
        </CardTitle>

        {doctors.length === 0 ? (
          <EmptyState
            title="医師がまだ登録されていません"
            description="医師を登録すると、定例枠の設定や空き枠検索の対象になります。"
            action={
              <Button variant="primary" onClick={openNew}>
                新規追加
              </Button>
            }
          />
        ) : (
          <Table head={['表示名', '氏名', '対応可能手術', '状態', '']}>
            {doctors.map((row) => (
              <tr key={row.id} className={cn('align-top', !row.isActive && 'bg-slate-50/60')}>
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2 font-medium text-slate-900">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', palette(row.colorToken).dot)} />
                    {row.displayName}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.name}</td>
                <td className="px-3 py-3">
                  {row.surgeryIds.length === 0 ? (
                    <span className="text-xs text-amber-700">未設定（検索の候補になりません）</span>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {row.surgeryIds.map((id) => (
                        <Badge key={id}>{surgeryName(id)}</Badge>
                      ))}
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
        title={form?.id ? '医師を編集' : '医師を追加'}
        description="表示名はカレンダーや検索結果に表示されます。"
        footer={<ModalFooter onClose={() => setForm(null)} onSubmit={submit} pending={pending} />}
      >
        {form && (
          <div className="space-y-5">
            <ErrorList errors={errors} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="表示名" required hint="例：A医師">
                <Input
                  value={form.displayName}
                  onChange={(e) => update({ displayName: e.target.value })}
                  placeholder="A医師"
                />
              </Field>

              <Field label="氏名" required hint="院内の名簿に載せる正式な氏名">
                <Input
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="山田 太郎"
                />
              </Field>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">表示色</p>
              <div className="flex flex-wrap gap-2">
                {DOCTOR_COLOR_TOKENS.map((token) => (
                  <ChipToggle
                    key={token}
                    selected={form.colorToken === token}
                    onClick={() => update({ colorToken: token })}
                  >
                    <span
                      className={cn(
                        'h-3 w-3 rounded-full',
                        palette(token).dot,
                        form.colorToken === token && 'ring-2 ring-white'
                      )}
                    />
                    {COLOR_LABELS[token]}
                  </ChipToggle>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                カレンダーや検索結果で、この医師の枠を見分けるための色です。
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">対応可能手術</p>
                <span className="text-xs text-slate-500">{form.surgeryIds.length}件を選択中</span>
              </div>

              {surgeries.length === 0 ? (
                <p className="text-sm text-slate-500">手術がまだ登録されていません。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {surgeries.map((surgery) => {
                    const selected = form.surgeryIds.includes(surgery.id);
                    return (
                      <ChipToggle
                        key={surgery.id}
                        selected={selected}
                        onClick={() => toggleSurgery(surgery.id)}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded border text-[10px] leading-none',
                            selected ? 'border-white/70 bg-white/20 text-white' : 'border-slate-300 text-transparent'
                          )}
                        >
                          ✓
                        </span>
                        {surgery.displayName}
                        {!surgery.isActive && (
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
                タップで選択／解除できます。ここで選んだ手術だけが、この医師の担当候補として検索されます。
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
        target={deleteTarget ? `${deleteTarget.displayName}（${deleteTarget.name}）` : ''}
        note="予約が残っている医師は削除できません。その場合は「無効」にして新規予約の対象から外してください。"
        errors={deleteErrors}
        pending={pending}
      />
    </>
  );
}

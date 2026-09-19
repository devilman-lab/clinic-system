'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteRoomAction, saveRoomAction, type RoomInput } from '@/app/actions/masters';
import { Modal } from '@/components/Modal';
import { Button, Card, CardTitle, EmptyState, Field, Input, Table, cn } from '@/components/ui';
import {
  ActiveBadge,
  ActiveToggle,
  DeleteConfirm,
  ErrorList,
  ModalFooter,
  RowActions,
} from '../_shared';

export interface RoomRow {
  id: string;
  name: string;
  number: number;
  isActive: boolean;
}

interface RoomForm {
  id?: string;
  name: string;
  number: string;
  isActive: boolean;
}

const EMPTY: RoomForm = { name: '', number: '', isActive: true };

export function RoomsClient({ rooms }: { rooms: RoomRow[] }) {
  const router = useRouter();
  const [form, setForm] = useState<RoomForm | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<RoomRow | null>(null);
  const [deleteErrors, setDeleteErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const openNew = () => {
    setErrors([]);
    const nextNumber = rooms.reduce((max, r) => Math.max(max, r.number), 0) + 1;
    setForm({ ...EMPTY, number: String(nextNumber) });
  };

  const openEdit = (row: RoomRow) => {
    setErrors([]);
    setForm({ id: row.id, name: row.name, number: String(row.number), isActive: row.isActive });
  };

  const update = (patch: Partial<RoomForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setErrors([]);
  };

  const submit = () => {
    if (!form) return;
    const parsed = Number(form.number);
    const payload: RoomInput = {
      id: form.id,
      name: form.name,
      number: Number.isFinite(parsed) ? parsed : 0,
      isActive: form.isActive,
    };

    startTransition(async () => {
      const result = await saveRoomAction(payload);
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
      const result = await deleteRoomAction(id);
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
          description={`登録 ${rooms.length}室（有効 ${rooms.filter((r) => r.isActive).length}室）`}
          action={
            <Button variant="primary" onClick={openNew}>
              新規追加
            </Button>
          }
        >
          手術室一覧
        </CardTitle>

        {rooms.length === 0 ? (
          <EmptyState
            title="手術室がまだ登録されていません"
            description="手術室を登録すると、定例枠の設定や予約の割り当てができるようになります。"
            action={
              <Button variant="primary" onClick={openNew}>
                新規追加
              </Button>
            }
          />
        ) : (
          <Table head={['番号', '名称', '状態', '']}>
            {rooms.map((row) => (
              <tr key={row.id} className={cn(!row.isActive && 'bg-slate-50/60')}>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums font-medium text-slate-900">
                  {row.number}
                </td>
                <td className="px-3 py-3 text-slate-700">{row.name}</td>
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
        title={form?.id ? '手術室を編集' : '手術室を追加'}
        description="名称と番号は、それぞれ院内で重複しないようにしてください。"
        footer={<ModalFooter onClose={() => setForm(null)} onSubmit={submit} pending={pending} />}
      >
        {form && (
          <div className="space-y-5">
            <ErrorList errors={errors} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="番号" required hint="一覧の並び順に使います。">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  value={form.number}
                  onChange={(e) => update({ number: e.target.value })}
                />
              </Field>

              <Field label="名称" required hint="例：第1手術室">
                <Input
                  value={form.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="第1手術室"
                />
              </Field>
            </div>

            <ActiveToggle checked={form.isActive} onChange={(v) => update({ isActive: v })} />
          </div>
        )}
      </Modal>

      <DeleteConfirm
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        target={deleteTarget?.name ?? ''}
        note="予約が残っている手術室は削除できません。その場合は「無効」にしてください。定例枠も一緒に削除されます。"
        errors={deleteErrors}
        pending={pending}
      />
    </>
  );
}

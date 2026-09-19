'use client';

import { ReactNode } from 'react';
import { Modal } from '@/components/Modal';
import { Alert, Badge, Button, cn } from '@/components/ui';

export function ErrorList({
  errors,
  title = 'この内容では保存できません',
}: {
  errors: string[];
  title?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <Alert tone="error" title={title}>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </Alert>
  );
}

export function ChipToggle({
  selected,
  onClick,
  children,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      data-touch-target
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
        selected
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      )}
    >
      {children}
    </button>
  );
}

export function ActiveToggle({
  checked,
  onChange,
  label = '有効（予約・検索の対象にする）',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <label
      data-touch-target
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5 shadow-sm transition-colors hover:bg-slate-50"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 accent-brand-600"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">有効</Badge>
  ) : (
    <Badge className="border-slate-200 bg-slate-100 text-slate-500">無効</Badge>
  );
}

export function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" onClick={onEdit}>
        編集
      </Button>
      <Button size="sm" variant="danger" onClick={onDelete}>
        削除
      </Button>
    </div>
  );
}

export function DeleteConfirm({
  open,
  onClose,
  onConfirm,
  target,
  note,
  errors,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  target: string;
  note?: ReactNode;
  errors: string[];
  pending: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="削除の確認"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? '削除中…' : '削除する'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorList errors={errors} title="削除できませんでした" />
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">{target}</span> を削除します。この操作は元に戻せません。
        </p>
        {note && <div className="text-sm text-slate-500">{note}</div>}
      </div>
    </Modal>
  );
}

export function ModalFooter({
  onClose,
  onSubmit,
  pending,
  submitLabel = '保存',
}: {
  onClose: () => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel?: string;
}) {
  return (
    <>
      <Button onClick={onClose} disabled={pending}>
        キャンセル
      </Button>
      <Button variant="primary" onClick={onSubmit} disabled={pending}>
        {pending ? '保存中…' : submitLabel}
      </Button>
    </>
  );
}

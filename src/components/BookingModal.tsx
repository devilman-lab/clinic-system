'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createBookingAction, updateBookingAction } from '@/app/actions/bookings';
import type { Masters } from '@/lib/masters';
import { toMinutes, toTimeString } from '@/lib/time';
import { Modal } from './Modal';
import { Alert, Badge, Button, Field, Input, Select, Textarea } from './ui';

export interface BookingDraft {
  id?: string;
  patientId: string;
  patientName: string;
  patientBirth: string;
  surgeryId: string;
  doctorId: string;
  operatingRoomId: string;
  dateKey: string;
  startTime: string;
  notes: string;
}

export function BookingModal({
  open,
  onClose,
  draft,
  masters,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draft: BookingDraft | null;
  masters: Masters;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<BookingDraft | null>(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  // モーダルを開き直したときに前回の入力が残らないようにする
  const [lastDraft, setLastDraft] = useState(draft);
  if (draft !== lastDraft) {
    setLastDraft(draft);
    setForm(draft);
    setErrors([]);
  }

  const isEdit = Boolean(form?.id);

  const surgery = useMemo(
    () => masters.surgeries.find((s) => s.id === form?.surgeryId),
    [masters.surgeries, form?.surgeryId]
  );

  const endTime = useMemo(() => {
    if (!form || !surgery) return '';
    return toTimeString(toMinutes(form.startTime) + surgery.requiredSlotDuration);
  }, [form, surgery]);

  // 選択中の手術に対応できる医師だけを担当医の候補にする
  const eligibleDoctors = useMemo(
    () => masters.doctors.filter((d) => (surgery ? d.surgeryIds.includes(surgery.id) : true)),
    [masters.doctors, surgery]
  );

  if (!form) return null;

  const update = (patch: Partial<BookingDraft>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
    setErrors([]);
  };

  const handleSurgeryChange = (surgeryId: string) => {
    const next = masters.surgeries.find((s) => s.id === surgeryId);
    const doctorStillEligible = next?.doctorIds.includes(form.doctorId) ?? false;
    update({ surgeryId, doctorId: doctorStillEligible ? form.doctorId : '' });
  };

  const submit = () => {
    const payload = {
      patientId: form.patientId,
      patientName: form.patientName,
      patientBirth: form.patientBirth,
      surgeryId: form.surgeryId,
      doctorId: form.doctorId,
      operatingRoomId: form.operatingRoomId,
      dateKey: form.dateKey,
      startTime: form.startTime,
      notes: form.notes,
    };

    startTransition(async () => {
      const result = form.id
        ? await updateBookingAction({ ...payload, id: form.id })
        : await createBookingAction(payload);

      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      router.refresh();
      onSaved?.();
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? '予約を変更' : '手術予約を登録'}
      description={
        isEdit
          ? '変更内容は保存時に医師・手術室の重複チェックを通します。'
          : '選択した枠に予約を登録します。保存時に再度重複チェックを行います。'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? '保存中…' : isEdit ? '変更を保存' : '予約を確定'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errors.length > 0 && (
          <Alert tone="error" title="この内容では保存できません">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
          <p className="text-xs font-medium text-brand-700">予約する枠</p>
          <p className="mt-1 text-base font-semibold text-brand-900">
            {form.dateKey} {form.startTime}
            {endTime && ` 〜 ${endTime}`}
          </p>
          {surgery && (
            <p className="mt-1 text-xs text-brand-800">
              {surgery.displayName}：執刀 {surgery.standardDuration}分 ／ 確保する枠{' '}
              {surgery.requiredSlotDuration}分（前後の入れ替え時間を含む）
            </p>
          )}
        </div>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-semibold text-slate-800">患者情報</legend>
          <Alert tone="warning">
            デモ環境です。実在する患者の氏名・生年月日は入力しないでください。
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="患者ID" required>
              <Input
                value={form.patientId}
                onChange={(e) => update({ patientId: e.target.value })}
                placeholder="P001"
              />
            </Field>
            <Field label="患者名" required>
              <Input
                value={form.patientName}
                onChange={(e) => update({ patientName: e.target.value })}
                placeholder="デモ患者001"
              />
            </Field>
          </div>

          <Field label="生年月日" required>
            <Input
              type="date"
              value={form.patientBirth}
              onChange={(e) => update({ patientBirth: e.target.value })}
            />
          </Field>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-1 text-sm font-semibold text-slate-800">手術内容</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="手術種類" required>
              <Select value={form.surgeryId} onChange={(e) => handleSurgeryChange(e.target.value)}>
                <option value="">選択してください</option>
                {masters.surgeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}（枠 {s.requiredSlotDuration}分）
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="担当医"
              required
              hint={surgery ? `${surgery.displayName}に対応できる医師のみ表示しています` : undefined}
            >
              <Select value={form.doctorId} onChange={(e) => update({ doctorId: e.target.value })}>
                <option value="">選択してください</option>
                {eligibleDoctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="手術室" required>
              <Select
                value={form.operatingRoomId}
                onChange={(e) => update({ operatingRoomId: e.target.value })}
              >
                <option value="">選択してください</option>
                {masters.rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="手術日" required>
              <Input
                type="date"
                value={form.dateKey}
                onChange={(e) => update({ dateKey: e.target.value })}
              />
            </Field>

            <Field label="開始時刻" required hint={endTime ? `終了 ${endTime}` : undefined}>
              <Input
                type="time"
                step={1800}
                value={form.startTime}
                onChange={(e) => update({ startTime: e.target.value })}
              />
            </Field>
          </div>

          <Field label="備考">
            <Textarea
              value={form.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="院内での申し送り事項など"
            />
          </Field>
        </fieldset>

        <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Badge>保存時チェック</Badge>
          担当医の対応可否・定例枠の範囲・手術室の空き・既存予約との重複を再判定します。
        </p>
      </div>
    </Modal>
  );
}

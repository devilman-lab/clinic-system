'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveSettingsAction, type SettingsInput } from '@/app/actions/masters';
import { Alert, Button, Card, CardTitle, Field, Input } from '@/components/ui';
import { ChipToggle, ErrorList } from '../_shared';

export function SettingsClient({ settings }: { settings: SettingsInput }) {
  const router = useRouter();
  const [form, setForm] = useState<SettingsInput>(settings);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const update = (patch: Partial<SettingsInput>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setErrors([]);
    setSaved(false);
  };

  const submit = () => {
    startTransition(async () => {
      const result = await saveSettingsAction(form);
      if (!result.ok) {
        setErrors(result.errors);
        setSaved(false);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardTitle description="画面の表示や公開範囲に関する設定です。">基本設定</CardTitle>

      <div className="space-y-5">
        <ErrorList errors={errors} />
        {saved && <Alert tone="success">設定を保存しました。</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="クリニック名" required hint="画面上部やログイン画面に表示されます。">
            <Input
              value={form.clinic_name}
              onChange={(e) => update({ clinic_name: e.target.value })}
              placeholder="デモ外科クリニック"
            />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">公開予約表</p>
          <div className="flex flex-wrap gap-2">
            <ChipToggle
              selected={form.public_schedule_enabled === 'true'}
              onClick={() => update({ public_schedule_enabled: 'true' })}
            >
              公開する
            </ChipToggle>
            <ChipToggle
              selected={form.public_schedule_enabled === 'false'}
              onClick={() => update({ public_schedule_enabled: 'false' })}
            >
              公開しない
            </ChipToggle>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            ログインしていない方に、空き状況のみを表示する画面を出すかどうかの設定です。患者情報は表示されません。
          </p>
        </div>

        <div className="border-t border-slate-200 pt-4">
          <Button variant="primary" size="lg" onClick={submit} disabled={pending}>
            {pending ? '保存中…' : '設定を保存'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

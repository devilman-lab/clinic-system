'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { loginAction, type LoginState } from '@/app/actions/auth';
import { Alert, Button, Field, Input } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? 'サインイン中…' : 'サインイン'}
    </Button>
  );
}

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123', role: '管理者', note: 'マスタ設定を含む全機能' },
  { username: 'staff', password: 'staff123', role: 'スタッフ', note: '予約の検索・登録・変更' },
  { username: 'doctor_a', password: 'doctor123', role: '医師', note: 'スケジュールの閲覧中心' },
];

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, { error: null });

  return (
    <div className="w-full max-w-sm">
      <form action={formAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1">
          <h1 className="text-lg font-semibold text-slate-900">院内スタッフ用サインイン</h1>
          <p className="mt-1 text-sm text-slate-500">
            医療情報を扱うため、ご自身のアカウントでサインインしてください。
          </p>
        </div>

        {state.error && <Alert tone="error">{state.error}</Alert>}

        <input type="hidden" name="next" value={next ?? ''} />

        <Field label="ユーザーID" required>
          <Input name="username" autoComplete="username" required autoFocus />
        </Field>

        <Field label="パスワード" required>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>

        <SubmitButton />
      </form>

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-100/70 p-4">
        <p className="text-xs font-semibold text-slate-600">デモ用アカウント</p>
        <ul className="mt-2 space-y-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.username} className="text-xs text-slate-600">
              <code className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-800">
                {account.username}
              </code>
              <span className="px-1 text-slate-400">/</span>
              <code className="rounded bg-white px-1.5 py-0.5 text-slate-800">{account.password}</code>
              <span className="ml-1.5 text-slate-500">
                {account.role} — {account.note}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          デモ環境のため固定アカウントを表示しています。本番では表示せず、パスワードポリシー・多要素認証・
          アカウントロックの運用が必要です。
        </p>
      </div>
    </div>
  );
}

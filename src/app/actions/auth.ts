'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authenticate, clearSessionCookie, setSessionCookie } from '@/lib/auth';

const LoginSchema = z.object({
  username: z.string().trim().min(1, 'ユーザーIDを入力してください。').max(64),
  password: z.string().min(1, 'パスワードを入力してください。').max(200),
  next: z.string().optional(),
});

export interface LoginState {
  error: string | null;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
    next: formData.get('next'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力内容を確認してください。' };
  }

  const user = await authenticate(parsed.data.username, parsed.data.password);

  if (!user) {
    // ユーザー名とパスワードのどちらが誤りかは明かさない
    return { error: 'ユーザーIDまたはパスワードが正しくありません。' };
  }

  await setSessionCookie(user);

  // オープンリダイレクト対策: 自サイト内の相対パスだけを許可する
  const next = parsed.data.next;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  redirect(safeNext);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

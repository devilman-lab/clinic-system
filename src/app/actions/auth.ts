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

  let user: Awaited<ReturnType<typeof authenticate>>;
  try {
    user = await authenticate(parsed.data.username, parsed.data.password);
  } catch (error) {
    // 接続文字列の誤り・テーブル未作成はデプロイ直後に起きやすいので、原因を画面で示す
    console.error('[login] database error', error);
    return {
      error:
        'データベースに接続できないか、テーブルが作成されていません。DATABASE_URL の設定と、npm run db:push / db:seed の実行を確認してください（/api/health で状態を確認できます）。',
    };
  }

  if (!user) {
    // ユーザー名とパスワードのどちらが誤りかは明かさない
    return { error: 'ユーザーIDまたはパスワードが正しくありません。' };
  }

  try {
    await setSessionCookie(user);
  } catch (error) {
    console.error('[login] session error', error);
    return {
      error: 'セッションを発行できません。環境変数 SESSION_SECRET が設定されているか確認してください。',
    };
  }

  // オープンリダイレクト対策: 自サイト内の相対パスだけを許可する
  const next = parsed.data.next;
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  redirect(safeNext);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect('/login');
}

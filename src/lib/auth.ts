/**
 * セッション管理。
 *
 * - トークンは HMAC-SHA256 署名付きで改ざんを検出する
 * - Cookie は httpOnly / sameSite=lax / 本番は secure
 *   （localStorage に認証情報を置かないため XSS でトークンを抜かれない）
 * - 署名鍵は環境変数から読む
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import db from './db';

export const SESSION_COOKIE = 'clinic_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export type Role = 'ADMIN' | 'STAFF' | 'DOCTOR';

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  doctorId: string | null;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value) {
    throw new Error(
      'SESSION_SECRET が設定されていません。.env に署名鍵を設定してください。'
    );
  }
  return value;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(body: string): string {
  return base64url(createHmac('sha256', secret()).update(body).digest());
}

export function createToken(user: SessionUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(fromBase64url(body).toString()) as SessionPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return {
      id: payload.id,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      doctorId: payload.doctorId,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

/**
 * Secure 属性は NODE_ENV ではなく実際の接続方式で決める。
 * HTTP 接続に Secure を付けるとブラウザ（特に Safari / WebKit）が Cookie を保存せず、
 * ログインが黙って失敗する。平文接続では Secure を付けても保護にならないため、
 * HTTPS のときだけ付与する。本番は HSTS と併用する前提（next.config.ts 参照）。
 */
async function isSecureRequest(): Promise<boolean> {
  const proto = (await headers()).get('x-forwarded-proto');
  return proto?.split(',')[0].trim() === 'https';
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: await isSecureRequest(),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function authenticate(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const bcrypt = await import('bcryptjs');
  const user = await db.user.findUnique({ where: { username } });

  // ユーザーが存在しない場合もハッシュ比較を走らせ、応答時間から存在有無が漏れないようにする
  const hash = user?.password ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const matched = await bcrypt.compare(password, hash);

  if (!user || !user.isActive || !matched) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role as Role,
    doctorId: user.doctorId,
  };
}

/** API / Server Action 側の権限チェック。画面側の出し分けだけに頼らない。 */
export class AuthorizationError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthorizationError(401, 'ログインが必要です。');
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthorizationError(403, 'この操作を行う権限がありません。');
  }
  return user;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: '管理者',
  STAFF: 'スタッフ',
  DOCTOR: '医師',
};

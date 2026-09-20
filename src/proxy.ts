import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from './lib/session-cookie';

/**
 * 未ログインのまま業務画面へ来た場合にログイン画面へ戻すための一次ゲート。
 *
 * ここでは Cookie の有無しか見ない（署名検証はしない）。
 * 署名検証と権限チェックは各ページ・各 Server Action の Node ランタイム側で必ず行う。
 * つまりこの層は UX のためのものであって、認可の拠り所ではない。
 */

const PUBLIC_PATHS = ['/login', '/schedule'];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

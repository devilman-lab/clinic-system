/**
 * proxy.ts（リクエスト前段）からも参照するため、依存のない単独ファイルに置く。
 * auth.ts を直接 import すると Prisma クライアントまで前段に巻き込んでしまう。
 */
export const SESSION_COOKIE = 'clinic_session';

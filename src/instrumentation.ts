/**
 * サーバー起動時に一度だけ実行される Next.js のフック。
 *
 * 「本日」「曜日」「第N週」の判定はサーバーのローカル時刻で行うため、
 * 実行環境の時刻帯に依存させず、クリニックの時刻帯に固定する。
 *
 * TZ の有無で判定してはいけない：Vercel（AWS Lambda）は TZ=":UTC" を
 * 明示的に渡してくるため「未設定なら東京」では上書きされない。
 * Node は実行時の process.env.TZ への代入を反映する。
 */
export const DEFAULT_CLINIC_TIMEZONE = 'Asia/Tokyo';

export async function register() {
  process.env.TZ = process.env.CLINIC_TIMEZONE || DEFAULT_CLINIC_TIMEZONE;
}

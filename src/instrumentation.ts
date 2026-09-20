/**
 * サーバー起動時に一度だけ実行される Next.js のフック。
 *
 * 「本日」「曜日」「第N週」の判定はサーバーのローカル時刻で行うため、
 * 時刻帯が UTC の実行環境（Vercel など）ではクリニックの日付とずれてしまう。
 * 環境変数 TZ が未設定なら日本時間を既定にする。Node は実行時の TZ 変更を反映する。
 */
export async function register() {
  if (!process.env.TZ) {
    process.env.TZ = 'Asia/Tokyo';
  }
}

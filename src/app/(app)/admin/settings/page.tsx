import { Alert, Card, CardTitle } from '@/components/ui';
import { getAllConfig } from '@/lib/config';
import { SettingsClient } from './SettingsClient';

export const dynamic = 'force-dynamic';

const PRODUCTION_NOTES = [
  {
    title: 'アクセスログ',
    body: '誰がいつどの患者情報を閲覧したかを記録し、一定期間保管する仕組みが必要です。',
  },
  {
    title: '操作履歴（監査ログ）',
    body: '予約やマスタの登録・変更・削除を、実行者と変更前後の内容とあわせて残す必要があります。',
  },
  {
    title: 'バックアップ',
    body: '定期的な自動バックアップと、実際に復元できることの定期確認が必要です。',
  },
  {
    title: '保存データの暗号化',
    body: 'データベースおよびバックアップを保存時に暗号化し、鍵の管理手順を定める必要があります。',
  },
  {
    title: 'アカウントと権限の管理',
    body: '職員ごとの個別アカウント、強度のあるパスワード運用、多要素認証、退職時の速やかな停止、役割に応じた最小限の権限付与が必要です。',
  },
];

export default async function SettingsPage() {
  const config = await getAllConfig();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">設定</h1>
        <p className="mt-1 text-sm text-slate-600">
          クリニック名や公開予約表の表示など、システム全体にかかわる設定を変更します。
        </p>
      </div>

      <SettingsClient
        settings={{
          clinic_name: config.clinic_name ?? 'デモ外科クリニック',
          public_schedule_enabled: config.public_schedule_enabled === 'false' ? 'false' : 'true',
        }}
      />

      <Card>
        <CardTitle description="このデモには含まれていない、本番導入時に別途必要となる対応です。">
          本番運用時の留意事項
        </CardTitle>

        <dl className="divide-y divide-slate-100">
          {PRODUCTION_NOTES.map((note) => (
            <div key={note.title} className="py-3 first:pt-0 last:pb-0 sm:flex sm:gap-4">
              <dt className="text-sm font-semibold text-slate-800 sm:w-52 sm:shrink-0">
                {note.title}
              </dt>
              <dd className="mt-0.5 text-sm text-slate-600 sm:mt-0">{note.body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <Alert tone="warning" title="外部予約連携について">
            GMO の外部予約システムとの連携は、本デモではモック（動作を模した仮実装）です。実際の連携には、提供元との接続仕様の確認と個別の開発が必要です。
          </Alert>
        </div>
      </Card>
    </div>
  );
}

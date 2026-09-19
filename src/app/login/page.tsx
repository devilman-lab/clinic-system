import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from './LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSession()) redirect('/');

  const { next } = await searchParams;

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <div className="flex flex-col justify-center bg-brand-800 px-8 py-10 text-white lg:w-1/2 lg:px-16 lg:py-0">
        <p className="text-sm font-medium tracking-wide text-brand-300">
          外科クリニック向け
        </p>
        <h2 className="mt-2 text-2xl font-semibold leading-snug lg:text-3xl">
          手術予約・枠管理システム
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-100/90">
          医師ごとの対応可能な手術、定例枠、手術室、既存予約を横断して
          「この手術は誰がいつできるか」を自動で判定します。
          紙のノートと予約システムへの二重入力をなくすことを目的にしています。
        </p>

        <ul className="mt-8 space-y-2.5 text-sm text-brand-100/90">
          {[
            '医師 × 手術室 × 時間帯の3次元で空きを判定',
            '第2・第4金曜などの例外枠にも対応',
            '最短で予約できる日時をワンクリックで検索',
          ].map((text) => (
            <li key={text} className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
              {text}
            </li>
          ))}
        </ul>

        <Link
          href="/schedule"
          className="mt-8 inline-flex w-fit items-center gap-2 rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-medium text-brand-100 transition-colors hover:bg-brand-700"
        >
          患者向けの公開予約表を見る
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
        <LoginForm next={next} />
      </div>
    </div>
  );
}

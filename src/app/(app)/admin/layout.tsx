import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/**
 * 管理画面の入口ガード。
 * 各 Server Action 側でも requireRole('ADMIN') を通すため、ここは一次防御。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN') redirect('/');

  return <>{children}</>;
}

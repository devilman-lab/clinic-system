import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getSession } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect('/login');

  const clinicName = await getConfig('clinic_name', 'クリニック');

  return (
    <AppShell user={user} clinicName={clinicName}>
      {children}
    </AppShell>
  );
}

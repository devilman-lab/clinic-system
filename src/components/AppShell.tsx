'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { IconName, Icons } from './icons';
import { cn } from './ui';
import { logoutAction } from '@/app/actions/auth';
import type { Role, SessionUser } from '@/lib/auth';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles?: Role[];
  exact?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: '業務',
    items: [
      { href: '/', label: 'ダッシュボード', icon: 'dashboard', exact: true },
      { href: '/calendar', label: '手術スケジュール', icon: 'calendar' },
      { href: '/bookings', label: '予約管理', icon: 'clipboard' },
    ],
  },
  {
    title: 'マスタ管理',
    items: [
      { href: '/admin/doctors', label: '医師管理', icon: 'doctor', roles: ['ADMIN'] },
      { href: '/admin/surgeries', label: '手術管理', icon: 'scalpel', roles: ['ADMIN'] },
      { href: '/admin/rooms', label: '手術室管理', icon: 'room', roles: ['ADMIN'] },
      { href: '/admin/schedules', label: '定例枠設定', icon: 'grid', roles: ['ADMIN'] },
      { href: '/admin/exceptions', label: '例外日設定', icon: 'alert', roles: ['ADMIN'] },
    ],
  },
  {
    title: 'その他',
    items: [
      { href: '/schedule', label: '公開予約表', icon: 'eye' },
      { href: '/admin/settings', label: '設定', icon: 'settings', roles: ['ADMIN'] },
    ],
  },
];

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-brand-100 text-brand-800 border-brand-200',
  STAFF: 'bg-slate-100 text-slate-700 border-slate-200',
  DOCTOR: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: '管理者',
  STAFF: 'スタッフ',
  DOCTOR: '医師',
};

export function AppShell({
  user,
  clinicName,
  children,
}: {
  user: SessionUser;
  clinicName: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const visibleGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(user.role)),
  })).filter((group) => group.items.length > 0);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-5 pb-4">
        <Link href="/" className="block" onClick={() => setDrawerOpen(false)}>
          <p className="text-[11px] font-medium tracking-wide text-brand-300">手術予約・枠管理</p>
          <p className="mt-0.5 truncate text-base font-semibold text-white">{clinicName}</p>
        </Link>
      </div>

      <div className="px-3 pb-4">
        <Link
          href="/search"
          onClick={() => setDrawerOpen(false)}
          className="flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-brand-800 shadow-sm transition-colors hover:bg-brand-50"
        >
          <Icons.bolt className="h-4 w-4" />
          最短予約可能枠を検索
        </Link>
      </div>

      <nav className="thin-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {visibleGroups.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-brand-300/80">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = Icons[item.icon];
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                        active
                          ? 'bg-brand-700/70 font-semibold text-white'
                          : 'text-brand-100/90 hover:bg-brand-700/40 hover:text-white'
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-brand-700/60 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.displayName}</p>
            <span
              className={cn(
                'mt-1 inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold',
                ROLE_BADGE[user.role]
              )}
            >
              {ROLE_LABEL[user.role]}
            </span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              title="ログアウト"
              aria-label="ログアウト"
              data-touch-target
              className="rounded-lg p-2 text-brand-200 transition-colors hover:bg-brand-700/60 hover:text-white"
            >
              <Icons.logout className="h-[18px] w-[18px]" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 bg-brand-800 lg:block">{sidebar}</aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-brand-800 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur lg:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            data-touch-target
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
          >
            <Icons.menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1" />

          <Link
            href="/search"
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
            data-touch-target
          >
            <Icons.search className="h-4 w-4" />
            <span className="hidden sm:inline">空き枠検索</span>
            <span className="sm:hidden">検索</span>
          </Link>
        </header>

        <main className="thin-scrollbar flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] px-4 py-5 lg:px-6 lg:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

const LINKS = {
  executive: [
    ['/onboarding', 'My profile'],
    ['/notifications', 'Notifications'],
    ['/account', 'My data'],
  ],
  consultant: [
    ['/review', 'Review queue'],
    ['/notifications', 'Notifications'],
  ],
  admin: [
    ['/review', 'Review queue'],
    ['/admin/users', 'Users'],
    ['/admin/audit', 'Audit log'],
    ['/notifications', 'Notifications'],
  ],
};

export default function Nav() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-navy-900">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded bg-navy-800 text-xs font-bold text-white">RT</span>
          Executive Portal
        </Link>
        {user && (
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {(LINKS[user.role] || []).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`rounded px-3 py-1.5 ${pathname.startsWith(href) ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {label}
              </Link>
            ))}
            <span className="ml-2 hidden text-xs text-slate-500 sm:inline">
              {user.email} · {user.role}
            </span>
            <button
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
              className="ml-2 rounded px-3 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}

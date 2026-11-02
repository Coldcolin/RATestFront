'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth';

/** UX-only route guard. The API enforces every rule again; this just avoids showing screens that would 403. */
export default function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = user && (!roles || roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (!allowed) router.replace(HOME_BY_ROLE[user.role]);
  }, [loading, user, allowed, router]);

  if (loading || !allowed) return <p className="p-8 text-sm text-slate-500">Loading…</p>;
  return children;
}

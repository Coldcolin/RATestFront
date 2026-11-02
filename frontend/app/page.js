'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth';

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? HOME_BY_ROLE[user.role] : '/login');
  }, [loading, user, router]);
  return <p className="text-sm text-slate-500">Loading…</p>;
}

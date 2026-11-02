'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, HOME_BY_ROLE } from '@/lib/auth';
import { errorText } from '@/lib/api';
import { Alert, Button, Card, Field, Input } from './ui';

export default function AuthForm({ mode }) {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (isRegister && form.get('password') !== form.get('confirm')) return setError({ message: 'Passwords do not match' });
    setBusy(true);
    setError(null);
    try {
      const user = await login(form.get('email'), form.get('password'), mode);
      router.replace(HOME_BY_ROLE[user.role]);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">{isRegister ? 'Create your executive account' : 'Sign in'}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {isRegister ? 'For executives joining the RiskTech & Advisory vetting programme.' : 'Executives, consultants and administrators.'}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required maxLength={254} />
          </Field>
          <Field label="Password" hint={isRegister ? 'At least 12 characters. Avoid common passwords and your email name.' : undefined}>
            <Input name="password" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} required minLength={isRegister ? 12 : 1} maxLength={128} />
          </Field>
          {isRegister && (
            <Field label="Confirm password">
              <Input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
            </Field>
          )}
          <Alert>{errorText(error)}</Alert>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-600">
          {isRegister ? (
            <>Already registered? <Link className="font-medium text-navy-800 underline" href="/login">Sign in</Link></>
          ) : (
            <>New executive? <Link className="font-medium text-navy-800 underline" href="/register">Create an account</Link></>
          )}
        </p>
      </Card>
    </div>
  );
}

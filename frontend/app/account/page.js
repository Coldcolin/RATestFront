'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Guard from '@/components/Guard';
import { Alert, Button, Card, Field, Input, PageTitle } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { clearLocalData } from '@/lib/offlineQueue';

function AccountPage() {
  const { setUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function exportData() {
    setError(null);
    try {
      const data = await api('/profile/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'my-data-export.json' });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err);
    }
  }

  async function erase(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/profile/me/delete-request', { method: 'POST', body: { password: new FormData(e.currentTarget).get('password') } });
      await clearLocalData().catch(() => {});
      setUser(null);
      router.replace('/login');
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="My data" subtitle="Your rights under the Nigeria Data Protection Act 2023" />
      <Alert>{errorText(error)}</Alert>
      <Card>
        <h2 className="font-semibold text-slate-900">Right of access</h2>
        <p className="mt-1 text-sm text-slate-600">Download everything we hold about you — account, profile, consents, document records, notifications and the audit entries about you — as a JSON file.</p>
        <Button className="mt-4" variant="secondary" onClick={exportData}>Download my data</Button>
      </Card>
      <Card>
        <h2 className="font-semibold text-slate-900">Right to rectification</h2>
        <p className="mt-1 text-sm text-slate-600">You can edit your profile while it is a draft, or whenever a consultant requests more information.</p>
      </Card>
      <Card className="border-red-200">
        <h2 className="font-semibold text-red-800">Right to erasure</h2>
        <p className="mt-1 text-sm text-slate-600">
          Permanently deletes your uploaded documents, anonymises your profile and account, and signs you out. A non-identifying record that the deletion happened is kept in the audit log, together with consent evidence, for accountability. This cannot be undone.
        </p>
        {!confirming ? (
          <Button className="mt-4" variant="danger" onClick={() => setConfirming(true)}>Delete my account and data…</Button>
        ) : (
          <form onSubmit={erase} className="mt-4 max-w-sm space-y-3">
            <Field label="Confirm with your password">
              <Input name="password" type="password" autoComplete="current-password" required />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="danger" disabled={busy}>{busy ? 'Deleting…' : 'Permanently delete'}</Button>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Guard roles={['executive']}>
      <AccountPage />
    </Guard>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Guard from '@/components/Guard';
import { Alert, Button, Card, PageTitle, fmtDate } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { enablePush, pushSupport } from '@/lib/push';

const PUSH_TEXT = {
  unsupported: 'This browser does not support push notifications. Updates will appear in the list below.',
  unconfigured: 'Push is not configured for this deployment. Updates will appear in the list below.',
  denied: 'Notifications are blocked in your browser settings. Updates will appear in the list below.',
  granted: 'Push notifications are enabled on this device.',
  default: 'Get a notification on this device when your vetting status changes.',
};

function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [push, setPush] = useState('unsupported');
  const [error, setError] = useState(null);

  const load = useCallback(() => api('/notifications').then((d) => setItems(d.items)).catch(setError), []);
  useEffect(() => {
    setPush(pushSupport());
    load();
  }, [load]);

  async function turnOnPush() {
    setError(null);
    try {
      setPush(await enablePush());
    } catch (err) {
      setError(err.message ? err : { message: 'Could not enable push notifications' });
    }
  }

  async function markRead(id) {
    await api(`/notifications/${id}/read`, { method: 'PATCH' }).catch(setError);
    load();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Notifications" />
      <Card className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">{PUSH_TEXT[push]}</p>
        {push === 'default' && <Button onClick={turnOnPush}>Enable push notifications</Button>}
      </Card>
      <Alert>{errorText(error)}</Alert>
      <ul className="space-y-2">
        {items.length === 0 && <li className="text-sm text-slate-500">No notifications yet.</li>}
        {items.map((n) => (
          <li key={n._id} className={`flex items-start justify-between gap-4 rounded-md border p-4 text-sm ${n.read ? 'border-slate-200 bg-white' : 'border-sky-200 bg-sky-50'}`}>
            <div>
              <p className="text-slate-900">{n.message}</p>
              <p className="mt-1 text-xs text-slate-500">{fmtDate(n.createdAt)}</p>
            </div>
            {!n.read && <Button variant="ghost" onClick={() => markRead(n._id)}>Mark read</Button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Page() {
  return (
    <Guard>
      <NotificationsPage />
    </Guard>
  );
}

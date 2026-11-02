'use client';

import { useCallback, useEffect, useState } from 'react';
import Guard from '@/components/Guard';
import { Alert, Button, Card, PageTitle, Select, fmtDate } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(() => api('/admin/users').then((d) => setUsers(d.items)).catch(setError), []);
  useEffect(() => {
    load();
  }, [load]);

  async function patch(id, path, body) {
    setError(null);
    try {
      await api(`/admin/users/${id}/${path}`, { method: 'PATCH', body });
      await load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div>
      <PageTitle title="User management" subtitle="Role changes and deactivations take effect on the user's next request and are audit-logged." />
      <Alert>{errorText(error)}</Alert>
      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const locked = u.id === me.id || u.deleted;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">{u.email}{u.id === me.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                  <td className="px-4 py-3">
                    <Select value={u.role} disabled={locked} onChange={(e) => patch(u.id, 'role', { role: e.target.value })} aria-label={`Role for ${u.email}`}>
                      <option value="executive">Executive</option>
                      <option value="consultant">Consultant</option>
                      <option value="admin">Administrator</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">{u.deleted ? 'Erased' : u.isActive ? 'Active' : 'Deactivated'}</td>
                  <td className="px-4 py-3 text-xs">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {!locked && (
                      <Button variant={u.isActive ? 'secondary' : 'primary'} onClick={() => patch(u.id, 'active', { isActive: !u.isActive })}>
                        {u.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Guard roles={['admin']}>
      <UsersPage />
    </Guard>
  );
}

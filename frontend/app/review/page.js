'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Guard from '@/components/Guard';
import { Alert, Card, Field, PageTitle, Select, StatusBadge, fmtDate } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { REVIEW_STATUSES } from '@/lib/taxonomy';

function QueuePage() {
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('desc');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const qs = new URLSearchParams({ sort, ...(status ? { status } : {}) });
    api(`/review/queue?${qs}`)
      .then((d) => setItems(d.items))
      .catch(setError);
  }, [status, sort]);

  return (
    <div>
      <PageTitle title="Review queue" subtitle="Names and emails are masked here; open a submission to see full detail (each view is audit-logged).">
        <div className="flex gap-3">
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {REVIEW_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="Submitted">
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </Select>
          </Field>
        </div>
      </PageTitle>
      <Alert>{errorText(error)}</Alert>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Executive</th>
              <th className="px-4 py-3">Current role</th>
              <th className="px-4 py-3">Sectors</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items === null && (
              <tr><td colSpan={6} className="px-4 py-6 text-slate-500">Loading…</td></tr>
            )}
            {items?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No submissions match this filter.</td></tr>
            )}
            {items?.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.email}</div>
                </td>
                <td className="px-4 py-3">{r.currentTitle}<div className="text-xs text-slate-500">{r.currentCompany}</div></td>
                <td className="px-4 py-3 text-xs">{r.sectors.join(', ')}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-xs">{fmtDate(r.submittedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/review/${r.id}`} className="font-medium text-navy-800 underline">Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <Guard roles={['consultant', 'admin']}>
      <QueuePage />
    </Guard>
  );
}

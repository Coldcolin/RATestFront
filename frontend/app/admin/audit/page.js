'use client';

import { useEffect, useState } from 'react';
import Guard from '@/components/Guard';
import { Alert, Button, Card, PageTitle, fmtDate } from '@/components/ui';
import { api, errorText } from '@/lib/api';

const LIMIT = 50;

function AuditPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [verify, setVerify] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/audit?page=${page}&limit=${LIMIT}`).then(setData).catch(setError);
  }, [page, verify]);

  async function runVerify() {
    setError(null);
    try {
      setVerify(await api('/audit/verify'));
    } catch (err) {
      setError(err);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div>
      <PageTitle title="Audit log" subtitle="Append-only and hash-chained: each entry's hash covers its content and the previous entry's hash.">
        <Button onClick={runVerify}>Verify chain integrity</Button>
      </PageTitle>
      <div className="mb-4 space-y-3">
        <Alert>{errorText(error)}</Alert>
        {verify && (
          <Alert tone={verify.intact ? 'success' : 'error'}>
            {verify.intact ? (
              <>
                <strong>Chain intact.</strong> {verify.checked} entries verified at {fmtDate(verify.verifiedAt)}. Head hash{' '}
                <code className="break-all text-xs">{verify.headHash}</code>
              </>
            ) : (
              <>
                <strong>Tampering detected</strong> at entry #{verify.firstBrokenSeq}: {verify.reason}. {verify.checked} entries before it verified.
              </>
            )}
          </Alert>
        )}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">#</th>
              <th className="px-3 py-3">Time</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">Actor</th>
              <th className="px-3 py-3">Target</th>
              <th className="px-3 py-3">Metadata</th>
              <th className="px-3 py-3">Hash</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {data?.items.map((e) => (
              <tr key={e.seq} className="align-top">
                <td className="px-3 py-2">{e.seq}</td>
                <td className="whitespace-nowrap px-3 py-2 font-sans">{fmtDate(e.timestamp)}</td>
                <td className="px-3 py-2 font-medium text-slate-900">{e.action}</td>
                <td className="px-3 py-2">{e.actorRole}<div className="text-slate-400">{e.actorId?.slice(-8)}</div></td>
                <td className="px-3 py-2">{e.targetType}<div className="text-slate-400">{e.targetId?.slice(-8)}</div></td>
                <td className="max-w-xs break-all px-3 py-2">{Object.keys(e.metadata || {}).length ? JSON.stringify(e.metadata) : ''}</td>
                <td className="px-3 py-2 text-slate-500" title={`hash ${e.hash}\nprev ${e.prevHash}`}>{e.hash.slice(0, 10)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="mt-4 flex items-center justify-end gap-3 text-sm">
        <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</Button>
        <span>Page {page} of {pages}</span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Older</Button>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Guard roles={['admin']}>
      <AuditPage />
    </Guard>
  );
}

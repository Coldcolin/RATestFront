'use client';

import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { DOCUMENT_TYPES } from '@/lib/taxonomy';
import { Alert, Button, fmtDate } from './ui';

/** Document metadata list. "View" asks the API for a short-lived signed URL; there is no stored public link. */
export default function DocumentList({ docs, onRemove }) {
  const [err, setErr] = useState(null);
  async function open(id) {
    setErr(null);
    try {
      const { url } = await api(`/documents/${id}/file`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErr(e);
    }
  }
  if (!docs.length) return <p className="text-sm text-slate-500">No documents uploaded yet.</p>;
  return (
    <div>
      <Alert>{errorText(err)}</Alert>
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <span className="font-medium text-slate-900">{DOCUMENT_TYPES[d.type]}</span> · {d.originalName}
              <div className="text-xs text-slate-500" title={d.sha256}>
                {(d.size / 1024).toFixed(0)} KB · SHA-256 {d.sha256.slice(0, 12)}… · {fmtDate(d.uploadedAt)}
              </div>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" onClick={() => open(d.id)}>View</Button>
              {onRemove && <Button type="button" variant="ghost" onClick={() => onRemove(d.id)}>Remove</Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

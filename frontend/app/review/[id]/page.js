'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Guard from '@/components/Guard';
import DocumentList from '@/components/DocumentList';
import { Alert, Button, Card, Field, PageTitle, Select, StatusBadge, Textarea, fmtDate } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { NOTE_REQUIRED } from '@/lib/taxonomy';

const Row = ({ label, children }) => (
  <div className="grid gap-1 py-2 sm:grid-cols-[12rem_1fr]">
    <dt className="text-sm text-slate-500">{label}</dt>
    <dd className="text-sm text-slate-900">{children || '—'}</dd>
  </div>
);

const Section = ({ title, children }) => (
  <Card>
    <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
    {children}
  </Card>
);

function ReviewDetail() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api(`/review/${id}`).then((d) => setP(d.profile)).catch(setError), [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/review/${id}/status`, { method: 'POST', body: { status: to, ...(note.trim() ? { note: note.trim() } : {}) } });
      setTo('');
      setNote('');
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!p) return error ? <Alert>{errorText(error)}</Alert> : <p className="text-sm text-slate-500">Loading…</p>;
  const pro = p.professional || {};
  const noteRequired = NOTE_REQUIRED.includes(to);

  return (
    <div className="space-y-6">
      <Link href="/review" className="text-sm text-navy-800 underline">← Back to queue</Link>
      <PageTitle title={pro.fullName} subtitle={`${pro.currentTitle} · ${pro.currentCompany} · submitted ${fmtDate(p.submittedAt)}`}>
        <StatusBadge status={p.status} />
      </PageTitle>
      <Alert>{errorText(error)}</Alert>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Section title="Professional profile">
            <dl className="divide-y divide-slate-100">
              <Row label="Account email">{p.accountEmail}</Row>
              <Row label="Contact email">{pro.contactEmail}</Row>
              <Row label="Phone">{pro.phone}</Row>
              <Row label="Years of experience">{pro.yearsExperience}</Row>
              <Row label="Summary"><span className="whitespace-pre-line">{pro.summary}</span></Row>
              <Row label="Sectors">{p.sectors.join(', ')}</Row>
              <Row label="Specialisms">{p.specialisms}</Row>
            </dl>
          </Section>
          <Section title="Executive & board experience">
            <ul className="space-y-3">
              {p.experience.map((x, i) => (
                <li key={i} className="text-sm">
                  <div className="font-medium text-slate-900">
                    {x.title}, {x.organisation} {x.isBoard && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">Board</span>}
                  </div>
                  <div className="text-xs text-slate-500">{x.startDate} – {x.endDate || 'present'}</div>
                  {x.description && <p className="mt-1 text-slate-700">{x.description}</p>}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Qualifications">
            <ul className="space-y-1 text-sm">
              {p.qualifications.map((q, i) => (
                <li key={i}>{q.title} — {q.institution} ({q.year}) <span className="text-xs text-slate-500">{q.kind}</span></li>
              ))}
            </ul>
          </Section>
          <Section title="Referees">
            <ul className="space-y-2 text-sm">
              {p.referees.map((r, i) => (
                <li key={i}>
                  <span className="font-medium">{r.name}</span> — {r.relationship}, {r.organisation}
                  <div className="text-xs text-slate-500">{r.email} · {r.phone}</div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Documents">
            <DocumentList docs={p.documents} />
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Vetting decision">
            {p.allowedTransitions.length ? (
              <form onSubmit={changeStatus} className="space-y-3">
                <Field label="Move to">
                  <Select value={to} onChange={(e) => setTo(e.target.value)} required>
                    <option value="">Select status…</option>
                    {p.allowedTransitions.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Reviewer note${noteRequired ? ' *' : ''}`} hint={to === 'More Information Required' ? 'Shown to the executive so they know what to fix.' : undefined}>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} required={noteRequired} maxLength={2000} rows={4} />
                </Field>
                <Button type="submit" disabled={busy || !to} className="w-full">{busy ? 'Saving…' : 'Update status'}</Button>
              </form>
            ) : (
              <p className="text-sm text-slate-600">
                {p.status === 'More Information Required' ? 'Waiting for the executive to update and resubmit.' : 'This submission has reached a final decision.'}
              </p>
            )}
          </Section>
          <Section title="Consent">
            <dl className="text-sm">
              <Row label="Vetting">{p.consents.vetting?.granted ? `Granted ${fmtDate(p.consents.vetting.timestamp)}` : 'Not granted'}</Row>
              <Row label="Share with clients">{p.consents.sharing?.granted ? `Granted ${fmtDate(p.consents.sharing.timestamp)}` : 'Not granted'}</Row>
            </dl>
          </Section>
          <Section title="Status history">
            <ol className="space-y-3 text-sm">
              {p.vettingNotes.length === 0 && <li className="text-slate-500">No reviewer actions yet.</li>}
              {[...p.vettingNotes].reverse().map((n, i) => (
                <li key={i} className="border-l-2 border-slate-200 pl-3">
                  <div className="font-medium">{n.fromStatus} → {n.toStatus}</div>
                  <div className="text-xs text-slate-500">{n.authorEmail || n.authorRole} · {fmtDate(n.createdAt)}</div>
                  {n.note && <p className="mt-1 text-slate-700">{n.note}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Guard roles={['consultant', 'admin']}>
      <ReviewDetail />
    </Guard>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Guard from '@/components/Guard';
import PrivacyNotice from '@/components/PrivacyNotice';
import { FieldGrid, ListEditor, coerce } from '@/components/FormFields';
import { Alert, Button, Card, Field, PageTitle, Select, StatusBadge, Textarea, fmtDate } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { cacheGet, cacheSet, enqueueDraft, pendingDrafts, replayDrafts } from '@/lib/offlineQueue';
import { DOCUMENT_TYPES, SECTORS } from '@/lib/taxonomy';
import DocumentList from '@/components/DocumentList';

const STEPS = ['Professional profile', 'Executive & board experience', 'Sector expertise', 'Qualifications', 'Referees', 'Documents', 'Consent & submit'];

const month = { type: 'text', placeholder: 'YYYY-MM', pattern: '\\d{4}-(0[1-9]|1[0-2])', inputMode: 'numeric' };
const phone = { type: 'tel', pattern: '\\+?[0-9 \\(\\)\\-]{7,20}', placeholder: '+234 …' };

const DEFS = {
  professional: [
    { name: 'fullName', label: 'Full name', required: true, maxLength: 120, autoComplete: 'name' },
    { name: 'contactEmail', label: 'Contact email', type: 'email', required: true, autoComplete: 'email' },
    { name: 'phone', label: 'Phone', required: true, ...phone },
    { name: 'currentTitle', label: 'Current title', required: true, maxLength: 120 },
    { name: 'currentCompany', label: 'Current company', required: true, maxLength: 120 },
    { name: 'yearsExperience', label: 'Years of experience', type: 'number', required: true, min: 0, max: 60 },
    { name: 'summary', label: 'Professional summary', type: 'textarea', required: true, minLength: 20, maxLength: 2000, wide: true },
  ],
  experience: [
    { name: 'organisation', label: 'Organisation', required: true, maxLength: 120 },
    { name: 'title', label: 'Title', required: true, maxLength: 120 },
    { name: 'startDate', label: 'Start', required: true, ...month },
    { name: 'endDate', label: 'End', hint: 'Leave blank if current', ...month },
    { name: 'isBoard', label: 'Board / non-executive role', type: 'checkbox' },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 1000, wide: true },
  ],
  qualifications: [
    { name: 'kind', label: 'Type', type: 'select', required: true, options: [['degree', 'Degree'], ['certification', 'Professional certification']] },
    { name: 'institution', label: 'Institution', required: true, maxLength: 160 },
    { name: 'title', label: 'Title', required: true, maxLength: 160 },
    { name: 'year', label: 'Year', type: 'number', required: true, min: 1950, max: new Date().getFullYear() },
  ],
  referees: [
    { name: 'name', label: 'Name', required: true, maxLength: 120 },
    { name: 'relationship', label: 'Relationship', required: true, maxLength: 120 },
    { name: 'organisation', label: 'Organisation', required: true, maxLength: 120 },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', required: true, ...phone },
  ],
};

// How a saved step maps onto the profile, used to show queued offline edits before they sync.
function stepToProfile(step, data) {
  if (step === 1) return { professional: data };
  if (step === 7) return { consents: { vetting: { granted: data.consents.vetting, pending: true }, sharing: { granted: data.consents.sharing, pending: true } } };
  return data;
}

const applyPending = (profile, pending) =>
  pending.reduce((p, e) => ({ ...p, ...stepToProfile(e.step, e.data), currentStep: Math.max(p.currentStep, Math.min(e.step + 1, 7)) }), profile);

const sendEntry = (entry) =>
  api(`/profile/me/step/${entry.step}`, {
    method: 'PUT',
    body: { data: entry.data, clientSavedAt: entry.clientSavedAt },
    headers: { 'Idempotency-Key': entry.idempotencyKey },
  });

function SyncBadge({ state, pending }) {
  const map = {
    synced: ['bg-emerald-100 text-emerald-800', 'All changes synced'],
    offline: ['bg-amber-100 text-amber-900', pending ? `Offline — ${pending} change(s) saved on this device` : 'Offline'],
    pending: ['bg-amber-100 text-amber-900', `${pending} change(s) waiting to sync`],
    syncing: ['bg-sky-100 text-sky-800', 'Syncing…'],
    auth: ['bg-red-100 text-red-800', 'Sign in again to sync your offline changes'],
  };
  const [cls, label] = map[state] || map.synced;
  return <span role="status" className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{label}</span>;
}

function OnboardingPage() {
  const [profile, setProfile] = useState(null);
  const [active, setActive] = useState(1);
  const [sync, setSync] = useState('synced');
  const [pending, setPending] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const showProfile = useCallback(async (serverProfile) => {
    await cacheSet('profile', serverProfile).catch(() => {});
    const queued = await pendingDrafts().catch(() => []);
    setPending(queued.length);
    setProfile(applyPending(serverProfile, queued));
  }, []);

  const runSync = useCallback(async () => {
    const queued = await pendingDrafts().catch(() => []);
    setPending(queued.length);
    if (!navigator.onLine) return setSync('offline');
    if (!queued.length) return setSync('synced');
    setSync('syncing');
    const result = await replayDrafts(sendEntry);
    if (result.last) await showProfile(result.last.profile);
    const left = (await pendingDrafts()).length;
    setPending(left);
    if (result.rejected.length) {
      setError({ message: `Some offline changes were rejected by the server — ${result.rejected.map((r) => `step ${r.step}: ${r.message}`).join('; ')}. Please re-enter them.` });
    }
    setSync(result.done ? 'synced' : result.error?.status === 401 ? 'auth' : navigator.onLine ? 'pending' : 'offline');
  }, [showProfile]);

  useEffect(() => {
    (async () => {
      try {
        const { profile: p } = await api('/profile/me');
        await showProfile(p);
        setActive(p.editable ? p.currentStep : 1);
      } catch (err) {
        const cached = err.code === 'NETWORK' ? await cacheGet('profile').catch(() => null) : null;
        if (!cached) return setError(err.code === 'NETWORK' ? { message: 'You are offline and this device has no saved copy of your profile yet. Open the portal once while online.' } : err);
        const p = applyPending(cached, await pendingDrafts());
        setProfile(p);
        setActive(p.currentStep);
      }
      runSync();
    })();
    const offline = () => setSync('offline');
    window.addEventListener('online', runSync);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', runSync);
      window.removeEventListener('offline', offline);
    };
  }, [runSync, showProfile]);

  async function saveStep(step, data) {
    setError(null);
    setNotice(null);
    const queue = async () => {
      await enqueueDraft(step, data);
      const queued = await pendingDrafts();
      setPending(queued.length);
      setSync('offline');
      setProfile((p) => applyPending(p, queued));
      setNotice('Saved on this device. It will sync automatically when you are back online.');
    };
    try {
      if (!navigator.onLine) await queue();
      else {
        const entry = { step, data, idempotencyKey: crypto.randomUUID(), clientSavedAt: new Date().toISOString() };
        const res = await sendEntry(entry);
        await showProfile(res.profile);
      }
      if (step < 7) setActive(step + 1);
      return true;
    } catch (err) {
      if (err.code === 'NETWORK') {
        await queue();
        if (step < 7) setActive(step + 1);
        return true;
      }
      setError(err);
      return false;
    }
  }

  async function submit() {
    setError(null);
    try {
      const { profile: p } = await api('/profile/me/submit', { method: 'POST' });
      await showProfile(p);
      setNotice('Submitted. A RiskTech consultant will review your profile, and you will be notified when the status changes.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err);
    }
  }

  if (!profile) {
    return error ? <Alert>{errorText(error)}</Alert> : <p className="text-sm text-slate-500">Loading your profile…</p>;
  }

  const latestFeedback = profile.feedback?.at(-1);
  const stepProps = { profile, onSave: saveStep, disabled: !profile.editable };

  return (
    <div>
      <PageTitle title="Executive onboarding" subtitle="Your progress is saved after every step, so you can leave and come back.">
        <div className="flex items-center gap-2">
          <StatusBadge status={profile.status} />
          {profile.editable && <SyncBadge state={sync} pending={pending} />}
        </div>
      </PageTitle>

      <div className="mb-4 space-y-3">
        <Alert>{errorText(error)}</Alert>
        <Alert tone="success">{notice}</Alert>
        {profile.status === 'More Information Required' && latestFeedback && (
          <Alert tone="warning">
            <strong>More information required.</strong> Reviewer note: {latestFeedback.note}. Update your profile, then resubmit from the last step.
          </Alert>
        )}
        {!profile.editable && (
          <Alert tone="info">
            Submitted {fmtDate(profile.submittedAt)} — current status <strong>{profile.status}</strong>. Your profile is read-only after submission unless a consultant requests more information.
            {latestFeedback && profile.status !== 'More Information Required' && <> Reviewer note: {latestFeedback.note}</>}
          </Alert>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <nav aria-label="Onboarding steps">
          <ol className="space-y-1">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const reachable = !profile.editable || n <= profile.currentStep;
              const done = n < profile.currentStep || !profile.editable;
              return (
                <li key={label}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => setActive(n)}
                    aria-current={active === n ? 'step' : undefined}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${active === n ? 'bg-navy-800 text-white' : reachable ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-400'}`}
                  >
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${active === n ? 'bg-white text-navy-800' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {done && active !== n ? '✓' : n}
                    </span>
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Step {active}: {STEPS[active - 1]}
          </h2>
          {active === 1 && <ObjectStep {...stepProps} step={1} />}
          {active === 2 && <ListStep {...stepProps} step={2} field="experience" itemLabel="Role" min={1} max={30} />}
          {active === 3 && <SectorStep {...stepProps} />}
          {active === 4 && <ListStep {...stepProps} step={4} field="qualifications" itemLabel="Qualification" min={1} max={20} />}
          {active === 5 && <ListStep {...stepProps} step={5} field="referees" itemLabel="Referee" min={2} max={5} />}
          {active === 6 && <DocumentStep {...stepProps} setProfile={setProfile} setError={setError} />}
          {active === 7 && <ConsentStep {...stepProps} onSubmit={submit} />}
        </Card>
      </div>
    </div>
  );
}

function StepActions({ disabled, label = 'Save & continue' }) {
  if (disabled) return null;
  return (
    <div className="mt-6 flex justify-end">
      <Button type="submit">{label}</Button>
    </div>
  );
}

function ObjectStep({ profile, onSave, disabled }) {
  const [value, setValue] = useState(profile.professional || {});
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(1, coerce(DEFS.professional, value)); }}>
      <FieldGrid defs={DEFS.professional} value={value} onChange={setValue} disabled={disabled} />
      <StepActions disabled={disabled} />
    </form>
  );
}

function ListStep({ profile, onSave, disabled, step, field, itemLabel, min, max }) {
  const initial = profile[field]?.length ? profile[field] : Array.from({ length: min }, () => ({}));
  const [items, setItems] = useState(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(step, { [field]: items.map((it) => coerce(DEFS[field], it)) }); }}>
      <ListEditor defs={DEFS[field]} items={items} onChange={setItems} itemLabel={itemLabel} min={min} max={max} disabled={disabled} />
      <StepActions disabled={disabled} />
    </form>
  );
}

function SectorStep({ profile, onSave, disabled }) {
  const [sectors, setSectors] = useState(profile.sectors || []);
  const [specialisms, setSpecialisms] = useState(profile.specialisms || '');
  const [err, setErr] = useState(null);
  const toggle = (s) => setSectors((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!sectors.length) return setErr('Select at least one sector');
        setErr(null);
        onSave(3, { sectors, specialisms: specialisms.trim() });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">Sectors *</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECTORS.map((s) => (
            <label key={s} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" checked={sectors.includes(s)} onChange={() => toggle(s)} disabled={disabled} className="h-4 w-4" />
              {s}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Specialisms" hint="Free text, e.g. 'Islamic finance, grid regulation'" className="mt-4">
        <Textarea value={specialisms} onChange={(e) => setSpecialisms(e.target.value)} maxLength={500} rows={3} disabled={disabled} />
      </Field>
      <div className="mt-3"><Alert>{err}</Alert></div>
      <StepActions disabled={disabled} />
    </form>
  );
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.docx';
const MAX_BYTES = 5 * 1024 * 1024;

function DocumentStep({ profile, onSave, disabled, setProfile, setError }) {
  const [type, setType] = useState('cv');
  const [busy, setBusy] = useState(false);
  const docs = profile.documents || [];
  const online = typeof navigator === 'undefined' || navigator.onLine;

  async function upload(e) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const file = formEl.elements.file.files[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ACCEPT.split(',').includes(`.${ext}`)) return setError({ message: 'Only PDF, PNG, JPG or DOCX files are accepted' });
    if (file.size > MAX_BYTES) return setError({ message: 'File exceeds the 5 MB limit' });
    const form = new FormData();
    form.append('type', type);
    form.append('file', file);
    setBusy(true);
    setError(null);
    try {
      const { document } = await api('/documents', { method: 'POST', body: form });
      setProfile((p) => ({ ...p, documents: [...p.documents, document] }));
      formEl.reset();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await api(`/documents/${id}`, { method: 'DELETE' });
      setProfile((p) => ({ ...p, documents: p.documents.filter((d) => d.id !== id) }));
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="space-y-6">
      {!online && <Alert tone="warning">Document upload needs an internet connection. Your other steps can still be saved offline.</Alert>}
      <DocumentList docs={docs} onRemove={disabled ? null : remove} />
      {!disabled && (
        <form onSubmit={upload} className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-slate-300 p-4">
          <Field label="Document type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(DOCUMENT_TYPES).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </Field>
          <Field label="File" hint="PDF, PNG, JPG or DOCX · max 5 MB">
            <input name="file" type="file" accept={ACCEPT} required className="block text-sm" />
          </Field>
          <Button type="submit" disabled={busy || !online}>{busy ? 'Uploading…' : 'Upload'}</Button>
        </form>
      )}
      {!disabled && (
        <form onSubmit={(e) => { e.preventDefault(); onSave(6, {}); }}>
          <p className="text-sm text-slate-600">A CV and an identification document are required.</p>
          <StepActions disabled={disabled} />
        </form>
      )}
    </div>
  );
}

function ConsentStep({ profile, onSave, onSubmit, disabled }) {
  // Never pre-ticked: the executive must actively tick each box every time they record consent.
  const [vetting, setVetting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const recorded = profile.consents?.vetting;
  const canSubmit = !disabled && recorded?.granted && !recorded.pending;

  return (
    <div className="space-y-6">
      <details className="rounded-md border border-slate-200 p-4" open>
        <summary className="cursor-pointer text-sm font-medium text-slate-900">Privacy notice (NDPA 2023)</summary>
        <div className="mt-3"><PrivacyNotice /></div>
      </details>

      {recorded && (
        <p className="text-sm text-slate-600">
          Recorded choices: processing for vetting <strong>{recorded.granted ? 'granted' : 'not granted'}</strong>, sharing with clients{' '}
          <strong>{profile.consents.sharing?.granted ? 'granted' : 'not granted'}</strong>
          {recorded.timestamp && <> on {fmtDate(recorded.timestamp)}</>}
          {recorded.pending && ' (saved on this device, not yet synced)'}.
        </p>
      )}

      {!disabled && (
        <form onSubmit={(e) => { e.preventDefault(); onSave(7, { consents: { vetting, sharing } }); }} className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={vetting} onChange={(e) => setVetting(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span><strong>Required to submit.</strong> I consent to RiskTech &amp; Advisory processing my personal data and documents for the purpose of executive vetting.</span>
          </label>
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={sharing} onChange={(e) => setSharing(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span><strong>Optional.</strong> I consent to RiskTech &amp; Advisory sharing my verified profile with client organisations seeking executives.</span>
          </label>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary">Record my consent choices</Button>
          </div>
        </form>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-sm text-slate-600">
            {canSubmit ? 'Ready to submit. You will not be able to edit while your profile is being vetted.' : 'Record consent to vetting (and be online) to submit.'}
          </p>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {profile.status === 'More Information Required' ? 'Resubmit for vetting' : 'Submit for vetting'}
          </Button>
        </div>
      )}
      {disabled && <Link href="/account" className="text-sm text-navy-800 underline">Download or delete your data</Link>}
    </div>
  );
}

export default function Page() {
  return (
    <Guard roles={['executive']}>
      <OnboardingPage />
    </Guard>
  );
}

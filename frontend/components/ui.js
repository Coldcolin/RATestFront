'use client';

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-navy-800 text-white hover:bg-navy-900 disabled:bg-slate-400',
    secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-400',
    ghost: 'text-navy-800 hover:bg-slate-100',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-navy-500 focus:outline-none focus:ring-1 focus:ring-navy-500 disabled:bg-slate-100';

export const Input = (props) => <input className={inputClass} {...props} />;
export const Textarea = (props) => <textarea className={inputClass} rows={4} {...props} />;
export const Select = ({ children, ...props }) => (
  <select className={inputClass} {...props}>
    {children}
  </select>
);

export function Alert({ tone = 'error', children }) {
  if (!children) return null;
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

const STATUS_STYLES = {
  draft: 'bg-slate-100 text-slate-700',
  Submitted: 'bg-sky-100 text-sky-800',
  'Under Review': 'bg-indigo-100 text-indigo-800',
  'More Information Required': 'bg-amber-100 text-amber-900',
  Verified: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-red-100 text-red-800',
};

export const StatusBadge = ({ status }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
    {status === 'draft' ? 'Draft' : status}
  </span>
);

export const Card = ({ children, className = '' }) => (
  <section className={`rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</section>
);

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

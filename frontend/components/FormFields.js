'use client';

import { Button, Field, Input, Select, Textarea } from './ui';

/** One input driven by a field definition: { name, label, type, required, options, ... }. */
function FieldInput({ def, value, onChange, disabled }) {
  const { name, label, type = 'text', options, hint, wide, ...rest } = def;
  if (type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="h-4 w-4 rounded border-slate-300" />
        {label}
      </label>
    );
  }
  const common = { value: value ?? '', onChange: (e) => onChange(e.target.value), disabled, ...rest };
  return (
    <Field label={`${label}${rest.required ? ' *' : ''}`} hint={hint} className={wide ? 'sm:col-span-2' : ''}>
      {type === 'textarea' ? (
        <Textarea {...common} />
      ) : type === 'select' ? (
        <Select {...common}>
          <option value="">Select…</option>
          {options.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      ) : (
        <Input type={type} {...common} />
      )}
    </Field>
  );
}

export function FieldGrid({ defs, value, onChange, disabled }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((def) => (
        <FieldInput key={def.name} def={def} value={value?.[def.name]} disabled={disabled} onChange={(v) => onChange({ ...value, [def.name]: v })} />
      ))}
    </div>
  );
}

/** Editable list of objects (roles, qualifications, referees). */
export function ListEditor({ defs, items, onChange, itemLabel, min = 0, max = 20, disabled }) {
  const update = (i, v) => onChange(items.map((item, j) => (j === i ? v : item)));
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">{itemLabel} {i + 1}</span>
            {items.length > min && !disabled && (
              <Button type="button" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</Button>
            )}
          </div>
          <FieldGrid defs={defs} value={item} onChange={(v) => update(i, v)} disabled={disabled} />
        </div>
      ))}
      {items.length < max && !disabled && (
        <Button type="button" variant="secondary" onClick={() => onChange([...items, {}])}>+ Add {itemLabel.toLowerCase()}</Button>
      )}
    </div>
  );
}

/** Converts form strings into the types the API validates (numbers, null end dates, no empty optionals). */
export function coerce(defs, obj) {
  const out = {};
  for (const { name, type, required } of defs) {
    let v = obj?.[name];
    if (type === 'number') v = v === '' || v == null ? undefined : Number(v);
    else if (type === 'checkbox') v = Boolean(v);
    else if (typeof v === 'string') v = v.trim();
    if (type === 'month' && !v && !required) v = null;
    if (v === '' && !required) v = undefined;
    if (v !== undefined) out[name] = v;
  }
  return out;
}

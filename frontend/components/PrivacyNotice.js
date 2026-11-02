// Shown in full on /privacy and inline at the consent step.
export default function PrivacyNotice() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      <p>
        <strong>RiskTech &amp; Advisory</strong> (the data controller) processes your personal data in line with the{' '}
        <strong>Nigeria Data Protection Act (NDPA) 2023</strong>.
      </p>
      <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <dt className="font-medium text-slate-900">What we collect</dt>
        <dd>Your professional profile, executive and board history, sector expertise, qualifications, referee contact details, and the documents you upload (CV, identification, certificates). Nothing else.</dd>
        <dt className="font-medium text-slate-900">Purpose</dt>
        <dd>Executive vetting only: verifying your identity, experience and qualifications. If you separately consent, we share your <em>verified</em> profile with client organisations seeking executives.</dd>
        <dt className="font-medium text-slate-900">Lawful basis</dt>
        <dd>Your consent (NDPA s.25(1)(a)), given separately for each purpose. You can change your choices while your profile is editable, or withdraw at any time by contacting the DPO or deleting your account; withdrawal does not affect processing already carried out.</dd>
        <dt className="font-medium text-slate-900">Retention</dt>
        <dd>For the duration of your engagement and up to 24 months after the vetting outcome, after which it is deleted or anonymised. A minimal, non-identifying audit trail is retained for accountability.</dd>
        <dt className="font-medium text-slate-900">Security</dt>
        <dd>Encrypted in transit and at rest, documents stored privately and only reachable through short-lived authorised links, and every access is recorded in a tamper-evident audit log.</dd>
        <dt className="font-medium text-slate-900">Your rights</dt>
        <dd>Access (download a copy of your data), rectification (edit your profile while it is in draft or when more information is requested), and erasure (delete your account and documents) — all available from &ldquo;My data&rdquo;. You may also complain to the Nigeria Data Protection Commission.</dd>
        <dt className="font-medium text-slate-900">Contact</dt>
        <dd>Data Protection Officer: dpo@example.com (placeholder for this proof of concept).</dd>
      </dl>
    </div>
  );
}

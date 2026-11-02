# Executive Onboarding & Vetting Portal

A proof of concept for **RiskTech & Advisory**: the first module of its Executive Platform.

- **Executives** register, complete a seven-step onboarding wizard (save & resume, works offline), upload documents, give granular NDPA consent and submit.
- **Consultants** work a masked review queue and move submissions through a server-enforced vetting state machine with mandatory notes. The executive is notified by Web Push and in-app.
- **Administrators** manage users and roles and can verify a hash-chained, tamper-evident audit log.

Security, privacy and auditability are built in throughout. **All data is synthetic.**

```
backend/      Express 5 + Mongoose REST API            → Render
frontend/     Next.js (App Router) PWA + Tailwind      → Vercel
design-pack/  architecture · data model · tech justification · risk register
```

---

## 1. Run locally

Prerequisites: Node.js ≥ 20 and a MongoDB, either an Atlas free cluster or a local `mongod`.

```bash
# API (port 4000)
cd backend
cp .env.example .env          # set MONGODB_URI and JWT_SECRET at minimum
npm install
npm run seed                  # wipes the DB and loads synthetic demo data
npm run dev

# Frontend (port 3000), in a second terminal
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # open http://localhost:3000
```

- **Cookies locally.** Over http on localhost the session cookie is `SameSite=Lax` and not `Secure`. In production (`NODE_ENV=production`) it is `SameSite=None; Secure`. This switch is automatic.
- **PWA / offline / push.** The service worker is registered only in production builds, so it never serves stale code while you develop. To try them locally, run `npm run build && npm start` in `frontend/`.
- **Push keys.** Generate a VAPID pair with `npx web-push generate-vapid-keys`. Put both keys in `backend/.env` and the public key in `frontend/.env.local` as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- **Uploads.** These need the three `CLOUDINARY_*` variables. Without them, the rest of the app still works and uploads return a clear `503 STORAGE_UNAVAILABLE`.

### Tests & CI

```bash
cd backend && npm test        # 10 API tests on an in-memory MongoDB, no setup needed
cd backend && npm run lint
```

The tests cover:
- password policy and cookie flags;
- generic, audited login failures;
- the CSRF guard;
- RBAC denials for each role;
- document ownership (403, with no existence leak);
- upload rejection (wrong type, spoofed magic bytes, over 5 MB — with nothing stored);
- save & resume, idempotent replay and stale-replay protection;
- consent-gated submission;
- every legal and illegal status transition, mandatory notes and notifications;
- list masking;
- NDPA export and erasure;
- append-only enforcement, and detection of tampering in the audit chain.

`.github/workflows/ci.yml` runs backend lint and tests plus a frontend production build on every push.

## 2. Deploy (three free services, no Docker)

1. **Database: MongoDB Atlas (free M0).**
   - Create a cluster and a database user.
   - Allow network access from `0.0.0.0/0`. This is for the PoC only; in production, restrict it to Render's egress IPs or use private networking.
   - Copy the connection string into `MONGODB_URI`.
2. **Documents: Cloudinary (free).** Create an account and copy the Cloud name, API key and API secret from the dashboard. No bucket configuration is needed: files are uploaded as `authenticated`, so they are never public.
3. **Backend: Render (free Web Service).**
   - New Web Service → connect the repo → **Root Directory `backend`**. Build: `npm install`. Start: `npm start`.
   - Environment variables: `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (at least 32 random characters), `CORS_ORIGIN` (your Vercel URL, exact), `COOKIE_DOMAIN` (leave empty for `*.onrender.com`), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Optional: `IP_HASH_SALT`.
   - To seed, run `SEED_FORCE=true npm run seed` once from the Render shell. The seed refuses to run against production without that flag.
4. **Frontend: Vercel.** Import the repo → **Root Directory `frontend`** (Next.js is auto-detected). Environment variables: `NEXT_PUBLIC_API_URL` (the Render URL, no trailing slash) and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
5. **Wire them together.** Set the backend's `CORS_ORIGIN` to the Vercel domain and the frontend's `NEXT_PUBLIC_API_URL` to the Render domain, then redeploy both. `NEXT_PUBLIC_*` values are inlined at build time.

## 3. Demo accounts (synthetic)

All seeded accounts use the password **`Demo!Passw0rd-2024`**.

| Role | Email | State after seeding |
|---|---|---|
| Administrator | `admin@example.com` | — |
| Consultant | `consultant@example.com` | — |
| Executive | `executive@example.com` | empty draft; use this account to demo onboarding |
| Executive | `executive2@example.com` | "Jane Executive", **Submitted** |
| Executive | `executive3@example.com` | "John Sample", **Under Review** |
| Executive | `executive4@example.com` | "Ada Placeholder", **Verified** |

**Suggested demo**
1. Sign in as `executive@example.com` and fill steps 1–4.
2. Switch the browser offline (DevTools → Network → Offline), save step 5, and watch the "saved on this device" badge. Go back online and it changes to "All changes synced".
3. As `consultant@example.com`, open Jane Executive and move her to Under Review → Verified.
4. As `executive2@example.com`, check the notification.
5. As `admin@example.com`, open Audit log → **Verify chain integrity**.

## 4. Technology choices

Summary: Express + Mongoose for a small, readable security pipeline and a document-shaped profile; Next.js for a deployable PWA; a JWT in an httpOnly cookie so XSS cannot reach the session; Cloudinary with authenticated delivery behind a one-file `storageService`; Tailwind. The full reasoning, the rejected alternatives and a justification for every dependency are in [design-pack/tech-justification.md](design-pack/tech-justification.md).

- [Architecture](design-pack/architecture.md)
- [Data model](design-pack/data-model.md)
- [Risk register & NDPA mapping](design-pack/risk-register.md)

## 5. Assumptions

- **Registration.** Executives self-register. Consultants and administrators are created by seeding, or by an admin promoting a registered user. Self-registration can never choose a role.
- **"More Information Required".** This re-opens the **whole** profile for editing, not just flagged sections. The reviewer's note is shown to the executive in-app.
- **Reviewer notes.** A note is mandatory for *More Information Required* and *Rejected*, and optional for the other transitions. Every transition is still recorded in `vettingNotes`.
- **Consent.** Vetting consent is required to submit; sharing consent is optional. The checkboxes are never pre-ticked, even if consent was recorded earlier.
- **Submission requirements.** A submission needs a CV and an identification document. Certifications are optional.
- **Drafts.** Drafts are invisible to reviewers, because data is processed for vetting only after submission and consent.
- **Audit log access.** The audit log is admin-only. The spec allowed consultants optional read-only access; it was left admin-only to keep least privilege.
- **Retention.** The privacy notice states 24 months after the vetting outcome. This is a placeholder for the firm's actual policy.
- **Session length.** Sessions last 30 minutes with no refresh token. Work is saved per step, so an expired session costs at most the current step.

## 6. Known limitations & what was left out

| Item | Why |
|---|---|
| Render free tier cold starts | The first request after idling can take ~30–60 s. Acceptable for a PoC demo. |
| Third-party cookies | Production runs the frontend and API on different sites (`vercel.app` → `onrender.com`), so the session cookie is a third-party cookie. Browsers that block these (Safari by default, Firefox strict mode, Chrome with blocking turned on) cannot keep a session. Fix: host both on one registrable domain (e.g. `app.` / `api.` subdomains with `COOKIE_DOMAIN`), or proxy `/api` through Vercel rewrites. |
| Offline scope | Only onboarding draft saves work offline. Uploads, submission, vetting actions and admin actions need connectivity, and the UI says so. The service worker is active in production builds only. |
| Offline sync trigger | Replay runs when the page loads and on the browser's `online` event, not through the Background Sync API (Chromium-only). Queued saves sync the next time the app is open and online. |
| No automated retention purge | Retention is stated, but no scheduled job enforces it yet. |
| Consent withdrawal after submission | Not self-service yet (handled via DPO or erasure). |
| No antivirus scanning of uploads | Type, magic-byte and size validation only. AV/CDR is listed in the risk register. |
| Audit tail truncation | The hash chain detects edits, deletions and reordering, but not removal of the newest entries. Mitigation: anchor the head hash externally. |
| CSP allows `'unsafe-inline'` scripts | Next.js needs this without a nonce middleware. |
| Seeded submissions have no documents | Seeding cannot assume Cloudinary credentials. |
| Rate limits are in-memory per instance | Fine on a single Render instance. Use a Redis store when scaling out. |
| **Stretch goals:** automated tests ✅ and CI ✅ built. **MFA, analytics dashboard and matching not attempted** | Time was spent on core security, privacy and audit depth instead. The `User.mfaSecret` field is reserved for MFA. |

## 7. What I'd build next

1. **Hardening.**
   - TOTP MFA for consultants and admins first, then everyone.
   - Per-account login backoff and breached-password checks.
   - Nonce-based CSP.
   - Same-site API domain, with `SameSite=Strict` cookies.
   - Atlas IP allow-listing and a least-privilege DB user (insert + find only on `auditlogs`).
   - Secrets in a vault, and secret scanning in CI.
2. **Storage.**
   - S3 with SSE-KMS, object lock and pre-signed URLs (a one-file swap in `storageService`).
   - AV scanning before a document becomes viewable.
3. **Audit.**
   - Anchor the chain head hash to WORM storage on a schedule.
   - Alert on verification failure and on `auth.login_failed` spikes.
4. **Privacy operations.**
   - Retention job.
   - Self-service consent withdrawal.
   - DPIA and records of processing.
   - Notify the DPO on erasure.
5. **Product.**
   - Consultant analytics (counts by status, time-to-verify).
   - Role-brief matching on sector and experience overlap.
   - Reviewer assignment and per-section "more information" flags.

# Executive Onboarding & Vetting Portal — Build Specification

> **For:** Claude Code
> **Goal:** Build a working, secure proof-of-concept web application for **RiskTech & Advisory**, a Governance, Risk & Compliance (GRC) firm. This is the first module of their "Executive Platform": an **Executive Onboarding & Vetting Portal**.
> **Audience that will grade it:** GRC consultants who assess *security, privacy, and auditability* as closely as they assess features. Build accordingly.

---

## 0. How to read this spec

- Build **exactly** the core scope in Section 3. Do the stretch items in Section 4 **only after** core is working end-to-end.
- Everything is **synthetic data only**. Never generate or use real personal/company data. Seed scripts must produce obviously-fake data (e.g. `executive1@example.com`, "Jane Executive").
- Prefer **a smaller scope done well** over many half-finished features. Where you leave something out, record it in the README's **Known Limitations** section with a one-line reason.
- Keep the two apps independent so they can be **hosted separately**:
  - `backend/` → Node.js + Express + MongoDB (REST API)
  - `frontend/` → Next.js (PWA)
- Produce the **technical design pack** (Section 9) as markdown files in the repo. These are graded.

---

## 1. Tech stack (and why — these justifications go in the README)

| Layer | Choice | Why (defensible to a GRC panel) |
|---|---|---|
| Backend runtime | **Node.js + Express** | Mature, well-understood, small surface area for a PoC; easy to reason about security middleware explicitly rather than hidden framework magic. |
| Database | **MongoDB (via Mongoose)** | Flexible schema fits an evolving multi-step onboarding profile; Mongoose gives us schema validation + a single place to enforce data rules. Atlas provides encryption-at-rest and network allow-listing on the free tier. |
| Frontend | **Next.js (App Router) + React** | First-class PWA support (service worker, offline), good DX, deploys trivially to Vercel. |
| Auth | **JWT in httpOnly, Secure cookies** | Token is not reachable by JavaScript → resistant to XSS token theft, which a GRC reviewer will look for. |
| File storage | **Cloudinary**, accessed behind a `storageService` | Managed object storage with a free tier; survives backend restarts (unlike local disk on Render's ephemeral filesystem); supports **authenticated delivery** so documents are never publicly reachable by URL. The `storageService` abstraction keeps a later swap to S3/GCS a one-file change. |
| Styling | **Tailwind CSS** | Fast, consistent, no bikeshedding. |

> Keep dependencies minimal. Every library you add, you must be able to justify. Avoid heavyweight boilerplate/starter kits.

---

## 2. Repository structure

```
executive-portal/
├── README.md                     # setup, assumptions, known limitations, tech justification
├── design-pack/
│   ├── architecture.md           # architecture diagram (Mermaid) + narrative
│   ├── data-model.md             # ER-style diagram (Mermaid) + collection definitions
│   ├── tech-justification.md     # the table above, expanded
│   └── risk-register.md          # security & privacy threats + mitigations
├── backend/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── server.js             # app bootstrap, middleware wiring
│   │   ├── config/               # db connection, env loading
│   │   ├── models/               # Mongoose schemas
│   │   ├── routes/               # express routers
│   │   ├── controllers/          # request handlers
│   │   ├── middleware/           # auth, rbac, audit, error, rate-limit, upload
│   │   ├── services/             # auditService, storageService (Cloudinary), notificationService
│   │   ├── utils/                # hashing, validators
│   │   └── seed/                 # synthetic data seeding script
└── frontend/
    ├── package.json
    ├── .env.local.example
    ├── next.config.js            # PWA config
    ├── public/
    │   ├── manifest.json
    │   └── icons/
    ├── app/                      # App Router pages
    ├── components/
    ├── lib/                      # api client, auth context, offline queue (IndexedDB)
    └── workers/ or service-worker setup for offline + push
```

Add a root `.gitignore` covering `node_modules`, `.env`, `.env.local`, build output.

---

## 3. CORE SCOPE (build all of this)

### 3.1 Roles & Role-Based Access Control (RBAC)

Three roles. Enforce on **every** protected route via middleware — never trust the frontend.

- **Executive** — onboards themselves; can only see/edit *their own* profile and documents; sees their own vetting status; cannot see other executives or the reviewer queue.
- **Consultant (reviewer)** — sees the reviewer queue, opens any executive's submission, changes vetting status, adds reviewer notes. Cannot manage users or roles.
- **Administrator** — everything a Consultant can do, **plus** user management (list users, assign roles, deactivate) and full audit-log access.

Implement RBAC as `requireAuth` + `requireRole(...roles)` middleware. Also enforce **ownership** checks (an Executive hitting another Executive's record returns 403, not 404-leaking).

### 3.2 Authentication

- Email + password registration & login. Passwords hashed with **bcrypt** (cost ≥ 12). Never log or return password hashes.
- On login, issue a short-lived JWT (e.g. 15–60 min) set as an **httpOnly, Secure, SameSite=None** cookie (SameSite=None is required because frontend and backend are on different domains; must be paired with Secure + HTTPS, which Render/Vercel provide).
- Provide `/auth/me` to hydrate the frontend session, and `/auth/logout` to clear the cookie.
- Add basic **rate limiting** (e.g. `express-rate-limit`) on auth routes to blunt brute-force. Mention this in the risk register.
- Enforce a password policy (min length, not a common password) at registration.

### 3.3 Executive onboarding — multi-step, save & resume

A wizard with these steps (one logical section each):

1. **Professional profile** — full name, contact, current title, current company, years of experience, professional summary.
2. **Executive & board experience** — list of roles (org, title, start/end, board/non-board flag, description).
3. **Sector expertise** — multi-select from a fixed taxonomy (e.g. Financial Services, Energy, Healthcare, Technology, Public Sector, etc.) + free-text specialisms.
4. **Qualifications** — degrees, professional certifications (institution, title, year).
5. **Referees** — at least two: name, relationship, organisation, email, phone.
6. **Documents** — see 3.4.
7. **Consent & review** — see 3.7, then submit.

Requirements:
- **Save & resume**: each step persists to the server as a `draft`. The executive can leave and return; the wizard reopens at the furthest-completed step with data pre-filled. Store a `currentStep` and `status: "draft"` until final submission.
- Validate each step both client-side (UX) and **server-side** (source of truth).
- Final submission flips the profile to `status: "Submitted"` and writes an audit entry.

### 3.4 Secure document upload

- Document types: **CV**, **Identification**, **Certification(s)**.
- Validate **MIME type AND extension** (allow e.g. `pdf`, `png`, `jpg`, `docx`) and **max size** (e.g. 5 MB). Reject with a clear error; never store a rejected file.
- Do not trust the client filename; sanitise and store the original name as metadata only. Let Cloudinary assign a random `public_id` (or generate one) so filenames aren't guessable.
- **Store files in Cloudinary through `storageService`**, uploaded as `type: "authenticated"` (or `private`) and `resource_type: "raw"` for PDFs/`docx` (images can use `resource_type: "image"`). The raw Cloudinary URL must **not** be publicly accessible. Validate the file **before** uploading (stream/buffer via `multer` memory storage — do not write to local disk).
- Serve downloads only through an **authorised, access-controlled route** (`GET /api/documents/:id/file`) that re-checks role/ownership, then returns a **short-lived signed Cloudinary URL** (or streams the bytes through the backend). Never store or return a public URL.
- Record each upload in a `Document` record with Cloudinary's `public_id` + `resource_type`, the original name/MIME/size, and a **SHA-256 content hash** of the bytes (supports integrity checks and feeds the audit trail).

### 3.5 Vetting workflow

- Status machine (enforce legal transitions server-side; reject illegal jumps):
  ```
  Submitted ─▶ Under Review ─▶ Verified
                    │        └▶ Rejected
                    └▶ More Information Required ─▶ (executive edits) ─▶ Submitted
  ```
- **Reviewer queue**: Consultants/Admins see a list of submissions filterable by status, sortable by submission date.
- Each status change requires a **reviewer note** (mandatory for "More Information Required" and "Rejected"). Store notes as an append-only list on the profile (`vettingNotes[]`) with author + timestamp.
- "More Information Required" re-opens editing for the executive (limited to flagged areas if simple, otherwise the whole profile) and notifies them (3.6).
- Every transition writes an audit entry.

### 3.6 Push notifications + offline capability

**Push notifications** (notify executive when vetting status changes):
- Use the **Web Push API with VAPID keys**. On the frontend, request notification permission, subscribe via the service worker, and POST the subscription to the backend (`PushSubscription` record per user).
- `notificationService` on the backend sends a push on status change. If a user has no subscription, fall back silently to an **in-app notifications list** (`GET /notifications`) so the feature still demonstrably works without push permission. Document this fallback.

**Offline capability** (PWA):
- Ship a `manifest.json` + icons + service worker so the app is installable.
- Cache the app shell for offline load.
- **Offline onboarding**: if the user saves a step while offline, queue it in **IndexedDB** and replay it to the server via **background sync** (or a sync-on-reconnect routine) once online. Use an idempotency key per queued step so replays don't duplicate. Show clear "offline / syncing / synced" UI state.
- Keep offline scope honest: only onboarding draft-saving needs to work offline. Document that uploads and vetting actions require connectivity.

### 3.7 Consent & privacy (NDPA 2023)

- At onboarding, capture **explicit, granular consent** before submission: (a) consent to process personal data for vetting, (b) consent to share verified profile with client organisations. Store each as `{ granted: bool, version, timestamp, ipHash }`. No pre-ticked boxes.
- Show a short **privacy notice** referencing the **Nigeria Data Protection Act (NDPA) 2023**: what data is collected, purpose (executive vetting), lawful basis (consent), retention, and data-subject rights (access, rectification, erasure).
- Provide a **data-subject rights** demonstration: an executive can **export their own data** (JSON) and **request deletion** (soft-delete / anonymise their record + purge files, with an audit entry). This shows NDPA data-subject-rights handling concretely.
- **Data minimisation**: don't collect anything not needed for vetting. **Mask** sensitive fields in list views; reveal full detail only to authorised reviewers viewing a single record.
- Reference NDPA principles (lawfulness, purpose limitation, minimisation, accuracy, storage limitation, integrity/confidentiality, accountability) in `risk-register.md` and map each to something in the build.

### 3.8 Audit trail — tamper-evident

- Append-only `AuditLog` collection. Every entry: `{ actorId, actorRole, action, targetType, targetId, metadata, timestamp, prevHash, hash }`.
- **Tamper-evidence via hash chaining**: `hash = SHA256(prevHash + canonicalJSON(entry fields))`. Each new entry links to the previous entry's hash (blockchain-lite). Provide a `GET /audit/verify` endpoint (Admin only) that walks the chain and reports whether integrity holds — this is your "tamper-evident" proof for the demo.
- Log at minimum: register, login (success/failure), consent granted, step saved, submission, every status transition, document upload/download, role change, data export, deletion request.
- Audit log is viewable by **Administrators** (and optionally Consultants, read-only). Never editable or deletable via the API.
- Write audit entries through a single `auditService.record(...)` so it can't be bypassed.

---

## 4. STRETCH GOALS (only after core works; each is optional)

Pick the ones you have time for and list the rest as "not attempted" in the README:
- **MFA** — TOTP (authenticator app) on login.
- **Consultant analytics dashboard** — counts by status, average time-to-verify, submissions over time.
- **Matching** — score an executive profile against a sample role brief (sector + experience overlap); return top matches.
- **Automated tests** — a handful of meaningful backend tests (auth, RBAC denial, status-transition rules, audit-chain verify).
- **CI pipeline** — GitHub Actions running lint + tests on push.

---

## 5. Data model (MongoDB collections)

Define these Mongoose schemas (expand in `design-pack/data-model.md`):

- **User** — `email` (unique), `passwordHash`, `role` (`executive`|`consultant`|`admin`), `isActive`, `mfaSecret?`, `createdAt`.
- **ExecutiveProfile** — `userId`, `status` (draft/Submitted/Under Review/More Information Required/Verified/Rejected), `currentStep`, `professional{}`, `experience[]`, `sectors[]`, `qualifications[]`, `referees[]`, `consents[]`, `vettingNotes[]`, `assignedReviewerId?`, timestamps. Mask/soft-delete support.
- **Document** — `profileId`, `ownerId`, `type` (cv/id/certification), `cloudinaryPublicId`, `resourceType`, `originalName`, `mimeType`, `size`, `sha256`, `uploadedAt`.
- **AuditLog** — append-only, hash-chained (Section 3.8).
- **Notification** — `userId`, `type`, `message`, `read`, `createdAt` (in-app fallback).
- **PushSubscription** — `userId`, subscription object.

---

## 6. API surface (REST, prefix `/api`)

Keep it small and consistent. Examples (not exhaustive — add what the features need):

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/profile/me                 # executive: own profile/draft
PUT    /api/profile/me/step/:step      # save a step (draft) — idempotent
POST   /api/profile/me/submit          # draft -> Submitted (requires consents)
GET    /api/profile/me/export          # NDPA data export (JSON)
POST   /api/profile/me/delete-request  # NDPA erasure

POST   /api/documents                  # upload (multipart) + validation
GET    /api/documents/:id/file         # access-controlled download

GET    /api/review/queue               # consultant/admin
GET    /api/review/:profileId          # consultant/admin
POST   /api/review/:profileId/status   # transition + mandatory note

GET    /api/notifications              # in-app list
POST   /api/push/subscribe             # store web-push subscription

GET    /api/audit                      # admin: list
GET    /api/audit/verify               # admin: chain integrity check

GET    /api/admin/users                # admin
PATCH  /api/admin/users/:id/role       # admin
```

All responses JSON. Consistent error shape `{ error: { code, message } }`. Validate request bodies server-side (e.g. with `zod` or `express-validator`).

---

## 7. Security requirements (checklist — reviewer will look for these)

- `helmet` for secure headers; strict **CORS** with an explicit allow-list (the frontend origin) and `credentials: true`.
- httpOnly + Secure + SameSite=None cookies; no JWT in localStorage.
- bcrypt (cost ≥ 12); password policy; rate-limited auth.
- Server-side input validation on every write route; Mongoose schema validation.
- RBAC + ownership enforced on the server for every protected route.
- File upload: type + size validation **before** upload, validate in memory (no local disk write), Cloudinary **authenticated/private** delivery via short-lived signed URLs (never public), content hashing.
- No secrets in the repo; everything via env vars; provide `.env.example` with safe placeholders.
- Generic error messages to clients; detailed errors only in server logs. Don't leak stack traces in production.
- Tamper-evident audit chain + verification endpoint.
- NDPA: consent, minimisation, data-subject export/erasure, privacy notice.

---

## 8. Hosting — the simplest separate-hosting path (put this in the README verbatim-ish)

Three free services, no Docker, no custom infra:

1. **Database — MongoDB Atlas (free M0 cluster)**
   - Create a free cluster, a database user, and allow access (for the PoC, allow from anywhere `0.0.0.0/0` — note in README this would be IP-restricted in production).
   - Copy the connection string → `MONGODB_URI`.

2. **Backend — Render (free Web Service)**
   - New Web Service → connect the repo → **Root Directory: `backend`**.
   - Build: `npm install` · Start: `npm start`.
   - Set env vars: `MONGODB_URI`, `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CORS_ORIGIN` (the Vercel URL), `COOKIE_DOMAIN`, `NODE_ENV=production`.
   - Note: Render's free tier spins down when idle (cold starts) — acceptable for a PoC demo. Uploaded documents live in **Cloudinary**, so they survive restarts; note the cold-start behaviour in Known Limitations.

   **Cloudinary setup:** create a free account, grab the Cloud name / API key / API secret from the dashboard, and set the three env vars above. No bucket config needed.

3. **Frontend — Vercel**
   - Import the repo → **Root Directory: `frontend`** → framework auto-detected (Next.js).
   - Set env vars: `NEXT_PUBLIC_API_URL` (the Render backend URL), `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

4. **Wire them together**: set backend `CORS_ORIGIN` to the Vercel domain and frontend `NEXT_PUBLIC_API_URL` to the Render domain; redeploy both.

Also document **running locally**: start MongoDB (Atlas or local), `cd backend && npm install && npm run seed && npm run dev` (port 4000), `cd frontend && npm install && npm run dev` (port 3000), with `.env`/`.env.local` from the `.example` files. Local cookies: use SameSite=Lax over http on localhost; SameSite=None+Secure only in production — handle via `NODE_ENV`.

---

## 9. Technical design pack (markdown files in `design-pack/` — these are graded)

- **architecture.md** — a **Mermaid** diagram showing: browser (Next.js PWA + service worker) → Express API (auth/RBAC/audit middleware) → MongoDB; plus Web Push and file storage. One short paragraph per component explaining its job.
- **data-model.md** — a **Mermaid ER diagram** of the collections in Section 5, with field notes and relationships.
- **tech-justification.md** — the Section 1 table, expanded into prose; justify each choice and name one alternative you rejected and why.
- **risk-register.md** — a table of the main security & privacy threats with likelihood/impact and mitigation. Cover at least: credential stuffing/brute force, XSS/token theft, broken access control (IDOR), insecure file upload, audit tampering, data breach of PII, NDPA non-compliance (consent/retention/rights). Map NDPA principles to controls.

---

## 10. README must contain

1. One-paragraph project summary.
2. **Setup** — local run steps + the hosting steps from Section 8.
3. **Seed/demo accounts** — one per role (synthetic), e.g.
   `admin@example.com` / `consultant@example.com` / `executive@example.com` with the dev passwords printed here.
4. **Tech justification** (link to design-pack).
5. **Assumptions** you made.
6. **Known limitations & what you left out, and why** (Render free-tier cold starts, offline scope limited to onboarding drafts, etc.).
7. **What I'd build next** (hardening, real object storage, MFA everywhere, retention jobs, richer matching).

---

## 11. Build order (do it in this sequence)

1. Scaffold `backend/` + `frontend/`, env examples, `.gitignore`.
2. Backend: DB connection, User model, auth (register/login/me/logout) with bcrypt + httpOnly JWT cookie, `requireAuth` + `requireRole`.
3. `auditService` with hash chaining + `/audit` + `/audit/verify`; wire audit into auth.
4. ExecutiveProfile model + multi-step save/resume + submit + server validation.
5. Document upload (validation, hashing, access-controlled download).
6. Vetting workflow (queue, transitions, mandatory notes) + audit on each.
7. Consent capture + privacy notice + NDPA export/erasure.
8. Notifications: in-app list first, then Web Push.
9. Frontend: auth pages, onboarding wizard, reviewer queue + review screen, admin users + audit viewer, notifications UI.
10. PWA: manifest, service worker, offline draft queue (IndexedDB) + sync.
11. Seed script with synthetic data (users for all 3 roles + a couple of sample submissions in different statuses).
12. Write the design-pack + README.
13. Stretch goals if time remains.

Verify at the end: each role can do only its permitted actions; the full flow Submitted → Under Review → Verified works and notifies; the audit chain verifies as intact; offline draft-save syncs on reconnect; everything runs from a clean clone following the README.
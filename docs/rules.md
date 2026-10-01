# AGAPAY — Project Rules

> For every developer **and every AI coding agent** working in this repository. If a rule here conflicts with a convenience, the rule wins. If a rule is wrong, change the rule in a PR; do not quietly break it.

---

## 0. Reading Order and Source of Truth

Read in this order before changing code: `PLAN.md` → `architecture.md` → `database.md` → `api.md` → `design.md` → this file (and `chatbot.md` for chat work).

**Backend work (anything in `apps/api` or `packages/shared`) must also follow `rules-backend.md`**: senior-level TypeScript, PostgreSQL/Prisma, concurrency, reliability, security, and testing rules with IDs (`TS-xx`, `DB-xx`, `API-xx`, `OPS-xx`, `SEC-xx`, `TEST-xx`). Sections 2 to 5 below are the summary; where they differ, `rules-backend.md` is stricter and wins.

| Question                                                                    | Authority                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| What are we building and why?                                               | `PLAN.md`, proposal                               |
| How is it structured?                                                       | `architecture.md`                                 |
| Tables, constraints, codes                                                  | `database.md` and `schema.prisma`                 |
| Endpoints, payloads, errors                                                 | `api.md` and the Zod schemas in `packages/shared` |
| How should it look?                                                         | `design.md`                                       |
| How is backend code written (types, DB, concurrency, ops, security, tests)? | `rules-backend.md`                                |

**If code and docs disagree, stop and fix one of them in the same PR.** Do not leave drift.

### Rules for AI coding agents

1. **Do not invent** endpoints, tables, statuses, fields, env vars, or business rules. If it is not in the docs, ask or propose a doc change first.
2. **Ask before** creating or changing: the Prisma schema, auth logic, inventory arithmetic, email templates, public endpoints, or anything touching personal data.
3. **Do not fabricate content**: no fake statistics, testimonials, partner logos, team members, or legal text. Use clearly marked placeholders (`TODO(owner): …`).
4. **Do not add dependencies** without stating why, the alternative considered, and its licence and maintenance status.
5. **Never** commit secrets, real personal data, or production credentials. Use `.env.example` with placeholder values.
6. **Run before declaring done:** `npm run typecheck && npm run lint && npm test`, and run the changed flow in the browser. Report what you actually ran. Never claim a test passed without running it.
7. Prefer small, reviewable changes. One concern per PR.
8. No dead UI: every button, link, and form must do something real or be visibly disabled with a reason. No links to pages that do not exist.
9. Comments explain **why**, not what. Remove comments that restate the code.
10. Follow `design.md` for all UI. Without direction for a screen, ask; do not improvise a style.

---

## 1. Repository and Tooling

- npm workspaces: `apps/web`, `apps/api`, `packages/shared`. No cross-imports between `web` and `api`; share only through `packages/shared`.
- Node LTS pinned in `.nvmrc` and `engines`. Exact dependency versions via the lockfile; commit `package-lock.json`.
- Scripts at the root: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:migrate`, `db:seed`.
- Pre-commit: Prettier and ESLint on changed files, wired up when hooks are added. CI re-runs everything; CI is the gate.
- Environment: copy `.env.example` → `.env`. Config is parsed by a Zod `env.ts` that fails fast at boot.

## 2. TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- **No `any`.** Use `unknown` and narrow. `@ts-expect-error` needs a reason comment and a ticket.
- Derive types from Zod: `type X = z.infer<typeof xSchema>`. Do not hand-write a type that duplicates a schema.
- Enums come from `packages/shared` (mirroring the Prisma enums). Do not use magic strings for statuses.
- Named exports; no default exports except where a framework requires them.
- Money does not exist in this system. Quantities are integers.
- Dates: store UTC `timestamptz`; parse and format at the edges; display in `Asia/Manila`.

Naming: files `kebab-case.ts`; React components `PascalCase.tsx`; functions `camelCase`; DB models `PascalCase`; env vars `UPPER_SNAKE`; routes `/kebab-case` plural nouns.

## 3. Backend Rules

### Layering (see `architecture.md` §2)

- Route → controller → service → (repository) → Prisma. Controllers contain no business logic. **Only services change state.**
- Services do not import `express`. They accept plain inputs and return plain data. Chat tools and jobs call the same services.
- Cross-module calls go through the other module's **service**, not its tables.

### Validation and errors

- Every route validates `body`, `params`, and `query` with Zod. Reject unknown keys on bodies (`.strict()`).
- Throw `AppError(code, status, message, details?)`. Never `res.status(500).send(err.message)`. Never leak stack traces or SQL errors.
- Error codes are the ones in `api.md` §1; add new codes to that table when you add them.
- Map database rows to **response DTOs**. Never return a Prisma model directly.

### Transactions and concurrency

- A state change that touches more than one row or table runs in one `prisma.$transaction`.
- Inventory changes use the atomic conditional `UPDATE ... WHERE available >= qty` pattern from `database.md` §7. Never read-then-write stock in application code.
- When locking several rows, lock in a fixed order (by `id`) to avoid deadlocks.
- Outbox rows (emails) are inserted **inside** the same transaction as the state change, with a deterministic `dedupeKey`.

### Side effects

- Never send email, call Google, or call OpenRouter from inside a request transaction. Enqueue and let workers do it.
- Jobs must be **idempotent** and **catch-up based** (scan for what is due). Assume any job can run twice or late.
- Wrap external calls with timeouts and bounded retries.

### Logging

- `pino` structured logs with a request ID. Redact: `authorization`, cookies, passwords, tokens, emails, phone numbers.
- Never log request bodies for public endpoints or the chat endpoint.
- Log level `info` in production; `debug` only locally.

## 4. Database Rules

- Schema changes only through Prisma migrations. Commit the SQL. Never edit an applied migration.
- Constraints belong in the database as well as in code (`CHECK`, unique, partial unique, FKs).
- Donations, requests, distributions, inventory movements, and audit logs are **never hard-deleted**. Use status or `isActive`.
- `InventoryItem` counters are updated only through the inventory service, and every change appends an `InventoryMovement`.
- Every foreign key and every column used in a `WHERE`/`ORDER BY` of a list endpoint has an index. Check with `EXPLAIN` before shipping a new list query.
- Seeds are idempotent and never include real data. Demo data is gated by `SEED_DEMO=true` and never runs in production.

## 5. API Rules

- Version prefix `/api/v1`. Breaking changes require `/v2` or a deprecation period.
- Resource nouns plural, actions as sub-resources (`POST /donations/:id/verify`). No verbs in collection paths.
- Status codes per `api.md` §1. `201` for creates, `204` for no body, `409` for state conflicts.
- Lists are paginated with a maximum page size and a whitelisted sort.
- Authenticated routes: `authenticate` then `requireRole(...)` **then an ownership check in the service** for donor-owned data.
- Public routes are explicit (under `/public`), rate limited, Turnstile-protected where they write, and return minimal DTOs.
- Public lookups must not reveal whether a record exists beyond the single generic `NOT_FOUND`.
- Add or change an endpoint → update `api.md` and the shared Zod schema in the same PR.

## 6. Frontend Rules

- Data fetching with TanStack Query only. No `useEffect` fetching. Query keys come from a central factory.
- Forms use React Hook Form with the **shared Zod schema** as resolver. No ad-hoc validation.
- Every data view has loading, empty, error, and success states. Every mutation has pending, success, and error feedback.
- Accessibility is a requirement, not a polish step:
  - everything operable by keyboard with a visible focus indicator;
  - semantic elements and labelled inputs; errors linked with `aria-describedby`;
  - **status is never conveyed by colour alone** (text or icon too);
  - WCAG AA contrast (4.5:1 text, 3:1 large text and UI);
  - respect `prefers-reduced-motion`.
- Layout works from small phones upward; no horizontal page scroll. Beneficiaries are likely on phones, so test at narrow widths first.
- Use design **tokens** from `design.md`, never raw hex values or arbitrary pixel values scattered in components.
- One `<StatusBadge>` for all statuses; one `requestStatusMessages` map for beneficiary wording. No duplicates.
- Do not store tokens in `localStorage`. Access token in memory, refresh token in the httpOnly cookie.
- No `dangerouslySetInnerHTML`. Render chat output as plain text or sanitised markdown.
- Route guards on the client are a **convenience**. The API is the real authorisation.
- Do not add UI copy that makes unverifiable claims (statistics, partners, "trusted by", security badges).

## 7. Security Rules

| Area         | Rule                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Passwords    | argon2id; min length 10; never logged; reset tokens single use, 1 hour                             |
| Tokens       | refresh rotated every use; reuse revokes the family; only hashes stored                            |
| Cookies      | httpOnly, Secure, SameSite=Lax; CSRF header check on cookie-authenticated routes                   |
| Headers      | `helmet` defaults; CORS allow-list from `WEB_ORIGIN` only; strict CSP on the web host              |
| Input        | Zod on everything; no string-built SQL (`$queryRaw` must use tagged template parameters)           |
| Public forms | Turnstile, rate limits, duplicate detection, email-verification flag                               |
| Tracking     | code + email, generic failure, rate limited, minimal response                                      |
| Secrets      | env only; rotate if leaked; separate keys per environment; spend cap on the OpenRouter key         |
| Dependencies | `npm audit` in CI; update regularly; review new packages                                           |
| Uploads      | none in MVP; if added later, type/size checks and no public write buckets                          |
| Admin        | No public admin registration; admins cannot demote or deactivate themselves; log all admin actions |
| Errors       | no stack traces to clients; request ID for support                                                 |

## 8. Privacy Rules (Data Privacy Act of 2012)

- Collect the minimum. Do not add fields "just in case".
- Consent is recorded (`consentAt`) before a beneficiary request is saved.
- Personal data is not placed in URLs, logs, analytics events, `AuditLog.metadata`, or chat prompts.
- Retention and anonymisation follow D-13. Changing the period is a settings change plus an audit entry.
- Staff see personal data only on screens that need it; reports show aggregates.
- Not legal advice: have your organisation's data protection contact review the privacy notice and retention period before launch.

## 9. Business Rules

Each rule has an ID so tests and PRs can reference it (`// BR-INV-02`). A rule without a test is not finished.

### Campaigns

- **BR-CAM-01** A campaign accepts donations and requests only while `ACTIVE`.
- **BR-CAM-02** The system campaign "General Pool" cannot be completed, archived, or deleted.
- **BR-CAM-03** A campaign with donations, requests, events, or stock cannot be deleted; archive it.

### Donations

- **BR-DON-01** Only email-verified donors can submit donations.
- **BR-DON-02** Donations move only along the transitions in `architecture.md` §3.1.
- **BR-DON-03** Rejection requires a reason shown to the donor.
- **BR-DON-04** Only `quantityReceived` increases inventory, never `quantityDeclared`.
- **BR-DON-05** A donor can edit or cancel only their own donation, and edit only while `PENDING`.

### Requests

- **BR-REQ-01** A request needs consent, a verified-format email, a contact number, a location, an active campaign, and at least one requested item.
- **BR-REQ-02** At most one active request per email per campaign (D-10).
- **BR-REQ-03** Requested quantities respect `ItemType.maxPerRequest` and `perHouseholdMember` unless staff overrides with a note.
- **BR-REQ-04** Approval generates the tracking number once; it never changes afterwards.
- **BR-REQ-05** Rejection requires a reason written for the beneficiary.
- **BR-REQ-06** The reference number alone never grants access to anything.
- **BR-REQ-07** Possible duplicates and outside-area requests are **flagged**, never auto-rejected.
- **BR-REQ-08** Every status change writes a `RequestStatusEvent` and, for admin actions, an `AuditLog`.

### Inventory

- **BR-INV-01** `available`, `reserved`, `distributed` are never negative (DB `CHECK` plus service logic).
- **BR-INV-02** Stock is changed only by donation completion, reservation, release, distribution, or an adjustment, each with a movement row.
- **BR-INV-03** Adjustments require a reason.
- **BR-INV-04** Stock is reserved when a distribution is **scheduled**, not at approval (D-08).
- **BR-INV-05** If stock is insufficient the request stays `APPROVED` and is never marked scheduled or distributed.
- **BR-INV-06** Distributing more than was reserved is not allowed; distributing less releases the difference.
- **BR-INV-07** Stock is per `(itemType, campaign)`; transfers between campaigns are admin-only and audited.

### Distribution and calendar

- **BR-DIS-01** Only `APPROVED` requests can be allocated to an event.
- **BR-DIS-02** A request has at most one live distribution.
- **BR-DIS-03** Cancelling an event releases stock for all its live distributions and emails affected people.
- **BR-DIS-04** An event's `endAt` is after `startAt`; distribution events need a location.
- **BR-DIS-05** The database is the source of truth; a failed Google sync never blocks scheduling, it shows a retry badge.

### Notifications

- **BR-NOT-01** Emails are queued through the outbox in the same transaction as the cause.
- **BR-NOT-02** `dedupeKey` prevents duplicate emails for the same event.
- **BR-NOT-03** Daily sending stays under `EMAIL_DAILY_LIMIT`; priority order is tracking/approval/rejection, then verification/schedule, then reminders.
- **BR-NOT-04** Emails to beneficiaries contain no more personal data than needed (reference or tracking number, status, schedule).

### Access

- **BR-ACC-01** Donors see only their own donations and dashboard.
- **BR-ACC-02** Staff cannot manage users, settings, or delete records.
- **BR-ACC-03** Admins cannot demote or deactivate themselves.

## 10. AI / Chatbot Rules

(Detail in `chatbot.md`.)

- The assistant is **read-only**. No tool may create, update, approve, reject, schedule, or delete.
- Persona and tools are chosen server-side from the authenticated role.
- Admin tools return aggregates only; public free text never reaches the model.
- No personal data in prompts or logs. Conversations are not stored by default.
- Per-actor and global quotas always on; a spend cap on the OpenRouter key.
- Every number the assistant states must come from a tool result in the same turn.
- Model IDs live in config; code never hardcodes a model.
- Prompt-injection and authorisation tests (`chatbot.md` §4) must pass in CI.

## 11. Testing Rules

- Every business rule ID above has at least one test, including the failure case.
- API tests hit a real Postgres (service container in CI), not mocks of Prisma.
- Include a **concurrency test**: two simultaneous reservations for the last unit; exactly one succeeds.
- Include RBAC tests per endpoint: unauthenticated, wrong role, right role, other user's data.
- One Playwright scenario covers the 17-step MVP flow end to end; another covers tracking with a wrong email.
- Email tests assert on the outbox rows and rendered template, with a stub provider; never send real email from tests.
- Bug fix PRs include a regression test.
- Do not skip or delete failing tests to make CI pass.

## 12. Git and Review

- Branches: `feat/<module>-<short>`, `fix/…`, `chore/…`, `docs/…`. Never commit to `main` directly.
- Conventional commits: `feat(donations): verify and reject endpoints`.
- A PR is small, links the milestone, and states: what changed, how it was tested, which docs were updated, screenshots for UI.
- At least one reviewer who did not write the code. Reviewers check rules in this file, not just style.
- Squash merge. Keep `main` deployable.

## 13. Definition of Done

A change is done only when all are true:

1. Matches `api.md` / `database.md` (or those docs are updated in the same PR).
2. Inputs validated; roles and ownership enforced.
3. Business-rule tests present and passing; typecheck, lint, tests green in CI.
4. UI has loading, empty, error, success states; keyboard and narrow-screen checked; status not by colour alone.
5. Emails go through the outbox; admin actions are audited.
6. No secrets or personal data in code, logs, or fixtures.
7. Reviewed and merged by someone else.

## 14. Things We Do Not Do

- No money, payments, or transport logistics (proposal scope).
- No beneficiary accounts or passwords.
- No public email-sending endpoint.
- No hard deletes of operational records.
- No chatbot write actions.
- No `any`, no `localStorage` tokens, no secrets in the repo, no silent doc drift.

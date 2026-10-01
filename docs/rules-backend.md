# AGAPAY — Backend Rules (Senior Level)

> Extends `rules.md` §2 to §5. Applies to everything in `apps/api` and `packages/shared`.
> Rules have IDs (`TS-01`, `DB-07`, …) so reviews and PRs can cite them. A rule marked **MUST** blocks merge. **SHOULD** needs a written reason to skip.
> Stack assumed: Node LTS, Express 5, TypeScript, Prisma, PostgreSQL, Zod, pg-boss, pino.

---

## 1. Mindset

1. **Make illegal states unrepresentable.** Prefer types, constraints, and state machines over comments and hope.
2. **Correctness before cleverness.** Boring, explicit code that a new teammate can read in one pass.
3. **Trust nothing at a boundary.** HTTP, queue payloads, env, third-party responses, and LLM output are all untrusted until parsed.
4. **Design for failure.** Every external call can time out, fail, or run twice. Every job can run late or twice.
5. **The database is the last line of defence.** Application checks are for good error messages; constraints are for correctness.
6. **Money is not here, but trust is.** Donated goods are someone's generosity and a beneficiary's survival. Inventory and approvals must be auditable and never silently wrong.

---

## 2. TypeScript

### 2.1 Compiler and lint baseline

**TS-01 (MUST)** `tsconfig` extends a shared base with at least:

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "useUnknownInCatchVariables": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
  },
}
```

**TS-02 (MUST)** ESLint (typescript-eslint, type-aware) with at least: `no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `await-thenable`, `switch-exhaustiveness-check`, `no-unnecessary-type-assertion`, `consistent-type-imports`, `no-non-null-assertion`, `only-throw-error`, `prefer-readonly`. Lint warnings are treated as errors in CI.

### 2.2 Types as design

**TS-03 (MUST)** No `any`. Use `unknown` at boundaries and narrow with Zod or a type guard. No `as` casts to silence the compiler; the only allowed casts are `as const` and narrowly-scoped, commented casts at a parsed boundary.

**TS-04 (MUST)** Derive types from a single source: `type X = z.infer<typeof xSchema>`; Prisma enums mirrored in `packages/shared` as `const` objects:

```ts
export const RequestStatus = {
  PENDING: 'PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SCHEDULED: 'SCHEDULED',
  DISTRIBUTED: 'DISTRIBUTED',
  CANCELLED: 'CANCELLED',
} as const;
export type RequestStatus = (typeof RequestStatus)[keyof typeof RequestStatus];
```

**TS-05 (SHOULD)** Use **branded types** for identifiers and codes that must not be mixed up:

```ts
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };
export type RequestId = Brand<string, 'RequestId'>;
export type TrackingNumber = Brand<string, 'TrackingNumber'>;
export type Email = Brand<string, 'Email'>; // already trimmed + lowercased
```

Create branded values only in parsing functions (`parseEmail`, `generateTrackingNumber`), never by casting in business code. This prevents passing a reference number where a tracking number is required.

**TS-06 (MUST)** Model states with **discriminated unions**, and check them with an exhaustive switch:

```ts
export function assertNever(x: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
}

function beneficiaryMessage(s: RequestStatus): string {
  switch (s) {
    case 'PENDING':
      return messages.pending;
    case 'UNDER_REVIEW':
      return messages.underReview;
    // ... every status
    default:
      return assertNever(s); // compile error when a status is added and not handled
  }
}
```

**TS-07 (MUST)** State transitions are a **table**, not scattered `if`s:

```ts
const requestTransitions: Record<RequestStatus, readonly RequestStatus[]> = {
  PENDING: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'PENDING'],
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['DISTRIBUTED', 'APPROVED'],
  DISTRIBUTED: [],
  REJECTED: [],
  CANCELLED: [],
};
export function assertTransition(from: RequestStatus, to: RequestStatus): void {
  if (!requestTransitions[from].includes(to)) throw invalidTransition(from, to);
}
```

One table per entity, unit-tested exhaustively, mirrored in `architecture.md` §3.

**TS-08 (SHOULD)** Use `satisfies` for config/lookup objects so keys are checked but literal types are kept. Use `readonly` and `ReadonlyArray` for data that must not be mutated. Prefer `Record<Enum, T>` over open-ended maps so adding an enum member forces handling.

**TS-09 (SHOULD)** Prefer `type` for unions and shapes; `interface` only for extendable contracts (ports like `EmailProvider`). Avoid `enum` and `namespace` (use const objects). No `I` prefix.

**TS-10 (MUST)** Functions return explicit, narrow types. Exported functions have explicit return types. No boolean-trap parameters: use an options object (`{ includeArchived: true }`).

**TS-11 (SHOULD)** Keep generics simple. If a type needs more than a screen of conditional types, simplify the design instead.

### 2.3 Errors

**TS-12 (MUST)** Expected failures are **typed `AppError`s**; bugs are plain exceptions.

```ts
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_STATE_TRANSITION'
  | 'INSUFFICIENT_STOCK'
  | 'DUPLICATE_ACTIVE_REQUEST'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
```

**TS-13 (MUST)** Always preserve the cause: `throw new AppError(..., { cause: err })`. Never `catch (e) { throw new Error('failed') }` without the cause. Never swallow errors with an empty `catch`. A catch either handles, translates (with cause), or rethrows.

**TS-14 (SHOULD)** For multi-outcome domain operations where the caller must branch (e.g. "reserve stock" → `ok` or a shortfall list), return a discriminated result instead of throwing:

```ts
type ReserveResult =
  | { ok: true; reservationIds: string[] }
  | { ok: false; shortages: { itemTypeId: string; requested: number; available: number }[] };
```

The controller maps `ok: false` to `409 INSUFFICIENT_STOCK`. Use exceptions for exceptional paths, results for expected business branches.

**TS-15 (MUST)** One central Express error middleware. It maps `AppError`, Zod errors, and known Prisma errors (`P2002` unique violation → `409 CONFLICT`, `P2025` not found → `404`, `P2034` write conflict → retry or `409`) to the error envelope. Everything else becomes `500 INTERNAL` with the request ID; details only in logs.

### 2.4 Async correctness

**TS-16 (MUST)** No floating promises. Every promise is awaited, returned, or explicitly handled. Fire-and-forget work goes to the job queue, not an un-awaited call.

**TS-17 (MUST)** Every outbound call (HTTP, SMTP, Google, OpenRouter) has a **timeout** via `AbortSignal.timeout(ms)` and a bounded retry policy with exponential backoff and jitter for idempotent operations only.

```ts
const res = await fetch(url, { signal: AbortSignal.timeout(8_000), ... });
```

**TS-18 (SHOULD)** Use `Promise.all` for independent I/O; use `Promise.allSettled` when partial failure is acceptable. Never `await` in a loop over unbounded input; batch or use a concurrency limit.

**TS-19 (MUST)** Do not block the event loop: no sync crypto/FS in request paths (argon2 is async), no huge JSON in memory (CSV exports stream), no unbounded loops over DB results (cursor/batch).

**TS-20 (SHOULD)** Use `AsyncLocalStorage` to carry `requestId` (and actor) through logs and audit writes instead of threading parameters everywhere.

### 2.5 Structure and design

**TS-21 (MUST)** Dependency direction: `routes → controllers → services → repositories/Prisma`. Never upward, never sideways between modules' internals. Enforce with an ESLint import-boundary rule (`eslint-plugin-boundaries` or `no-restricted-imports`) and `dependency-cruiser` in CI.

**TS-22 (SHOULD)** Services are created by **factory functions with explicit dependencies**, not hidden singletons:

```ts
export function createDonationService(deps: {
  db: PrismaClient;
  clock: Clock;
  inventory: InventoryService;
  outbox: Outbox;
  audit: AuditService;
}) {
  return { submit, verify, reject, collect };
}
```

This makes services testable without mocking modules and lets chat tools and jobs reuse them. No DI framework needed.

**TS-23 (MUST)** Inject time and randomness. No `Date.now()`/`new Date()`/`Math.random()` in business logic:

```ts
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };
```

Tests pass a fixed clock. Security-sensitive randomness uses `crypto.randomBytes`/`randomInt` only.

**TS-24 (MUST)** Pure logic (state tables, quantity math, code formatting, limits) lives in pure functions with no I/O, so it is trivially unit-testable.

**TS-25 (SHOULD)** Functions do one thing, stay under ~40 lines, and have cyclomatic complexity under ~10. Early returns over nesting. Name by intent (`assertCampaignAcceptsRequests`), not mechanism.

**TS-26 (MUST)** No mutable module-level state (except the Prisma client, logger, and parsed env). No global caches without size and TTL limits.

**TS-27 (SHOULD)** Avoid barrel files (`index.ts` re-exports) inside modules; they hide dependency direction and slow tooling. One public entry per module: `modules/<name>/index.ts` exporting only the service factory and its types.

### 2.5.1 Config

**TS-28 (MUST)** `env.ts` parses `process.env` once with Zod (coercion, defaults, `.refine` for cross-field checks), exports a frozen typed object, and the process **exits at boot** if invalid. Nothing else reads `process.env`.

### 2.6 Modern Node practices

**TS-29 (SHOULD)** Use native features first: `fetch`, `AbortSignal`, `crypto.randomUUID`, `structuredClone`, `node:test` is optional (we use Vitest). Add a dependency only when native is insufficient.

**TS-30 (MUST)** ESM or CJS: choose one for the whole API and keep it. Do not mix.

---

## 3. Database (PostgreSQL + Prisma)

### 3.1 Modelling

**DB-01 (MUST)** Every business invariant that can be a constraint **is** a constraint: `NOT NULL`, `UNIQUE`, `FOREIGN KEY`, `CHECK`, partial unique indexes (see `database.md` §4). The service also checks, to return friendly errors, but never instead of the constraint.

**DB-02 (MUST)** Use `timestamptz` for all timestamps. Store UTC. No local-time columns. Prisma's bare `DateTime` maps to a **naive** `TIMESTAMP(3)` with no zone, so every field must be annotated `@db.Timestamptz(3)` explicitly — see `database.md` §3.

**DB-03 (MUST)** Quantities are `Int` with `CHECK >= 0` (or `> 0` for line items). No floats for anything countable.

**DB-04 (MUST)** Emails are normalised (trim + lowercase) at the boundary **and** uniquely indexed on `lower(email)` (or use `citext`). Phone numbers are normalised to one format before storing and before duplicate checks.

**DB-05 (SHOULD)** Enums are database enums (Prisma enums) when the set is small and stable (statuses). Use a lookup table when admins manage the values (`ItemType`).

**DB-06 (MUST)** Nothing operational is hard-deleted. Use status, `isActive`, or `archivedAt`. Child rows with `onDelete: Cascade` only where the parent is never hard-deleted in practice (e.g. `RequestedItem` under a request) or the data has no independent audit value.

**DB-07 (SHOULD)** Add `createdAt` and `updatedAt` to every table. Add `createdById` / actor columns where accountability matters.

### 3.2 Transactions and concurrency

**DB-08 (MUST)** Choose isolation deliberately. Default `READ COMMITTED` is fine when each critical write is a **single atomic statement** or uses explicit row locks. Use `SERIALIZABLE` only for multi-step invariants that cannot be expressed as one conditional update, and then **retry on serialization failure** (Prisma `P2034`).

**DB-09 (MUST)** Atomic conditional updates for counters; never read-modify-write in app memory:

```ts
// Reserve stock. count === 0 means insufficient stock; abort the whole transaction.
const { count } = await tx.inventoryItem.updateMany({
  where: { id, available: { gte: qty } },
  data: { available: { decrement: qty }, reserved: { increment: qty } },
});
if (count === 0) throw insufficientStock(id, qty);
```

Then read the new balances and append the `InventoryMovement` in the same transaction.

**DB-10 (MUST)** Lock multiple rows in a **consistent order** (sort by id) to avoid deadlocks. When the invariant spans rows Prisma cannot lock, use `SELECT ... FOR UPDATE` via a parameterised `$queryRaw` inside the transaction.

**DB-11 (MUST)** Keep transactions **short**. No network calls, no email, no LLM, no `sleep` inside a transaction. Set explicit limits on interactive transactions:

```ts
await prisma.$transaction(
  async (tx) => {
    /* ... */
  },
  {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: 10_000,
  },
);
```

**DB-12 (MUST)** Wrap serializable or conflict-prone transactions in a small `withRetry` helper (max 3 attempts, jittered backoff) that retries **only** `P2034` and Postgres `40001`/`40P01`. Everything else fails fast.

**DB-13 (SHOULD)** Use optimistic concurrency (`version Int @default(0)`, `updateMany({ where: { id, version } })`, `count === 0 → 409 CONFLICT`) for records two staff might edit at once (e.g. campaign settings). State transitions use a conditional update on the **current status**:

```ts
const { count } = await tx.assistanceRequest.updateMany({
  where: { id, status: 'UNDER_REVIEW' },   // expected current state
  data: { status: 'APPROVED', approvedAt: clock.now() },
});
if (count === 0) throw invalidTransition(...);   // someone else already moved it
```

This turns double-clicks and two admins acting at once into a clean `409`, not corrupt data.

**DB-14 (MUST)** Idempotency: `Idempotency-Key` header stored with a unique index; the outbox uses `dedupeKey` unique. A retried request or job must never create a second donation, request, email, or movement.

**DB-15 (MUST)** Job claiming uses `FOR UPDATE SKIP LOCKED` (pg-boss does this for you). Hand-rolled outbox sweeps must do the same.

### 3.3 Querying and performance

**DB-16 (MUST)** No N+1. Use `include`/`select` with intent, or batch with `findMany({ where: { id: { in } } })`. Review any loop containing `await prisma...`.

**DB-17 (MUST)** Use `select` to return only needed columns. Never load `passwordHash`, token hashes, or large JSON by default; map to DTOs in the service.

**DB-18 (MUST)** Index for the **queries you actually run**: composite indexes ordered equality-first then range/sort; partial indexes for hot subsets (e.g. open requests); unique partial indexes for invariants. Check new list queries with `EXPLAIN (ANALYZE, BUFFERS)` against realistic seed volume (≥ 100k rows) and record the index rationale in the migration comment. Do not add indexes speculatively; each costs writes.

**DB-19 (SHOULD)** Pagination: offset pagination is acceptable for admin tables under ~50k rows. For feeds that grow (audit log, inventory movements, emails), use **keyset pagination** (`WHERE (createdAt, id) < ($1, $2) ORDER BY createdAt DESC, id DESC LIMIT n`). Always include a deterministic tiebreaker in `ORDER BY`.

**DB-20 (MUST)** Raw SQL only through `` prisma.$queryRaw`...` `` tagged templates (parameterised). Never `$queryRawUnsafe` with user input. Raw queries live in the module's repository, with a comment and a test.

**DB-21 (SHOULD)** Reports run aggregates in the database (`groupBy`, `SUM`, `COUNT ... FILTER`), never by loading rows and summing in JS. Heavy or frequent reports use a read-optimised query and, if needed, a materialised view refreshed on a schedule. Cap date ranges.

**DB-22 (MUST)** Set `statement_timeout` (e.g. 10 s for the API role, longer for the migration/report role) and `idle_in_transaction_session_timeout` so a stuck query cannot hold locks or exhaust connections.

**DB-23 (MUST)** Connection management: one `PrismaClient` per process; pool size sized to the host (free tiers allow few connections). On serverless-style Postgres (Neon) use the **pooled** URL for the app and the **direct** URL for migrations and pg-boss. Handle `SIGTERM` by `await prisma.$disconnect()`.

### 3.4 Migrations

**DB-24 (MUST)** Migrations are forward-only, reviewed SQL, applied in CI to an empty database to prove they work from zero. Never edit an applied migration.

**DB-25 (MUST)** Use **expand → migrate → contract** for anything that could break the running version:

1. Expand: add nullable column / new table / new index (`CREATE INDEX CONCURRENTLY` on big tables, in its own migration).
2. Migrate: backfill in batches; deploy code that writes both and reads new.
3. Contract: add `NOT NULL`/drop old column in a later release.

**DB-26 (MUST)** Destructive changes (drop column/table, type change) need a written rollback or restore plan in the PR and a fresh backup. Test the restore path once before launch.

**DB-27 (SHOULD)** Seed scripts are idempotent (`upsert`) and environment-aware. Production seed contains only reference data and the bootstrap admin from env.

### 3.5 Integrity, audit, privacy

**DB-28 (MUST)** Inventory is **ledger-backed**: counters are a cache of the movement history. Provide an admin-only reconciliation query that recomputes balances from `InventoryMovement` and reports mismatches; run it in a scheduled job and alert on any drift.

**DB-29 (MUST)** Audit writes happen **in the same transaction** as the change they describe. No audit entry without a change, no change without an audit entry (for admin/staff actions).

**DB-30 (MUST)** Personal data minimisation and anonymisation per `database.md` §9. Anonymisation is a tested job, idempotent, and never touches counts needed for reports.

**DB-31 (SHOULD)** Backups: automated daily backup/PITR from the provider, retention documented, and a restore drill recorded before the pilot.

---

## 4. API and Service Design

**API-01 (MUST)** Every endpoint follows: authenticate → authorise (role) → validate (Zod) → call **one** service method → map to DTO. Ownership checks live in the service.

**API-02 (MUST)** Response DTOs are explicit and versioned with the API. Never return Prisma models. Never expose internal IDs where a public code exists (public tracking uses codes + email, not DB IDs).

**API-03 (MUST)** Request size and shape limits: `express.json({ limit: '100kb' })`, string max lengths and array max sizes in every schema, reject unknown keys, cap page size.

**API-04 (MUST)** Status codes and error codes only from `api.md` §1. Errors are stable contracts: clients branch on `code`, never on `message`.

**API-05 (SHOULD)** Unauthenticated lookups run in roughly constant time and return one generic error for all failures (prevents enumeration). Compare secrets with `crypto.timingSafeEqual` or by comparing hashes.

**API-06 (MUST)** Authorisation is **deny by default**: a route without an explicit role guard fails a startup check/test that enumerates routes.

**API-07 (SHOULD)** Long operations (CSV export of large ranges, bulk assignments) are asynchronous jobs with a status endpoint, or stream the response. No request should run for more than a few seconds.

**API-08 (MUST)** Rate limits are per route class (see `api.md` §2) and per identity (IP, email, code) where applicable. Store counters in Postgres or memory with documented single-instance limits; note that memory counters reset on restart and do not work across instances.

---

## 5. Reliability and Operations

**OPS-01 (MUST)** **Graceful shutdown:** on `SIGTERM`, stop accepting connections, finish in-flight requests (timeout 10 s), stop pg-boss workers, `$disconnect`, then exit. Free hosts redeploy and sleep often.

**OPS-02 (MUST)** `/health` is liveness (no dependencies). `/health/ready` checks DB connectivity with a short timeout. Neither exposes versions or secrets.

**OPS-03 (MUST)** Outbox pattern for all external effects (email, calendar). Workers are **idempotent**, claim with `SKIP LOCKED`, and use bounded retries with backoff and a terminal `FAILED` state that is visible to admins.

**OPS-04 (MUST)** Jobs are **catch-up based**: query for what is due (`scheduledFor <= now() AND status = 'QUEUED'`), do not depend on a timer firing at an exact moment. Assume the host was asleep.

**OPS-05 (SHOULD)** Third-party calls sit behind a **port** (`EmailProvider`, `CalendarProvider`, `LlmProvider`) with a real adapter and a test/console adapter. Business code never imports a vendor SDK directly.

**OPS-06 (SHOULD)** Light circuit breaking for flaky providers: after N consecutive failures, stop calling for a cool-down and surface a degraded status (emails stay queued; chat falls back to FAQ).

**OPS-07 (MUST)** Logging: JSON via pino, `requestId` on every line, log levels used consistently (`error` = needs a human, `warn` = degraded, `info` = business events, `debug` = local). **Redact** secrets and personal data (see `rules.md` §3). Log **events and IDs**, not payloads.

**OPS-08 (SHOULD)** Metrics worth having even on free tiers: request count and latency by route, error rate, queue depth and oldest queued email age, daily email usage vs limit, LLM calls and failures, DB pool saturation. A simple `/metrics` (restricted) or provider dashboard is enough.

**OPS-09 (SHOULD)** Alert on: failed emails above threshold, email daily budget > 80 %, inventory reconciliation drift, repeated 5xx, DB readiness failing, job backlog growing.

**OPS-10 (MUST)** Feature flags and kill switches via settings/env for risky features: chatbot on/off, public request form on/off (incident control), email sending on/off.

---

## 6. Security (Backend)

**SEC-01 (MUST)** Passwords: argon2id with tuned parameters; check against a short common-password list; never log. Login errors are generic (no "user not found" vs "wrong password").

**SEC-02 (MUST)** Tokens: refresh tokens random 256-bit, hashed at rest, rotated each use with **reuse detection** that revokes the family. Access tokens short-lived (15 min) with `iss`, `aud`, `exp`, and role claim verified every request; verify the user is still active for sensitive actions.

**SEC-03 (MUST)** Authorisation has three layers: route role guard, service ownership/state check, DB constraint. A missing layer is a bug.

**SEC-04 (MUST)** Never trust client-computed values: totals, statuses, roles, ownership, price-like numbers. Recompute server-side.

**SEC-05 (MUST)** Mass-assignment protection: schemas list allowed fields explicitly; services build update objects field by field. Never spread `req.body` into Prisma `data`.

**SEC-06 (MUST)** Output encoding in emails: escape every interpolated value in HTML templates; use a template engine with auto-escaping; plain-text alternative included.

**SEC-07 (MUST)** Webhook or callback endpoints (if added, e.g. email provider events) verify signatures and are idempotent.

**SEC-08 (SHOULD)** Dependency hygiene: `npm audit` and an update bot in CI; pin the Node version; review install scripts of new packages; prefer well-maintained packages with few transitive dependencies.

**SEC-09 (MUST)** LLM safety on the server: tools read-only, persona from auth, no personal data in prompts, output treated as untrusted text, spend and rate caps (`chatbot.md` §3 to §4).

**SEC-10 (MUST)** Secrets only from env or the host's secret store; different values per environment; rotation procedure documented; a leaked secret is rotated, not "removed from git history and forgotten".

---

## 7. Testing (Senior Expectations)

**TEST-01 (MUST)** Test pyramid: many pure unit tests (state tables, math, codes), a solid layer of **API integration tests against a real Postgres**, a few end-to-end flows. Do not mock Prisma; mock only true external boundaries (email, Google, LLM) through their ports.

**TEST-02 (MUST)** Each test is isolated: unique data per test (factories), transaction rollback or truncate between tests, no order dependence, no shared mutable fixtures.

**TEST-03 (MUST)** Concurrency tests for every invariant protected by locking or conditional updates: two parallel reservations for the last unit (exactly one wins), two admins approving the same request (one `409`), duplicate submissions with the same `Idempotency-Key`.

**TEST-04 (MUST)** Authorisation matrix tests: for each route, assert unauthenticated, wrong role, right role, and another user's resource. Include a test that fails if a new route lacks a guard (API-06).

**TEST-05 (SHOULD)** Property-style tests (e.g. `fast-check`) for pure logic: tracking code format and uniqueness, quantity limits, inventory arithmetic (`available + reserved + distributed` conserved by every movement).

**TEST-06 (MUST)** Time is injected (`Clock`). Tests never call `sleep`; they advance a fake clock.

**TEST-07 (SHOULD)** Contract-test response DTOs with the shared Zod response schemas so API and web cannot drift.

**TEST-08 (MUST)** Migrations tested: apply all from empty, then run the seed and a smoke test.

**TEST-09 (SHOULD)** Coverage is a signal, not a goal. Require tests for every business-rule ID; aim for high coverage in `services/` and state tables; do not chase numbers in glue code.

---

## 8. Code Review Checklist (use in every PR)

- [ ] Types: no `any`/unsafe casts; branded/union types used where states or IDs could be confused (TS-03 to TS-07)
- [ ] Errors: typed, cause preserved, none swallowed (TS-12, TS-13)
- [ ] Async: no floating promises; timeouts on outbound calls (TS-16, TS-17)
- [ ] State change goes through a service, a transition table, and a conditional update (TS-07, DB-13)
- [ ] Multi-step change is in one short transaction with no external calls (DB-11)
- [ ] Counters use atomic conditional updates and append a movement (DB-09, DB-28)
- [ ] New constraint/index justified; migration is expand/contract safe (DB-18, DB-25)
- [ ] No N+1, `select` used, DTO mapped (DB-16, DB-17, API-02)
- [ ] Emails/calendar via outbox with `dedupeKey` (OPS-03, DB-14)
- [ ] Authorisation at route + service (+ DB where possible) (SEC-03)
- [ ] No personal data in logs/URLs/prompts (OPS-07)
- [ ] Tests: success, failure, concurrency, authorisation (TEST-01 to TEST-04)
- [ ] Docs updated: `api.md`, `database.md`, `rules.md`/`STATUS.md` as needed

---

## 9. Anti-Patterns (reject on sight)

| Anti-pattern                                               | Do this instead                                          |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `const stock = await find(); update(stock - qty)`          | Conditional atomic update (DB-09)                        |
| Sending email inside the request/transaction               | Outbox row in the same transaction (OPS-03)              |
| `catch (e) { console.log(e) }`                             | Handle, translate with cause, or rethrow (TS-13)         |
| `req.body` spread into Prisma `data`                       | Explicit field mapping from a Zod-parsed object (SEC-05) |
| Returning the Prisma model                                 | Response DTO (API-02)                                    |
| `if (status === 'APPROVED' \|\| ...)` scattered everywhere | Transition table + `assertTransition` (TS-07)            |
| `new Date()` in business logic                             | Injected `Clock` (TS-23)                                 |
| Fire-and-forget `doThing()`                                | Job queue (TS-16)                                        |
| Unbounded `findMany()` in a list/report                    | Pagination or DB aggregation (DB-19, DB-21)              |
| Trusting role from the request body/client                 | Role from the verified token + DB check (SEC-03)         |
| One giant service with every method                        | Module-per-aggregate with a small public surface (TS-27) |
| Mocking Prisma in tests                                    | Real Postgres in CI (TEST-01)                            |
| Editing an applied migration                               | New migration (DB-24)                                    |
| Catch-all `utils.ts`                                       | Named modules by responsibility                          |

---

## 10. Reference Snippets

### 10.1 Transaction retry helper

```ts
const RETRYABLE = new Set(['P2034']); // Prisma write conflict / deadlock
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (i >= attempts || !code || !RETRYABLE.has(code)) throw err;
      await sleep(25 * 2 ** i + Math.random() * 25); // jittered backoff
    }
  }
}
```

### 10.2 Service method shape (approve a request)

```ts
async function approve(id: RequestId, actor: Actor, input: ApproveInput): Promise<RequestDto> {
  return withRetry(() =>
    db.$transaction(async (tx) => {
      const req = await tx.assistanceRequest.findUnique({
        where: { id },
        select: requestForApproval,
      });
      if (!req) throw notFound('request');
      assertTransition(req.status, 'APPROVED'); // fast, friendly error
      const trackingNumber = await generateUniqueTrackingNumber(tx);

      const { count } = await tx.assistanceRequest.updateMany({
        where: { id, status: req.status }, // guards against races
        data: {
          status: 'APPROVED',
          trackingNumber,
          approvedAt: clock.now(),
          reviewedById: actor.id,
        },
      });
      if (count === 0) throw invalidTransition(req.status, 'APPROVED');

      await tx.requestStatusEvent.create({
        data: { requestId: id, fromStatus: req.status, toStatus: 'APPROVED', actorId: actor.id },
      });
      await audit.write(tx, actor, 'request.approve', 'AssistanceRequest', id);
      await outbox.enqueue(tx, {
        type: 'REQUEST_APPROVED',
        dedupeKey: `REQUEST_APPROVED:${id}` /* ... */,
      });

      return toRequestDto(await tx.assistanceRequest.findUniqueOrThrow({ where: { id } }));
    }, txOptions),
  );
}
```

### 10.3 Keyset pagination

```ts
const rows = await db.auditLog.findMany({
  where: cursor
    ? {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      }
    : {},
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1, // one extra row tells us whether there is a next page
});
```

### 10.4 Graceful shutdown

```ts
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    logger.info({ signal }, 'shutting down');
    server.close(); // stop accepting new connections
    await Promise.race([boss.stop({ graceful: true }), sleep(10_000)]);
    await prisma.$disconnect();
    process.exit(0);
  });
}
```

### 10.5 Env parsing

```ts
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  EMAIL_DAILY_LIMIT: z.coerce.number().int().positive().default(280),
});
export const env = Object.freeze(schema.parse(process.env)); // throws at boot if invalid
```

---

## 11. When to Break a Rule

Rules exist to prevent specific failures. If one blocks a good solution: state the rule ID, the reason, the risk, and the mitigation in the PR description and in a code comment (`// RULE-OVERRIDE DB-19: …`), and get reviewer agreement. Undocumented exceptions are bugs.

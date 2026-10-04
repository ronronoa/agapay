# STATUS

> Living file. Agents read this first and update it last. Keep it under ~60 lines.

**Current milestone:** M1 Foundation in progress — auth module done. See `PLAN.md` §5.
**Repo state:** API auth verified against a real Postgres and live server. On `feat/m0-scaffold`; M1 is uncommitted.

## Done

- All planning docs written, including `rules-backend.md`.
- npm workspaces root: `package.json`, `tsconfig.base.json`, type-aware ESLint, Prettier, Husky + lint-staged, `.nvmrc`, CI with a Postgres service container.
- `packages/shared`: Prisma enum mirrors, `ErrorCode` + `ERROR_STATUS`, `errorEnvelopeSchema`, `requestStatusMessages`, list-query schema, `assertNever`.
- `apps/api`: `env.ts`, `logger.ts`, `AppError`, central error middleware, request context, `Clock`, Prisma client + `withRetry`, Express app, health routes, graceful shutdown.
- `apps/web`: Vite + React 19 + React Router, TanStack Query provider, Tailwind v4 with `design.md` tokens, app shell, full route table, typed API client.
- Prisma baseline migration `20260101000000_baseline` **applied to a live database**, with all CHECK and partial-unique constraints from `database.md` §4.
- All 45 timestamp columns converted to `@db.Timestamptz(3)`.
- `prisma.config.ts` loads the root `.env`; replaces the deprecated `package.json#prisma` key.
- `scripts/setup-db.ps1` provisions role, database, migrations, and seed in one step.
- Contrast verified and `design.md` §2 corrected: `--color-text-muted` darkened to `#5F6875`; accent buttons use charcoal text.
- Docs updated for npm, Resend, `/api/v1/health`, and `timestamptz`.
- Stripped ~200 lines of redundant code comments; kept the ones that explain why.
- **M1 auth module** in `apps/api/src/modules/auth/`: argon2id hashing, register, verify email, login, refresh rotation with family reuse detection, logout, forgot/reset/change password, `GET/PATCH /me`. All 10 routes in `api.md` §3 are live. No schema change was needed — the baseline already had `User`, `RefreshToken`, `AuthToken`.
- Access token is a 15-min HS256 JWT (`sub`, `role`, `iss`, `aud`); refresh is a 256-bit opaque token in an httpOnly SameSite=Lax cookie, stored only as a SHA-256 hash and rotated on every use (SEC-01, SEC-02).
- `requireAuth` re-checks `isActive` on every request, so deactivating a user takes effect before the token expires.
- `requireCsrf` guards the cookie-authenticated `refresh` and `logout` (architecture.md §5).
- Rate limits per `api.md` §2, including the per-email login limiter keyed on a hash rather than the address.
- Verification and password-reset emails are queued as `EmailNotification` outbox rows; nothing is sent inside a request (hard rule 6).

## In progress

- (nothing)

## Next

1. M1: web auth — `auth-client.ts`, login and register pages, session store holding the access token in memory.
2. M1: seeded admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (argon2 is available now).
3. M1: users list, audit-log helper, item-type catalog, campaigns CRUD with areas and priority goods.

## Built modules (update as they land)

| Module              | API       | Web | Tests | Notes                                           |
| ------------------- | --------- | --- | ----- | ----------------------------------------------- |
| health              | yes       | —   | 3     | liveness + readiness, both verified live        |
| shared              | —         | —   | 6     | enums, errors, status messages, auth schemas    |
| web shell           | —         | yes | 3     | routing, tokens, skip link                      |
| notifications/email | port only | —   | —     | Resend + console adapters; no outbox worker yet |
| auth                | yes       | —   | 30    | 22 unit + 38 integration incl. reuse + CSRF     |
| schema              | migration | —   | 8     | integration suite against real Postgres         |

## Open decisions / blockers

- Email budget lowered to 90/day for Resend's 100/day free cap (D-01). A paid plan is likely needed before a real calamity.
- Waiting on team `design.md` (starter in `design.md`)
- Domain for email sending and cookies: undecided
- Filipino language at launch: undecided
- Inventory per campaign (D-16): confirm

## Gotchas learned

- **Prisma maps `DateTime` to naive `TIMESTAMP(3)`, not `timestamptz`.** Every field needs `@db.Timestamptz(3)`. Do not regex-replace `DateTime` in the schema: `\s+` eats newlines and silently merges fields, corrupting the file.
- The Prisma CLI runs with cwd `apps/api` and cannot see the root `.env`. `apps/api/prisma.config.ts` loads it with `process.loadEnvFile` before defining the config. The integration vitest config does the same.
- `prisma migrate diff --from-empty --to-schema-datamodel <schema> --script` produces baseline SQL with no database, which is how the first migration was created without credentials. It does **not** write `migration_lock.toml`; create that by hand.
- `migrate diff --from-migrations` needs `--shadow-database-url`; the shadow database must already exist.
- npm 11 blocks install scripts by default. `npm approve-scripts prisma @prisma/client @prisma/engines esbuild` is required once; it writes an `allowScripts` block into the root `package.json`.
- `@prisma/client` has no usable types until `npm run db:generate` has run. ESLint reports a flood of `no-unsafe-*` until then.
- Flat-config ESLint needs the `@typescript-eslint/` prefix on rule names; the bare names in `rules.md` TS-02 will error.
- ESLint `projectService` cannot lint files outside every `tsconfig` `include`. Config files and `prisma/seed.ts` use `allowDefaultProject`; putting a file in both a tsconfig and `allowDefaultProject` is itself an error.
- PowerShell `Set-Content` mangles non-ASCII in already-UTF-8 files (`§` became Latin-1 0xA7). Prefer the edit tool, or write with explicit UTF-8.
- Check-vs-build configs are split (`tsconfig.json` is `noEmit` and includes tests; `tsconfig.build.json` emits and excludes them) so `dist` never contains test files.
- Root `typecheck` builds `shared` first: its declarations are what `api` and `web` resolve through `node_modules`.
- Web uses `moduleResolution: "bundler"` with extensionless imports; the API uses `nodenext` with `.js` extensions. Deliberately different.
- Husky 9 sets `core.hooksPath` to `.husky/_`; there is no `.git/hooks/pre-commit` file to look for.
- 3 high advisories remain in `deepmerge-ts` via `prisma` → `@prisma/config`. Dev-CLI only, no non-breaking fix; Prisma 8 is still RC. CI fails only on `critical`.
- **`exactOptionalPropertyTypes` is on.** An interface field written `foo?: string` cannot be assigned `{ foo: undefined }`; it must be `foo?: string | undefined`.
- **Express's `req.body` and `req.cookies` are `any`,** so type-aware ESLint rejects every direct use. Assign to `unknown` first (`const body: unknown = req.body`), which the rule permits, rather than casting. `@types/cookie-parser` types `cookies` as `Record<string, any>`.
- Supertest's `res.body` is also `any`. Parse it with a shared Zod schema (`errorEnvelopeSchema`, `accessTokenResponseSchema`) instead of reading `.body.x`, which is how the health test avoids the lint errors. `expect.any(String)` also trips `no-unsafe-assignment`.
- **Integration tests share one process, so per-IP rate limits throttle the suite itself.** Give each request a distinct `X-Forwarded-For` (`app.ts` sets `trust proxy`, so `express-rate-limit` keys on it) and pin an address explicitly in the tests that assert throttling. Symptoms are 7 tests failing with no `set-cookie` and missing queued emails.
- `argon2` ships prebuilds, so it works even with the install script unapproved; `npm approve-scripts argon2` is still worth running so a clean CI install is reproducible.
- `withRetry` lives in `lib/retry.ts`, not `lib/prisma.ts`. `lib/prisma.ts` exports `prisma` and `txOptions`.
- **A fresh clone has no `packages/shared/dist`.** `dist/` is gitignored, so `@agapay/shared` (resolved through a Windows junction to `packages/shared`, then to `dist/index.d.ts`) is unresolvable until something builds it. The symptom is an editor reporting `AuthResult.user: service.AuthUser` and `Unsafe member access .success on a type that cannot be resolved` while `tsc` and `npm run lint` are clean. Root `postinstall` now builds `shared`, which closes it.
- **Two TypeScript majors can coexist.** The root manifest did not declare `typescript`, so npm auto-installed `6.0.3` at the root to satisfy the `typescript-eslint` optional peer while each workspace kept its own `5.9.3`. The editor's ESLint extension loads from the root and would type-check under a different compiler than the build. Root now pins `typescript` in both `devDependencies` and `overrides`.
- `eslint.config.js` is covered by the root `tsconfig.json` (`allowJs` + `checkJs`), so it is **not** in `allowDefaultProject`. A file may not be in both; putting it in a tsconfig while also listing it in `allowDefaultProject` yields `error typed` values from `tseslint.configs.recommendedTypeChecked`.
- `packages/shared/dist/index.d.ts` is what every other workspace actually type-checks against. After editing anything in `packages/shared/src`, run `npm run build -w @agapay/shared` or the root `typecheck`, which does it for you.
- **`const v: unknown = anyValue[x]` does not satisfy `no-unsafe-member-access`.** The rule fires on the member access itself, before the assignment, so assigning to `unknown` afterwards changes nothing. Narrow with a `value is Record<string, unknown>` type guard first, then index. This bit `req.cookies[NAME]`: `@types/cookie-parser` declares `cookies: Record<string, any>`, and some editor resolvers widen it to plain `any`, so the same file lints clean in CI and red in the editor.
- When CLI lint and editor lint disagree, reproduce the editor's typing instead of guessing: write a throwaway file declaring `declare const x: { cookies: any }`, exercise both patterns, run `npx eslint` on it, then delete it. That is how the `unknown`-assignment trap was confirmed rather than assumed.
- `req.body` and `req.cookies` are `any`; assigning the whole property to `unknown` is fine, only member access on it is not.

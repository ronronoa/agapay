# STATUS

> Living file. Agents read this first and update it last. Keep it under ~60 lines.

**Current milestone:** M0 Setup complete — see `PLAN.md` §5. Next: M1 Foundation.
**Repo state:** backend + web scaffolded and verified against a real Postgres. Nothing committed yet.

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

## In progress

- (nothing)

## Next

1. M1: auth module — argon2, register, verify, login, refresh rotation, RBAC, and the seeded admin.
2. M1: users list, audit-log helper, item-type catalog, campaigns CRUD with areas and priority goods.
3. M1: public campaign pages in `apps/web`.

## Built modules (update as they land)

| Module              | API       | Web | Tests | Notes                                           |
| ------------------- | --------- | --- | ----- | ----------------------------------------------- |
| health              | yes       | —   | 3     | liveness + readiness, both verified live        |
| shared              | —         | —   | 3     | enums, errors, status messages                  |
| web shell           | —         | yes | 3     | routing, tokens, skip link                      |
| notifications/email | port only | —   | —     | Resend + console adapters; no outbox worker yet |
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

# AGENTS.md — Agapay

Calamity relief donation and distribution system. npm workspaces monorepo, TypeScript end to end.
Keep this file short. Detail lives in `docs/`; load it only when the task needs it.

## Do not explore the repo

You do not need to scan the project. Everything you need to orient is below.

1. Read `docs/STATUS.md` first. It says what is built, what is in progress, and what is next.
2. Use the **Where things live** table to go straight to the right folder.
3. Search with targeted `grep`/glob inside **one** module folder. Never list or read the whole tree, `node_modules`, `dist`, lockfiles, or generated Prisma output.
4. Read at most the files you will change plus their direct imports. If you need more, say why.
5. Do not re-read a doc you already read in this session.
6. When you finish, update `docs/STATUS.md` (3 lines max: what changed, what is next).

## Stack

- `apps/web`: React + Vite + TypeScript, React Router, TanStack Query, React Hook Form + Zod, Tailwind + shadcn/ui
- `apps/api`: Node LTS + Express 5 + TypeScript, Prisma + PostgreSQL, Zod, pino, pg-boss (jobs)
- `packages/shared`: Zod schemas, enums, DTO types, status messages. **Only** place web and api share code
- Email: Resend behind `EmailProvider` (default adapter is `console` in dev). Calendar: Google Calendar via service account + `.ics`
- Chatbot: OpenRouter via Vercel AI SDK, **read-only tools only**

## Commands

```
npm run dev            web + api (API reads ../../.env; needs a Postgres for anything past /health)
npm run typecheck      npm run lint      npm test      npm run test:e2e
npm run db:migrate     npm run db:seed   npm run build
```

Run `npm run typecheck && npm run lint && npm test` before saying a task is done. Report what you actually ran. If a command does not exist yet, say so; do not invent output.

## Where things live

| Task                           | Go to                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New or changed endpoint        | `apps/api/src/modules/<module>/` (`*.routes.ts`, `*.controller.ts`, `*.service.ts`) + Zod schema in `packages/shared/src/<module>.ts` + update `docs/api.md` |
| Business rule or status change | `<module>.service.ts` only, never a controller                                                                                                               |
| DB table or column             | `apps/api/prisma/schema.prisma` + new migration + update `docs/database.md`                                                                                  |
| Inventory math                 | `apps/api/src/modules/inventory/` only                                                                                                                       |
| Email                          | enqueue via `notifications` service; templates in `apps/api/src/modules/notifications/templates/`                                                            |
| Background job                 | `apps/api/src/jobs/`                                                                                                                                         |
| Chatbot                        | `apps/api/src/modules/chat/` (prompts, tools, quota) and `apps/web/src/features/chat/`                                                                       |
| Page / screen                  | `apps/web/src/features/<feature>/` and route in `apps/web/src/routes/`                                                                                       |
| Shared UI component            | `apps/web/src/components/ui/` (one `StatusBadge` for all statuses)                                                                                           |
| Env var                        | `apps/api/src/lib/env.ts` (Zod) + `.env.example`                                                                                                             |

Modules: `auth users item-types campaigns donations inventory requests distributions calendar notifications reports public chat audit`.
Flow inside the API: route → controller → service → Prisma. Modules call each other through **services**, not tables.

## Docs (read only when relevant)

| File                    | Read it when                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `docs/STATUS.md`        | Always, first                                                                              |
| `docs/rules.md`         | Before writing code in a new area; its business rules have IDs (BR-xxx)                    |
| `docs/rules-backend.md` | Any change in `apps/api` or `packages/shared`. Cite rule IDs (TS-xx, DB-xx, SEC-xx) in PRs |
| `docs/api.md`           | Adding or changing an endpoint, payload, or error code                                     |
| `docs/database.md`      | Touching schema, constraints, codes, inventory recipes                                     |
| `docs/architecture.md`  | State machines, sequences, auth, jobs, deployment questions                                |
| `docs/chatbot.md`       | Any chat work                                                                              |
| `docs/design.md`        | Any UI work                                                                                |
| `docs/PLAN.md`          | Scope, milestones, decision IDs (D-xx). Not needed for routine tasks                       |

If code and docs disagree, stop and fix one in the same change. Do not leave drift.

## Hard rules (the short list)

1. **Do not invent** endpoints, tables, statuses, fields, env vars, or business rules. Ask or propose a doc change.
2. **Ask before** changing: Prisma schema, auth, inventory arithmetic, email templates, public endpoints, anything touching personal data.
3. Validate every input with the shared Zod schema. No `any`. Types come from `z.infer`.
4. Only services change state. Multi-row changes run in one `prisma.$transaction`.
5. Stock changes use the atomic `UPDATE ... WHERE available >= qty` pattern and always append an `InventoryMovement`. Never read-then-write stock.
6. Never send email or call Google/OpenRouter inside a request. Insert an outbox row in the same transaction and let the worker send.
7. Never hard-delete donations, requests, distributions, movements, or audit logs.
8. Public endpoints live under `/public`, are rate limited, return minimal DTOs, and give one generic `NOT_FOUND` on failed lookups. A reference number alone never grants access.
9. Never put personal data (name, email, phone, notes) in logs, URLs, audit metadata, or chat prompts.
10. Chatbot tools are read-only. Persona and tools are chosen server-side from the auth role. Admin tools return aggregates only.
11. UI: every view has loading, empty, error, success states; keyboard operable; status is never shown by colour alone; use design tokens, not raw hex. No dead buttons or links to pages that do not exist.
12. No fabricated content (stats, testimonials, partners, legal text). Use `TODO(owner): ...`.
13. No new dependency without stating why and the alternative considered.
14. No secrets or real personal data in the repo. Use `.env.example` placeholders.
15. Backend types: no `any`, no unsafe `as`; statuses are discriminated unions with a transition table and an exhaustive `switch` (`assertNever`). Typed `AppError` with `cause`; never swallow errors (TS-03 to TS-13).
16. State changes use a conditional update on the expected current status (`updateMany` with `where: { id, status }`, `count === 0` → `409`). No read-then-write (DB-09, DB-13).
17. Transactions are short: no email, HTTP, or LLM calls inside one. Inject `Clock`; never call `new Date()` in business logic (DB-11, TS-23).
18. Every outbound call has a timeout and bounded retry. No floating promises (TS-16, TS-17).
19. Constraints belong in the database as well as in code. Migrations are expand/contract and never edited after applying (DB-01, DB-24, DB-25).
20. Tests use a real Postgres, not mocked Prisma. Add a concurrency test for any locking or conditional-update logic (TEST-01, TEST-03).

## Output style

- Make the smallest change that solves the task. One concern per change.
- Comments explain why, not what.
- If requirements are ambiguous, ask one specific question before coding.
- Final message: what changed, files touched, commands run and their result, docs updated, what is next.

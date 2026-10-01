# AGAPAY — Project Plan

> Calamity Relief Donation and Distribution Management System
> Plan date: 2026-09-30 · Companion docs: `architecture.md`, `database.md`, `api.md`, `design.md`, `rules.md`, `chatbot.md`

---

## 1. Review of the Proposal

### 1.1 What is already strong

- **Clear scope boundary.** Physical goods only, no money, no transport. This removes payments, PCI, and logistics from the build.
- **The no-account beneficiary flow** is the right call for people in a calamity. The system must compensate with careful public-endpoint security (see 1.2).
- **A defined MVP (§33)** with 17 steps. This plan keeps it as the backbone of milestones M1 to M6.
- **Honest "pending decisions" list (§35).** Section 3 of this plan resolves every item with a recommended default so nobody is blocked.

### 1.2 Gaps and risks found (with recommended fixes)

| #   | Finding                                                                                                                                                   | Why it matters                                                                   | Recommended fix                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Tracking number is only issued **after approval**, but §22 tracking assumes the beneficiary has one. Pending and rejected requests have nothing to track. | A worried beneficiary can't see "still under review".                            | Accept **either** the `REQ-` reference (given at submit) **or** the `TRK-` number. Both require the email on the request as a second factor.                                                |
| G2  | `GET /assistance-requests/:trackingNumber` puts the identifier in the URL and offers no second factor.                                                    | Codes leak via logs, referrers, screenshots. §29 already flags this.             | `POST /public/track` with `{ code, email }`, generic error for any mismatch, rate limited.                                                                                                  |
| G3  | Public form + email field = **email-bombing and fake-request vector** (anyone can submit anyone's email).                                                 | Spam to third parties, junk in the admin queue, burns the free email quota.      | Cloudflare Turnstile (free), per-IP and per-email rate limits, email-verification link in the confirmation mail, duplicate detection. Unverified emails are flagged for admin, not blocked. |
| G4  | **Distribution is modelled 1:1 with a request**, but the example is one distribution _event_ (Sept 25, barangay hall) serving many people.                | Calendar would get one event per beneficiary.                                    | Split into `CalendarEvent` (the event) and `Distribution` (one request's allocation within that event).                                                                                     |
| G5  | Inventory stores `total/available/reserved/distributed` counters only.                                                                                    | Counters drift and can't be audited; donations are the trust core of the system. | Keep counters for speed, add an append-only `InventoryMovement` ledger, update both in one transaction, and add DB `CHECK` constraints so nothing goes negative.                            |
| G6  | Inventory is not tied to a campaign, but donations and distributions are.                                                                                 | Goods donated to Campaign A could be given out under Campaign B with no trace.   | Inventory is keyed by `(itemType, campaign)`. A system campaign "General Pool" holds unearmarked goods.                                                                                     |
| G7  | `DonationItem.quantity` only. Donors declare; the admin receives something different.                                                                     | Inventory must reflect what was actually received.                               | `quantityDeclared` and `quantityReceived`. Only `quantityReceived` enters inventory. Add `expiryDate` for food/water.                                                                       |
| G8  | Free-text goods ("Food Packs") on both donations and requests.                                                                                            | Can't match supply to demand or report by item.                                  | Admin-managed `ItemType` catalog. "Other" allowed with a custom name.                                                                                                                       |
| G9  | Free email tiers have **daily caps** (Resend 100/day, Brevo 300/day). A calamity spike will exceed them.                                                  | Approval and tracking emails silently stop.                                      | Transactional outbox + queue with a daily budget and priority (tracking/approval before reminders), retry, and visible failed-email list for admins.                                        |
| G10 | Admin AI summaries would read beneficiary free-text notes.                                                                                                | **Prompt injection** via a public form.                                          | Admin assistant is read-only and aggregate-only. Free text is never passed to the model unless clearly delimited as data. See `chatbot.md`.                                                 |
| G11 | Philippine deployment collects names, contact numbers, and locations of calamity victims.                                                                 | Data Privacy Act of 2012 (RA 10173) obligations.                                 | Consent checkbox + privacy notice on forms, data minimisation, retention rule, access logging. Have your adviser or a lawyer confirm the details; this plan is not legal advice.            |
| G12 | Reminders and retries need a scheduler; free hosts sleep.                                                                                                 | Emails would stop when the API is idle.                                          | Postgres-backed queue (pg-boss) + an external cron ping. See `architecture.md` §9.                                                                                                          |

---

## 2. Recommended Tech Stack

Chosen for: one language end to end (TypeScript), free-tier friendly, minimal moving parts (no Redis), and easy for a small team to learn.

### 2.1 Summary

| Layer               | Choice                                                                                                                              | Why                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language            | **TypeScript** everywhere                                                                                                           | Shared types and Zod schemas between web and API.                                                                                                    |
| Monorepo            | **npm workspaces** (`apps/web`, `apps/api`, `packages/shared`)                                                                      | One repo, one PR for a full-stack change, shared validation. No Turborepo needed at this size.                                                       |
| Frontend            | **React + Vite**                                                                                                                    | SPA is fine: the app is behind forms and dashboards, and SEO needs are small (home, campaigns, about).                                               |
| Routing / data      | **React Router**, **TanStack Query**                                                                                                | Standard, cache and retry built in.                                                                                                                  |
| Forms               | **React Hook Form + Zod**                                                                                                           | Same Zod schema validates in browser and API.                                                                                                        |
| UI                  | **Tailwind CSS + shadcn/ui (Radix)**                                                                                                | Accessible primitives (focus, keyboard, dialogs) which the proposal's accessibility principles require. Restyled with the team's `design.md` tokens. |
| Tables / charts     | **TanStack Table**, **Recharts**                                                                                                    | Admin lists and report charts.                                                                                                                       |
| Backend             | **Node.js LTS + Express 5 + TypeScript**                                                                                            | As in the proposal.                                                                                                                                  |
| Validation          | **Zod**                                                                                                                             | One source of truth for DTOs.                                                                                                                        |
| ORM / DB            | **Prisma + PostgreSQL**                                                                                                             | As requested. Migrations, typed client. Raw SQL only for `CHECK` constraints and reports.                                                            |
| Auth                | Short-lived **JWT access token** + rotating **refresh token** (httpOnly cookie, hashed in DB), **argon2** password hashing          | Matches `/auth/refresh` in the proposal.                                                                                                             |
| Background jobs     | **pg-boss** (queue on Postgres)                                                                                                     | Emails, reminders, calendar sync, retries with no Redis.                                                                                             |
| Email               | **Resend** (API) behind an `EmailProvider` interface; `console` adapter in dev                                                      | See 2.2 and D-01.                                                                                                                                    |
| Calendar            | **Google Calendar API** (service account owning a shared "Agapay Operations" calendar) + **.ics attachments** in beneficiary emails | Beneficiaries have no accounts, so an .ics file is how they add the event to their own calendar.                                                     |
| AI chatbot          | **OpenRouter** via **Vercel AI SDK** (`ai`, `@openrouter/ai-sdk-provider`, `@ai-sdk/react` `useChat`)                               | Streaming, typed tool calling with Zod, model swap by env var.                                                                                       |
| Bot protection      | **Cloudflare Turnstile**                                                                                                            | Free CAPTCHA alternative for the public form.                                                                                                        |
| Security middleware | `helmet`, `cors`, `express-rate-limit`, `pino` + `pino-http`                                                                        | Baseline hardening and structured logs.                                                                                                              |
| Testing             | **Vitest**, **Supertest**, **Testing Library**, **Playwright**                                                                      | Unit, API integration, component, and end-to-end (the 17-step MVP flow).                                                                             |
| Quality             | ESLint, Prettier, GitHub Actions CI                                                                                                 | Enforces `rules.md` automatically.                                                                                                                   |
| Local dev           | Postgres + the `console` email adapter                                                                                              | No container layer yet; see `STATUS.md`.                                                                                                             |

Pin exact versions in `package.json` when you scaffold. Verify current majors of Prisma, Express, React, Tailwind, and the AI SDK at that time, since their setup steps change between majors.

### 2.2 "Best and free" for email, calendar, AI

Free-tier limits below were checked on 2026-09-30. Providers change these; re-check before launch.

| Service                       | Free allowance                                                                                                      | Verdict                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Resend** (email)            | 3,000/month but only 100/day, 1 verified domain, 2 requests/sec                                                     | **Chosen (D-01).** Cleanest API and a straightforward SDK, but 100/day is the tightest free cap here — the daily budget is set to 90 and a paid plan should be budgeted before a real calamity.       |
| **Brevo** (email)             | 300 emails/day, SMTP relay and REST API, transactional included                                                     | Not chosen, but kept as the upgrade path if the 100/day cap turns out to be the binding constraint.                                                                                                   |
| **Gmail SMTP**                | Personal-account limits                                                                                             | Do **not** use for production: fragile, may be blocked, hurts deliverability. Fine for a quick local test only.                                                                                       |
| **Google Calendar API**       | Free                                                                                                                | **Recommended.** Use a service account and share one operations calendar with admin Google accounts.                                                                                                  |
| **OpenRouter** `:free` models | 20 requests/min; 50 requests/day, raised to 1,000/day after a one-time $10 credit purchase; free model list rotates | Good for demo and low traffic. For a real launch, expect to either buy the $10 unlock or use a cheap paid model. The chatbot has per-user quotas and a static FAQ fallback so it degrades gracefully. |

Email deliverability tip: whichever provider you use, authenticate the sending domain (SPF, DKIM, DMARC). Without your own domain, mail from a shared or free-mail sender is more likely to land in spam, which matters because beneficiaries depend on the tracking email.

### 2.3 Hosting (free, with honest trade-offs)

| Piece              | Free option                                                | Trade-off                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web (static SPA)   | Cloudflare Pages, Netlify, or Vercel                       | Check each host's terms; some free tiers restrict commercial use.                                                                                                       |
| API                | **Render** free web service                                | Sleeps after ~15 min idle and takes about a minute to wake; 750 instance-hours/month (enough for one always-awake service). Use a cron ping (see `architecture.md` §9). |
| Database           | **Neon** or **Supabase** free Postgres                     | Permanent free tiers. Do **not** use Render's free Postgres: it expires 30 days after creation.                                                                         |
| Later / real pilot | One small VPS with Docker Compose (API + Postgres + Caddy) | Small monthly cost, no cold starts, backups under your control.                                                                                                         |

Serve web and API under the **same site** (e.g. `app.agapay.example` and `api.agapay.example`, or proxy `/api/*` through the web host) so the refresh-token cookie stays first-party.

---

## 3. Resolved Design Decisions (from proposal §35)

Each row is a **recommended default**. Change any of them before the milestone that needs it. Decision IDs (D-xx) are referenced in the other docs.

| ID   | Pending item in proposal             | Default decision                                                                                                                                                                                              |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | Email provider                       | Resend via the `EmailProvider` interface. Note the trade-off: Resend's free tier is 100 emails/day against Brevo's 300, so the daily budget is set to 90 and a paid plan is likely before a real calamity.    |
| D-02 | Calendar provider                    | Google Calendar, service account, plus .ics attachments.                                                                                                                                                      |
| D-03 | Donor email verification             | **Required** before a donor can submit a donation (verification link, 24 h expiry).                                                                                                                           |
| D-04 | Tracking number format               | `TRK-XXXX-XXXX`, 8 chars from an unambiguous 32-char alphabet (no 0/O/1/I/L), from a CSPRNG. Reference: `REQ-YYYY-NNNNNN` (sequential, **never** grants access alone).                                        |
| D-05 | Extra verification for tracking      | Code **plus the request's email address**. OTP by email is a later upgrade.                                                                                                                                   |
| D-06 | Max goods per request                | Per item type `maxPerRequest` and `perHouseholdMember` limits on `ItemType`, editable by admin. Request has optional `householdSize`. Admin can override with a note.                                         |
| D-07 | Eligibility / validation             | Campaign must be `ACTIVE`; barangay must be within the campaign's affected areas (soft check, admin sees a flag if outside); required fields; consent given.                                                  |
| D-08 | Inventory allocation                 | Reserve on **scheduling** (not on approval), from the request's campaign stock, atomic in one transaction. If short, the request stays `APPROVED` and is listed as "awaiting stock".                          |
| D-09 | One request, multiple campaigns?     | **No.** One request = one campaign.                                                                                                                                                                           |
| D-10 | One email, multiple active requests? | **One active request per email per campaign.** A new one is allowed after `REJECTED`, `DISTRIBUTED` or `CANCELLED`.                                                                                           |
| D-11 | Admin roles                          | `ADMIN` (everything) and `STAFF` (review, inventory, scheduling; no user management, settings, or deletes). Donors are `DONOR`.                                                                               |
| D-12 | Report metrics                       | See `api.md` §Reports: donations by status/campaign, stock on hand, requests by status, distributions completed, goods distributed by item and barangay, pending ages. CSV export.                            |
| D-13 | Data retention / privacy             | Consent recorded. Beneficiary personal data anonymised (name, phone, email blanked, statistics kept) 12 months after campaign completion unless the org sets another period. Chat logs not stored by default. |
| D-14 | Email retry / failure                | Outbox with 5 attempts, exponential backoff, then `FAILED` shown on an admin "Failed emails" list with a resend button.                                                                                       |
| D-15 | Duplicate / fraud detection          | Same email or same normalised phone + campaign flagged; same IP hash burst flagged; admin sees flags. Nothing is auto-rejected.                                                                               |
| D-16 | Inventory scope                      | Per `(itemType, campaign)`; "General Pool" system campaign for unearmarked goods.                                                                                                                             |
| D-17 | Tracking code timing                 | Reference at submit, tracking number at approval (proposal), both usable to track.                                                                                                                            |

---

## 4. Repository Layout

```
agapay/
├── apps/
│   ├── api/                 Express + TypeScript + Prisma
│   │   ├── prisma/          schema.prisma, migrations, seed.ts
│   │   └── src/
│   │       ├── modules/     auth, users, campaigns, item-types, donations,
│   │       │                requests, inventory, distributions, calendar,
│   │       │                notifications, reports, chat, audit, public
│   │       ├── jobs/        pg-boss workers: email, reminders, calendar-sync
│   │       ├── lib/         prisma, logger, errors, http, tokens, sequence
│   │       └── app.ts / server.ts
│   └── web/                 React + Vite + TypeScript
│       └── src/ (routes, features/*, components/ui, lib/api, styles)
├── packages/
│   └── shared/              Zod schemas, enums, DTO types, status maps
├── docs/                    the documents in this folder
├── .env.example             every API env var, placeholder values
├── .github/workflows/ci.yml
└── package.json             npm workspaces root
```

---

## 5. Roadmap

Sprints are about one week each for a small team (2 to 4 people). Adjust to your capacity. Every milestone ends with something demonstrable.

| Milestone                            | Sprint | Scope                                                                                                                                                                                                                  | Exit criteria                                                                                                                          |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 Setup**                         | 0      | Monorepo, lint/format/CI, Postgres provisioning, Prisma baseline, env handling, logger, error middleware, `design.md` tokens into Tailwind, app shell and routing                                                      | `npm run dev` runs web + API + DB; CI green; health endpoint returns OK                                                                |
| **M1 Foundation**                    | 1      | Auth (donor register, email verification, login, refresh, logout, password reset), seeded admin, RBAC, users list, audit-log helper, item-type catalog, campaigns CRUD + areas + priority goods, public campaign pages | MVP steps 1 and 2. Admin creates and activates a campaign; donor can register and verify                                               |
| **M2 Donations and Inventory**       | 2      | Donor submit donation, admin verify/reject, collection scheduling, mark collected with received quantities, inventory + movements ledger, low-stock flag, donor history                                                | MVP steps 3 to 5. Verified donation becomes stock, ledger shows the movement                                                           |
| **M3 Requests and Tracking**         | 3      | Public request form (Turnstile, consent, dedupe), reference number, confirmation + verify-email mail, admin review queue, approve/reject with reason, tracking number, public tracking page, status timeline           | MVP steps 6 to 12. A beneficiary goes from form to tracking with no account                                                            |
| **M4 Distribution and Calendar**     | 4      | Calendar events (drive, collection, distribution), Google Calendar sync, assign approved requests to an event with reservation, schedule email + .ics, reminders job, record distribution, inventory update, history   | MVP steps 13 to 17. Full 17-step flow passes as one Playwright test                                                                    |
| **M5 Dashboard, Reports, Hardening** | 5      | Admin and donor dashboards, reports + CSV, failed-email list, audit-log viewer, rate limits tuned, security review, accessibility pass, seed/demo data                                                                 | Needs-attention counts match the DB; every list has empty/loading/error states                                                         |
| **M6 AI Chatbot**                    | 6      | Chat endpoint, persona tools (public, donor, admin), streaming widget, quotas, fallback FAQ, prompt-injection tests                                                                                                    | Bot answers FAQs, guides the request form, reports tracking status, and gives admin aggregate summaries without exposing personal data |
| **M7 Deploy and UAT**                | 7      | Production deploy, backups, monitoring/uptime ping, privacy notice, user acceptance with real staff, fixes                                                                                                             | Pilot-ready; runbook written                                                                                                           |

The chatbot is deliberately after the core flow: it is a layer over existing services, and it depends on stable read APIs.

### Suggested split for a small team

- **Person A:** auth, users, campaigns, item types, reports, deploy.
- **Person B:** donations, inventory, distributions, calendar, jobs.
- **Person C:** public request flow, tracking, notifications/emails, chatbot.
- **Everyone:** design system components, tests for their own modules, PR reviews.

---

## 6. Definition of Done (per feature)

1. Matches `api.md` and `database.md` (or those docs are updated in the same PR).
2. Zod validation on every input; role checks on every route.
3. Business rules in `rules.md` covered by tests, including the failure paths.
4. UI has loading, empty, error, and success states; keyboard usable; status shown with text or icon, not colour alone.
5. Emails go through the outbox, never sent inline in a request.
6. Audit log entry for every admin state change.
7. No secrets or personal data in logs.

---

## 7. Top Risks

| Risk                                          | Mitigation                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Free email cap reached during a real calamity | Outbox with priorities; monitor daily usage; know the upgrade path (Resend paid, or Brevo).              |
| Free API host sleeps and misses reminders     | Cron ping, plus reminder job catches up on wake (scans for due reminders, not exact-time timers).        |
| Free LLM quota exhausted                      | Per-user and global quotas, fallback models list, static FAQ fallback, clear "assistant unavailable" UI. |
| Inventory disagrees with reality              | Ledger, receiver quantities, adjustment reasons, audit log, periodic stock-count adjustment flow.        |
| Public-form abuse                             | Turnstile, rate limits, dedupe, email verification flag, admin visibility of flags.                      |
| Scope creep beyond the 17-step MVP            | Anything not in `PLAN.md` §5 goes to a backlog; the MVP flow test is the gate.                           |

---

## 8. Questions Still Open for You

1. Do you own a domain for sending email and hosting? (Strongly affects deliverability and cookies.)
2. Will beneficiary and donor UI need **Filipino** in addition to English at launch? (i18n is cheaper to add at the start.)
3. How many admin or staff users, and does anyone need a Google account for Calendar viewing?
4. Is inventory earmarked per campaign (D-16) acceptable, or should all goods be one shared pool?
5. Your team's `design.md`: send it when ready; `design.md` here is only a starter built from proposal §24 to §26.

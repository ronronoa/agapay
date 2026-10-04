# AGAPAY — API Specification

> Base URL: `/api/v1` · JSON only · Extends proposal §19 using decisions in `PLAN.md` §3.
> Deliberate deviation: public tracking is `POST /public/track` (code + email in the body) instead of `GET /assistance-requests/:trackingNumber`, so identifiers stay out of URLs and logs.

---

## 1. Conventions

**Roles:** `Public` (no auth), `Donor`, `Staff`, `Admin`. `Staff+` means Staff or Admin.

**Auth header:** `Authorization: Bearer <accessToken>`. Refresh token lives in an httpOnly cookie.

**Success envelope**

```json
{ "data": {}, "meta": { "page": 1, "pageSize": 20, "total": 134 } }
```

`meta` appears only on lists.

**Error envelope**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": [{ "path": "email", "message": "Invalid email address" }],
    "requestId": "b7f1c0e2-..."
  }
}
```

| HTTP | `code`                     | When                                                      |
| ---- | -------------------------- | --------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`         | Zod validation failed                                     |
| 401  | `UNAUTHENTICATED`          | Missing or expired token                                  |
| 403  | `FORBIDDEN`                | Role or ownership check failed                            |
| 403  | `EMAIL_NOT_VERIFIED`       | Donor action blocked until the address is verified (D-03) |
| 404  | `NOT_FOUND`                | Missing resource (also used for failed tracking lookups)  |
| 409  | `INVALID_STATE_TRANSITION` | Action not allowed in the current status                  |
| 409  | `INSUFFICIENT_STOCK`       | Reservation would make stock negative                     |
| 409  | `DUPLICATE_ACTIVE_REQUEST` | D-10                                                      |
| 409  | `CONFLICT`                 | Unique violation, stale update                            |
| 422  | `BUSINESS_RULE_VIOLATION`  | e.g. campaign not active, item over limit                 |
| 429  | `RATE_LIMITED`             | Includes `Retry-After` header                             |
| 429  | `CHAT_QUOTA_EXCEEDED`      | Chat daily limit                                          |
| 500  | `INTERNAL`                 | Unexpected; see logs by `requestId`                       |
| 503  | `ASSISTANT_UNAVAILABLE`    | LLM provider down                                         |

**Lists:** `?page=1&pageSize=20&sort=submittedAt&order=desc&q=text&status=PENDING`. `pageSize` max 100. Unknown query keys are rejected.

**Dates:** ISO 8601 UTC (`2026-09-25T01:00:00Z`). The UI converts to `Asia/Manila`.

**IDs:** UUIDs. **Codes:** `REQ-`, `TRK-`, `DON-` strings are never used as path IDs for authenticated routes.

**Idempotency:** `POST /public/assistance-requests` and `POST /donations` accept an optional `Idempotency-Key` header; a repeat with the same key returns the original response.

---

## 2. Rate Limits

| Scope                                     | Limit                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Global per IP                             | 300 requests / 15 min                                                       |
| `POST /auth/login`                        | 10 / 15 min per IP, 5 / 15 min per email                                    |
| `POST /auth/register`, `/forgot-password` | 5 / hour per IP                                                             |
| `POST /public/assistance-requests`        | 5 / hour per IP, 3 / day per email                                          |
| `POST /public/track`                      | 10 / 15 min per IP, 5 / hour per code                                       |
| `POST /chat`                              | per-user and global daily quota (see `chatbot.md`), plus 10 / min per actor |

---

## 3. Auth

| Method | Path                        | Role   | Purpose                                          |
| ------ | --------------------------- | ------ | ------------------------------------------------ |
| POST   | `/auth/register`            | Public | Donor registration. Sends verification email.    |
| POST   | `/auth/verify-email`        | Public | `{ token }` marks email verified.                |
| POST   | `/auth/resend-verification` | Public | `{ email }` always returns 204.                  |
| POST   | `/auth/login`               | Public | Returns access token, sets refresh cookie.       |
| POST   | `/auth/refresh`             | Cookie | Rotates refresh token, returns new access token. |
| POST   | `/auth/logout`              | Cookie | Revokes the token family.                        |
| POST   | `/auth/forgot-password`     | Public | `{ email }` always returns 204.                  |
| POST   | `/auth/reset-password`      | Public | `{ token, password }`                            |
| GET    | `/auth/me`                  | Any    | Current user.                                    |
| PATCH  | `/auth/me`                  | Any    | Update own name, phone.                          |
| POST   | `/auth/change-password`     | Any    | `{ currentPassword, newPassword }`               |

**Register**

```http
POST /api/v1/auth/register
{ "name": "Ana Reyes", "email": "ana@example.com", "password": "••••••••••", "phone": "09171234567" }
```

```json
201 { "data": { "id": "…", "email": "ana@example.com", "emailVerified": false } }
```

**Login**

```json
200 { "data": { "accessToken": "eyJ…", "expiresIn": 900, "user": { "id": "…", "name": "Ana Reyes", "role": "DONOR" } } }
```

Login for an unverified donor succeeds but `POST /donations` returns `403 EMAIL_NOT_VERIFIED` (D-03).

---

## 4. Public (no authentication)

| Method | Path                                       | Purpose                                                                                         |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GET    | `/public/campaigns`                        | Active campaigns (list, filter `calamityType`).                                                 |
| GET    | `/public/campaigns/:slug`                  | Campaign details, areas, priority goods, upcoming distribution events (location and time only). |
| GET    | `/public/item-types`                       | Active goods list for the request form, with limits.                                            |
| POST   | `/public/assistance-requests`              | Submit a request.                                                                               |
| POST   | `/public/assistance-requests/verify-email` | `{ token }` from the confirmation email.                                                        |
| POST   | `/public/track`                            | Look up status.                                                                                 |
| GET    | `/health`, `/health/ready`                 | Liveness, DB readiness.                                                                         |

**Submit request**

```http
POST /api/v1/public/assistance-requests
{
  "fullName": "Maria Santos",
  "email": "maria@example.com",
  "contactNumber": "09171234567",
  "barangay": "San Isidro",
  "city": "Quezon City",
  "province": "Metro Manila",
  "householdSize": 5,
  "campaignId": "…",
  "items": [
    { "itemTypeId": "…", "quantity": 1 },
    { "itemTypeId": "…", "quantity": 2, "customName": null }
  ],
  "notes": "Elderly member needs maintenance medicine.",
  "consent": true,
  "turnstileToken": "…"
}
```

```json
201 { "data": { "referenceNumber": "REQ-2026-004281", "status": "PENDING" } }
```

Errors: `422` campaign not active or item exceeds limit; `409 DUPLICATE_ACTIVE_REQUEST`; `400` missing consent or failed Turnstile; `429`.

**Track**

```http
POST /api/v1/public/track
{ "code": "TRK-82K4-19Q7", "email": "maria@example.com" }
```

```json
200 {
  "data": {
    "code": "TRK-82K4-19Q7",
    "campaign": { "name": "Typhoon Kristine Relief" },
    "status": "SCHEDULED",
    "statusMessage": "Your goods are ready. Please come on the date below.",
    "submittedAt": "2026-09-18T03:12:00Z",
    "timeline": [
      { "status": "PENDING", "at": "2026-09-18T03:12:00Z" },
      { "status": "UNDER_REVIEW", "at": "2026-09-18T07:40:00Z" },
      { "status": "APPROVED", "at": "2026-09-19T02:05:00Z" },
      { "status": "SCHEDULED", "at": "2026-09-20T01:30:00Z" }
    ],
    "distribution": {
      "startAt": "2026-09-25T01:00:00Z",
      "endAt": "2026-09-25T04:00:00Z",
      "location": "Barangay San Isidro Hall"
    }
  }
}
```

Any lookup failure returns the same `404 NOT_FOUND` (`"No request found for those details."`). A rejected request returns `status: "REJECTED"` and `rejectionReason`. No phone, address, notes, or staff names are ever returned.

---

## 5. Campaigns

| Method | Path                      | Role          | Purpose                                                     |
| ------ | ------------------------- | ------------- | ----------------------------------------------------------- |
| GET    | `/campaigns`              | Donor, Staff+ | List (donors see `ACTIVE` only).                            |
| GET    | `/campaigns/:id`          | Donor, Staff+ | Detail.                                                     |
| POST   | `/campaigns`              | Admin         | Create (starts `DRAFT`).                                    |
| PATCH  | `/campaigns/:id`          | Admin         | Update fields, areas, priority goods.                       |
| POST   | `/campaigns/:id/activate` | Admin         | `DRAFT` → `ACTIVE`.                                         |
| POST   | `/campaigns/:id/complete` | Admin         | `ACTIVE` → `COMPLETED`.                                     |
| POST   | `/campaigns/:id/archive`  | Admin         | Soft remove.                                                |
| DELETE | `/campaigns/:id`          | Admin         | Only if no donations, requests, or events; otherwise `409`. |

```json
POST /campaigns
{
  "name": "Typhoon Kristine Relief",
  "description": "…",
  "calamityType": "TYPHOON",
  "startDate": "2026-09-15",
  "endDate": null,
  "areas": [{ "barangay": "San Isidro", "city": "Quezon City", "province": "Metro Manila" }],
  "priorityItems": [{ "itemTypeId": "…", "targetQuantity": 500 }]
}
```

## 6. Item Types

| Method | Path              | Role          |
| ------ | ----------------- | ------------- |
| GET    | `/item-types`     | Donor, Staff+ |
| POST   | `/item-types`     | Admin         |
| PATCH  | `/item-types/:id` | Admin         |

Archive by `isActive: false`; never delete.

---

## 7. Donations

| Method | Path                      | Role                        | Purpose                                                                                                                                              |
| ------ | ------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/donations`              | Donor (own), Staff+ (all)   | List. Filters: `status`, `campaignId`, `from`, `to`, `q`.                                                                                            |
| GET    | `/donations/:id`          | Donor (own), Staff+         | Detail with items and history.                                                                                                                       |
| POST   | `/donations`              | Donor (verified)            | Submit.                                                                                                                                              |
| PATCH  | `/donations/:id`          | Donor (own, `PENDING` only) | Edit before verification.                                                                                                                            |
| POST   | `/donations/:id/cancel`   | Donor (own), Staff+         | While `PENDING` or `VERIFIED`/`SCHEDULED`.                                                                                                           |
| POST   | `/donations/:id/verify`   | Staff+                      | `PENDING` → `VERIFIED`.                                                                                                                              |
| POST   | `/donations/:id/reject`   | Staff+                      | `{ reason }` required.                                                                                                                               |
| POST   | `/donations/:id/schedule` | Staff+                      | `{ calendarEventId }` → `SCHEDULED`; emails donor with .ics.                                                                                         |
| POST   | `/donations/:id/collect`  | Staff+                      | `{ items: [{ donationItemId, quantityReceived, expiryDate? }] }` → `COLLECTED` then `COMPLETED`; increases stock and writes `DONATION_IN` movements. |

```json
POST /donations
{
  "campaignId": "…",
  "preferredDate": "2026-09-22",
  "preferredNote": "Afternoon drop-off",
  "items": [
    { "itemTypeId": "…", "quantityDeclared": 40, "description": "Canned goods", "expiryDate": "2027-06-01" }
  ],
  "notes": ""
}
```

`DELETE /donations/:id` does not exist; donations are cancelled, never deleted.

---

## 8. Assistance Requests (staff side)

| Method | Path                                  | Role   | Purpose                                                                                                          |
| ------ | ------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/assistance-requests`                | Staff+ | Queue. Filters: `status`, `campaignId`, `barangay`, `flag` (`duplicate`, `outsideArea`, `unverifiedEmail`), `q`. |
| GET    | `/assistance-requests/:id`            | Staff+ | Full detail with status events and distributions.                                                                |
| POST   | `/assistance-requests/:id/claim`      | Staff+ | `PENDING` → `UNDER_REVIEW`, sets `reviewedById`.                                                                 |
| POST   | `/assistance-requests/:id/release`    | Staff+ | `UNDER_REVIEW` → `PENDING`.                                                                                      |
| POST   | `/assistance-requests/:id/approve`    | Staff+ | Optional `{ note, adjustedItems? }`. Generates `trackingNumber`, emails it.                                      |
| POST   | `/assistance-requests/:id/reject`     | Staff+ | `{ reason }` required, written for the beneficiary.                                                              |
| POST   | `/assistance-requests/:id/cancel`     | Staff+ | `{ reason }`                                                                                                     |
| GET    | `/assistance-requests/awaiting-stock` | Staff+ | `APPROVED` requests that cannot currently be fully reserved.                                                     |

Staff cannot edit a beneficiary's submitted data except notes added by staff; corrections are done by adding an internal note (`POST /assistance-requests/:id/notes`).

---

## 9. Inventory

| Method | Path                       | Role   | Purpose                                                                                                                        |
| ------ | -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/inventory`               | Staff+ | `?campaignId&itemTypeId&lowStock=true`. Each row returns `available`, `reserved`, `distributed`, computed `total`, `lowStock`. |
| GET    | `/inventory/:id`           | Staff+ | Row detail.                                                                                                                    |
| GET    | `/inventory/:id/movements` | Staff+ | Ledger, paginated.                                                                                                             |
| POST   | `/inventory/adjustments`   | Staff+ | `{ itemTypeId, campaignId, direction: "IN"                                                                                     | "OUT", quantity, reason }`; reason mandatory. |
| POST   | `/inventory/transfer`      | Admin  | Move goods between campaigns, written as paired OUT/IN adjustments.                                                            |

Direct `PATCH` of counters is **not** offered. Stock changes only through donations, distributions, and adjustments, so the ledger always explains the numbers.

---

## 10. Calendar and Distributions

| Method | Path                          | Role   | Purpose                                                                        |
| ------ | ----------------------------- | ------ | ------------------------------------------------------------------------------ |
| GET    | `/calendar/events`            | Staff+ | `?from&to&type&campaignId&status`                                              |
| GET    | `/calendar/events/:id`        | Staff+ | Detail with attached donations/distributions.                                  |
| POST   | `/calendar/events`            | Staff+ | Create (`DONATION_DRIVE`, `COLLECTION`, `DISTRIBUTION`); queues Google sync.   |
| PATCH  | `/calendar/events/:id`        | Staff+ | Update; notifies affected people if time/location changed.                     |
| POST   | `/calendar/events/:id/cancel` | Staff+ | Releases stock for its distributions, emails affected people.                  |
| POST   | `/calendar/events/:id/resync` | Staff+ | Retry a `FAILED` Google sync.                                                  |
| GET    | `/distributions`              | Staff+ | `?status&campaignId&eventId&requestId`                                         |
| GET    | `/distributions/:id`          | Staff+ | Detail.                                                                        |
| POST   | `/distributions`              | Staff+ | Allocate an `APPROVED` request to an event; reserves stock.                    |
| PATCH  | `/distributions/:id`          | Staff+ | Change planned quantities or move to another event (releases and re-reserves). |
| POST   | `/distributions/:id/complete` | Staff+ | Record actual quantities; stock moves to distributed.                          |
| POST   | `/distributions/:id/no-show`  | Staff+ | Releases stock, request returns to `APPROVED`.                                 |
| POST   | `/distributions/:id/cancel`   | Staff+ | Releases stock, request returns to `APPROVED`.                                 |

```json
POST /distributions
{
  "requestId": "…",
  "calendarEventId": "…",
  "items": [{ "itemTypeId": "…", "quantity": 1 }, { "itemTypeId": "…", "quantity": 5 }]
}
```

```json
201 { "data": { "id": "…", "status": "SCHEDULED" } }
409 { "error": { "code": "INSUFFICIENT_STOCK", "message": "Not enough Drinking Water.", "details": [{ "itemTypeId": "…", "requested": 5, "available": 3 }] } }
```

```json
POST /distributions/:id/complete
{ "receivedByName": "Maria Santos", "items": [{ "distributionItemId": "…", "quantity": 1 }], "notes": "" }
```

Calendar `DELETE` is replaced by `cancel`, which keeps history.

---

## 11. Notifications (admin visibility)

Email sending is **internal only**; there is no public "send email" endpoint.

| Method | Path                              | Role   | Purpose                               |
| ------ | --------------------------------- | ------ | ------------------------------------- |
| GET    | `/notifications/emails`           | Staff+ | Outbox list, filter `status`, `type`. |
| POST   | `/notifications/emails/:id/retry` | Staff+ | Re-queue a `FAILED` email.            |
| GET    | `/notifications/emails/usage`     | Staff+ | Today's sent count vs daily limit.    |

---

## 12. Dashboard and Reports

| Method | Path                     | Role   | Purpose                                                                                |
| ------ | ------------------------ | ------ | -------------------------------------------------------------------------------------- |
| GET    | `/dashboard/admin`       | Staff+ | "Needs attention" counts, low stock, scheduled today, recent donations (proposal §17). |
| GET    | `/dashboard/donor`       | Donor  | Own donation counts, recent donations, active campaigns.                               |
| GET    | `/reports/donations`     | Staff+ | Group by status, campaign, item, month.                                                |
| GET    | `/reports/requests`      | Staff+ | Group by status, barangay, campaign; average review time.                              |
| GET    | `/reports/inventory`     | Staff+ | Stock by item and campaign, low stock.                                                 |
| GET    | `/reports/distributions` | Staff+ | Completed distributions, goods by item and barangay.                                   |

All reports accept `from`, `to`, `campaignId` and `format=csv` for download. Reports return **aggregates only**.

```json
GET /dashboard/admin
{
  "data": {
    "needsAttention": { "donationsAwaitingVerification": 18, "requestsAwaitingReview": 12, "distributionsToday": 3, "lowStockItems": 5 },
    "awaitingStock": 2
  }
}
```

---

## 13. Users, Audit, Settings (Admin)

| Method | Path          | Purpose                                                                      |
| ------ | ------------- | ---------------------------------------------------------------------------- |
| GET    | `/users`      | List, filter `role`, `isActive`, `q`.                                        |
| POST   | `/users`      | Create staff/admin (sends set-password email).                               |
| PATCH  | `/users/:id`  | Change name, role, `isActive`. An admin cannot demote or disable themselves. |
| GET    | `/audit-logs` | Filter `actorId`, `action`, `entityType`, `entityId`, date range.            |
| GET    | `/settings`   | Retention period, daily email limit, low-stock default.                      |
| PATCH  | `/settings`   | Update settings.                                                             |

---

## 14. Chat

| Method | Path           | Role                  | Purpose                                                                  |
| ------ | -------------- | --------------------- | ------------------------------------------------------------------------ |
| POST   | `/chat`        | Public, Donor, Staff+ | Streaming assistant. Persona and tools selected from the caller's role.  |
| GET    | `/chat/status` | Public                | `{ available, remainingToday }` so the widget can show the FAQ fallback. |

```http
POST /api/v1/chat
{ "messages": [{ "role": "user", "parts": [{ "type": "text", "text": "How do I request help?" }] }] }
```

Response is a streamed UI-message stream compatible with the AI SDK `useChat` hook. Details in `chatbot.md`.

---

## 15. Status Reference

| Entity         | Values                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| Donation       | `PENDING`, `VERIFIED`, `SCHEDULED`, `COLLECTED`, `COMPLETED`, `REJECTED`, `CANCELLED`      |
| Request        | `PENDING`, `UNDER_REVIEW`, `APPROVED`, `SCHEDULED`, `DISTRIBUTED`, `REJECTED`, `CANCELLED` |
| Distribution   | `SCHEDULED`, `DISTRIBUTED`, `NO_SHOW`, `CANCELLED`                                         |
| Campaign       | `DRAFT`, `ACTIVE`, `COMPLETED`, `ARCHIVED`                                                 |
| Calendar event | `SCHEDULED`, `COMPLETED`, `CANCELLED`                                                      |

Beneficiary-facing wording for each request status lives in `packages/shared` (`requestStatusMessages`) so web, emails, and the chatbot say the same thing.

---

## 16. Implementation Notes

- Write schemas once in `packages/shared` (Zod). Derive TypeScript types with `z.infer`.
- Optional: generate OpenAPI from the Zod schemas (`zod-to-openapi`) and publish at `/docs` in non-production environments.
- Every mutating authenticated endpoint writes an `AuditLog` entry.
- Every list endpoint enforces a maximum `pageSize` and a whitelist of sortable fields.
- Responses never include `passwordHash`, token hashes, `submitIpHash`, or other internal fields: map DB rows to explicit response DTOs.

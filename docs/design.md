# AGAPAY — Design

> **STARTER FILE. Replace with your team's `design.md`.**
> Everything marked **Source: proposal** is copied from proposal §24 to §26. Everything marked **TBD (team)** is intentionally left open: typography, spacing scale, radius, shadow, motion, iconography, imagery, and status colours were not specified, so they are not invented here.
> When you send your design, I will merge it and update `rules.md` §6 and the Tailwind token section below.

---

## 1. Direction

**Source: proposal**

```
Light surfaces + deep teal identity + small orange accents
+ real human/community photography + clear status indicators + simple forms
```

- Lighter and more approachable than the first dark-heavy mockup. Dark navy may be used for **selected hero or authentication sections only**, not the whole product.
- Operational screens (forms, tracking, inventory, admin tables, reports) prioritise **clarity** over decoration.
- Avoid making every element heavily rounded, glowing, animated, or gradient-filled.

## 2. Colour Tokens

**Source: proposal**

| Purpose           | Name           | Hex       | Token                  |
| ----------------- | -------------- | --------- | ---------------------- |
| Primary           | Deep Teal      | `#0F766E` | `--color-primary`      |
| Dark primary      | Dark Teal      | `#115E59` | `--color-primary-dark` |
| CTA accent        | Warm Orange    | `#F97352` | `--color-accent`       |
| CTA hover         | Orange         | `#EA6040` | `--color-accent-hover` |
| Background        | Warm Off-White | `#F7F8F5` | `--color-bg`           |
| Surface           | White          | `#FFFFFF` | `--color-surface`      |
| Secondary surface | Soft Sage      | `#EAF3EF` | `--color-surface-alt`  |
| Primary text      | Charcoal       | `#1F2933` | `--color-text`         |
| Secondary text    | Slate          | `#5F6875` | `--color-text-muted`   |
| Border            | Light Gray     | `#E2E8E5` | `--color-border`       |

### Contrast (verified, WCAG AA)

Measured against the tokens above. Minimum is 4.5:1 for body text and 3:1 for large text and UI components.

| Pair                                  | Ratio      | Verdict |
| ------------------------------------- | ---------- | ------- |
| Charcoal on warm off-white `#F7F8F5`  | 13.84:1    | pass    |
| White on deep teal `#0F766E`          | 5.47:1     | pass    |
| White on dark teal `#115E59`          | 7.58:1     | pass    |
| Deep teal on warm off-white (links)   | 5.13:1     | pass    |
| Slate on warm off-white               | 5.29:1     | pass    |
| **Slate on soft sage `#EAF3EF`**      | **4.99:1** | pass    |
| **Charcoal on warm orange `#F97352`** | **5.34:1** | pass    |

Two corrections were applied to the proposal's values, both flagged as risks above:

1. **Buttons on the orange accent use charcoal text, never white.** White on `#F97352` is only **2.76:1** and fails AA badly; charcoal on the same orange is 5.34:1.
2. **`--color-text-muted` was darkened from `#667085` to `#5F6875`.** The original slate measured **4.40:1 on soft sage**, just under the 4.5 minimum. `#5F6875` clears the bar on both sage (4.99:1) and off-white (5.29:1), so one token value is safe on every surface it is used on.

Re-run the check whenever a token value changes.

### Tailwind mapping (Tailwind v4 CSS-first)

```css
/* apps/web/src/styles/tokens.css */
@import 'tailwindcss';

@theme {
  --color-primary: #0f766e;
  --color-primary-dark: #115e59;
  --color-accent: #f97352;
  --color-accent-hover: #ea6040;
  --color-bg: #f7f8f5;
  --color-surface: #ffffff;
  --color-surface-alt: #eaf3ef;
  --color-text: #1f2933;
  --color-text-muted: #5f6875;
  --color-border: #e2e8e5;
}
```

Components use the **tokens**, never raw hex values.

## 3. Status Presentation

**Source: proposal** (status names and the rule): statuses are `Pending`, `Under Review`, `Approved`, `Rejected`, `Scheduled`, `Distributed`. **Do not rely on colour alone; combine colour with text or icons.**

Timeline markers used by the proposal's tracking page:

```
✓ completed step     ● current step     ○ upcoming step     ✕ rejected
```

| Status       | Label        | Marker     | Colour     |
| ------------ | ------------ | ---------- | ---------- |
| PENDING      | Pending      | TBD (team) | TBD (team) |
| UNDER_REVIEW | Under Review | TBD (team) | TBD (team) |
| APPROVED     | Approved     | TBD (team) | TBD (team) |
| REJECTED     | Rejected     | ✕          | TBD (team) |
| SCHEDULED    | Scheduled    | ●          | TBD (team) |
| DISTRIBUTED  | Distributed  | ✓          | TBD (team) |

Donation, distribution, and campaign statuses (see `api.md` §15) need the same treatment. Build **one** `<StatusBadge>` component that maps every status to label + icon + colour from a single table, so the whole app stays consistent.

## 4. Principles

**Source: proposal**

1. **Action-first home page.** Immediately expose: Donate Relief Goods, Request Assistance, Track Assistance.
2. **Minimal beneficiary friction.** No password, no account, no repeated login, no dashboard just to check a request.
3. **Clear status communication** with consistent statuses (see 3).
4. **Human-centred imagery:** community photography on Home, Campaign pages, About. Information-focused layouts on Forms, Tracking, Inventory, Admin tables, Reports.
5. **No excessive decoration** on operational screens.

## 5. Information Architecture

**Source: proposal §20, §26**

Public navigation: `About · How It Works · Campaigns · Track Assistance` plus buttons `Request Assistance` and `Donate`.

```
Public   /  Home, About, How It Works, Campaigns, Campaign Details,
            Request Assistance, Track Assistance, Login, Donor Registration
Donor    /donor  Dashboard, My Donations, Submit Donation, Donation Details, Campaigns, Profile
Admin    /admin  Dashboard, Donations, Assistance Requests, Beneficiaries,
                 Inventory, Campaigns, Distributions, Calendar, Reports, Users, Settings
```

Note: the proposal lists **Beneficiaries** in admin navigation although beneficiaries have no accounts. In this plan it is a read-only view over requests grouped by person (email), not a user-management screen. Confirm or remove.

Admin dashboard must answer: what needs attention now, inventory available, requests awaiting review, distributions scheduled, recent donations.

## 6. Required Screen States

Every list, form, and data view needs: **loading**, **empty**, **error**, and **success** states, plus keyboard operation and a visible focus indicator.

## 7. Forms

- Required fields marked and explained in text, not only with an asterisk. Errors appear next to the field and in a summary, linked to the field.
- Beneficiary request form follows proposal §21: Personal Information, Location, Relief Information, Additional Information. Consent checkbox with a link to the privacy notice.
- Success screen shows the reference number and what happens next.

## 8. Language

English first. If Filipino support is added (open question in `PLAN.md` §8), all user-facing strings go through an i18n layer from the start. Use a single place for status messages (`requestStatusMessages` in `packages/shared`).

## 9. TBD From Your `design.md`

Send these and they will replace this section:

- [ ] Logo and wordmark usage
- [ ] Typefaces, sizes, line heights, weights
- [ ] Spacing scale and layout grid, breakpoints
- [ ] Radius and elevation rules
- [ ] Status colours and icons
- [ ] Icon set
- [ ] Photography direction and image rules
- [ ] Motion rules (including reduced-motion behaviour)
- [ ] Component inventory (buttons, inputs, tables, dialogs, toasts, empty states)
- [ ] Email template look (header, button style, footer)
- [ ] Chat widget look

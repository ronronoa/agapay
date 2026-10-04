# AGAPAY Design System

## Overview

This design system draft was generated from Figma and suggests a clear accent color for emphasis, a light and spacious background foundation, strong readable text contrast, structured layout patterns. It is intended as a working specification for UI generation, design system documentation, and AI-assisted layout exploration. Review semantic tokens and component rules before using it as a final source of truth.

---

## Colors

- Primary (#475569): Main call-to-action buttons, active highlights, and strong emphasis.
- Background (#F8FAFC): Page background and large canvas areas.
- Surface (#FFFFFF): Cards, panels, modals, and elevated containers.
- Text (#183327): Headings, body copy, and primary reading content.
- Border (#BAC9C9): Subtle dividers, input borders, and low-emphasis outlines.
- Muted Text (#625F5F): Secondary copy, helper text, and low-emphasis metadata.
- Supporting Color (#0F172A): Secondary or contextual color requiring manual semantic review before reuse as a primary accent.
- Supporting Color (#4C7273): Secondary or contextual color requiring manual semantic review before reuse as a primary accent.
- Supporting Color (#94A3B8): Secondary or contextual color requiring manual semantic review before reuse as a primary accent.

## Typography

- Headline Font: [Manual input required]
- Body Font: [Manual input required]
- No local text styles found

---

## Spacing

Base unit: **8px**

- xs: 4px — Tight inline gaps
- sm: 8px — Compact component spacing
- md: 16px — Default padding
- lg: 24px — Card padding and section gutters
- xl: 32px — Larger section spacing

## Border Radius

- sm: 4px — Small tags, chips, compact corners
- md: 8px — Buttons, inputs, cards
- lg: 12px — Panels, larger containers
- full: 9999px — Pills, avatars, circular elements

## Elevation

- Gentle, diffused shadows are recommended unless stronger hierarchy is clearly required.
- sm: Buttons, chips, small overlays.
- DEFAULT: Cards, dropdowns, standard floating surfaces.
- md: Elevated cards, side panels, larger floating regions.
- lg: Modals and high-priority overlay containers.

## Components

### Buttons

- **Primary**: #475569 fill, #FFFFFF text, no border, radius 8px.
- **Primary Hover**: #404D5F fill, #FFFFFF text, no border.
- **Primary Focus**: #475569 fill, #FFFFFF text, 3px ring #4755691F.
- **Primary Disabled**: #475569 fill, #FFFFFF text, 40% opacity.

- **Secondary**: transparent fill, #183327 text, 1px #BAC9C9 border, radius 8px.
- **Secondary Hover**: #1833270A fill, #183327 text, 1px #BAC9C9 border.
- **Secondary Focus**: transparent fill, #183327 text, 1px #475569 border, 3px ring #4755691F.
- **Secondary Disabled**: transparent fill, #625F5F text, 1px #BAC9C9 border, 40% opacity.

- **Ghost**: transparent fill, #625F5F text, no border, radius 8px.
- **Ghost Hover**: #18332706 fill, #183327 text, no border.
- **Ghost Focus**: transparent fill, #183327 text, 3px ring #4755691F.
- **Ghost Disabled**: transparent fill, #625F5F text, no border, 40% opacity.

### Cards

- **Default**: #FFFFFF fill, 1px #BAC9C9 border, radius 8px.
- **Elevated**: #FFFFFF fill, soft elevation, radius 8px.
- **Large Panel**: #FFFFFF fill, subtle border or elevation, radius 12px.

### Inputs

- **Default**: #FFFFFF fill, 1px #BAC9C9 border, text color #183327, radius 8px.
- **Hover**: #FFFFFF fill, 1px #99A5A5 border, text color #183327.
- **Focus**: #FFFFFF fill, 1px #475569 border, 3px ring #4755691F.
- **Error**: #FFFFFF fill, 1px #EF4444 border, 3px ring #EF44441F.
- **Disabled**: #FFFFFF fill, 1px #BAC9C9 border, text color #625F5F, 40% opacity.

### Layout Containers

- Use #FFFFFF for contained regions.
- Use #F8FAFC for page-level background areas.
- Use 12px only for larger panels or special containers.
- Keep radii and spacing consistent across repeated containers.

---

## Layout Principles

- Use generous whitespace between sections and repeated content groups.
- Prefer card-based grouping for related content and modular page regions.
- Maintain spacing rhythm based on the 8px system.
- Keep page background and surface colors visually distinct when depth or grouping is needed.
- Reuse existing auto layout patterns instead of inventing one-off container structures.

## Do's and Don'ts

1. **Do** use #475569 for key interactive emphasis only.
2. **Do** keep page backgrounds consistent with #F8FAFC.
3. **Do** preserve strong readability with #183327 for core reading content.
4. **Do** maintain a compact, repeatable radius and spacing rhythm across repeated UI.
5. **Don't** introduce additional accent colors unless intentionally extending the system.
6. **Don't** use supporting colors as new CTA colors without explicitly defining their role.
7. **Don't** replace Primary with other extracted blues unless explicitly promoted to a semantic token.
8. **Don't** mix unrelated shadow styles or multiple border treatments without purpose.

## Extracted Source Notes

- Auto-generated from Figma on 2026-10-04.
- Source of truth: Figma file.
- File: AGAPAY
- Scope: Current Page
- Root nodes scanned: 91
- Auto layout containers found: 297
- This draft combines extracted signals with inferred semantic rules.
- Manual input required: Responsive

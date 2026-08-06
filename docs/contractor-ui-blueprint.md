# OnSite Contractor UI Blueprint

Status: Approved and locked

This document defines the visual and interaction blueprint for contractor-side OnSite pages. The current Company Dashboard implementation in `app.js` and `styles.css` is the source of truth. Future contractor UI work must review this document and the live Dashboard before introducing or changing page patterns.

> The current contractor Dashboard is visually locked and is the approved reference implementation. Do not modify its visual design unless explicitly requested by the user.

## Implementation Anchors

Use the existing shared tokens and components. Do not copy their values into page-specific variants.

- Page width: `--page-content-max`, currently backed by `--shell-content-max: 1120px`.
- App background: `--bg`.
- Surface and text: `--surface`, `--ink`, `--ink-2`, and `--ink-3`.
- Spacing: `--space-1` through `--space-4`, plus `--space-section`, `--space-card`, and `--space-card-mobile`.
- Cards: `--card-radius`, `--card-border`, `--card-divider`, `--card-shadow`, and `--card-shadow-hover`.
- Motion: `--motion-fast`, `--motion-med`, `--motion-ease`, and `--motion-pop`.
- Dashboard page shell: `.company-dashboard-page` and `.company-dashboard-shell`.
- Dashboard heading: `.company-page-head--compact`.
- Top-level Dashboard cards: `.company-dashboard-section-card`.
- Date pill: `.os-date-pill`.
- Clickable KPI tiles: `.company-briefing-metric.is-clickable`.

These selectors are reference anchors, not an invitation to refactor working Dashboard code.

## 1. Page Structure

- Use the Dashboard's maximum content width and horizontal alignment.
- Keep the light-grey application background visible around the page content.
- Use a compact, unboxed page heading directly on that background.
- Keep one clear semantic `h1`; use the approved Dashboard sizing: 32px desktop, 30px tablet, and 27px narrow mobile.
- Align a page-level action or date pill to the right of the heading when useful.
- Do not use large white page-header cards.
- Do not add duplicate subtitles, decorative eyebrow labels, or breadcrumbs unless they add genuinely new information.

## 2. Card Hierarchy

- Top-level sections use the Dashboard card radius, neutral border, white background, and restrained shadow.
- Avoid card-inside-card-inside-card layering.
- Make necessary nested cards visually quieter than their parent.
- Keep non-interactive cards static. Do not add pointer cursors, hover elevation, or orange borders to them.
- Give genuinely clickable cards the OnSite orange hover and focus border.
- Allow an interactive nested card to respond independently while its non-clickable outer section remains static.
- Use subtle `1px` dividers based on `--card-divider` where separation is needed.

## 3. Interaction Rules

- Orange hover borders communicate real navigation or interaction only.
- Clickable cards use a `1px` OnSite orange border on hover and focus, a subtle shadow change, and a pointer cursor.
- Clickable cards do not scale, shift, or cause surrounding content to move.
- Keyboard focus remains clearly visible and restrained.
- Enter and Space activate card interactions when the element is semantically interactive.
- Inline actions use orange text with a right arrow.
- The strongest page action may use a filled orange button.
- Avoid multiple filled orange calls to action competing on one screen.
- Use the shared motion duration and easing; interactions should feel calm rather than animated for effect.

## 4. Brand and Semantic Colours

- OnSite orange: `#F97316` via `--orange`.
- Primary text: `--ink`.
- Muted text: `--ink-2` or `--ink-3`, according to hierarchy.
- Urgent: `#E00000` via `--health-urgent`.
- At Risk: `--health-at-risk`.
- Healthy: `--health-healthy`.
- Neutral or informational: `--health-neutral`.

Urgent health dots, status text, pulse centres, and activity indicators must all use `--health-urgent`. Urgent pills use the approved pale red background and border tokens so `#E00000` text remains readable. Do not introduce a second urgent-red family.

## 5. Health Indicators

- Use the same dot size and semantic colour tokens across contractor pages.
- Show the same project health consistently across Dashboard, Projects, Attendance, Notifications, and related views.
- Only the highest-priority visible health indicator may pulse.
- The pulse is an expanding and fading ring around a stationary centre dot.
- Do not bounce the centre dot or leave a permanent halo.
- Respect `prefers-reduced-motion`.
- Keep supporting health copy concise and avoid repeating figures already visible nearby.

## 6. Typography

- Use the shared Inter font stack and the Dashboard's weight hierarchy.
- Keep the page title as the dominant `h1`, without making it oversized.
- Keep orange section labels concise, uppercase, and restrained.
- Avoid excessive bold weights; reserve stronger weight for titles, primary decisions, and numeric metrics.
- Render large metrics in strong black typography unless a genuine semantic state requires colour.
- Keep supporting copy and metadata visibly quieter.
- Use zero letter spacing for page titles and avoid exaggerated tracking elsewhere.

## 7. Spacing

- Reuse the Dashboard's 8px-based spacing rhythm and shared spacing tokens.
- Keep consistent gaps between the page heading and first section, top-level cards, section headings and content, and nested cards.
- Use `--space-card` on desktop and `--space-card-mobile` where the responsive Dashboard does.
- Keep divider spacing consistent through `--space-divider` or the established component rule.
- Avoid arbitrary page-specific margins, excessive blank space, and fixed heights unless the layout requires them.

## 8. KPI and Summary Tiles

- Make a summary metric clickable only when it opens a meaningful filtered destination.
- Keep zero-value tiles functional when their destination remains useful.
- Clickable tiles receive the orange hover and focus border independently; their outer summary card remains static.
- Keep border width constant to prevent layout shift.
- Keep KPI numbers black unless they communicate a genuine semantic state.
- Preserve visible destination filters so the relationship between a Dashboard count and its destination is understandable.
- Do not add nested borders around the number, label, or chevron.

## 9. Responsive and Accessibility Rules

- Preserve the Dashboard's desktop, tablet, and mobile behaviour.
- Use the shared desktop, tablet, and mobile gutters.
- Keep interactive cards keyboard accessible with visible focus states.
- Ensure Enter and Space work where semantically appropriate.
- Do not depend on hover to reveal essential information.
- Prevent horizontal scrolling, overlapping controls, clipped text, and layout shifts.
- Honour reduced-motion preferences for non-essential animation.

## 10. Locked Dashboard

The current contractor Dashboard is visually locked and is the approved reference implementation. Do not modify its visual design unless explicitly requested by the user.

Documentation work must not trigger Dashboard code cleanup or visual refactoring. Product changes that genuinely require Dashboard behaviour must preserve this blueprint unless the user explicitly approves a visual change.

## 11. Future Contractor Pages

Review every contractor-side page against this blueprint and the current Dashboard implementation before making UI changes.

Use Linear, Stripe Dashboard, Ramp, Procore, and Notion as quality references for restraint, hierarchy, clarity, and interaction quality. Do not copy their branding or generic product patterns when those patterns conflict with construction labour operations.

The goal is a calm, professional, operational interface that feels coherent with the approved Dashboard and remains practical for construction companies.

## Review Checklist

Before completing future contractor-side UI work, confirm:

- The page uses the shared content width, background, gutters, and spacing rhythm.
- The heading follows the compact Dashboard structure and contains one semantic `h1`.
- Cards use shared tokens, with no unnecessary nesting.
- Hover and focus styling appears only on interactive elements.
- Filled orange actions do not compete with one another.
- Health colours and pulse behaviour match the shared semantic system.
- Keyboard, responsive, and reduced-motion behaviour remain intact.
- No visual change has been made to the locked Dashboard without explicit user direction.

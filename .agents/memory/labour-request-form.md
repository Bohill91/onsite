---
name: Labour Request form conventions
description: Redesigned Request Labour form — multi-trade builder is UI-only, submit-listener ordering trick, map init on modal open.
---

# Labour Request form (#formJob / #jobForm)

- The multi-trade requirement builder is **UI-only**: the backend/job model stores ONE labour requirement per request. Saved cards live in `pendingTradeRequirements[]`; a `submit` listener registered *before* the main submit handler restores the first card into the builder inputs when they're incomplete, so submission behaves exactly as a single-requirement form.
  - **Why:** cards would otherwise silently be dropped or block native validation; `required` attrs are relaxed while cards exist.
  - **How to apply:** any future multi-requirement backend support must replace `restoreFirstTradeRequirement` and submit ALL entries of `pendingTradeRequirements` (see TODOs in app.js near the builder block).
- Listener-ordering trick: handlers on `#jobForm` fire in registration order; UI-glue listeners defined earlier in app.js run before the main business submit handler. Keep any pre-processing of form values in a listener registered before it.
- The site picker map must be initialised when the labour request modal opens (`openLabourRequestWorkflow` → `initPickerMap()`); the old toggle-button init path no longer exists in the HTML.
- Saturday/Sunday Offered Rate inputs were intentionally removed from the form; the submit handler still reads them with `?.` and falls back to budget max — do not "fix" that fallback.
- Restoring a trade into `#jobTrade` requires dispatching a synchronous `change` event before setting `#jobSpecialism` (options are rebuilt by the change handler).

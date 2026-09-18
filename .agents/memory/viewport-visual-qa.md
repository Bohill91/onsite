---
name: Viewport visual QA
description: Reliable visual verification for responsive pages in this workspace.
---

For responsive visual checks, use the running app with a headless browser and set explicit viewport metrics. The standard app preview capture is fixed at 1280px, so it cannot verify mobile or intermediate breakpoints by itself.

**Why:** Responsive regressions can be hidden by the default preview size even when the page looks correct at desktop width.

**How to apply:** Check rendered geometry, document scroll width, and screenshots at the breakpoints relevant to the request. Use a separate browser interaction check for route switches and stateful controls.
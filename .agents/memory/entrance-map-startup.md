---
name: Entrance map startup readiness
description: The readiness signal and fallback boundary for the exact entrance vector map.
---

The vector entrance map is usable when MapLibre has a loaded style, a non-zero canvas, and a rendered frame. Use that first styled render as the startup readiness signal, with a bounded timeout and immediate fallback for genuine renderer failures.

**Why:** A valid local MapLibre renderer can produce a usable canvas before the later full `load` event. A short timeout tied only to `load` can send healthy vector maps to the raster fallback unnecessarily.

**How to apply:** Keep the vector renderer and style as the primary path. Change only the readiness signal or timeout when new timing evidence supports it; preserve map styling, pin ownership, controls, and fallback behavior.
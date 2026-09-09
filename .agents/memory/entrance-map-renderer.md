---
name: Entrance map renderer compatibility
description: Why the exact-entrance map must retain a non-WebGL fallback.
---

Keep the exact-entrance picker functional without WebGL; the vector renderer should remain primary, with a raster fallback that preserves placement and confirmation controls.

**Why:** Browser previews and constrained devices can disable GPU contexts entirely. Changing MapLibre versions does not solve that condition, and external ESM CDN imports may also be blocked by CORS.

**How to apply:** When changing the entrance map, verify both the vector and fallback paths retain click/drag placement, address recentering, disabled wheel zoom, attribution, and confirmed-versus-editing behavior.
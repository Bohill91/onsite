---
name: Entrance map state ownership
description: Boundary between the selected site center and the exact entrance pin in the Request Labour map.
---

The exact entrance pin is authoritative after geocoding, manual placement, saving, or renderer retry. The geocoded site center is a separate recenter target and must not replace a deliberately moved or saved pin during map initialization.

**Why:** Reinitialising a renderer after a manual adjustment must preserve the user's draft entrance location; otherwise a retry or fallback can silently move the pin back to the address centroid.

**How to apply:** Use the current pin for map initialization whenever one exists. Use the geocoded center only for the explicit re-centre control or before an entrance pin has been created.

Trustworthy geocoder bounding boxes should drive the initial and site re-centre framing, with a bounded close-context zoom; when fitting bounds, use the fitted bounds centre unless the saved entrance pin is being edited.

**Why:** A fixed zoom makes industrial sites feel cramped and small urban results feel inconsistent, while a raw geocoder point can sit at one edge of a valid site extent.

**How to apply:** Keep the bounds and precision fallback in the shared viewport helper. Never let adaptive framing replace a manually moved pin or a manual pan/zoom during normal renderer reuse.

Vector renderer startup should have a short bounded deadline and a restrained loader inside the existing map container; fatal renderer initialization errors may fall back immediately, while tile and font warnings remain recoverable.

**Why:** A long blank panel makes a renderer failure look like a broken form, but treating every MapLibre resource warning as fatal causes unnecessary raster fallback and can obscure the preferred vector map.

**How to apply:** Hide the loader only after vector `load` or usable raster tiles/safety timeout. Cancel renderer and loader timers together during retry or destruction so an old fallback cannot alter a new map instance.
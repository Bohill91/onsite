---
name: Requirement editor type switching
description: Durable event-ordering constraint for the multi-stage pre-start requirement editor.
---

Type changes in the pre-start requirement editor must be owned by the dedicated type-switch handler. Generic input/change listeners must ignore type-radio events, otherwise they can mutate the selected type before the handler snapshots the previous content draft.

**Why:** The browser emits radio input events before the change transition completes, and a generic listener can copy the old type’s resources into the new type. That causes stale PDFs or video links to leak across requirement types and can make Content Continue validation report the wrong result.

**How to apply:** Keep per-type content snapshots separate, stop generic propagation for type radios, and validate the current Content stage independently from later Completion/Assignment validation.
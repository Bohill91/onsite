(function initMarketplaceEvents(globalScope) {
  "use strict";

  const STORE_PROPERTY = "marketplaceEvents";
  const EVENT_TYPES = Object.freeze({
    REQUEST_POSTED: "request_posted",
    REQUEST_UPDATED: "request_updated",
    REQUEST_WITHDRAWN: "request_withdrawn",
    MATCH_GENERATED: "match_generated",
    OFFER_SENT: "offer_sent",
    OFFER_VIEWED: "offer_viewed",
    OFFER_ACCEPTED_WORKER: "offer_accepted_worker",
    OFFER_DECLINED_WORKER: "offer_declined_worker",
    OFFER_EXPIRED: "offer_expired",
    OFFER_IGNORED: "offer_ignored",
    OFFER_SUPERSEDED: "offer_superseded",
    COMPANY_ACCEPTED: "company_accepted",
    COMPANY_DECLINED: "company_declined",
    BOOKING_CONFIRMED: "booking_confirmed",
    AGREEMENT_ACTIVE: "agreement_active",
    ASSIGNMENT_STARTED: "assignment_started",
    SLOT_FILLED: "slot_filled",
    SLOT_RELEASED: "slot_released",
    CANCELLATION_CREATED: "cancellation_created",
    REPLACEMENT_REQUESTED: "replacement_requested",
    REPLACEMENT_OFFERED: "replacement_offered",
    REPLACEMENT_FILLED: "replacement_filled",
    PROJECT_EXTENDED: "project_extended",
    PROJECT_COMPLETED: "project_completed",
    FILL_FAILED: "fill_failed",
  });
  const EVENT_TYPE_VALUES = new Set(Object.values(EVENT_TYPES));
  const ACTOR_TYPES = new Set([
    "system",
    "company_user",
    "worker",
    "admin",
    "service",
  ]);
  const OMIT_METADATA_KEYS = [
    /^gps/i,
    /latitude/i,
    /longitude/i,
    /home.?address/i,
    /private.*(?:minimum|min).*rate/i,
    /worker.*(?:minimum|min).*rate/i,
    /document.*(?:content|body|text)/i,
    /background.*(?:content|result|details)/i,
  ];
  let fallbackSequence = 0;

  function cleanIdPart(value) {
    return String(value || "record")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "record";
  }

  function signatureHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableId(prefix, value) {
    return `${cleanIdPart(prefix)}-${signatureHash(value)}`;
  }

  function uniqueEventId() {
    if (globalScope.crypto?.randomUUID) {
      return `marketplace-event-${globalScope.crypto.randomUUID()}`;
    }
    fallbackSequence += 1;
    return `marketplace-event-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
  }

  function validTimestamp(value, fallback) {
    if (!value) return fallback;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
  }

  function shouldOmitMetadataKey(key) {
    return OMIT_METADATA_KEYS.some((pattern) => pattern.test(String(key || "")));
  }

  function sanitizeMetadata(value, key = "", seen = new WeakSet()) {
    if (shouldOmitMetadataKey(key)) return undefined;
    if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
      return value;
    }
    if (typeof value !== "object") return undefined;
    if (seen.has(value)) return undefined;
    seen.add(value);
    if (Array.isArray(value)) {
      return value
        .map((item) => sanitizeMetadata(item, key, seen))
        .filter((item) => item !== undefined);
    }
    return Object.entries(value).reduce((result, [childKey, childValue]) => {
      const sanitized = sanitizeMetadata(childValue, childKey, seen);
      if (sanitized !== undefined) result[childKey] = sanitized;
      return result;
    }, {});
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  function eventStore(state) {
    if (!state || typeof state !== "object") {
      throw new TypeError("Marketplace event state is required");
    }
    if (!Array.isArray(state[STORE_PROPERTY])) state[STORE_PROPERTY] = [];
    state[STORE_PROPERTY].forEach(deepFreeze);
    return state[STORE_PROPERTY];
  }

  function createEvent(input = {}, options = {}) {
    if (!EVENT_TYPE_VALUES.has(input.eventType)) {
      throw new TypeError(`Unsupported marketplace event type: ${input.eventType || "missing"}`);
    }
    const recordedAt = validTimestamp(
      options.recordedAt || input.recordedAt,
      new Date().toISOString(),
    );
    const occurredAt = validTimestamp(input.occurredAt, recordedAt);
    const idempotencyKey = String(options.idempotencyKey || "").trim();
    const eventId = String(input.eventId || "").trim() ||
      (idempotencyKey
        ? stableId("marketplace-event", idempotencyKey)
        : uniqueEventId());
    const actorType = ACTOR_TYPES.has(input.actorType)
      ? input.actorType
      : "system";
    const event = {
      eventId,
      eventType: input.eventType,
      occurredAt,
      recordedAt,
      actorType,
    };
    [
      "actorId",
      "companyId",
      "projectId",
      "requirementId",
      "slotId",
      "workerId",
      "applicationId",
      "offerAttemptId",
      "source",
    ].forEach((field) => {
      const value = String(input[field] || "").trim();
      if (value) event[field] = value;
    });
    const metadata = sanitizeMetadata(input.metadata || {});
    if (metadata && Object.keys(metadata).length) event.metadata = metadata;
    return deepFreeze(event);
  }

  function append(state, input, options = {}) {
    const store = eventStore(state);
    const event = createEvent(input, options);
    const existing = store.find((item) => item?.eventId === event.eventId);
    if (existing) return { ok: true, duplicate: true, event: existing };
    store.push(event);
    return { ok: true, duplicate: false, event };
  }

  function list(state, filters = {}) {
    return eventStore(state)
      .filter((event) =>
        ["eventType", "companyId", "projectId", "requirementId", "slotId", "workerId"]
          .every((field) => !filters[field] || event[field] === filters[field]),
      )
      .map((event) => JSON.parse(JSON.stringify(event)))
      .sort((left, right) =>
        new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime(),
      );
  }

  function nextRequestVersion(currentVersion) {
    return Math.max(1, Number(currentVersion) || 1) + 1;
  }

  function offerAttemptIdentity(applications = [], context = {}) {
    const chainSeed = [
      context.projectId,
      context.requirementId,
      context.slotId,
    ].join(":");
    const offerChainId = context.offerChainId || stableId("offer-chain", chainSeed);
    const attemptNumber = Math.max(
      0,
      ...applications
        .filter((application) => application?.offerChainId === offerChainId)
        .map((application) => Number(application.offerAttemptNumber) || 0),
    ) + 1;
    const attemptSeed = [
      context.applicationId,
      context.occurredAt,
      offerChainId,
      attemptNumber,
    ].join(":");
    return {
      offerAttemptId:
        context.offerAttemptId || stableId("offer-attempt", attemptSeed),
      offerChainId,
      attemptNumber,
    };
  }

  const api = {
    STORE_PROPERTY,
    EVENT_TYPES,
    append,
    list,
    createEvent,
    sanitizeMetadata,
    stableId,
    nextRequestVersion,
    offerAttemptIdentity,
  };

  globalScope.OnSiteMarketplaceEvents = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

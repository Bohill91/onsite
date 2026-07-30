(function () {
  const TONES = new Set(["success", "warning", "danger", "info", "brand", "neutral"]);
  const BUTTON_VARIANTS = new Set(["primary", "secondary", "ghost", "danger"]);
  const BUTTON_SIZES = new Set(["standard", "compact"]);
  const EMPTY_VARIANTS = new Set(["inline", "block"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function attrs(attributes = {}) {
    return Object.entries(attributes)
      .filter(([, value]) => value !== false && value != null)
      .map(([key, value]) => (value === true ? key : `${key}="${escapeHtml(value)}"`))
      .join(" ");
  }

  function cx(...classes) {
    return classes.filter(Boolean).join(" ");
  }

  function toneName(tone) {
    return TONES.has(tone) ? tone : "neutral";
  }

  function buttonClass({ variant = "primary", size = "standard", className = "" } = {}) {
    return cx(
      "os-button",
      `os-button--${BUTTON_VARIANTS.has(variant) ? variant : "primary"}`,
      `os-button--${BUTTON_SIZES.has(size) ? size : "standard"}`,
      className,
    );
  }

  function button({ label = "", variant = "primary", size = "standard", className = "", attributes = {} } = {}) {
    return `<button class="${buttonClass({ variant, size, className })}" type="button" ${attrs(attributes)}>${escapeHtml(label)}</button>`;
  }

  function pageHeader({ kicker = "", title = "", subtitle = "", datePill = "", actions = "", square = false } = {}) {
    return `<header class="${cx("os-page-header", square && "os-page-header--square")}">
      <div>
        ${kicker ? `<p class="os-kicker">${escapeHtml(kicker)}</p>` : ""}
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
        ${subtitle ? `<p class="os-page-subtitle">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${datePill || actions ? `<div class="os-page-header-actions">${datePill ? `<span class="os-date-pill">${escapeHtml(datePill)}</span>` : ""}${actions}</div>` : ""}
    </header>`;
  }

  function card(content = "", { className = "", attributes = {} } = {}) {
    return `<article class="${cx("os-card", className)}" ${attrs(attributes)}>${content}</article>`;
  }

  function section({ kicker = "", title = "", subtitle = "", body = "", actions = "", className = "" } = {}) {
    return card(
      `<div class="os-section-head">
        <div>
          ${kicker ? `<p class="os-kicker">${escapeHtml(kicker)}</p>` : ""}
          ${title ? `<h3>${escapeHtml(title)}</h3>` : ""}
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
        ${actions ? `<div class="os-section-actions">${actions}</div>` : ""}
      </div>
      ${body ? `<div class="os-section-body">${body}</div>` : ""}`,
      { className: cx("os-section-card", className) },
    );
  }

  function statusBadge({ label = "", tone = "neutral", className = "" } = {}) {
    return `<span class="${cx("os-status-badge", `os-status-badge--${toneName(tone)}`, className)}">${escapeHtml(label)}</span>`;
  }

  function emptyState({ icon = "", title = "", hint = "", action = "", variant = "block", className = "" } = {}) {
    const safeVariant = EMPTY_VARIANTS.has(variant) ? variant : "block";
    return `<div class="${cx("os-empty-state", `os-empty-state--${safeVariant}`, className)}">
      ${icon ? `<span class="os-empty-icon" aria-hidden="true">${icon}</span>` : ""}
      <div>
        ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
        ${hint ? `<p>${escapeHtml(hint)}</p>` : ""}
      </div>
      ${action ? `<div class="os-empty-action">${action}</div>` : ""}
    </div>`;
  }

  function metric({ label = "", value = "", hint = "", tone = "neutral" } = {}) {
    return `<div class="os-metric os-metric--${toneName(tone)}">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
      ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
    </div>`;
  }

  function dataRow(label = "", value = "") {
    return `<div class="os-data-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function tabs(items = [], activeId = "") {
    return `<div class="os-tabs" role="tablist">
      ${items
        .map((item) => `<button class="os-tab${item.id === activeId ? " active" : ""}" type="button" role="tab" aria-selected="${item.id === activeId ? "true" : "false"}" data-os-tab="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>`)
        .join("")}
    </div>`;
  }

  function createModalController(modal, { closeSelector = "[data-os-modal-close]" } = {}) {
    if (!modal) return null;
    const previouslyFocused = { element: null };
    const focusableSelector = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

    function close() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("modal-open");
      previouslyFocused.element?.focus?.();
    }

    function open() {
      previouslyFocused.element = document.activeElement;
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");
      requestAnimationFrame(() => modal.querySelector(focusableSelector)?.focus?.());
    }

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest(closeSelector)) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.classList.contains("hidden")) close();
    });

    return { open, close };
  }

  window.OnSiteUI = {
    attrs,
    button,
    buttonClass,
    card,
    createModalController,
    dataRow,
    emptyState,
    escapeHtml,
    metric,
    pageHeader,
    section,
    statusBadge,
    tabs,
  };
})();

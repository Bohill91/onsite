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

  const selectControllers = new Set();
  const selectControllerByElement = new WeakMap();
  let activeSelectController = null;
  let selectId = 0;
  let selectSyncQueued = false;

  function shouldEnhanceSelect(select) {
    return (
      select instanceof HTMLSelectElement &&
      !select.multiple &&
      select.size <= 1 &&
      !select.matches("[data-native-select], [data-onsite-select='native']")
    );
  }

  function selectFieldLabel(select) {
    const explicit = select.getAttribute("aria-label");
    if (explicit) return explicit.trim();

    const label = select.labels?.[0];
    if (!label) return select.name || "Select option";
    const copy = label.cloneNode(true);
    copy
      .querySelectorAll("select, input, textarea, button, .form-helper, .field-hint")
      .forEach((element) => element.remove());
    return copy.textContent.replace(/\s+/g, " ").trim() || select.name || "Select option";
  }

  function selectOptionSignature(select) {
    return Array.from(select.options)
      .map((option) =>
        [
          option.value,
          option.textContent,
          option.disabled ? "1" : "0",
          option.hidden ? "1" : "0",
          option.selected ? "1" : "0",
        ].join("\u001f"),
      )
      .join("\u001e");
  }

  function customSelectCheckIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  }

  function isCustomSelectMenuOption(option) {
    return Boolean(option && !option.hidden && option.value !== "");
  }

  function isCustomSelectChoice(option) {
    return isCustomSelectMenuOption(option) && !option.disabled;
  }

  function enhanceSelect(select) {
    if (!shouldEnhanceSelect(select) || selectControllerByElement.has(select)) return;

    const wrapper = document.createElement("span");
    wrapper.className = cx(
      "os-select",
      select.classList.contains("auth-input") && "os-select--auth",
    );

    const trigger = document.createElement("button");
    const listbox = document.createElement("span");
    const value = document.createElement("span");
    const chevron = document.createElement("span");
    const listboxId = `os-select-listbox-${++selectId}`;

    trigger.className = "os-select-trigger";
    trigger.type = "button";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", listboxId);
    value.className = "os-select-value";
    chevron.className = "os-select-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    trigger.append(value, chevron);

    listbox.className = "os-select-listbox";
    listbox.id = listboxId;
    listbox.setAttribute("role", "listbox");
    listbox.hidden = true;

    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select, trigger);
    select.classList.add("os-native-select");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");

    const controller = {
      highlightedIndex: -1,
      listbox,
      optionSignature: "",
      select,
      trigger,
      value,
      wrapper,

      renderOptions() {
        const fragment = document.createDocumentFragment();
        Array.from(select.options).forEach((option, index) => {
          if (!isCustomSelectMenuOption(option)) return;
          const row = document.createElement("button");
          const label = document.createElement("span");
          const check = document.createElement("span");

          row.className = cx(
            "os-select-option",
            option.selected && "is-selected",
          );
          row.type = "button";
          row.tabIndex = -1;
          row.dataset.optionIndex = String(index);
          row.id = `${listboxId}-option-${index}`;
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", String(option.selected));
          row.disabled = option.disabled;
          label.className = "os-select-option-label";
          label.textContent = option.textContent;
          check.className = "os-select-option-check";
          check.innerHTML = customSelectCheckIcon();
          row.append(label, check);
          fragment.appendChild(row);
        });
        listbox.replaceChildren(fragment);
      },

      sync({ forceOptions = false } = {}) {
        if (!select.isConnected) return;
        const signature = selectOptionSignature(select);
        if (forceOptions || signature !== this.optionSignature) {
          this.optionSignature = signature;
          this.renderOptions();
        }

        const selected = select.options[select.selectedIndex] || null;
        const selectedText = selected?.textContent?.trim() || "Select an option";
        const placeholder = !selected || selected.value === "";
        value.textContent = selectedText;
        trigger.classList.toggle("is-placeholder", placeholder);
        trigger.disabled = select.disabled;
        trigger.setAttribute("aria-disabled", String(select.disabled));
        trigger.setAttribute("aria-required", String(select.required));
        trigger.setAttribute("aria-label", `${selectFieldLabel(select)}: ${selectedText}`);
        const describedBy = select.getAttribute("aria-describedby");
        if (describedBy) trigger.setAttribute("aria-describedby", describedBy);
        else trigger.removeAttribute("aria-describedby");
        if (select.disabled && activeSelectController === this) this.close();
      },

      position() {
        if (activeSelectController !== this || listbox.hidden) return;
        const viewportPadding = 8;
        const gap = 6;
        const rect = trigger.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const width = Math.min(rect.width, viewportWidth - viewportPadding * 2);
        const below = viewportHeight - rect.bottom - gap - viewportPadding;
        const above = rect.top - gap - viewportPadding;
        const openUp = below < 180 && above > below;
        const available = Math.max(120, openUp ? above : below);
        const maxHeight = Math.min(304, available);
        const left = Math.min(
          Math.max(viewportPadding, rect.left),
          Math.max(viewportPadding, viewportWidth - width - viewportPadding),
        );

        listbox.style.left = `${left}px`;
        listbox.style.width = `${width}px`;
        listbox.style.maxHeight = `${maxHeight}px`;
        listbox.dataset.placement = openUp ? "top" : "bottom";
        if (openUp) {
          const height = Math.min(listbox.scrollHeight, maxHeight);
          listbox.style.top = `${Math.max(viewportPadding, rect.top - gap - height)}px`;
        } else {
          listbox.style.top = `${rect.bottom + gap}px`;
        }
      },

      highlight(index, { scroll = true } = {}) {
        const options = Array.from(select.options);
        if (!options.length) return;
        let next = index;
        while (next >= 0 && next < options.length && !isCustomSelectChoice(options[next])) {
          next += index >= this.highlightedIndex ? 1 : -1;
        }
        if (next < 0 || next >= options.length) return;
        this.highlightedIndex = next;
        listbox.querySelectorAll(".os-select-option.is-highlighted").forEach((row) => {
          row.classList.remove("is-highlighted");
        });
        const row = listbox.querySelector(`[data-option-index="${next}"]`);
        row?.classList.add("is-highlighted");
        trigger.setAttribute("aria-activedescendant", row?.id || "");
        if (scroll) row?.scrollIntoView({ block: "nearest" });
      },

      moveHighlight(direction) {
        const options = Array.from(select.options);
        if (!options.length) return;
        let index = this.highlightedIndex;
        do {
          index += direction;
        } while (
          index >= 0 &&
          index < options.length &&
          !isCustomSelectChoice(options[index])
        );
        if (index >= 0 && index < options.length) this.highlight(index);
      },

      open() {
        const options = Array.from(select.options);
        const firstChoiceIndex = options.findIndex(isCustomSelectChoice);
        if (select.disabled || firstChoiceIndex < 0) return;
        closeCustomSelects(wrapper);
        window.closeAppPopovers?.(wrapper);
        this.sync({ forceOptions: true });
        activeSelectController = this;
        wrapper.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        listbox.hidden = false;
        document.body.appendChild(listbox);
        this.position();
        const preferredOpenIndex = select.value
          ? -1
          : options.findIndex(
              (option) =>
                isCustomSelectChoice(option) &&
                option.value === select.dataset.openValue,
            );
        const selectedIndex = isCustomSelectChoice(options[select.selectedIndex])
          ? select.selectedIndex
          : preferredOpenIndex >= 0
            ? preferredOpenIndex
            : firstChoiceIndex;
        this.highlight(selectedIndex, { scroll: false });
        requestAnimationFrame(() => {
          this.position();
          this.highlight(this.highlightedIndex);
        });
      },

      close({ restoreFocus = false } = {}) {
        if (activeSelectController !== this && listbox.hidden) return;
        wrapper.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        trigger.removeAttribute("aria-activedescendant");
        listbox.hidden = true;
        listbox.remove();
        this.highlightedIndex = -1;
        if (activeSelectController === this) activeSelectController = null;
        if (restoreFocus && trigger.isConnected) trigger.focus();
      },

      choose(index) {
        const option = select.options[index];
        if (!isCustomSelectChoice(option)) return;
        select.value = option.value;
        this.sync({ forceOptions: true });
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        wrapper.classList.remove("is-invalid");
        trigger.removeAttribute("aria-invalid");
        this.close({ restoreFocus: true });
      },

      destroy() {
        this.close();
        listbox.remove();
        selectControllers.delete(this);
        selectControllerByElement.delete(select);
      },
    };

    selectControllers.add(controller);
    selectControllerByElement.set(select, controller);
    controller.sync({ forceOptions: true });

    trigger.addEventListener("click", () => {
      if (activeSelectController === controller) controller.close();
      else controller.open();
    });

    trigger.addEventListener("keydown", (event) => {
      if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (activeSelectController === controller && controller.highlightedIndex >= 0) {
          controller.choose(controller.highlightedIndex);
        } else {
          controller.open();
        }
        return;
      }
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        if (activeSelectController !== controller) controller.open();
        else controller.moveHighlight(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (activeSelectController !== controller) return;
      if (event.key === "Home") {
        event.preventDefault();
        const firstChoiceIndex = Array.from(select.options).findIndex(isCustomSelectChoice);
        if (firstChoiceIndex >= 0) controller.highlight(firstChoiceIndex);
      } else if (event.key === "End") {
        event.preventDefault();
        const options = Array.from(select.options);
        let lastChoiceIndex = options.length - 1;
        while (lastChoiceIndex >= 0 && !isCustomSelectChoice(options[lastChoiceIndex])) {
          lastChoiceIndex -= 1;
        }
        if (lastChoiceIndex >= 0) controller.highlight(lastChoiceIndex);
      } else if (event.key === "Escape") {
        event.preventDefault();
        controller.close({ restoreFocus: true });
      } else if (event.key === "Tab") {
        controller.close();
      }
    });

    listbox.addEventListener("pointermove", (event) => {
      const option = event.target.closest("[data-option-index]");
      if (option && !option.disabled) {
        controller.highlight(Number(option.dataset.optionIndex), { scroll: false });
      }
    });

    listbox.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-option-index]")) event.preventDefault();
    });

    listbox.addEventListener("click", (event) => {
      const option = event.target.closest("[data-option-index]");
      if (option) controller.choose(Number(option.dataset.optionIndex));
    });

    select.addEventListener("focus", () => trigger.focus());
    select.addEventListener("click", (event) => {
      event.preventDefault();
      trigger.focus();
      controller.open();
    });
  }

  function enhanceSelects(root = document) {
    if (root instanceof HTMLSelectElement) enhanceSelect(root);
    root.querySelectorAll?.("select").forEach(enhanceSelect);
  }

  function closeCustomSelects(except = null) {
    if (!activeSelectController) return;
    if (
      except &&
      (except === activeSelectController.wrapper ||
        activeSelectController.wrapper.contains(except))
    ) {
      return;
    }
    activeSelectController.close();
  }

  function syncSelect(select, options) {
    selectControllerByElement.get(select)?.sync(options);
  }

  function syncAllSelects() {
    selectSyncQueued = false;
    selectControllers.forEach((controller) => {
      if (!controller.select.isConnected) controller.destroy();
      else controller.sync();
    });
  }

  function queueSelectSync() {
    if (selectSyncQueued) return;
    selectSyncQueued = true;
    queueMicrotask(syncAllSelects);
  }

  function installSelectPropertySync(proto, property) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, property);
    if (!descriptor?.get || !descriptor?.set || !descriptor.configurable) return;
    Object.defineProperty(proto, property, {
      ...descriptor,
      set(nextValue) {
        descriptor.set.call(this, nextValue);
        queueSelectSync();
      },
    });
  }

  function initialiseCustomSelects() {
    installSelectPropertySync(HTMLSelectElement.prototype, "value");
    installSelectPropertySync(HTMLSelectElement.prototype, "selectedIndex");
    installSelectPropertySync(HTMLSelectElement.prototype, "disabled");
    installSelectPropertySync(HTMLSelectElement.prototype, "required");
    installSelectPropertySync(HTMLOptionElement.prototype, "selected");
    enhanceSelects(document);

    const observer = new MutationObserver((mutations) => {
      let needsControllerSweep = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          const containsSelect =
            node instanceof HTMLSelectElement || Boolean(node.querySelector("select"));
          if (!containsSelect) return;
          enhanceSelects(node);
          needsControllerSweep = true;
        });
        mutation.removedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLSelectElement || node.querySelector("select")) {
            needsControllerSweep = true;
          }
        });
        if (mutation.target instanceof HTMLSelectElement) {
          syncSelect(mutation.target, { forceOptions: true });
        } else if (mutation.target instanceof HTMLOptionElement) {
          syncSelect(mutation.target.closest("select"), { forceOptions: true });
        }
      });
      if (needsControllerSweep) queueSelectSync();
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["selected"],
      childList: true,
      subtree: true,
    });

    document.addEventListener("input", (event) => {
      if (event.target instanceof HTMLSelectElement) syncSelect(event.target);
    });
    document.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      syncSelect(event.target, { forceOptions: true });
      const controller = selectControllerByElement.get(event.target);
      if (event.target.validity.valid) {
        controller?.wrapper.classList.remove("is-invalid");
        controller?.trigger.removeAttribute("aria-invalid");
      }
    });
    document.addEventListener(
      "invalid",
      (event) => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        const controller = selectControllerByElement.get(event.target);
        if (!controller) return;
        event.preventDefault();
        controller.wrapper.classList.add("is-invalid");
        controller.trigger.setAttribute("aria-invalid", "true");
        requestAnimationFrame(() => controller.trigger.focus());
      },
      true,
    );
    document.addEventListener("reset", (event) => {
      if (event.target instanceof HTMLFormElement) {
        setTimeout(() => enhanceSelects(event.target));
        setTimeout(queueSelectSync);
      }
    });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (!activeSelectController) return;
        if (
          activeSelectController.wrapper.contains(event.target) ||
          activeSelectController.listbox.contains(event.target)
        ) {
          return;
        }
        closeCustomSelects();
      },
      true,
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeCustomSelects();
    });
    window.addEventListener("resize", () => activeSelectController?.position());
    window.addEventListener("scroll", () => activeSelectController?.position(), true);
    window.addEventListener("hashchange", () => closeCustomSelects());
    window.addEventListener("popstate", () => closeCustomSelects());
  }

  initialiseCustomSelects();

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
    closeSelects: closeCustomSelects,
    enhanceSelects,
    syncSelect,
    statusBadge,
    tabs,
  };
})();

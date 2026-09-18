(function initialiseEarlyAccessPage() {
  "use strict";

  const workerForm = document.getElementById("workerEarlyAccessForm");
  const companyForm = document.getElementById("companyEarlyAccessForm");
  const workerPanel = document.getElementById("workerPanel");
  const companyPanel = document.getElementById("companyPanel");
  const success = document.getElementById("earlyAccessSuccess");
  const workerTrade = document.getElementById("eaWorkerTrade");
  const workerRole = document.getElementById("eaWorkerRole");
  const companyCategories = document.getElementById("eaCompanyCategories");
  const companyCategoryPicker = document.getElementById("eaCategoryPicker");
  const companyCategoryTrigger = document.getElementById("eaCompanyCategoryTrigger");
  const companyCategoryValue = document.getElementById("eaCompanyCategoryValue");
  const companyCategoryMenu = document.getElementById("eaCompanyCategoryMenu");
  const companyCategorySearch = document.getElementById("eaCompanyCategorySearch");
  const companyCategoryOptions = document.getElementById("eaCompanyCategoryOptions");
  const routeStories = document.querySelectorAll("[data-route-story]");
  const referralInput = document.getElementById("eaReferralCode");
  const referralCaptured = document.getElementById("eaReferralCaptured");
  const referralReveal = document.getElementById("eaReferralReveal");
  const referralFallbackFields = document.getElementById("eaReferralFallbackFields");
  const referralHint = document.getElementById("eaReferralHint");
  const REFERRAL_STORAGE_KEY = "onsite_early_access_referral_v1";
  const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const REFERRAL_CODE_PATTERN = /^OSW-[A-Z0-9]{12,24}$/;
  let companyCategoryMenuOpen = false;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normaliseReferralCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  }

  function isValidReferralFormat(value) {
    return REFERRAL_CODE_PATTERN.test(normaliseReferralCode(value));
  }

  function referralStorage() {
    try {
      return window["local" + "Storage"];
    } catch (_) {
      return null;
    }
  }

  function clearStoredReferral() {
    try {
      referralStorage()?.removeItem(REFERRAL_STORAGE_KEY);
    } catch (_) {}
  }

  function readStoredReferral(now = Date.now()) {
    const storage = referralStorage();
    if (!storage) return null;
    try {
      const stored = JSON.parse(storage.getItem(REFERRAL_STORAGE_KEY) || "null");
      const code = normaliseReferralCode(stored?.code);
      const capturedAt = Number(stored?.capturedAt);
      const expiresAt = Number(stored?.expiresAt);
      if (!isValidReferralFormat(code) || !Number.isFinite(capturedAt) || !Number.isFinite(expiresAt) || expiresAt <= now) {
        clearStoredReferral();
        return null;
      }
      return { code, capturedAt, expiresAt };
    } catch (_) {
      clearStoredReferral();
      return null;
    }
  }

  function captureReferral(value, now = Date.now()) {
    const code = normaliseReferralCode(value);
    if (!isValidReferralFormat(code)) return null;
    const record = { code, capturedAt: now, expiresAt: now + REFERRAL_TTL_MS };
    try {
      referralStorage()?.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(record));
    } catch (_) {}
    return record;
  }

  function setReferralState(record) {
    if (!referralInput) return;
    const captured = Boolean(record);
    referralInput.value = record?.code || "";
    referralInput.readOnly = captured;
    referralInput.classList.toggle("ea-referral-input--captured", captured);
    if (referralCaptured) referralCaptured.hidden = !captured;
    if (referralReveal) referralReveal.hidden = captured;
    if (referralFallbackFields) referralFallbackFields.hidden = true;
    if (referralHint && captured) referralHint.textContent = "Referral link captured for 30 days.";
  }

  function initialiseReferral() {
    let record = readStoredReferral();
    if (!record) {
      const incoming = new URLSearchParams(window.location.search).get("ref") || "";
      if (isValidReferralFormat(incoming)) record = captureReferral(incoming);
    }
    setReferralState(record);
  }

  function revealReferralFallback({ allowReplacement = false } = {}) {
    if (!referralInput) return;
    if (allowReplacement) {
      clearStoredReferral();
      referralInput.value = "";
      referralInput.readOnly = false;
      referralInput.classList.remove("ea-referral-input--captured");
      if (referralCaptured) referralCaptured.hidden = true;
    }
    if (referralReveal) referralReveal.hidden = true;
    if (referralFallbackFields) referralFallbackFields.hidden = false;
    referralInput.focus();
  }

  function sourceAttribution() {
    const query = new URLSearchParams(window.location.search);
    return {
      utmSource: query.get("utm_source") || "",
      utmMedium: query.get("utm_medium") || "",
      utmCampaign: query.get("utm_campaign") || "",
      utmContent: query.get("utm_content") || "",
      landingPath: window.location.pathname,
    };
  }

  function setPath(path) {
    const workerSelected = path === "worker";
    setCompanyCategoryMenuOpen(false);
    workerPanel.hidden = !workerSelected;
    companyPanel.hidden = workerSelected;
    routeStories.forEach((story) => {
      story.hidden = story.dataset.routeStory !== path;
    });
    document.querySelectorAll("[data-signup-path]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.signupPath === path));
    });
  }

  function selectedValues(select) {
    return Array.from(select.selectedOptions).map((option) => option.value).filter(Boolean);
  }

  function visibleCompanyCategoryOptions() {
    return Array.from(companyCategoryOptions?.querySelectorAll("[data-category-key]") || [])
      .filter((button) => !button.hidden);
  }

  function updateCompanyCategorySummary() {
    if (!companyCategoryValue || !companyCategories) return;
    const selected = Array.from(companyCategories.selectedOptions).filter((option) => option.value);
    const labels = selected.map((option) => option.textContent.trim());
    companyCategoryValue.textContent = labels.length === 0
      ? "Select trades"
      : labels.length <= 2
        ? labels.join(", ")
        : `${labels.length} trades selected`;
    companyCategoryTrigger?.classList.toggle("is-placeholder", labels.length === 0);
  }

  function setCompanyCategoryMenuOpen(open, { focusSearch = false } = {}) {
    if (!companyCategoryTrigger || !companyCategoryMenu) return;
    companyCategoryMenuOpen = Boolean(open);
    companyCategoryMenu.hidden = !companyCategoryMenuOpen;
    companyCategoryTrigger.setAttribute("aria-expanded", String(companyCategoryMenuOpen));
    companyCategoryPicker?.classList.toggle("is-open", companyCategoryMenuOpen);
    if (companyCategoryMenuOpen) {
      filterCompanyCategories(companyCategorySearch?.value || "");
      if (focusSearch) window.setTimeout(() => companyCategorySearch?.focus(), 0);
    } else {
      companyCategorySearch?.blur();
    }
  }

  function filterCompanyCategories(query) {
    const needle = String(query || "").trim().toLowerCase();
    Array.from(companyCategoryOptions?.querySelectorAll("[data-category-key]") || []).forEach((button) => {
      button.hidden = needle && !button.textContent.toLowerCase().includes(needle);
    });
  }

  function syncCompanyCategoryButton(option) {
    const button = Array.from(companyCategoryOptions?.querySelectorAll("[data-category-key]") || [])
      .find((candidate) => candidate.dataset.categoryKey === option.value);
    if (!button) return;
    button.setAttribute("aria-selected", String(option.selected));
    button.classList.toggle("is-selected", option.selected);
    updateCompanyCategorySummary();
  }

  function renderCompanyCategories() {
    const trades = window.OnSiteTaxonomy?.trades || [];
    if (!companyCategories || !companyCategoryOptions) return;
    companyCategories.replaceChildren();
    companyCategoryOptions.replaceChildren();
    trades.forEach((trade) => {
      const option = document.createElement("option");
      option.value = trade.key;
      option.textContent = trade.name;
      companyCategories.appendChild(option);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "ea-category-option";
      button.dataset.categoryKey = trade.key;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.tabIndex = -1;
      button.innerHTML = `<span>${escapeHtml(trade.name)}</span><span class="ea-category-option-check" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
      button.addEventListener("click", () => {
        option.selected = !option.selected;
        companyCategories.dispatchEvent(new Event("change", { bubbles: true }));
      });
      companyCategoryOptions.appendChild(button);
    });
    companyCategories.addEventListener("change", () => {
      Array.from(companyCategories.options).forEach(syncCompanyCategoryButton);
      companyCategories.setCustomValidity("");
    });
    updateCompanyCategorySummary();
  }

  function focusVisibleCompanyCategoryOption(offset) {
    const options = visibleCompanyCategoryOptions();
    if (!options.length) return;
    const active = document.activeElement?.closest?.("[data-category-key]");
    const currentIndex = Math.max(0, options.indexOf(active));
    const nextIndex = Math.min(Math.max(currentIndex + offset, 0), options.length - 1);
    options[nextIndex].focus();
  }

  function handleCompanyCategoryKeydown(event) {
    const option = event.target.closest?.("[data-category-key]");
    if (option) {
      const options = visibleCompanyCategoryOptions();
      const currentIndex = options.indexOf(option);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[Math.min(Math.max(currentIndex + (event.key === "ArrowDown" ? 1 : -1), 0), options.length - 1)]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        options[event.key === "Home" ? 0 : options.length - 1]?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        option.click();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setCompanyCategoryMenuOpen(false);
        companyCategoryTrigger?.focus();
      } else if (event.key === "Tab") {
        setCompanyCategoryMenuOpen(false);
      }
      return;
    }
    if (event.target === companyCategorySearch && event.key === "ArrowDown") {
      event.preventDefault();
      focusVisibleCompanyCategoryOption(0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setCompanyCategoryMenuOpen(false);
      companyCategoryTrigger?.focus();
    }
  }

  function formPayload(form, type) {
    const data = new FormData(form);
    const common = {
      firstName: data.get("firstName") || "",
      lastName: data.get("lastName") || "",
      email: data.get("email") || "",
      mobile: data.get("mobile") || "",
      privacyAcknowledged: data.get("privacyAcknowledged") === "on",
      marketingConsent: data.get("marketingConsent") === "on",
      website: data.get("website") || "",
      source: sourceAttribution(),
    };
    if (type === "worker") {
      return {
        ...common,
        tradeKey: data.get("tradeKey") || "",
        roleKey: data.get("roleKey") || "",
        homeArea: data.get("homeArea") || "",
        referralCode: normaliseReferralCode(data.get("referralCode") || ""),
      };
    }
    return {
      ...common,
      companyName: data.get("companyName") || "",
      labourCategoryKeys: selectedValues(companyCategories),
      operatingArea: data.get("operatingArea") || "",
      approximateWorkers: data.get("approximateWorkers") || "",
      note: "",
    };
  }

  function setSubmitting(form, isSubmitting) {
    const button = form.querySelector("button[type='submit']");
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Joining Early Access…" : button.dataset.label;
  }

  function formError(form, message) {
    const element = form.querySelector(".ea-form-error");
    if (element) element.textContent = message || "";
  }

  async function submit(form, type) {
    formError(form, "");
    if (type === "company" && !selectedValues(companyCategories).length) {
      formError(form, "Select at least one trade or labour category.");
      companyCategoryTrigger?.classList.add("is-invalid");
      companyCategoryTrigger?.focus();
      return;
    }
    companyCategoryTrigger?.classList.remove("is-invalid");
    if (!form.reportValidity()) return;
    setSubmitting(form, true);
    try {
      const response = await fetch(`/api/early-access/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload(form, type)),
      });
      let payload = {};
      try { payload = await response.json(); } catch (_) {}
      if (!response.ok) {
        const error = new Error(payload.error || "Early Access signup could not be completed.");
        error.code = payload.code || "EARLY_ACCESS_ERROR";
        throw error;
      }
      renderSuccess(payload, type);
    } catch (error) {
      formError(form, error.message || "Early Access signup could not be completed.");
      if (error.code === "INVALID_REFERRAL_CODE") {
        revealReferralFallback({ allowReplacement: true });
        if (referralHint) referralHint.textContent = "That referral link was not accepted. Enter another code or leave it blank.";
      }
    } finally {
      setSubmitting(form, false);
    }
  }

  function renderSuccess(payload, type) {
    workerPanel.hidden = true;
    companyPanel.hidden = true;
    document.querySelector(".ea-path-toggle").hidden = true;
    success.hidden = false;
    if (type === "company") {
      success.innerHTML = `<span class="ea-success-badge">Company Early Access</span>
        <h2>You're on the list.</h2>
        <p><strong>${escapeHtml(payload.companyName || "Your company")}</strong> is registered for OnSite Early Access. We will contact you as contractor access opens.</p>`;
      return;
    }
    const hasReferral = !!payload.referralCode && !!payload.referralUrl;
    success.innerHTML = `<span class="ea-success-badge">Sub-contractor Early Access</span>
      <h2>Your Early Access place is confirmed.</h2>
       <p>${escapeHtml(payload.firstName || "Thanks")}, your details are registered for Early Access. We'll let you know when OnSite onboarding opens.</p>
      ${hasReferral ? `<div class="ea-referral-result">
        <small>Your personal referral link</small>
        <div class="ea-referral-code">${escapeHtml(payload.referralCode)}</div>
        <div class="ea-referral-url">${escapeHtml(payload.referralUrl)}</div>
        <div class="ea-share-actions">
          <button type="button" data-copy-referral>Copy link</button>
          <button type="button" data-share-referral>Share invite</button>
        </div>
        <div class="ea-progress-zero"><span>Sub-contractors joined through your link</span><strong>${Number(payload.referralProgress?.joinedCount) || 0}</strong></div>
      </div>` : `<p>Your registration is safely recorded. We will send your referral details to the email address supplied.</p>`}`;
    if (!hasReferral) return;
    success.querySelector("[data-copy-referral]")?.addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(payload.referralUrl);
      event.currentTarget.textContent = "Copied";
    });
    success.querySelector("[data-share-referral]")?.addEventListener("click", async () => {
      if (navigator.share) {
        await navigator.share({
          title: "Join OnSite Early Access",
          text: "Join me as an OnSite sub-contractor.",
          url: payload.referralUrl,
        });
      } else {
        await navigator.clipboard.writeText(payload.referralUrl);
      }
    });
  }

  document.querySelectorAll("[data-signup-path]").forEach((button) => {
    button.addEventListener("click", () => setPath(button.dataset.signupPath));
  });
  workerForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submit(workerForm, "worker");
  });
  companyForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submit(companyForm, "company");
  });
  workerTrade?.addEventListener("change", () => {
    window.OnSiteTaxonomy?.populateRoleSelect(workerRole, workerTrade.value);
  });
  referralReveal?.addEventListener("click", () => revealReferralFallback());
  referralInput?.addEventListener("blur", () => {
    referralInput.value = normaliseReferralCode(referralInput.value);
  });
  companyCategoryTrigger?.addEventListener("click", () => {
    setCompanyCategoryMenuOpen(!companyCategoryMenuOpen, { focusSearch: !companyCategoryMenuOpen });
  });
  companyCategoryTrigger?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCompanyCategoryMenuOpen(!companyCategoryMenuOpen, { focusSearch: !companyCategoryMenuOpen });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCompanyCategoryMenuOpen(true);
      window.setTimeout(() => focusVisibleCompanyCategoryOption(event.key === "ArrowDown" ? 0 : visibleCompanyCategoryOptions().length - 1), 0);
    } else if (event.key === "Escape" && companyCategoryMenuOpen) {
      event.preventDefault();
      setCompanyCategoryMenuOpen(false);
    } else if (event.key === "Tab") {
      setCompanyCategoryMenuOpen(false);
    }
  });
  companyCategorySearch?.addEventListener("input", () => filterCompanyCategories(companyCategorySearch.value));
  companyCategoryMenu?.addEventListener("keydown", handleCompanyCategoryKeydown);
  document.addEventListener("pointerdown", (event) => {
    if (companyCategoryMenuOpen && !companyCategoryPicker?.contains(event.target)) {
      setCompanyCategoryMenuOpen(false);
    }
  }, true);

  window.OnSiteTaxonomy?.populateTradeSelect(workerTrade);
  renderCompanyCategories();
  initialiseReferral();
})();

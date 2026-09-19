(function initialiseEarlyAccessPage() {
  "use strict";

  const workerForm = document.getElementById("workerEarlyAccessForm");
  const companyForm = document.getElementById("companyEarlyAccessForm");
  const phoneCountrySelects = document.querySelectorAll("[name='mobileCountry']");
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
  const companyCountryPicker = document.getElementById("eaCompanyCountryPicker");
  const companyCountryTrigger = document.getElementById("eaCompanyCountryTrigger");
  const companyCountryValue = document.getElementById("eaCompanyCountryValue");
  const companyCountryMenu = document.getElementById("eaCompanyCountryMenu");
  const companyCountrySearch = document.getElementById("eaCompanyCountrySearch");
  const companyCountryOptions = document.getElementById("eaCompanyCountryOptions");
  const companyCountrySelect = document.getElementById("eaCompanyCountry");
  const ukOperatingConsent = document.getElementById("eaUkOperatingConsent");
  const companyReferralConsent = document.getElementById("eaCompanyReferralConsent");
  const internationalInterestConsent = document.getElementById("eaInternationalInterestConsent");
  const routeStories = document.querySelectorAll("[data-route-story]");
  const referralControls = Object.freeze({
    worker: {
      input: document.getElementById("eaReferralCode"),
      captured: document.getElementById("eaReferralCaptured"),
      reveal: document.getElementById("eaReferralReveal"),
      fallback: document.getElementById("eaReferralFallbackFields"),
      hint: document.getElementById("eaReferralHint"),
    },
    company: {
      input: document.getElementById("eaCompanyReferralCode"),
      captured: document.getElementById("eaCompanyReferralCaptured"),
      reveal: document.getElementById("eaCompanyReferralReveal"),
      fallback: document.getElementById("eaCompanyReferralFallbackFields"),
      hint: document.getElementById("eaCompanyReferralHint"),
    },
  });
  const referralProgrammeCopy = document.getElementById("eaReferralProgrammeCopy");
  const referralProgrammeRewards = document.getElementById("eaReferralProgrammeRewards");
  const REFERRAL_STORAGE_KEY = "onsite_early_access_referral_v1";
  const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const REFERRAL_CODE_PATTERN = /^OS[WC]-[A-Z0-9]{12,24}$/;
  let companyCategoryMenuOpen = false;
  let companyCountryMenuOpen = false;
  let selectedCompanyCountry = "GB";

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

  function referralType(value) {
    const code = normaliseReferralCode(value);
    if (code.startsWith("OSW-")) return "worker";
    if (code.startsWith("OSC-")) return "company";
    return "";
  }

  function referralStorage() {
    try {
      return window["local" + "Storage"];
    } catch (_) {
      return null;
    }
  }

  function writeStoredReferrals(records) {
    try {
      const storage = referralStorage();
      const active = Object.fromEntries(
        Object.entries(records || {}).filter(([, record]) => record?.code),
      );
      if (Object.keys(active).length) storage?.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(active));
      else storage?.removeItem(REFERRAL_STORAGE_KEY);
    } catch (_) {}
  }

  function readStoredReferrals(now = Date.now()) {
    const storage = referralStorage();
    if (!storage) return {};
    try {
      const stored = JSON.parse(storage.getItem(REFERRAL_STORAGE_KEY) || "null");
      const candidates = stored?.code
        ? { [referralType(stored.code)]: stored }
        : stored && typeof stored === "object" ? stored : {};
      const records = {};
      ["worker", "company"].forEach((type) => {
        const candidate = candidates[type];
        const code = normaliseReferralCode(candidate?.code);
        const capturedAt = Number(candidate?.capturedAt);
        const expiresAt = Number(candidate?.expiresAt);
        if (
          referralType(code) === type
          && Number.isFinite(capturedAt)
          && Number.isFinite(expiresAt)
          && expiresAt > now
        ) {
          records[type] = { code, capturedAt, expiresAt };
        }
      });
      writeStoredReferrals(records);
      return records;
    } catch (_) {
      writeStoredReferrals({});
      return {};
    }
  }

  function captureReferral(value, now = Date.now()) {
    const code = normaliseReferralCode(value);
    if (!isValidReferralFormat(code)) return null;
    const type = referralType(code);
    const record = { code, capturedAt: now, expiresAt: now + REFERRAL_TTL_MS };
    writeStoredReferrals({ ...readStoredReferrals(now), [type]: record });
    return record;
  }

  function clearStoredReferral(type) {
    const records = readStoredReferrals();
    delete records[type];
    writeStoredReferrals(records);
  }

  function setReferralState(type, record) {
    const controls = referralControls[type];
    if (!controls?.input) return;
    const captured = Boolean(record);
    controls.input.value = record?.code || "";
    controls.input.readOnly = captured;
    controls.input.classList.toggle("ea-referral-input--captured", captured);
    if (controls.captured) {
      controls.captured.hidden = !captured;
      controls.captured.textContent = type === "company"
        ? "Your company has been referred to OnSite."
        : "You've been referred to OnSite.";
    }
    if (controls.reveal) controls.reveal.hidden = captured;
    if (controls.fallback) controls.fallback.hidden = true;
    if (controls.hint && captured) controls.hint.textContent = "Referral link captured for 30 days.";
  }

  function initialiseReferral() {
    const incoming = new URLSearchParams(window.location.search).get("ref") || "";
    const incomingRecord = isValidReferralFormat(incoming) ? captureReferral(incoming) : null;
    const records = readStoredReferrals();
    setReferralState("worker", records.worker || null);
    setReferralState("company", records.company || null);
    if (incomingRecord) setPath(referralType(incomingRecord.code));
  }

  function revealReferralFallback(type, { allowReplacement = false } = {}) {
    const controls = referralControls[type];
    if (!controls?.input) return;
    if (allowReplacement) {
      clearStoredReferral(type);
      controls.input.value = "";
      controls.input.readOnly = false;
      controls.input.classList.remove("ea-referral-input--captured");
      if (controls.captured) controls.captured.hidden = true;
    }
    if (controls.reveal) controls.reveal.hidden = true;
    if (controls.fallback) controls.fallback.hidden = false;
    controls.input.focus();
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

  function companyIsUkMarket() {
    return selectedCompanyCountry === "GB";
  }

  function renderReferralProgramme(path) {
    if (!referralProgrammeCopy || !referralProgrammeRewards) return;
    referralProgrammeRewards.dataset.route = path;
    if (path === "company") {
      if (!companyIsUkMarket()) {
        referralProgrammeCopy.innerHTML = `<p class="ea-kicker">ONSITE INTERNATIONAL EARLY ACCESS</p>
          <h2 id="referralValue">Register international interest for future market updates.</h2>
          <p>OnSite is launching first in the United Kingdom. If your company operates elsewhere, register your interest so we can understand where contractor companies want access next.</p>
          <p>International-interest registration does not provide immediate marketplace access and does not include the UK contractor referral programme or OnSite credit.</p>`;
        referralProgrammeRewards.innerHTML = `<article><strong>INTERNATIONAL INTEREST</strong><span>Help us understand where contractor access is wanted next</span></article>
          <article><strong>UK FIRST</strong><span>OnSite will launch the marketplace in the United Kingdom first</span></article>
          <article><strong>MARKET UPDATES</strong><span>We'll contact you when there is an update for your market</span></article>`;
        return;
      }
      referralProgrammeCopy.innerHTML = `<p class="ea-kicker">ONSITE CONTRACTOR REFERRAL PROGRAMME</p>
        <h2 id="referralValue">Earn up to £250 in OnSite credit per qualifying contractor referral.</h2>
        <p>Refer another UK contractor to OnSite. They receive £100 OnSite credit towards their first qualifying labour booking. Once the referred contractor reaches 5 paid labour days through OnSite, your company receives £100 credit. At 20 paid labour days, you receive another £150 credit.</p>
        <p>Referral credit is available to verified OnSite contractor accounts. Registration alone does not qualify for credit.</p>
        <p class="ea-example">OnSite credit is not cash and cannot be withdrawn.</p>`;
      referralProgrammeRewards.innerHTML = `<article><strong>REFERRED CONTRACTOR</strong><span>£100 credit towards their first qualifying labour booking</span></article>
        <article><strong>5 PAID LABOUR DAYS</strong><span>£100 OnSite credit</span></article>
        <article><strong>20 PAID LABOUR DAYS</strong><span>Additional £150 OnSite credit</span></article>`;
      return;
    }
    referralProgrammeCopy.innerHTML = `<p class="ea-kicker">ONSITE SUB-CONTRACTOR REFERRAL PROGRAMME</p>
      <h2 id="referralValue">Earn up to £100 per qualifying referral.</h2>
      <p>Refer a CIS sub-contractor to OnSite. When they complete 5 paid days through OnSite, you earn £50. When they reach 20 paid days, you earn another £50. The referred sub-contractor also earns £25 after their first 5 paid days.</p>
      <p>To receive referral rewards, you must complete your OnSite account setup and pass CIS verification. You do not need to complete paid work yourself to earn referral rewards.</p>
      <p class="ea-example">Twenty qualifying referrals could earn you up to <strong>£2,000</strong> in referral rewards. Registration alone does not qualify for a reward.</p>`;
    referralProgrammeRewards.innerHTML = `<article><strong>5 PAID DAYS</strong><span>£50 referral reward</span></article>
      <article><strong>20 PAID DAYS</strong><span>Additional £50 referral reward</span></article>
      <article><strong>REFERRED SUB-CONTRACTOR</strong><span>£25 reward after 5 paid days</span></article>`;
  }

  function setPath(path) {
    const workerSelected = path === "worker";
    setCompanyCategoryMenuOpen(false);
    setCompanyCountryMenuOpen(false);
    workerPanel.hidden = !workerSelected;
    companyPanel.hidden = workerSelected;
    routeStories.forEach((story) => {
      story.hidden = story.dataset.routeStory !== path;
    });
    document.querySelectorAll("[data-signup-path]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.signupPath === path));
    });
    renderReferralProgramme(path);
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

  function visibleCompanyCountryOptions() {
    return Array.from(companyCountryOptions?.querySelectorAll("[data-country-code]") || [])
      .filter((button) => !button.hidden);
  }

  function setCompanyCountryMenuOpen(open, { focusSearch = false } = {}) {
    if (!companyCountryTrigger || !companyCountryMenu) return;
    companyCountryMenuOpen = Boolean(open);
    companyCountryMenu.hidden = !companyCountryMenuOpen;
    companyCountryTrigger.setAttribute("aria-expanded", String(companyCountryMenuOpen));
    companyCountryPicker?.classList.toggle("is-open", companyCountryMenuOpen);
    if (companyCountryMenuOpen) {
      filterCompanyCountries(companyCountrySearch?.value || "");
      if (focusSearch) window.setTimeout(() => companyCountrySearch?.focus(), 0);
    } else {
      companyCountrySearch?.blur();
    }
  }

  function filterCompanyCountries(query) {
    const needle = String(query || "").trim().toLowerCase();
    visibleCompanyCountryOptions();
    Array.from(companyCountryOptions?.querySelectorAll("[data-country-code]") || []).forEach((button) => {
      button.hidden = Boolean(needle && !button.textContent.toLowerCase().includes(needle));
    });
  }

  function selectCompanyCountry(code) {
    const country = window.OnSiteCountries?.findCountry(code);
    if (!country || !companyCountrySelect) return;
    selectedCompanyCountry = country.iso2;
    companyCountrySelect.value = country.iso2;
    if (companyCountryValue) companyCountryValue.textContent = country.name;
    companyCountryTrigger?.setAttribute("aria-valuetext", country.name);
    Array.from(companyCountryOptions?.querySelectorAll("[data-country-code]") || []).forEach((button) => {
      const selected = button.dataset.countryCode === country.iso2;
      button.setAttribute("aria-selected", String(selected));
      button.classList.toggle("is-selected", selected);
    });
    const isUk = country.iso2 === "GB";
    const ukOperatingInput = ukOperatingConsent?.querySelector("input");
    const companyReferralInput = companyReferralConsent?.querySelector("input");
    const internationalInput = internationalInterestConsent?.querySelector("input");
    if (ukOperatingConsent) ukOperatingConsent.hidden = !isUk;
    if (companyReferralConsent) companyReferralConsent.hidden = !isUk;
    if (internationalInterestConsent) internationalInterestConsent.hidden = isUk;
    if (ukOperatingInput) {
      ukOperatingInput.required = isUk;
      if (!isUk) ukOperatingInput.checked = false;
    }
    if (companyReferralInput) {
      companyReferralInput.required = isUk;
      if (!isUk) companyReferralInput.checked = false;
    }
    if (internationalInput) {
      internationalInput.required = !isUk;
      if (isUk) internationalInput.checked = false;
    }
    const referralChoice = document.getElementById("eaCompanyReferralChoice");
    if (referralChoice) referralChoice.hidden = !isUk;
    const areaInput = companyForm?.querySelector("[name='operatingArea']");
    if (areaInput) {
      areaInput.placeholder = isUk
        ? "e.g. London and the South East"
        : `e.g. ${country.name} or the regions you cover`;
    }
    if (companyPanel && !companyPanel.hidden) renderReferralProgramme("company");
  }

  function handleCompanyCountryKeydown(event) {
    const option = event.target.closest?.("[data-country-code]");
    if (option) {
      const options = visibleCompanyCountryOptions();
      const currentIndex = options.indexOf(option);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        options[Math.min(Math.max(currentIndex + (event.key === "ArrowDown" ? 1 : -1), 0), options.length - 1)]?.focus();
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        options[event.key === "Home" ? 0 : options.length - 1]?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectCompanyCountry(option.dataset.countryCode);
        setCompanyCountryMenuOpen(false);
        companyCountryTrigger?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        setCompanyCountryMenuOpen(false);
        companyCountryTrigger?.focus();
      }
      return;
    }
    if (event.target === companyCountrySearch && event.key === "ArrowDown") {
      event.preventDefault();
      visibleCompanyCountryOptions()[0]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setCompanyCountryMenuOpen(false);
      companyCountryTrigger?.focus();
    }
  }

  function renderCompanyCountries() {
    const countries = [...(window.OnSiteCountries?.countries || [])]
      .sort((left, right) => left.iso2 === "GB" ? -1 : right.iso2 === "GB" ? 1 : left.name.localeCompare(right.name));
    if (!companyCountrySelect || !companyCountryOptions) return;
    companyCountrySelect.replaceChildren(...countries.map((country) => {
      const option = document.createElement("option");
      option.value = country.iso2;
      option.textContent = country.name;
      return option;
    }));
    companyCountryOptions.replaceChildren(...countries.map((country) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ea-category-option";
      button.dataset.countryCode = country.iso2;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(country.iso2 === "GB"));
      button.tabIndex = -1;
      button.innerHTML = `<span>${escapeHtml(country.name)}</span><span class="ea-category-option-check" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
      button.addEventListener("click", () => {
        selectCompanyCountry(country.iso2);
        setCompanyCountryMenuOpen(false);
        companyCountryTrigger?.focus();
      });
      return button;
    }));
    selectCompanyCountry("GB");
  }

  function formPayload(form, type) {
    const data = new FormData(form);
    const mobile = window.OnSitePhone?.normalisePhone(
      data.get("mobile") || "",
      data.get("mobileCountry") || "GB",
    ) || "";
    const common = {
      firstName: data.get("firstName") || "",
      lastName: data.get("lastName") || "",
      email: data.get("email") || "",
      mobile,
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
        cisAcknowledged: data.get("cisAcknowledged") === "on",
      };
    }
    return {
      ...common,
      companyName: data.get("companyName") || "",
      operatingCountryCode: data.get("operatingCountryCode") || "GB",
      labourCategoryKeys: selectedValues(companyCategories),
      operatingArea: data.get("operatingArea") || "",
      approximateWorkers: data.get("approximateWorkers") || "",
      note: "",
      referralCode: selectedCompanyCountry === "GB"
        ? normaliseReferralCode(data.get("referralCode") || "")
        : "",
      companyReferralAcknowledged: selectedCompanyCountry === "GB"
        && data.get("companyReferralAcknowledged") === "on",
      ukOperatingAcknowledged: selectedCompanyCountry === "GB"
        && data.get("ukOperatingAcknowledged") === "on",
      internationalInterestAcknowledged: selectedCompanyCountry !== "GB"
        && data.get("internationalInterestAcknowledged") === "on",
    };
  }

  function updatePhoneValidity(form) {
    const input = form.querySelector("[name='mobile']");
    const country = form.querySelector("[name='mobileCountry']");
    if (!input) return "";
    const rawValue = input.value.trim();
    const normalised = window.OnSitePhone?.normalisePhone(rawValue, country?.value || "GB") || "";
    input.setCustomValidity(rawValue && !normalised ? "Enter a valid telephone number." : "");
    return normalised;
  }

  function syncPhoneCountryPresentation(select) {
    const countries = window.OnSitePhone?.countries || [];
    const country = countries.find((candidate) => candidate.iso2 === select.value);
    const wrapper = select.closest(".os-select");
    const value = wrapper?.querySelector(".os-select-value");
    const trigger = wrapper?.querySelector(".os-select-trigger");
    if (!country || !value || !trigger) return;

    const compactLabel = country.callingCode;
    const accessibleLabel = `Country calling code: ${country.name} ${country.callingCode}`;
    select.dataset.displayValue = compactLabel;
    select.dataset.accessibleLabel = accessibleLabel;
    window.OnSiteUI?.syncSelect(select);
    value.textContent = compactLabel;
    trigger.setAttribute("aria-valuetext", `${country.name} ${country.callingCode}`);
  }

  function renderPhoneCountries() {
    const countries = window.OnSitePhone?.countries || [];
    phoneCountrySelects.forEach((select) => {
      select.replaceChildren(...countries.map((country) => {
        const option = document.createElement("option");
        option.value = country.iso2;
        option.textContent = `${country.callingCode} · ${country.name}`;
        return option;
      }));
      select.value = "GB";
      window.OnSiteUI?.syncSelect(select);
      syncPhoneCountryPresentation(select);
    });
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

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const fallback = document.createElement("textarea");
    fallback.value = value;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    if (!copied) throw new Error("Clipboard unavailable");
  }

  function setTemporaryButtonLabel(button, label) {
    if (!button) return;
    const original = button.dataset.originalLabel || button.textContent;
    button.dataset.originalLabel = original;
    button.textContent = label;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, 1800);
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
    updatePhoneValidity(form);
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
        const controls = referralControls[type];
        revealReferralFallback(type, { allowReplacement: true });
        if (controls?.hint) controls.hint.textContent = "That referral link was not accepted. Enter another code or leave it blank.";
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
    const emailDeliveryStatus = payload.emailDeliveryStatus;
    const internationalCompany = type === "company" && payload.registrationMarket === "international";
    if (internationalCompany) {
      const country = window.OnSiteCountries?.findCountry(payload.operatingCountryCode);
      const shareUrl = payload.earlyAccessUrl || `${window.location.origin}/early-access`;
      const emailCopy = {
        sent: "We've also emailed you a link to the Early Access page.",
        skipped: "Your interest is recorded. You can share the Early Access page below.",
        failed: "Your interest is recorded, but we couldn't send the confirmation email. Share the Early Access page below.",
        not_sent: "Your interest is recorded. You can share the Early Access page below.",
      }[emailDeliveryStatus] || "";
      success.innerHTML = `<span class="ea-success-badge">INTERNATIONAL EARLY ACCESS</span>
        <h2>Your international interest is registered.</h2>
        <p>${escapeHtml(payload.firstName || "Thanks")}, we've recorded your company's interest in OnSite Early Access for ${escapeHtml(country?.name || "your market")}.</p>
        <p>OnSite is launching first in the United Kingdom. This registration does not provide immediate marketplace access and does not include the UK contractor referral programme or OnSite credit.</p>
        ${emailCopy ? `<p class="ea-email-status">${emailCopy}</p>` : ""}
        <div class="ea-referral-result">
          <small>SHARE ONSITE EARLY ACCESS</small>
          <div class="ea-referral-url">${escapeHtml(shareUrl)}</div>
          <div class="ea-share-actions">
            <button type="button" data-copy-interest>Copy link</button>
            <button type="button" data-share-interest>Share OnSite</button>
          </div>
          <p class="ea-action-status" data-interest-action-status role="status" aria-live="polite"></p>
        </div>`;
      const actionStatus = success.querySelector("[data-interest-action-status]");
      success.querySelector("[data-copy-interest]")?.addEventListener("click", async (event) => {
        try {
          await copyText(shareUrl);
          setTemporaryButtonLabel(event.currentTarget, "Copied");
          if (actionStatus) actionStatus.textContent = "Early Access link copied.";
        } catch (_) {
          if (actionStatus) actionStatus.textContent = "Copy failed. Select the link above to copy it manually.";
        }
      });
      success.querySelector("[data-share-interest]")?.addEventListener("click", async (event) => {
        const shareText = `We're interested in OnSite Early Access for ${country?.name || "our market"}. Find out more:\n\n${shareUrl}`;
        try {
          if (navigator.share) {
            await navigator.share({ title: "OnSite Early Access", text: shareText });
            if (actionStatus) actionStatus.textContent = "Early Access link shared.";
          } else {
            await copyText(shareText);
            setTemporaryButtonLabel(event.currentTarget, "Invite copied");
            if (actionStatus) actionStatus.textContent = "Share text copied.";
          }
        } catch (error) {
          if (error?.name !== "AbortError" && actionStatus) {
            actionStatus.textContent = "Share failed. Copy the Early Access link above to send it.";
          }
        }
      });
      return;
    }
    const hasReferral = !!payload.referralCode && !!payload.referralUrl;
    const company = type === "company";
    const emailCopy = company
      ? {
        sent: "We've also emailed your contractor referral link to you.",
        skipped: "Save or copy your referral link before leaving this page.",
        failed: "We couldn't send the confirmation email. Save or copy your referral link before leaving this page.",
        not_sent: "Save or copy your referral link before leaving this page.",
      }[emailDeliveryStatus]
      : {
        sent: "We've also emailed your referral link to you.",
        skipped: "Your registration is complete. Save or copy your referral link below.",
        failed: "Your registration is complete, but we couldn't send the confirmation email. Save or copy your referral link below.",
        not_sent: "Your registration is complete. Save or copy your referral link below.",
      }[emailDeliveryStatus] || "";
    const badge = company ? "CONTRACTOR EARLY ACCESS" : "SUB-CONTRACTOR EARLY ACCESS";
    const title = company
      ? "Your company Early Access registration is confirmed."
      : "Your Early Access registration is confirmed.";
    const intro = company
      ? `${escapeHtml(payload.firstName || "Thanks")}, your company is registered for Early Access. We'll contact you when OnSite contractor onboarding opens.`
      : `${escapeHtml(payload.firstName || "Thanks")}, your details are registered for Early Access. We'll notify you when OnSite onboarding opens.`;
    const codeLabel = company ? "YOUR CONTRACTOR REFERRAL CODE" : "Your referral code";
    const linkLabel = company ? "YOUR CONTRACTOR REFERRAL LINK" : "Your personal referral link";
    const attribution = company
      ? "Registrations through this link are attributed to your company automatically."
      : "Registrations through this link are attributed to you automatically.";
    const eligibility = company
      ? "Company verification will be required before referral credit can be applied."
      : "You do not need to complete paid work yourself to earn referral rewards. CIS verification will be required before any referral reward can be paid.";
    const creditClarification = company
      ? "OnSite credit is not cash and cannot be withdrawn."
      : "";
    const contractorSummary = company
      ? `<section class="ea-contractor-summary" aria-labelledby="contractorSummaryTitle">
        <p class="ea-summary-kicker" id="contractorSummaryTitle">YOUR CONTRACTOR REFERRAL PROGRAMME</p>
        <div class="ea-summary-row"><strong>Referred contractor</strong><span>£100 credit towards first qualifying labour booking</span></div>
        <div class="ea-summary-row"><strong>Your company</strong><span>£100 credit at 5 paid labour days<br />+ £150 at 20 paid labour days</span></div>
      </section>`
      : "";
    success.innerHTML = `<span class="ea-success-badge">${badge}</span>
      <h2>${title}</h2>
      <p>${intro}</p>
      ${emailCopy ? `<p class="ea-email-status">${emailCopy}</p>` : ""}
      ${hasReferral ? `<div class="ea-referral-result">
        <small>${codeLabel}</small>
        <div class="ea-referral-code">${escapeHtml(payload.referralCode)}</div>
        <small>${linkLabel}</small>
        <div class="ea-referral-url">${escapeHtml(payload.referralUrl)}</div>
        <div class="ea-share-actions">
          <button type="button" data-copy-referral>Copy link</button>
          <button type="button" data-share-referral>Share invite</button>
        </div>
         <p class="ea-action-status" data-referral-action-status role="status" aria-live="polite"></p>
        <p class="ea-referral-attribution">${attribution}</p>
        <p class="ea-referral-attribution">${eligibility}</p>
         ${creditClarification ? `<p class="ea-referral-attribution">${creditClarification}</p>` : ""}
       </div>
       ${contractorSummary}` : `<p>Your registration is recorded. Referral details are available for new registrations.</p>`}`;
    if (!hasReferral) return;
    const actionStatus = success.querySelector("[data-referral-action-status]");
    success.querySelector("[data-copy-referral]")?.addEventListener("click", async (event) => {
      try {
        await copyText(payload.referralUrl);
        setTemporaryButtonLabel(event.currentTarget, "Copied");
        if (actionStatus) actionStatus.textContent = "Referral link copied.";
      } catch (_) {
        if (actionStatus) actionStatus.textContent = "Copy failed. Select the link above to copy it manually.";
      }
    });
    success.querySelector("[data-share-referral]")?.addEventListener("click", async (event) => {
      const shareText = company
        ? `We've joined OnSite Early Access. If your company hires CIS sub-contractors, register using our link:\n\n${payload.referralUrl}`
        : `I've joined OnSite Early Access. If you're a CIS sub-contractor, register using my link:\n\n${payload.referralUrl}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: "OnSite Early Access",
            text: shareText,
          });
          if (actionStatus) actionStatus.textContent = "Invite shared.";
        } else {
          await copyText(shareText);
          setTemporaryButtonLabel(event.currentTarget, "Invite copied");
          if (actionStatus) actionStatus.textContent = "Invite text copied.";
        }
      } catch (error) {
        if (error?.name !== "AbortError" && actionStatus) {
          actionStatus.textContent = "Share failed. Copy the link above to send your invite.";
        }
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
  document.querySelectorAll("form [name='mobile']").forEach((input) => {
    input.addEventListener("input", () => updatePhoneValidity(input.form));
    input.addEventListener("blur", () => updatePhoneValidity(input.form));
  });
  phoneCountrySelects.forEach((select) => {
    select.addEventListener("change", () => {
      syncPhoneCountryPresentation(select);
      updatePhoneValidity(select.form);
    });
  });
  workerTrade?.addEventListener("change", () => {
    window.OnSiteTaxonomy?.populateRoleSelect(workerRole, workerTrade.value);
  });
  Object.entries(referralControls).forEach(([type, controls]) => {
    controls.reveal?.addEventListener("click", () => revealReferralFallback(type));
    controls.input?.addEventListener("blur", () => {
      controls.input.value = normaliseReferralCode(controls.input.value);
    });
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
  companyCountryTrigger?.addEventListener("click", () => {
    setCompanyCountryMenuOpen(!companyCountryMenuOpen, { focusSearch: !companyCountryMenuOpen });
  });
  companyCountryTrigger?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCompanyCountryMenuOpen(!companyCountryMenuOpen, { focusSearch: !companyCountryMenuOpen });
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCompanyCountryMenuOpen(true);
      window.setTimeout(() => {
        const options = visibleCompanyCountryOptions();
        options[event.key === "ArrowDown" ? 0 : options.length - 1]?.focus();
      }, 0);
    } else if (event.key === "Escape" && companyCountryMenuOpen) {
      event.preventDefault();
      setCompanyCountryMenuOpen(false);
    } else if (event.key === "Tab") {
      setCompanyCountryMenuOpen(false);
    }
  });
  companyCountrySearch?.addEventListener("input", () => filterCompanyCountries(companyCountrySearch.value));
  companyCountryMenu?.addEventListener("keydown", handleCompanyCountryKeydown);
  document.addEventListener("pointerdown", (event) => {
    if (companyCategoryMenuOpen && !companyCategoryPicker?.contains(event.target)) {
      setCompanyCategoryMenuOpen(false);
    }
    if (companyCountryMenuOpen && !companyCountryPicker?.contains(event.target)) {
      setCompanyCountryMenuOpen(false);
    }
  }, true);

  window.OnSiteTaxonomy?.populateTradeSelect(workerTrade);
  renderPhoneCountries();
  renderCompanyCountries();
  renderCompanyCategories();
  initialiseReferral();
})();

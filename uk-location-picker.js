(function (root, factory) {
  const api = factory(root.OnSiteUkSettlementData || { settlements: [], metadata: {} });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OnSiteLocations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (dataset) {
  const runtime = typeof globalThis !== "undefined" ? globalThis : this;
  const INVALID_LOCATION_MESSAGE =
    "Select a valid UK town or city from the suggestions.";
  const UK_COUNTRIES = new Set([
    "England",
    "Scotland",
    "Wales",
    "Northern Ireland",
  ]);
  let pickerSequence = 0;

  function normaliseSearchText(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLocaleLowerCase("en-GB")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function canonicalFromTuple(tuple) {
    const [id, name, adminArea, country, latitude, longitude] = tuple;
    return normaliseSelectedLocation({
      id,
      name,
      displayName: [name, adminArea].filter(Boolean).join(", "),
      adminArea,
      country,
      latitude,
      longitude,
    });
  }

  function normaliseSelectedLocation(value) {
    if (!value || typeof value !== "object") return null;
    const id = String(value.id || value.placeId || "").trim();
    const name = String(value.name || value.locality || "").trim();
    const adminArea = String(value.adminArea || value.region || value.county || "").trim();
    const country = String(value.country || "").trim();
    const latitude = Number(value.latitude ?? value.lat);
    const longitude = Number(value.longitude ?? value.lng);
    if (
      !id ||
      !name ||
      !UK_COUNTRIES.has(country) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < 49 ||
      latitude > 61 ||
      longitude < -9 ||
      longitude > 3
    ) {
      return null;
    }
    return {
      id,
      name,
      displayName:
        String(value.displayName || "").trim() ||
        [name, adminArea].filter(Boolean).join(", "),
      adminArea,
      country,
      latitude,
      longitude,
    };
  }

  const locationIndex = (dataset.settlements || [])
    .map((tuple) => {
      const canonical = canonicalFromTuple(tuple);
      if (!canonical) return null;
      const population = Math.max(0, Number(tuple[6]) || 0);
      const searchTerms = [tuple[1], ...(Array.isArray(tuple[7]) ? tuple[7] : [])]
        .map(normaliseSearchText)
        .filter(Boolean)
        .filter((term, index, terms) => terms.indexOf(term) === index);
      return { canonical, population, searchTerms };
    })
    .filter(Boolean);

  const locationsById = new Map(
    locationIndex.map((entry) => [entry.canonical.id, entry.canonical]),
  );

  function termRank(term, query) {
    if (term === query) return 0;
    if (term.startsWith(query)) return 1;
    if (term.split(" ").some((word) => word.startsWith(query))) return 2;
    if (term.includes(query)) return 3;
    return Number.POSITIVE_INFINITY;
  }

  function searchUkLocations(query, { limit = 8 } = {}) {
    const normalizedQuery = normaliseSearchText(query);
    if (normalizedQuery.length < 2) return [];
    return locationIndex
      .map((entry) => {
        const rank = Math.min(
          ...entry.searchTerms.map((term) => termRank(term, normalizedQuery)),
        );
        return { entry, rank };
      })
      .filter(({ rank }) => Number.isFinite(rank))
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          b.entry.population - a.entry.population ||
          a.entry.canonical.name.localeCompare(b.entry.canonical.name, "en-GB") ||
          a.entry.canonical.adminArea.localeCompare(
            b.entry.canonical.adminArea,
            "en-GB",
          ),
      )
      .slice(0, Math.max(1, Number(limit) || 8))
      .map(({ entry }) => ({ ...entry.canonical }));
  }

  function resolveElement(value) {
    return typeof value === "string" ? document.querySelector(value) : value;
  }

  function initUkLocationPicker({
    input,
    listbox = null,
    message = null,
    minCharacters = 2,
    maxResults = 8,
    onSelect = null,
    onClear = null,
  } = {}) {
    const inputElement = resolveElement(input);
    if (!(inputElement instanceof HTMLInputElement)) return null;
    const rootElement = inputElement.closest("[data-uk-location-picker]") || inputElement.parentElement;
    let listboxElement = resolveElement(listbox);
    let messageElement = resolveElement(message);
    pickerSequence += 1;
    const listboxId =
      listboxElement?.id || `${inputElement.id || "ukLocation"}-listbox-${pickerSequence}`;

    if (!listboxElement) {
      listboxElement = document.createElement("div");
      listboxElement.id = listboxId;
      listboxElement.className = "uk-location-results hidden";
      listboxElement.setAttribute("role", "listbox");
      rootElement?.appendChild(listboxElement);
    }
    if (!messageElement) {
      messageElement = document.createElement("p");
      messageElement.className = "form-helper uk-location-message hidden";
      rootElement?.appendChild(messageElement);
    }

    inputElement.setAttribute("role", "combobox");
    inputElement.setAttribute("aria-autocomplete", "list");
    inputElement.setAttribute("aria-controls", listboxId);
    inputElement.setAttribute("aria-expanded", "false");
    inputElement.setAttribute("autocomplete", "off");

    let selectedLocation = null;
    let results = [];
    let activeIndex = -1;
    let isOpen = false;

    function setMessage(text = "", tone = "") {
      if (!messageElement) return;
      messageElement.textContent = text;
      messageElement.classList.toggle("hidden", !text);
      messageElement.dataset.tone = tone;
    }

    function setValidity(messageText = "") {
      inputElement.setCustomValidity(messageText);
      inputElement.setAttribute("aria-invalid", String(!!messageText));
    }

    function close() {
      isOpen = false;
      activeIndex = -1;
      listboxElement.classList.add("hidden");
      listboxElement.innerHTML = "";
      inputElement.setAttribute("aria-expanded", "false");
      inputElement.removeAttribute("aria-activedescendant");
    }

    function updateActiveResult(nextIndex) {
      if (!results.length) return;
      activeIndex = (nextIndex + results.length) % results.length;
      listboxElement.querySelectorAll("[role='option']").forEach((option, index) => {
        const active = index === activeIndex;
        option.classList.toggle("is-active", active);
        option.setAttribute("aria-selected", String(active));
        if (active) {
          inputElement.setAttribute("aria-activedescendant", option.id);
          option.scrollIntoView({ block: "nearest" });
        }
      });
    }

    function open() {
      if (!results.length) return;
      runtime.dispatchEvent(
        new CustomEvent("onsite-location-picker-open", { detail: api }),
      );
      isOpen = true;
      listboxElement.classList.remove("hidden");
      inputElement.setAttribute("aria-expanded", "true");
    }

    function renderResults() {
      listboxElement.innerHTML = "";
      if (!results.length) {
        close();
        setMessage("No matching UK town or city found.", "empty");
        return;
      }
      setMessage();
      const fragment = document.createDocumentFragment();
      results.forEach((location, index) => {
        const option = document.createElement("div");
        option.id = `${listboxId}-option-${index}`;
        option.className = "uk-location-option";
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        option.dataset.locationIndex = String(index);
        const primary = document.createElement("strong");
        primary.textContent = location.name;
        const secondary = document.createElement("span");
        secondary.textContent = [location.adminArea, location.country]
          .filter(Boolean)
          .filter((part, partIndex, parts) => parts.indexOf(part) === partIndex)
          .join(" · ");
        option.append(primary, secondary);
        fragment.appendChild(option);
      });
      listboxElement.appendChild(fragment);
      open();
      updateActiveResult(0);
    }

    function refreshResults() {
      const query = inputElement.value.trim();
      if (normaliseSearchText(query).length < minCharacters) {
        results = [];
        setMessage();
        close();
        return;
      }
      results = searchUkLocations(query, { limit: maxResults });
      renderResults();
    }

    function selectLocation(value, { focus = true, emit = true } = {}) {
      const normalized = normaliseSelectedLocation(value);
      if (!normalized) return false;
      selectedLocation = locationsById.get(normalized.id) || normalized;
      inputElement.value = selectedLocation.name;
      setValidity();
      setMessage();
      close();
      if (emit) {
        const detail = { ...selectedLocation };
        inputElement.dispatchEvent(
          new CustomEvent("onsite-location-selected", { bubbles: true, detail }),
        );
        if (typeof onSelect === "function") onSelect(detail);
      }
      if (focus) inputElement.focus({ preventScroll: true });
      return true;
    }

    function clearSelectedLocation({ clearInput = false, emit = true } = {}) {
      const hadSelection = !!selectedLocation;
      selectedLocation = null;
      if (clearInput) inputElement.value = "";
      const hasText = !!inputElement.value.trim();
      setValidity(hasText ? INVALID_LOCATION_MESSAGE : "");
      if (emit && hadSelection) {
        inputElement.dispatchEvent(
          new CustomEvent("onsite-location-cleared", { bubbles: true }),
        );
        if (typeof onClear === "function") onClear();
      }
    }

    function setLegacyValue(value = "") {
      selectedLocation = null;
      inputElement.value = String(value || "");
      setValidity(inputElement.value.trim() ? INVALID_LOCATION_MESSAGE : "");
      setMessage();
      close();
    }

    function validate({ report = false } = {}) {
      const valueMatchesSelection =
        selectedLocation &&
        normaliseSearchText(inputElement.value) ===
          normaliseSearchText(selectedLocation.name);
      if (!valueMatchesSelection) {
        selectedLocation = null;
        const messageText = inputElement.value.trim()
          ? INVALID_LOCATION_MESSAGE
          : "";
        setValidity(messageText);
        if (report) {
          inputElement.reportValidity();
          inputElement.focus({ preventScroll: true });
          refreshResults();
        }
        return false;
      }
      setValidity();
      return true;
    }

    function getSelectedLocation() {
      return selectedLocation ? { ...selectedLocation } : null;
    }

    function handleInput() {
      if (
        selectedLocation &&
        normaliseSearchText(inputElement.value) !==
          normaliseSearchText(selectedLocation.name)
      ) {
        clearSelectedLocation({ emit: true });
      } else if (!selectedLocation && inputElement.value.trim()) {
        setValidity(INVALID_LOCATION_MESSAGE);
      } else {
        setValidity();
      }
      refreshResults();
    }

    function handleKeydown(event) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!isOpen) refreshResults();
        if (!results.length) return;
        event.preventDefault();
        updateActiveResult(
          activeIndex + (event.key === "ArrowDown" ? 1 : -1),
        );
        return;
      }
      if (event.key === "Enter" && isOpen && activeIndex >= 0) {
        event.preventDefault();
        selectLocation(results[activeIndex]);
        return;
      }
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        close();
      }
    }

    function handleOptionSelection(event) {
      const option = event.target.closest("[data-location-index]");
      if (!option || !listboxElement.contains(option)) return;
      event.preventDefault();
      selectLocation(results[Number(option.dataset.locationIndex)]);
    }

    function handleOutsidePointer(event) {
      if (rootElement?.contains(event.target)) return;
      close();
    }

    function handleOtherPickerOpen(event) {
      if (event.detail !== api) close();
    }

    const api = {
      clear: clearSelectedLocation,
      close,
      getSelectedLocation,
      setLegacyValue,
      setSelectedLocation: selectLocation,
      validate,
    };

    inputElement.addEventListener("input", handleInput);
    inputElement.addEventListener("focus", () => {
      if (!selectedLocation) refreshResults();
    });
    inputElement.addEventListener("keydown", handleKeydown);
    listboxElement.addEventListener("pointerdown", (event) => event.preventDefault());
    listboxElement.addEventListener("click", handleOptionSelection);
    document.addEventListener("pointerdown", handleOutsidePointer, true);
    runtime.addEventListener("onsite-location-picker-open", handleOtherPickerOpen);

    return api;
  }

  return {
    INVALID_LOCATION_MESSAGE,
    datasetMetadata: { ...(dataset.metadata || {}) },
    initUkLocationPicker,
    normaliseSearchText,
    normaliseSelectedLocation,
    searchUkLocations,
  };
});

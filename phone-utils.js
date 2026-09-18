"use strict";

(function initialiseOnSitePhone(global) {
  const countries = Object.freeze([
    { iso2: "GB", name: "United Kingdom", callingCode: "+44" },
    { iso2: "IE", name: "Ireland", callingCode: "+353" },
    { iso2: "FR", name: "France", callingCode: "+33" },
    { iso2: "ES", name: "Spain", callingCode: "+34" },
    { iso2: "DE", name: "Germany", callingCode: "+49" },
    { iso2: "IT", name: "Italy", callingCode: "+39", keepTrunkPrefix: true },
    { iso2: "NL", name: "Netherlands", callingCode: "+31" },
    { iso2: "BE", name: "Belgium", callingCode: "+32" },
    { iso2: "PT", name: "Portugal", callingCode: "+351" },
    { iso2: "PL", name: "Poland", callingCode: "+48" },
    { iso2: "RO", name: "Romania", callingCode: "+40" },
    { iso2: "SE", name: "Sweden", callingCode: "+46" },
    { iso2: "NO", name: "Norway", callingCode: "+47" },
    { iso2: "DK", name: "Denmark", callingCode: "+45" },
    { iso2: "FI", name: "Finland", callingCode: "+358" },
    { iso2: "CH", name: "Switzerland", callingCode: "+41" },
    { iso2: "AT", name: "Austria", callingCode: "+43" },
    { iso2: "GR", name: "Greece", callingCode: "+30" },
    { iso2: "CZ", name: "Czechia", callingCode: "+420" },
    { iso2: "HU", name: "Hungary", callingCode: "+36" },
    { iso2: "BG", name: "Bulgaria", callingCode: "+359" },
    { iso2: "HR", name: "Croatia", callingCode: "+385" },
    { iso2: "SI", name: "Slovenia", callingCode: "+386" },
    { iso2: "SK", name: "Slovakia", callingCode: "+421" },
    { iso2: "EE", name: "Estonia", callingCode: "+372" },
    { iso2: "LV", name: "Latvia", callingCode: "+371" },
    { iso2: "LT", name: "Lithuania", callingCode: "+370" },
    { iso2: "CY", name: "Cyprus", callingCode: "+357" },
    { iso2: "MT", name: "Malta", callingCode: "+356" },
    { iso2: "LU", name: "Luxembourg", callingCode: "+352" },
    { iso2: "IS", name: "Iceland", callingCode: "+354" },
    { iso2: "US", name: "United States", callingCode: "+1" },
    { iso2: "CA", name: "Canada", callingCode: "+1" },
    { iso2: "AU", name: "Australia", callingCode: "+61" },
    { iso2: "NZ", name: "New Zealand", callingCode: "+64" },
    { iso2: "IN", name: "India", callingCode: "+91" },
    { iso2: "ZA", name: "South Africa", callingCode: "+27" },
    { iso2: "AE", name: "United Arab Emirates", callingCode: "+971" },
    { iso2: "SA", name: "Saudi Arabia", callingCode: "+966" },
    { iso2: "SG", name: "Singapore", callingCode: "+65" },
    { iso2: "HK", name: "Hong Kong", callingCode: "+852" },
    { iso2: "JP", name: "Japan", callingCode: "+81" },
    { iso2: "CN", name: "China", callingCode: "+86" },
    { iso2: "BR", name: "Brazil", callingCode: "+55" },
    { iso2: "MX", name: "Mexico", callingCode: "+52" },
    { iso2: "TR", name: "Türkiye", callingCode: "+90" },
    { iso2: "IL", name: "Israel", callingCode: "+972" },
    { iso2: "NG", name: "Nigeria", callingCode: "+234" },
    { iso2: "PK", name: "Pakistan", callingCode: "+92" },
    { iso2: "BD", name: "Bangladesh", callingCode: "+880" },
  ].map((country) => Object.freeze(country)));

  const countriesByIso = new Map(countries.map((country) => [country.iso2, country]));
  const countriesByCallingCode = [...countries].sort(
    (left, right) => right.callingCode.length - left.callingCode.length,
  );

  function compactPhone(value) {
    return String(value || "")
      .trim()
      .replace(/[\s().-]/g, "");
  }

  function countryForIso(iso2 = "GB") {
    return countriesByIso.get(String(iso2 || "GB").toUpperCase()) || countriesByIso.get("GB");
  }

  function countryForDigits(digits) {
    return countriesByCallingCode.find((country) => digits.startsWith(country.callingCode.slice(1)));
  }

  function normalisePhone(value, selectedIso = "GB") {
    const compact = compactPhone(value);
    if (!compact || !/^(?:\+|00)?\d+$/.test(compact)) return "";

    const selectedCountry = countryForIso(selectedIso);
    let digits;
    if (compact.startsWith("+")) {
      digits = compact.slice(1);
    } else if (compact.startsWith("00")) {
      digits = compact.slice(2);
    } else {
      const localDigits = compact.replace(/^0(?=\d)/, "");
      const selectedCode = selectedCountry.callingCode.slice(1);
      digits = localDigits.startsWith(selectedCode)
        ? localDigits
        : `${selectedCode}${localDigits}`;
    }

    const matchedCountry = countryForDigits(digits);
    if (!matchedCountry) return "";

    const nationalDigits = digits.slice(matchedCountry.callingCode.slice(1).length);
    if (
      !matchedCountry.keepTrunkPrefix
      && nationalDigits.startsWith("0")
      && (compact.startsWith("+") || compact.startsWith("00"))
    ) {
      digits = `${matchedCountry.callingCode.slice(1)}${nationalDigits.slice(1)}`;
    }

    if (!/^[1-9]\d{7,14}$/.test(digits)) return "";
    return `+${digits}`;
  }

  const api = Object.freeze({
    countries,
    countryForIso,
    normalisePhone,
  });

  if (typeof module === "object" && module.exports) module.exports = api;
  else global.OnSitePhone = api;
})(typeof globalThis === "object" ? globalThis : window);
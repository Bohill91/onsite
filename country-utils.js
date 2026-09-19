"use strict";

// ISO 3166-1 alpha-2 codes. Display names come from the platform's ICU
// data so the same validated code set is used by the browser and server.
const ISO_ALPHA2_CODES = Object.freeze(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" "),
);

const displayNames = typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["en"], { type: "region" })
  : null;

function countryName(iso2) {
  const code = String(iso2 || "").trim().toUpperCase();
  const name = displayNames?.of(code);
  return name && name !== code ? name : code;
}

const countries = Object.freeze(
  ISO_ALPHA2_CODES.map((iso2) => Object.freeze({ iso2, name: countryName(iso2) })),
);
const countriesByIso2 = new Map(countries.map((country) => [country.iso2, country]));

function findCountry(iso2) {
  return countriesByIso2.get(String(iso2 || "").trim().toUpperCase()) || null;
}

const api = Object.freeze({ ISO_ALPHA2_CODES, countries, findCountry });

if (typeof module !== "undefined" && module.exports) module.exports = api;
if (typeof window !== "undefined") window.OnSiteCountries = api;
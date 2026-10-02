import { getSubmitBaseUrl } from './constant.js';

/**
 * Get Full Name
 * @name getFullName Concats first name and last name
 * @param {string} firstname in Stringformat
 * @param {string} lastname in Stringformat
 * @return {string}
 */
function getFullName(firstname, lastname) {
  return `${firstname} ${lastname}`.trim();
}

/**
 * Custom submit function
 * @param {scope} globals
 */
function submitFormArrayToString(globals) {
  const data = globals.functions.exportData();
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key] = data[key].join(',');
    }
  });
  globals.functions.submitForm(data, true, 'application/json');
}

/**
 * Calculate the number of days between two dates.
 * @param {*} endDate
 * @param {*} startDate
 * @returns {number} returns the number of days between two dates
 */
function days(endDate, startDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // return zero if dates are valid
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffInMs = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

function isEmptyFieldValue(value) {
  return value === null || value === undefined
    || (typeof value === 'string' && value.trim() === '');
}

/**
 * Replaces empty/unfilled field values in a payload object with a default placeholder,
 * so every field that is part of the outbound payload always carries a value.
 * @param {object} obj - The payload object
 * @param {string} [defaultValue] - Placeholder used for empty fields
 * @returns {object} - A new object with empty values replaced
 */
function applyDefaultValues(obj, defaultValue = '-') {
  return Object.fromEntries(
    Object.entries(obj).map(
      ([key, value]) => [key, isEmptyFieldValue(value) ? defaultValue : value],
    ),
  );
}

/**
 * Removes top-level fields whose key contains "_exclude" from a payload object, then fills
 * any remaining empty/unfilled field with a default placeholder value.
 * @param {object} obj - The payload object
 * @returns {object} - A new object without the excluded fields, with empty fields defaulted
 */
function filterExcludeFields(obj) {
  const withoutExcluded = Object.fromEntries(
    Object.entries(obj).filter(([key]) => !key.includes('_exclude')),
  );
  return applyDefaultValues(withoutExcluded);
}

/**
 * Generates SHA256 hash of payload and returns Base64 encoded string
 *
 * @async
 * @param {object} payload - The payload object to hash
 * @returns {Promise<string>} - Base64 encoded SHA256 hash
 */
async function generatePayloadHash(payload) {
  try {
    // 1. Convert payload to compacted JSON string (no whitespace)
    const compactedBodyString = JSON.stringify(payload);

    // 2. Convert string to Uint8Array for hashing
    const encoder = new TextEncoder();
    const data = encoder.encode(compactedBodyString);

    // 3. Generate SHA256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // 4. Convert hash to Base64
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode.apply(null, hashArray));

    return hashBase64;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error generating payload hash:', error);
    return null;
  }
}

/**
 * Fetches CSRF token from the API
 *
 * @async
 * @returns {Promise<string|null>} - The CSRF token or null if fetch fails
 */
async function fetchCsrfToken() {
  try {
    const baseUrl = getSubmitBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/FormSubmissionService/forms/csrf/token`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (response.ok) {
      const data = await response.json();
      return data.token || data.csrfToken || data;
    }

    // eslint-disable-next-line no-console
    console.error('Failed to fetch CSRF token:', response.status);
    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching CSRF token:', error);
    return null;
  }
}

/**
 * Adds CSRF token to the form submission payload with headers.
 * Fetches the CSRF token from the API and adds it to X-CSRF-Token header.
 *
 * @async
 * @param {object} payload - Form submission payload (from $form.exportData())
 * @returns {Promise<object>} - Payload with CSRF token in { body, headers }
 *
 * @example
 * // Usage in submit button's click event in form JSON:
 * {
 *   "id": "submitButton",
 *   "fieldType": "button",
 *   "name": "submit",
 *   "label": { "value": "Submit" },
 *   "events": {
 *     "click": ["submitForm(await addCsrfToken($form.exportData()))"]
 *   }
 * }
 *
 * @example
 * // Usage with request function for API calls:
 * {
 *   "events": {
 *     "change": [
 *       "request('https://api.example.com/endpoint', 'POST',
 *        await addCsrfToken($form.exportData()),
 *        'custom:success', 'custom:error')"
 *     ]
 *   }
 * }
 */
async function addCsrfToken(payload) {
  const token = await fetchCsrfToken();

  if (token) {
    return {
      body: payload,
      headers: {
        'X-CSRF-Token': token,
      },
    };
  }

  // If token fetch fails, return payload as-is
  return payload;
}

/**
 * Adds a custom header to the form submission payload.
 * Use this to add any custom header (API keys, auth tokens) to submissions.
 *
 * @param {object} payload - Form submission payload or { body, headers }
 * @param {string} headerName - Header name (e.g., 'X-API-Key', 'Authorization')
 * @param {string} headerValue - The value of the header
 * @returns {object} - Payload with custom header in { body, headers } format
 *
 * @example
 * // Usage 1: Add single custom header on submit button click
 * {
 *   "id": "submitButton",
 *   "fieldType": "button",
 *   "events": {
 *     "click": [
 *       "submitForm(addCustomHeader($form.exportData(),
 *        'X-API-Key', 'your-api-key-here'))"
 *     ]
 *   }
 * }
 *
 * @example
 * // Usage 2: Chain with addCsrfToken to add both headers
 * {
 *   "events": {
 *     "click": [
 *       "submitForm(addCustomHeader(await addCsrfToken($form.exportData()),
 *        'X-Client-ID', 'client-123'))"
 *     ]
 *   }
 * }
 *
 * @example
 * // Usage 3: Add authorization header dynamically from form field
 * {
 *   "events": {
 *     "click": [
 *       "submitForm(addCustomHeader($form.exportData(),
 *        'Authorization', 'Bearer ' + authToken.$value))"
 *     ]
 *   }
 * }
 *
 * @example
 * // Usage 4: With request function for custom API calls
 * {
 *   "events": {
 *     "change": [
 *       "request('https://api.example.com/data', 'POST',
 *        addCustomHeader({data: $field.$value}, 'X-Request-ID', '12345'),
 *        'custom:success', 'custom:error')"
 *     ]
 *   }
 * }
 */
function addCustomHeader(payload, headerName, headerValue) {
  // If payload already has headers structure, merge with existing headers
  if (payload && typeof payload === 'object'
    && 'body' in payload && 'headers' in payload) {
    return {
      body: payload.body,
      headers: {
        ...payload.headers,
        [headerName]: headerValue,
      },
    };
  }

  // Otherwise, create new structure with headers
  return {
    body: payload,
    headers: {
      [headerName]: headerValue,
    },
  };
}

/**
 * Synchronously fetches the base URL for a given key from configs.json.
 * This is used in functions that need to run synchronously in the AEM Forms Rule Engine.
 *
 * @param {string} key - The config key to look up (e.g., 'get-province-en', 'cc-apply-status')
 * @returns {string} - The base URL from configs.json, or empty string if not found/error
 */
function getBaseUrl(key) {
  let baseUrl = '';
  const cfgXhr = new XMLHttpRequest();
  cfgXhr.open('GET', '/configs.json', false);
  cfgXhr.send(null);
  if (cfgXhr.status >= 200 && cfgXhr.status < 300) {
    try {
      const entry = JSON.parse(cfgXhr.responseText)
        .data?.find((c) => c.Key === key);
      baseUrl = entry?.Value || '';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('CcApplicationStatus: failed to read configs.json', e);
    }
  }

  if (!baseUrl) {
    // eslint-disable-next-line no-console
    console.error('CcApplicationStatus: failed to read configs.json');
    return '';
  }
  return baseUrl;
}

/**
* Fetches and normalizes province data.
* Expected API shape:
* [
*   { "Province": "Bangkok" },
*   { "Province": "Chiang Mai" }
* ]
*
* @private
* @returns {Array<{value: string, label: string}>}
*/
function getProvinceData() {
  const urlProvinceEnPath = getBaseUrl('get-province-en');
  const url = `${urlProvinceEnPath}`;
  const xhr = new XMLHttpRequest();

  xhr.open('GET', url, false);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(null);

  if (xhr.status < 200 || xhr.status >= 300) {
    return [];
  }

  const response = JSON.parse(xhr.responseText);

  if (!Array.isArray(response)) {
    return [];
  }

  return response
    .map((item) => {
      const province = item && item.Province ? String(item.Province) : '';

      return {
        value: province,
        label: province,
      };
    })
    .filter((item) => item.value !== '');
}

/**
* Returns the stored dropdown values for Province.
* Maps to enum.
*
* @name getProvinceEnum
* @returns {string[]}
*/
function getProvinceEnum() {
  const data = getProvinceData();
  return data.map((item) => item.value);
}

/**
* Returns the display labels for Province.
* Maps to enumNames.
*
* @name getProvinceEnumNames
* @returns {string[]}
*/
function getProvinceEnumNames() {
  const data = getProvinceData();
  return data.map((item) => item.label);
}

/**
* Fetches and normalizes province data in TH.
* Expected API shape:
* [
*   { "Province": "กรุงเทพมหานคร" },
*   { "Province": "กระบี่" }
* ]
*
* @private
* @returns {{value: string[], label: string[]}}
*/
function getProvinceDataTh() {
  const urlProvinceThPath = getBaseUrl('get-province-th');
  /* const baseUrl = configs.aemBaseUrl || ''; */
  const url = `${urlProvinceThPath}`;
  const xhr = new XMLHttpRequest();

  xhr.open('GET', url, false);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(null);

  if (xhr.status < 200 || xhr.status >= 300) {
    return [];
  }

  const response = JSON.parse(xhr.responseText);

  if (!Array.isArray(response)) {
    return [];
  }

  return response
    .map((item) => {
      const province = item && item.Province ? String(item.Province) : '';

      return {
        value: province,
        label: province,
      };
    })
    .filter((item) => item.value !== '');
}

/**
* Returns the stored dropdown values for Province.
* Maps to enum.
*
* @name getProvinceEnumTh
* @returns {string[]}
*/
function getProvinceEnumTh() {
  const data = getProvinceDataTh();
  return data.map((item) => item.value);
}

/**
* Returns the display labels for Province in Thai.
* Maps to enumNames.
*
* @name getProvinceEnumNamesTh
* @returns {string[]}
*/
function getProvinceEnumNamesTh() {
  const data = getProvinceDataTh();
  return data.map((item) => item.label);
}

/**
 * Fetches BBL branch locations for a given province.
 * Calls the LocationSearchService endpoint with BRC (Branch) type.
 * Supports both Thai ('th') and English ('en') language endpoints.
 *
 * @name fetchBranchesByProvince
 * @param {string} province - Province name matching the selected language
 * @param {string} [lang='th'] - Language code: 'th' for Thai, 'en' for English
 * @returns {Array} - Array of branch objects from the API, or [] on error
 *
 * @example
 * // Thai (default) — province value from getProvinceEnumTh
 * {
 *   "events": {
 *     "change": [
 *       "vars.branches = fetchBranchesByProvince($field.$value)",
 *       "$form.branchField.$enum = vars.branches.map(b => b.BranchNo)",
 *       "$form.branchField.$enumNames = vars.branches.map(b => b.BranchName)"
 *     ]
 *   }
 * }
 *
 * @example
 * // English — province value from getProvinceEnum
 * {
 *   "events": {
 *     "change": [
 *       "vars.branches = fetchBranchesByProvince($field.$value, 'en')",
 *       "$form.branchField.$enum = vars.branches.map(b => b.BranchNo)",
 *       "$form.branchField.$enumNames = vars.branches.map(b => b.BranchName)"
 *     ]
 *   }
 * }
 */
// Caches branch results per province+lang so repeated lookups for the same
// selection (e.g. the rule engine's own change handler and the district
// grouping watcher below both resolving the same province) reuse the
// response instead of firing another blocking XHR.
const branchesByProvinceCache = new Map();

function fetchBranchesByProvince(province, lang = 'th') {
  if (!province) return [];
  const cacheKey = `${lang}::${province}`;
  if (branchesByProvinceCache.has(cacheKey)) {
    return branchesByProvinceCache.get(cacheKey);
  }

  const branchesByProvinceUrl = getBaseUrl('branches-by-province');
  const provinceBaseUrl = branchesByProvinceUrl.endsWith('/')
    ? branchesByProvinceUrl : `${branchesByProvinceUrl}/`;
  const encoded = encodeURIComponent(province);
  const segment = lang === 'en' ? 'SearchThaiLandEnWithLocation' : 'SearchThaiLandThWithLocation';
  const url = `${provinceBaseUrl}${segment}/${encoded}/0/0/0/BRC`;

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(null);

  if (xhr.status < 200 || xhr.status >= 300) {
    // eslint-disable-next-line no-console
    console.error('Branches API error:', xhr.status, 'for province:', province);
    return [];
  }

  const data = JSON.parse(xhr.responseText);
  const result = Array.isArray(data) ? data : [];
  branchesByProvinceCache.set(cacheKey, result);
  return result;
}

/**
* Returns BranchNo values for a given province.
* Maps to enum for branch dropdown.
*
* @name getBranchEnum
* @param {string} province - Province name matching the selected language
* @param {string} [lang='th'] - Language code: 'th' for Thai, 'en' for English
* @returns {string[]}
*/
function getBranchEnum(province, lang = 'th') {
  const data = fetchBranchesByProvince(province, lang);
  return data.map((item) => item.BranchNo);
}

/**
* Returns BranchName display labels for a given province.
* Maps to enumNames for branch dropdown.
* NOTE: runs inside the Rule Engine's Web Worker (no DOM access), so no
* grouping logic happens here — see the main-thread polling below.
*
* @name getBranchEnumNames
* @param {string} province - Province name matching the selected language
* @param {string} [lang='th'] - Language code: 'th' for Thai, 'en' for English
* @returns {string[]}
*/
function getBranchEnumNames(province, lang = 'th') {
  const data = fetchBranchesByProvince(province, lang);
  return data.map((item) => item.BranchName);
}

// Wraps a select's <option> elements into <optgroup> by district, with
// districts sorted A-Z and branches within each district sorted A-Z.
// Works for both EN selects (value = BranchName) and TH selects (value = BranchNo).
// The district (Address3) is stored in a data-district attribute on each option so it
// can be read by getBranchDistrict() without changing the option's value attribute —
// leaving it unchanged keeps AEM Forms enum validation working correctly.
function applyBranchDistrictGroupingToSelect(selectEl, data) {
  // Build lookups by both BranchName and BranchNo so we handle EN and TH selects.
  const districtByBranchName = {};
  const districtByBranchNo = {};
  data.forEach((item) => {
    const district = item.Address3 ? String(item.Address3).trim() : '';
    if (item.BranchName) districtByBranchName[item.BranchName] = district;
    if (item.BranchNo) districtByBranchNo[String(item.BranchNo)] = district;
  });

  // Collator gives correct A-Z ordering for both Thai and English labels.
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

  // (district, then option label) so everything ends up A-Z.
  const entries = Array.from(selectEl.querySelectorAll('option'))
    .map((opt) => {
      const district = districtByBranchName[opt.value] || districtByBranchNo[opt.value] || '';
      return { opt, district };
    })
    .filter((entry) => entry.district !== '');

  entries.sort((a, b) => {
    const districtCompare = collator.compare(a.district, b.district);
    if (districtCompare !== 0) return districtCompare;
    return collator.compare(a.opt.textContent, b.opt.textContent);
  });

  let currentGroup = null;
  let currentDistrict = null;

  entries.forEach(({ opt, district }) => {
    // Store district in a data attribute — the value attribute is intentionally
    // left unchanged so AEM Forms enum validation continues to pass.
    // eslint-disable-next-line no-param-reassign
    opt.dataset.district = district;

    if (district !== currentDistrict) {
      currentGroup = document.createElement('optgroup');
      currentGroup.label = district;
      currentGroup.style.fontWeight = 'bold';
      selectEl.appendChild(currentGroup);
      currentDistrict = district;
    }
    currentGroup.appendChild(opt);
  });
}

// Tracks selects that have already been grouped so we don't process them twice.
// Uses a live DOM check: if the select already has <optgroup> children, it is
// considered grouped. When the form rule engine resets options (stripping
// optgroups), the check fails and the select is re-grouped automatically.

// Applies branch sorting/grouping to every matching unprocessed <select> in the DOM.
// Option values are never modified — district is stored in data-district attributes.
function applyBranchGroupingToAllMatching(data) {
  if (!data.length) return;
  const branchNames = new Set(data.map((item) => String(item.BranchName)));
  const branchNos = new Set(data.map((item) => String(item.BranchNo)));
  Array.from(document.querySelectorAll('select')).forEach((sel) => {
    // Already grouped — optgroups still in place, nothing to do.
    if (sel.querySelector('optgroup')) return;
    const optVals = Array.from(sel.options).map((o) => o.value).filter((v) => v !== '');
    const isMatch = optVals.length > 0
      && (optVals.every((v) => branchNames.has(v)) || optVals.every((v) => branchNos.has(v)));
    if (isMatch) {
      applyBranchDistrictGroupingToSelect(sel, data);
    }
  });
}

// Polls briefly on load, then installs a MutationObserver so any branch
// <select> that appears later (e.g. conditionally shown by a radio button)
// is also sorted and grouped.
function scheduleApplyBranchDistrictGroupingAuto(data) {
  if (!data.length) return;

  // Initial pass — run shortly after data is available.
  setTimeout(() => applyBranchGroupingToAllMatching(data), 0);

  // Watch for new/modified selects added to the DOM later.
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some((m) => m.addedNodes.length > 0 || m.type === 'attributes');
      if (hasNewNodes) applyBranchGroupingToAllMatching(data);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class'],
    });
  }
}

// The Rule Engine worker can't touch the DOM, and this form's custom
// dropdown widget may not dispatch real 'change' events — so instead of
// listening for events, poll each <select>'s value directly for changes.
// Only the page's own language is fetched here: the rule engine's change
// handler already fetches that language to populate enum/enumNames, and
// unconditionally also fetching the other language previously fired on
// every province change (e.g. an English province name against the
// Thai-language endpoint), which reliably returns an empty result.
if (typeof document !== 'undefined') {
  const lastValues = new Map();

  setInterval(() => {
    const lang = (document.documentElement.lang || 'en').toLowerCase().startsWith('th')
      ? 'th' : 'en';
    document.querySelectorAll('select').forEach((sel) => {
      const key = sel.name || sel.id;
      const prev = lastValues.get(key);
      const current = sel.value;

      if (current && current !== prev) {
        lastValues.set(key, current);
        const data = fetchBranchesByProvince(current, lang);
        if (data.length) {
          scheduleApplyBranchDistrictGroupingAuto(data);
        }
      }
    });
  }, 300);
}

/**
 * Validates Thai Citizen ID using the official algorithm
 * @name validateThaiCitizenID
 * @param {string} id - The 13-digit Thai Citizen ID to validate
 * @returns {boolean} - Returns true if the ID is valid, false otherwise
 *
 * @example
 * // Usage in form validation
 * validateThaiCitizenID('1234567890123') // returns true or false
 */
function validateThaiCitizenID(id) {
  if (
    id.length !== 13
    || id.charAt(0).match(/[09]/)
  ) return false;

  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += parseInt(id.charAt(i), 10) * (13 - i);
  }

  if ((11 - (sum % 11)) % 10 !== parseInt(id.charAt(12), 10)) {
    return false;
  }
  return true;
}

/**
 * Validates credit card number using the Luhn algorithm (Mod 10)
 * @name validateCreditCardNumber
 * @param {string|number} inputNum - The credit card number to validate
 * @returns {boolean} - Returns true if the credit card number is valid, false otherwise
 *
 * @example
 * // Usage in form validation
 * validateCreditCardNumber('4532015112830366') // returns true or false
 * validateCreditCardNumber(4532015112830366) // returns true or false
 */
function validateCreditCardNumber(inputNum) {
  if (inputNum.length < 16) {
    return false;
  }

  let flag = true;
  let sum = 0;
  const digits = (`${inputNum}`).split('').reverse();

  for (let i = 0; i < digits.length; i += 1) {
    let digit = digits[i];
    digit = parseInt(digit, 10);

    // eslint-disable-next-line no-cond-assign
    if ((flag = !flag)) {
      digit *= 2;
    }

    if (digit > 9) {
      digit -= 9;
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

// Module-level cache — set by CcApplicationStatus, read by getCcField
let ccLastResult = null;

/**
 * Fetches CC application status, picks the latest record when multiple are
 * returned, caches the full result, and returns NEW_TRANSAC_RESULT directly.
 * @param {string} idAndDob
 * @return {string}
 */
function CcApplicationStatus(idAndDob) {
  ccLastResult = null;

  // fetchConfigs() is async and accesses document/window — both unavailable
  // in the AEM Forms Rule Engine Web Worker. Read configs.json directly via
  // synchronous XHR instead (sync XHR is permitted in workers).
  const baseUrl = getBaseUrl('cc-apply-status');

  const xhr = new XMLHttpRequest();
  xhr.open('GET', `${baseUrl}?idAndDob=${encodeURIComponent(idAndDob)}`, false);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(null);

  if (xhr.status < 200 || xhr.status >= 300) {
    // eslint-disable-next-line no-console
    console.error('CcApplicationStatus API error:', xhr.status, xhr.statusText);
    return '';
  }

  let data;
  try {
    data = JSON.parse(xhr.responseText);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('CcApplicationStatus JSON parse error:', e);
    return '';
  }

  if (!Array.isArray(data) || data.length === 0) return '';

  let result;
  if (data.length === 1) {
    [result] = data;
  } else {
    const parseDate = (dateStr) => {
      if (!dateStr || dateStr.length !== 8) return new Date(0);
      const y = dateStr.substring(4, 8);
      const mo = dateStr.substring(2, 4);
      const d = dateStr.substring(0, 2);
      return new Date(`${y}-${mo}-${d}`);
    };
    result = data.reduce((best, current) => (
      parseDate(current.TRANSAC_DECISION_DATE) > parseDate(best.TRANSAC_DECISION_DATE)
        ? current : best
    ));
  }

  ccLastResult = result;
  return result.NEW_TRANSAC_RESULT ?? '';
}

/**
 * Returns a named field from the last CcApplicationStatus call.
 * @param {string} fieldName
 * @return {string}
 */
function getCcField(fieldName) {
  return ccLastResult?.[fieldName] ?? '';
}

// Module-level cache — set by fetchPlanData, read by
// getPlanField / getRiderField / getPlanError / getPlanErrorStatus
let fetchPlanDataResult = null;
let fetchPlanDataErrorMsg = '';
let fetchPlanDataErrorStatus = '';

/**
 * Fetches plan data and returns a single filtered plan based on prospectCategory and planTerm.
 *
 * Protection: planTerm is the planCode string directly — "8PWLBD", "12PWLBD", "16PWLBD"
 * Health: planTerm is the roomAndBoard value as a string — "1500", "2000", "3000", "4000"
 *
 * The matched plan object is cached in fetchPlanDataResult so getPlanField()
 * can retrieve individual fields without re-calling the API.
 *
 * @name fetchPlanData
 * @param {number} prospectAge
 * @param {string} prospectGender
 * @param {string} prospectCategory - "Protection" or "Health"
 * @param {number} prospectSA
 * @param {string|number} planTerm - planCode string (e.g. "8PWLBD") for Protection;
 *                                  roomAndBoard number (e.g. 1500) for Health
 * @return {string} JSON string of the matched plan, or empty string on failure
 */
function fetchPlanData(prospectAge, prospectGender, prospectCategory, prospectSA, planTerm) {
  fetchPlanDataResult = null;
  fetchPlanDataErrorMsg = '';
  fetchPlanDataErrorStatus = '';

  const baseUrl = getBaseUrl('fetch-plan-data');
  if (!baseUrl) {
    // eslint-disable-next-line no-console
    console.error('fetchPlanData: fetch-plan-data missing in configs.json');
    return '';
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', baseUrl, false);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'application/json');
  // Health uses "hospitalplan" key; Protection uses "prospectSA"
  const isHealth = String(prospectCategory).trim() === 'Health';
  const body = {
    prospectAge,
    prospectGender,
    prospectCategory,
    ...(isHealth ? { hospitalplan: String(planTerm) } : { prospectSA }),
  };

  try {
    xhr.send(JSON.stringify(body));
  } catch (e) {
    // Sync XHR throws NetworkError on CORS block or connectivity failure
    fetchPlanDataErrorMsg = e.message || 'Network error';
    fetchPlanDataErrorStatus = 'NetworkError';
    // eslint-disable-next-line no-console
    console.error('fetchPlanData network/CORS error:', e.message);
    return 'ERROR';
  }

  let response;
  try {
    response = JSON.parse(xhr.responseText);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('fetchPlanData JSON parse error (HTTP', xhr.status, '):', e);
    return '';
  }

  // Gateway / proxy error — e.g. BBL API layer returned HTTP 500
  // with { success: false, status: 500, message: "..." }
  if (response?.success === false) {
    fetchPlanDataErrorMsg = response.message || 'Unknown error';
    fetchPlanDataErrorStatus = String(response.status || 'Error');
    // eslint-disable-next-line no-console
    console.error('fetchPlanData gateway error:', fetchPlanDataErrorStatus, fetchPlanDataErrorMsg);
    return 'ERROR';
  }

  // AIA API-level error — { status: "ERROR", data: {}, errMsg: "..." }
  if (response?.status === 'ERROR') {
    fetchPlanDataErrorMsg = response.errMsg || 'Unknown error';
    fetchPlanDataErrorStatus = 'ERROR';
    // eslint-disable-next-line no-console
    console.error('fetchPlanData API returned ERROR:', fetchPlanDataErrorMsg);
    return 'ERROR';
  }

  const plans = response?.data?.plans;
  if (!Array.isArray(plans) || plans.length === 0) return '';

  const term = String(planTerm || '').trim();
  const category = String(prospectCategory || '').trim();
  let matched = null;

  if (category === 'Protection') {
    matched = plans.find((p) => p.planCode === term) ?? null;
  } else if (category === 'Health') {
    matched = plans.find((p) => p.rider?.[0]?.roomAndBoard === Number(planTerm)) ?? null;
  }

  if (!matched) {
    // eslint-disable-next-line no-console
    console.error('fetchPlanData: no plan matched for category', category, 'planTerm', term);
    return '';
  }

  fetchPlanDataResult = matched;
  return JSON.stringify(matched);
}

/**
 * Returns a named field from the last fetchPlanData call, formatted with
 * comma thousand separators when the value is purely numeric.
 * @name getPlanField
 * @param {string} fieldName - e.g. "premium", "rider.0.roomAndBoard"
 * @return {string}
 */
function getPlanField(fieldName) {
  if (!fetchPlanDataResult) return '';
  const value = String(fieldName).split('.')
    .reduce((obj, k) => (obj != null ? obj[k] : null), fetchPlanDataResult);

  if (value == null) return '';

  const strValue = String(value).trim();
  if (strValue === '') return '';

  const num = Number(strValue);
  if (!Number.isNaN(num)) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return strValue;
}

/**
 * Returns a named field from the rider matching riderCode in the last fetchPlanData result.
 * Returns defaultValue if the riderCode is absent from the rider array.
 * Purely numeric values are formatted with comma thousand separators
 * (no decimals). Non-numeric values (e.g. dashes, text) are returned as-is.
 *
 * @name getRiderField
 * @param {string} riderCode - e.g. "TI_Free", "ADBN8", "WP_FREE"
 * @param {string} fieldName - e.g. "riderSA", "riderName"
 * @param {string} [defaultValue] - returned when riderCode not found (default: '')
 * @return {string}
 */
function getRiderField(riderCode, fieldName, defaultValue) {
  const fallback = defaultValue != null ? String(defaultValue) : '';
  if (!fetchPlanDataResult) return fallback;
  const riders = fetchPlanDataResult.rider;
  if (!Array.isArray(riders)) return fallback;
  const rider = riders.find((r) => r.riderCode === riderCode);
  if (!rider) return fallback;
  const value = rider[fieldName];

  if (value == null) return fallback;

  const strValue = String(value).trim();
  if (strValue === '') return fallback;

  const num = Number(strValue);
  if (!Number.isNaN(num)) {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  return strValue;
}

/**
 * Returns the error message stored by the last fetchPlanData call that received
 * an ERROR status, or '' when the last call succeeded.
 *
 * @name getPlanError
 * @return {string}
 */
function getPlanError() {
  return fetchPlanDataErrorMsg;
}

/**
 * Returns the error status stored by the last fetchPlanData call:
 * "ERROR" for an AIA API-level error, the HTTP status code string (e.g. "500")
 * for a gateway error, or '' when the last call succeeded.
 *
 * @name getPlanErrorStatus
 * @return {string}
 */
function getPlanErrorStatus() {
  return fetchPlanDataErrorStatus;
}

/**
 * Fetches campaign details from the language-specific EDS spreadsheet and
 * returns the name and detail for the matching campaign ID.
 *
 * Spreadsheet path: /{language}/cc-campaign.json
 * Expected columns: campaignId, campaignName, campaignDetail
 *
 * @name fetchCcCampaignDetails
 * @param {string} campaignId - Campaign ID to look up
 * @param {string} language - Language code: 'th' or 'en'
 * @returns {{ campaignName: string, campaignDetail: string }}
 */
function fetchCcCampaignDetails(campaignId, language) {
  const DEFAULT_CAMPAIGN_NAME = 'CCWEBPIA04';
  const DEFAULT_CAMPAIGN_DETAIL = 'สมัครผ่านหน้าเว็บไซต์ธนาคารกรุงเทพ บัตรทั่วไป';

  if (!campaignId || !language) {
    return {
      campaignName: DEFAULT_CAMPAIGN_NAME,
      campaignDetail: DEFAULT_CAMPAIGN_DETAIL,
    };
  }

  const lang = String(language).toLowerCase() === 'en' ? 'en' : 'th';
  const url = `/${lang}/cc-campaign.json`;

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, false);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(null);

  if (xhr.status < 200 || xhr.status >= 300) {
    // eslint-disable-next-line no-console
    console.error('fetchCcCampaignDetails API error:', xhr.status, xhr.statusText);

    return {
      campaignName: DEFAULT_CAMPAIGN_NAME,
      campaignDetail: DEFAULT_CAMPAIGN_DETAIL,
    };
  }

  let data;
  try {
    const response = JSON.parse(xhr.responseText);
    data = response?.data ?? response;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('fetchCcCampaignDetails JSON parse error:', e);

    return {
      campaignName: DEFAULT_CAMPAIGN_NAME,
      campaignDetail: DEFAULT_CAMPAIGN_DETAIL,
    };
  }

  if (!Array.isArray(data)) {
    return {
      campaignName: DEFAULT_CAMPAIGN_NAME,
      campaignDetail: DEFAULT_CAMPAIGN_DETAIL,
    };
  }

  const campaign = data.find(
    (item) => String(item.campaignId) === String(campaignId),
  );

  if (!campaign) {
    return {
      campaignName: DEFAULT_CAMPAIGN_NAME,
      campaignDetail: DEFAULT_CAMPAIGN_DETAIL,
    };
  }

  return {
    campaignName: campaign.campaignName?.trim() || DEFAULT_CAMPAIGN_NAME,
    campaignDetail: campaign.campaignDetail?.trim() || DEFAULT_CAMPAIGN_DETAIL,
  };
}
function getidAndDob(id, dob) {
  const parts = dob.split(/[-/]/);
  // parts: [yyyy, mm, dd]  →  reorder to ddmmyyyy
  const ddmmyyyy = `${parts[2]}${parts[1]}${parts[0]}`;
  return `${id}${ddmmyyyy}`;
}

function convertThaiToEnglishDate(thaiDateString) {
  if (!thaiDateString) return null;

  const s = String(thaiDateString).trim();
  if (!s) return null;

  let year;
  let month; // 0-11 for JS Date
  let day;

  const m = s.match(/^(\d{3,4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    year = parseInt(m[1], 10);
    month = parseInt(m[2], 10) - 1;
    day = parseInt(m[3], 10);
  } else {
    const parsed = new Date(s);
    if (Number.isNaN(parsed.getTime())) return null;
    year = parsed.getFullYear();
    month = parsed.getMonth();
    day = parsed.getDate();
  }

  if (year >= 2400) year -= 543;

  const d = new Date(year, month, day);
  const valid = d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  if (!valid) return null;

  // Format as yyyy-mm-dd from LOCAL parts (not toISOString — that shifts to UTC)
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const SUM_INSURED_MIN = 300000;
const SUM_INSURED_MAX = 9999999;
const SUM_INSURED_MESSAGE = 'ทุนประกันภัยต้องอยู่ระหว่าง 300,000 ถึง 9,999,999 บาท';
const CUSTOM_RULES = {
  'sum-insured': {
    normalize: (value) => value.replace(/\D/g, ''),
    validate: (value) => {
      const amount = Number(value);
      return amount >= SUM_INSURED_MIN && amount <= SUM_INSURED_MAX;
    },
    message: SUM_INSURED_MESSAGE,
  },
};

/**
 * Formats sum-insured field with commas live as the user types,
 * caps at 7 digits, validates 300,000–9,999,999 range.
 *
 * @name formatAndValidateSumInsured
 * @returns {void}
 */
function formatAndValidateSumInsured() {
  if (typeof document === 'undefined') return;
  if (window.sumInsuredListenerAttached) return;
  window.sumInsuredListenerAttached = true;
  const CLASS_NAME = 'sum-insured';
  const MAX_DIGITS = 7;

  const isTarget = (el) => el.classList?.contains(CLASS_NAME) || el.closest(`.${CLASS_NAME}`);
  const digitsOnly = (v) => v.replace(/\D/g, '');
  const withCommas = (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const validate = (input, digits) => {
    const num = Number(digits);
    const isInvalid = digits !== '' && (num < SUM_INSURED_MIN || num > SUM_INSURED_MAX);
    input.dataset.preserveCustomValidity = String(isInvalid);
    input.setCustomValidity(isInvalid ? SUM_INSURED_MESSAGE : '');
  };

  const applyValue = (input, formatValue) => {
    if (input.type !== 'text') {
      input.type = 'text';
      input.setAttribute('inputmode', 'numeric');
    }

    const digits = digitsOnly(input.value).slice(0, MAX_DIGITS);
    const nextValue = formatValue ? withCommas(digits) : digits;

    if (input.value !== nextValue) {
      input.value = nextValue;
      if (document.activeElement === input) {
        input.setSelectionRange(nextValue.length, nextValue.length);
      }
    }

    validate(input, digits);
  };

  const handler = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !isTarget(input)) return;
    applyValue(input, event.type === 'blur');
  };

  ['input', 'keyup', 'blur'].forEach((type) => {
    document.addEventListener(type, handler, true);
  });
}
formatAndValidateSumInsured();

function replaceOtherAndJoin(selectedValues, otherText) {
  if (!selectedValues) {
    return '';
  }
  const parsed = typeof selectedValues === 'string' ? JSON.parse(selectedValues) : selectedValues;
  const values = parsed.filter((value) => value !== 'Other (please specify)');
  if (otherText && otherText.trim()) {
    values.push(otherText.trim());
  }
  return values.join(', ');
}

function getSelectedLabelFromDropdown(dropdown) {
  if (!dropdown || !dropdown.options) {
    return '';
  }
  return dropdown.options[dropdown.selectedIndex].text.trim();
}

/**
 * Formats date, hour, and minute inputs into a single datetime string.
 * Accepts date in "yyyy-mm-dd" or "dd/mm/yyyy" format, and hour/minute as separate inputs.
 * Transforms the date portion to YYYY-MM-DD format.
 * Returns formatted string like "2024-01-05 14:30:00".
 *
 * @name formatDateTime
 * @param {string} date - Date string in "yyyy-mm-dd" or "dd/mm/yyyy" format
 * @param {string|number} hour - Hour component (0-23)
 * @param {string|number} minute - Minute component (0-59)
 * @returns {string} Formatted datetime string (YYYY-MM-DD HH:mm:ss) or empty string if inputs
 *   are invalid
 *
 * @example
 * formatDateTime("2024-01-05", "14", "30") // returns "2024-01-05 14:30:00"
 * formatDateTime("05/01/2024", "14", "30") // returns "2024-01-05 14:30:00"
 * formatDateTime("invalid", "14", "30") // returns ""
 * formatDateTime("2024-01-05", "", "30") // returns ""
 */
function formatDateTime(date, hour, minute) {
  if (!date || !hour || !minute) return '';
  let day;
  let month;
  let year;

  if (String(date).includes('-')) {
    [year, month, day] = String(date).split('-');
  } else {
    [day, month, year] = String(date).split('/');
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const formattedDate = `${year}-${mm}-${dd}`;

  return `${formattedDate} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

/**
* @name updateTextCount
* @param {object} passportNumber - Passport Number field object
* @returns {string} Character count in format x/4
*/
function updateTextCount(passportNumber) {
  const count = String(passportNumber?.$value || '').length;
  return `${count}/4`;
}

/**
 * Reads the district (Address3) stored in the data-district attribute of the
 * currently selected <option> in a branch dropdown.
 * Call this from the form's change event after applyBranchDistrictGroupingToSelect
 * has run, to retrieve the district without altering the field's submitted value.
 *
 * @name getBranchDistrict
 * @param {string} selectNameOrId - The name or id attribute of the branch <select> element
 * @returns {string} The district of the selected branch, or '' if not found
 *
 * @example
 * // In a form rule (Set Value on a hidden district field):
 * getBranchDistrict('branch')   // returns e.g. "Bang Rak"
 */
function getBranchDistrict(selectNameOrId) {
  if (typeof document === 'undefined') return '';
  const sel = document.querySelector(
    `select[name="${selectNameOrId}"], select#${selectNameOrId}`,
  );
  if (!sel) return '';
  const selectedOpt = sel.options[sel.selectedIndex];
  return selectedOpt ? (selectedOpt.dataset.district || '') : '';
}

/**
 * Concatenates province, branch, and Address3 into a single descriptive string.
 *
 * Pass province and branch as plain strings. Address3 (sub-district / tambon)
 * is read automatically from the branchesByProvinceCache that is populated
 * when the province dropdown changes. If Address3 is absent from the payload
 * for the selected branch the segment is silently omitted.
 *
 * Result: "<province> | <branch> | <Address3>"
 * Any segment that is empty or whitespace-only is silently omitted.
 *
 * @name getConcatenatedBranchInfo
 * @param {string} province    - The selected province value
 * @param {string} branch      - The selected branch value (plain, as stored in $enum)
 * @param {string} [separator] - Separator between segments (default: " | ")
 * @returns {string} Concatenated string, or empty string when all inputs are empty.
 *
 * @example
 * getConcatenatedBranchInfo('Krabi', 'Ao Luk Branch')
 * // => "Krabi | Ao Luk Branch | Ao Luek"   (Address3 auto-resolved from cache)
 *
 * @example
 * // Branch whose Address3 is absent from the API payload:
 * getConcatenatedBranchInfo('Bangkok', 'Some Branch')
 * // => "Bangkok | Some Branch"             (Address3 segment omitted gracefully)
 */
function getConcatenatedBranchInfo(province, branch, separator = ' | ') {
  // The AEM Forms Rule Engine may pass field objects instead of plain strings.
  // Extract .$value when that happens.
  const resolveVal = (v) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return String(v.$value ?? '');
    return String(v);
  };

  const prov = resolveVal(province).trim();
  const br = resolveVal(branch).trim();

  // Resolve Address3 from the in-memory cache first (Strategy 1),
  // then fall back to a direct API fetch (Strategy 2) when the cache
  // has not yet been populated (e.g. Rule Engine Web Worker context).
  // If Address3 is absent from the branch payload, address3 stays '' and
  // the segment is omitted from the output — no error is thrown.
  let address3 = '';

  if (br) {
    // Strategy 1: search every cached dataset (province-keyed, lang-keyed).
    branchesByProvinceCache.forEach((cachedData) => {
      if (address3) return; // stop once found
      const match = cachedData.find(
        (item) => item.BranchName === br || String(item.BranchNo) === br,
      );
      // Use Address3 only when it is a non-empty string in the payload.
      if (match && match.Address3 && String(match.Address3).trim() !== '') {
        address3 = String(match.Address3).trim();
      }
    });

    // Strategy 2: cache empty — fetch directly (sync XHR, works in workers too).
    if (!address3 && prov) {
      ['en', 'th'].some((lang) => {
        const data = fetchBranchesByProvince(prov, lang);
        if (!data.length) return false;
        const match = data.find(
          (item) => item.BranchName === br || String(item.BranchNo) === br,
        );
        if (match && match.Address3 && String(match.Address3).trim() !== '') {
          address3 = String(match.Address3).trim();
          return true;
        }
        return false;
      });
    }
  }

  // Build result: omit any segment that is empty/whitespace.
  return [prov, br, address3]
    .filter((segment) => segment !== '')
    .join(separator);
}

/**
 * Returns the label name of the selected option in a dropdown.
 * @param {string} dropdown - The dropdown value string
 * @returns {string} The label name of the selected option
 */
function getSelectedLabelName(dropdown) {
  if (!dropdown) {
    return '';
  }
  const parts = String(dropdown).split('|');
  return parts.length > 1 ? parts[1].trim() : '';
}

/**
 * Returns the value of the selected option in a dropdown.
 * @param {string} dropdown - The dropdown value string
 * @returns {string} The value of the selected option
 */
function getSelectedLabelValue(dropdown) {
  if (!dropdown) {
    return '';
  }
  const parts = String(dropdown).split('|');
  return parts.length > 0 ? parts[0].trim() : '';
}

/**
* Returns BranchName display labels for a given province.
* Maps to enumNames for branch dropdown.
*
* @name getCampaignNames
* @param {string} campaignId - Campaign ID to look up in the campaign details JSON
* @param {string} [lang='th'] - Language code: 'th' for Thai, 'en' for English
* @returns {string}
*/
function getCampaignNames(campaignId, lang = 'th') {
  const data = fetchCcCampaignDetails(campaignId, lang);
  return data.campaignName;
}

/**
* Returns CampaignDetail for a given campaign ID.
*
* @name getCampaignDetails
* @param {string} campaignId - Campaign ID to look up in the campaign details JSON
* @param {string} [lang='th'] - Language code: 'th' for Thai, 'en' for English
* @returns {string}
*/
function getCampaignDetails(campaignId, lang = 'th') {
  const data = fetchCcCampaignDetails(campaignId, lang);
  return data.campaignDetail;
}

/**
 * Returns true when the number of selected checkbox values does not exceed maxCount.
 * Use as the expression in a Validate rule on a checkbox-group field so the form
 * blocks submission when too many options are selected.
 *
 * UE Validate expression:  validateMaxCheckbox($field, 3)
 *
 * @name validateMaxCheckbox
 * @param {string[]} selected - The checkbox-group value (array of selected values)
 * @param {number} maxCount - Maximum allowed selections
 * @return {boolean}
 */
function validateMaxCheckbox(selected, maxCount) {
  const arr = Array.isArray(selected) ? selected : [];
  return arr.length <= Number(maxCount);
}

/**
 * Replaces the "Other" selection in a checkbox-group value with the
 * user-typed free-text value, so the review/summary panel shows the typed
 *
 * @name replaceother
 * @param {string[]|string} selectedValues - Checkbox-group value, either as
 * @param {string} otherText - The free-text value typed in the "please
 *   specify" field
 * @returns {string} Comma-separated string of selected values, with any
 *   "Other" entry replaced by the typed text
 */
function replaceother(selectedValues, otherText) {
  if (!selectedValues) return '';

  let parts;
  try {
    parts = typeof selectedValues === 'string' ? JSON.parse(selectedValues) : selectedValues;
  } catch (e) {
    parts = String(selectedValues)
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((s) => s.replace(/^"|"$/g, '').trim());
  }

  const otherLabels = ['Others', 'Other', 'อื่น ๆ (โปรดระบุ)'];
  const typed = (otherText || '').trim();

  return parts
    .map((part) => {
      const trimmedPart = String(part).trim();
      const isOtherLabel = otherLabels.includes(trimmedPart)
        || trimmedPart.indexOf('อื่น') === 0
        || trimmedPart.indexOf('Other') === 0;
      return isOtherLabel && typed !== '' ? typed : trimmedPart;
    })
    .join(', ');
}

/**
 * Restricts input characters based on CSS classes on the input or its ancestors:
 * - `number-only`  → digits only
 * - `english-only` → English letters only (a-z, A-Z)
 * - both classes   → digits and English letters
 *
 * @name restrictNumberOnlyInputs
 * @returns {void}
 */
function restrictNumberOnlyInputs() {
  if (typeof document === 'undefined') return;
  document.addEventListener('beforeinput', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    const isNumberOnly = input.classList.contains('number-only')
      || input.closest('.number-only') !== null;
    const isEnglishOnly = input.classList.contains('english-only')
      || input.closest('.english-only') !== null;
    if (!isNumberOnly && !isEnglishOnly) {
      return;
    }
    const insertingTypes = [
      'insertText', 'insertFromPaste', 'insertFromDrop', 'insertCompositionText',
    ];
    if (!insertingTypes.includes(event.inputType)) {
      return;
    }
    if (event.data === null) return;
    let pattern;
    if (isNumberOnly && isEnglishOnly) {
      pattern = /[^a-zA-Z0-9]/;
    } else if (isNumberOnly) {
      pattern = /\D/;
    } else {
      pattern = /[^a-zA-Z]/;
    }
    if (pattern.test(event.data)) {
      event.preventDefault();
    }
  });
}
restrictNumberOnlyInputs();

/**
 * Generic live validation for form fields. Reads independent properties
 * (required, minlength, maxlength, pattern, min/max) from the control and the
 * matching error messages from the field wrapper's dataset, then shows the
 * result in the wrapper's `.field-description`.
 *
 * Supports input, textarea, select, checkbox, and custom widgets whose value
 * lives in a hidden input (e.g. the Thai date-of-birth picker).
 *
 * @name validateFieldInputs
 * @returns {void}
 */
function validateFieldInputs() {
  if (typeof document === 'undefined') return;

  const DEFAULT_MESSAGES = {
    required: 'This field is required.',
    minLength: 'Value is too short.',
    maxLength: 'Value is too long.',
    pattern: 'Please enter a valid value.',
    range: 'Value is out of range.',
    custom: 'Please enter a valid value.',
  };

  const SKIP_TYPES = ['radio', 'button', 'submit', 'reset', 'file'];
  const CONTROL_SELECTOR = 'input, select, textarea';

  const getMessage = (wrapper, key) => wrapper.dataset[`${key}ErrorMessage`]
    || DEFAULT_MESSAGES[key];

  const getCustomRule = (control) => {
    const cls = Object.keys(CUSTOM_RULES).find(
      (name) => control.classList.contains(name) || control.closest(`.${name}`) !== null,
    );
    return cls ? CUSTOM_RULES[cls] : null;
  };

  /**
   * Resolves the value-holding control for an event target. If the target is
   * a real control, use it. Otherwise (e.g. a div role="button" trigger),
   * fall back to the control inside the same field wrapper, such as the
   * hidden input used by the date picker.
   */
  const resolveControl = (target) => {
    if (!(target instanceof Element)) return null;
    let control = target.matches(CONTROL_SELECTOR)
      ? target
      : target.closest('.field-wrapper')?.querySelector(CONTROL_SELECTOR);
    if (!control || SKIP_TYPES.includes(control.type)) control = null;
    return control;
  };

  /** Returns an error message, or '' when the value is valid. */
  const getError = (control, wrapper) => {
    const touched = !!control.dataset.touched;

    if (control.type === 'checkbox') {
      return control.required && touched && !control.checked
        ? getMessage(wrapper, 'required')
        : '';
    }

    const { value } = control;
    const rule = getCustomRule(control);
    const validationValue = rule?.normalize ? rule.normalize(value) : value;
    const isEmpty = validationValue.trim() === '' && !control.validity.badInput;

    if (isEmpty) {
      // Only complain about required once the user has interacted with the field
      return (control.required || wrapper.dataset.required === 'true') && touched
        ? getMessage(wrapper, 'required')
        : '';
    }

    // type="number" returns '' for junk input, so check badInput explicitly
    if (control.validity.badInput) return getMessage(wrapper, 'range');

    const min = parseInt(control.getAttribute('minlength'), 10);
    const max = parseInt(control.getAttribute('maxlength'), 10);
    if (!Number.isNaN(min) && validationValue.length < min) {
      return getMessage(wrapper, 'minLength');
    }
    if (!Number.isNaN(max) && validationValue.length > max) {
      return getMessage(wrapper, 'maxLength');
    }
    if (control.type === 'number') {
      const num = Number(validationValue);
      const lo = control.min !== '' ? Number(control.min) : null;
      const hi = control.max !== '' ? Number(control.max) : null;
      if ((lo !== null && num < lo) || (hi !== null && num > hi)) {
        return getMessage(wrapper, 'range');
      }
    }

    const pattern = control.getAttribute('pattern');
    if (pattern) {
      try {
        if (!new RegExp(pattern).test(validationValue)) return getMessage(wrapper, 'pattern');
      } catch (e) {
        // Invalid regex configured by the author: don't block the user
      }
    }

    if (rule && !rule.validate(validationValue, control)) {
      return rule.message || getMessage(wrapper, 'custom');
    }
    return '';
  };

  const runCheck = (control) => {
    const wrapper = control.closest('.field-wrapper');
    if (!wrapper) return;

    let description = wrapper.querySelector('.field-description');
    if (!description) {
      description = document.createElement('div');
      description.className = 'field-description';
      description.setAttribute('aria-live', 'polite');
      wrapper.appendChild(description);
    }

    const message = getError(control, wrapper);

    if (message) {
      wrapper.classList.add('field-invalid');
      description.textContent = message;
    } else {
      wrapper.classList.remove('field-invalid');
      if (wrapper.dataset.description) {
        description.innerHTML = wrapper.dataset.description;
      } else {
        description.textContent = '';
      }
    }
  };

  const handler = (event) => {
    const control = resolveControl(event.target);
    if (!control) return;
    const wrapper = control.closest('.field-wrapper');

    if (event.type === 'blur') {
      // Moving between parts of one widget (day -> month -> year) is not
      // "leaving the field", so don't flag it yet.
      if (wrapper && wrapper.contains(event.relatedTarget)) return;
      control.dataset.touched = 'true';
    } else if (event.type === 'input' || event.type === 'change') {
      control.dataset.touched = 'true';
    }
    runCheck(control);
  };

  ['input', 'keyup', 'blur', 'change'].forEach((type) => {
    document.addEventListener(type, handler, true);
  });
}
validateFieldInputs();

/**
 * Validates that a numeric-range field's value stays within 11–75, live,
 * on typing (input/keyup) and on blur, targeting fields marked with the
 * `age-range` CSS class on the input or its ancestors. Listening on
 * multiple events guards against edge cases where a single event type
 * doesn't fire reliably (e.g. paste, fast typing, or first interaction
 * right after the field is dynamically inserted into the DOM).
 *
 * @name validateAgeRangeInputs
 * @returns {void}
 */
function validateAgeRangeInputs() {
  if (typeof document === 'undefined') return;

  const MIN = 11;
  const MAX = 75;
  const MESSAGE = 'อายุต้องอยู่ระหว่าง 11-75 ปี';

  const runCheck = (input) => {
    const wrapper = input.closest('.field-wrapper');
    if (!wrapper) return;

    let description = wrapper.querySelector('.field-description');
    if (!description) {
      description = document.createElement('div');
      description.className = 'field-description';
      description.setAttribute('aria-live', 'polite');
      wrapper.appendChild(description);
    }

    const num = Number(input.value);
    const isInvalid = input.value !== '' && (Number.isNaN(num) || num < MIN || num > MAX);

    if (isInvalid) {
      wrapper.classList.add('field-invalid');
      description.textContent = MESSAGE;
    } else {
      wrapper.classList.remove('field-invalid');
      if (wrapper.dataset.description) {
        description.innerHTML = wrapper.dataset.description;
      } else {
        description.textContent = '';
      }
    }
  };

  const handler = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const isAgeRange = input.classList.contains('age-range')
      || input.closest('.age-range') !== null;
    if (!isAgeRange) return;
    runCheck(input);
  };

  ['input', 'keyup', 'blur'].forEach((type) => {
    document.addEventListener(type, handler, true);
  });
}
validateAgeRangeInputs();

/**
 * Formats a number with comma separators
 * @name formatNumberWithCommas
 * @param {string} value - The numeric value to format
 * @return {string}
 */
function formatNumberWithCommas(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/**
 * Validates that a numeric-range field's value stays within 1–75
 *
 * @name validateAgeInputRange
 * @returns {void}
 */
function validateAge() {
  if (typeof document === 'undefined') return;

  const MIN = 1;
  const MAX = 75;
  const MESSAGE = 'อายุต้องอยู่ระหว่าง 1-75 ปี';

  const runCheck = (input) => {
    const wrapper = input.closest('.field-wrapper');
    if (!wrapper) return;

    let description = wrapper.querySelector('.field-description');
    if (!description) {
      description = document.createElement('div');
      description.className = 'field-description';
      description.setAttribute('aria-live', 'polite');
      wrapper.appendChild(description);
    }

    const num = Number(input.value);
    const isInvalid = input.value !== '' && (Number.isNaN(num) || num < MIN || num > MAX);

    if (isInvalid) {
      wrapper.classList.add('field-invalid');
      description.textContent = MESSAGE;
    } else {
      wrapper.classList.remove('field-invalid');
      if (wrapper.dataset.description) {
        description.innerHTML = wrapper.dataset.description;
      } else {
        description.textContent = '';
      }
    }
  };

  const handler = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const isAgeLimit = input.classList.contains('age-limit')
      || input.closest('.age-limit') !== null;
    if (!isAgeLimit) return;
    runCheck(input);
  };

  ['input', 'keyup', 'blur'].forEach((type) => {
    document.addEventListener(type, handler, true);
  });
}
validateAge();

/**
 * Preserves field unit/description labels (e.g. "Baht/Month", "Baht/Year")
 * so they remain visible even when the AEM Forms Rule Engine overwrites the
 * Only applies to fields marked with the `preserve-unit-label` CSS class.
 *
 * @name preserveFieldUnitLabels
 * @returns {void}
 */
function preserveFieldUnitLabels() {
  if (typeof document === 'undefined') return;

  const initWrapper = (wrapper) => {
    if (wrapper.dataset.unitLabelInit === 'true') return;

    const rawDescription = wrapper.getAttribute('data-description');
    if (!rawDescription) return;

    const temp = document.createElement('div');
    temp.innerHTML = rawDescription;
    const unitText = temp.textContent.trim();
    if (!unitText) return;

    const computedPosition = window.getComputedStyle(wrapper).position;
    if (computedPosition === 'static') {
      wrapper.style.position = 'relative';
    }

    const unitLabel = document.createElement('span');
    unitLabel.className = 'field-unit-label';
    unitLabel.textContent = unitText;
    unitLabel.style.position = 'absolute';
    unitLabel.style.right = '0';
    unitLabel.style.top = '3.2rem';
    unitLabel.style.color = 'var(--bbl-color-gray-800)';
    unitLabel.style.fontSize = '0.875rem';
    unitLabel.style.pointerEvents = 'none';
    unitLabel.style.background = 'transparent';

    wrapper.appendChild(unitLabel);

    // Hide the original description text ONLY while it still shows the
    // original unit text (e.g. "Baht/Month"), so it never overlaps our
    // cloned label. Once the Rule Engine overwrites it with a validation
    // error, its text no longer matches, so it becomes visible again.
    const originalDescription = wrapper.querySelector('.field-description');
    if (originalDescription && originalDescription.textContent.trim() === unitText) {
      originalDescription.style.display = 'none';
    }

    wrapper.dataset.unitLabelInit = 'true';
  };

  const scan = () => {
    const selector = '.field-wrapper.preserve-unit-label[data-description]';
    document.querySelectorAll(selector).forEach((wrapper) => {
      initWrapper(wrapper);

      // Re-check on every scan: toggle the original description's
      // visibility based on whether it currently holds the original
      // unit text or a validation error message.
      const originalDescription = wrapper.querySelector('.field-description');
      const unitLabel = wrapper.querySelector('.field-unit-label');
      if (originalDescription && unitLabel) {
        const isOriginalText = originalDescription.textContent.trim()
          === unitLabel.textContent.trim();
        originalDescription.style.display = isOriginalText ? 'none' : '';
      }
    });
  };

  scan();

  const observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true });
}
preserveFieldUnitLabels();

/**
 * Restricts a numeric field's value to digits only, capped at either 12
 * or 10 digits depending on the CSS class applied, and formats the value
 * with thousand-separator commas once the field loses focus. Targets
 * fields marked with the `number-max-12` or `number-max-10` CSS class on
 *
 * @name formatCommaInputs
 * @returns {void}
 */
function formatCommaInputs() {
  if (typeof document === 'undefined') return;

  const CLASS_LIMITS = {
    'number-max-12': 12,
    'number-max-10': 10,
  };

  const getMaxDigits = (input) => {
    let result = null;
    Object.keys(CLASS_LIMITS).forEach((className) => {
      if (result !== null) return;
      if (input.classList.contains(className) || input.closest(`.${className}`) !== null) {
        result = CLASS_LIMITS[className];
      }
    });
    return result;
  };

  const stripCommas = (value) => value.replace(/,/g, '');

  const stripNonDigits = (value) => value.replace(/\D/g, '');

  const addCommas = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  const runSanitize = (input, maxDigits) => {
    let digits = stripNonDigits(input.value);
    if (digits.length > maxDigits) {
      digits = digits.slice(0, maxDigits);
    }
    input.value = digits;
  };

  const runFormat = (input, maxDigits) => {
    const digits = stripNonDigits(input.value).slice(0, maxDigits);
    input.value = addCommas(digits);
  };

  const runUnformat = (input) => {
    input.value = stripCommas(input.value);
  };

  const handler = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const maxDigits = getMaxDigits(input);
    if (maxDigits === null) return;

    switch (event.type) {
      case 'focus':
        runUnformat(input);
        break;
      case 'input':
      case 'keyup':
        runSanitize(input, maxDigits);
        break;
      case 'blur':
        runFormat(input, maxDigits);
        break;
      default:
        break;
    }
  };

  const keydownHandler = (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const maxDigits = getMaxDigits(input);
    if (maxDigits === null) return;

    const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (controlKeys.includes(event.key)) return;

    const isDigit = /^\d$/.test(event.key);
    const currentDigits = stripNonDigits(input.value).length;
    if (!isDigit || currentDigits >= maxDigits) {
      event.preventDefault();
    }
  };

  ['focus', 'input', 'keyup', 'blur'].forEach((type) => {
    document.addEventListener(type, handler, true);
  });
  document.addEventListener('keydown', keydownHandler, true);
}
formatCommaInputs();

/**
 * Restricts `gpa-only` inputs to digits and one decimal point, max 4 chars.
 * @name restrictGpaOnlyInputs
 * @returns {void}
 */
function restrictGpaOnlyInputs() {
  if (typeof document === 'undefined') return;
  document.addEventListener('keydown', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.closest('.gpa-only')) return;
    if (event.ctrlKey || event.metaKey || event.key.length !== 1) return;
    const value = input.value.slice(0, input.selectionStart)
    + event.key + input.value.slice(input.selectionEnd);
    if (!/^[0-9.]{0,4}$/.test(value) || (value.match(/\./g) || []).length > 1) {
      event.preventDefault();
    }
  }, true);
}
restrictGpaOnlyInputs();

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName,
  days,
  submitFormArrayToString,
  getProvinceEnum,
  getProvinceEnumNames,
  getProvinceEnumTh,
  getProvinceEnumNamesTh,
  validateThaiCitizenID,
  validateCreditCardNumber,
  fetchCsrfToken,
  addCsrfToken,
  addCustomHeader,
  filterExcludeFields,
  applyDefaultValues,
  generatePayloadHash,
  fetchBranchesByProvince,
  getBranchEnum,
  getBranchEnumNames,
  getidAndDob,
  convertThaiToEnglishDate,
  replaceOtherAndJoin,
  getSelectedLabelFromDropdown,
  CcApplicationStatus,
  getCcField,
  fetchPlanData,
  getPlanField,
  getRiderField,
  getPlanError,
  getPlanErrorStatus,
  getCampaignDetails,
  getCampaignNames,
  formatDateTime,
  updateTextCount,
  getSelectedLabelName,
  getSelectedLabelValue,
  getBranchDistrict,
  getConcatenatedBranchInfo,
  validateMaxCheckbox,
  replaceother,
  formatNumberWithCommas,
};

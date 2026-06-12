import { getSubmitBaseUrl } from './constant.js';
import { fetchConfigs } from '../../scripts/config.js';

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
  const configs = fetchConfigs();
  /* const baseUrl = configs.aemBaseUrl ||''; */
  const urlPath = configs.getProvinceEn;
  const url = `${urlPath}`;
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
  const configs = fetchConfigs();
  const urlPath = configs.getprovinceth;
  /* const baseUrl = configs.aemBaseUrl || ''; */
  const url = `${urlPath}`;
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
function fetchBranchesByProvince(province, lang = 'th') {
  if (!province) return [];
  const configs = fetchConfigs();
  const ProvinceBaseUrl = configs.branchesByProvince;
  const encoded = encodeURIComponent(province);
  const segment = lang === 'en' ? 'SearchThaiLandEnWithLocation' : 'SearchThaiLandThWithLocation';
  const url = `${ProvinceBaseUrl}${segment}/${encoded}/0/0/0/BRC`;

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
  return Array.isArray(data) ? data : [];
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
  let baseUrl = '';
  const cfgXhr = new XMLHttpRequest();
  cfgXhr.open('GET', '/configs.json', false);
  cfgXhr.send(null);
  if (cfgXhr.status >= 200 && cfgXhr.status < 300) {
    try {
      const entry = JSON.parse(cfgXhr.responseText)
        .data?.find((c) => c.Key === 'cc-apply-status');
      baseUrl = entry?.Value || '';
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('CcApplicationStatus: failed to read configs.json', e);
    }
  }

  if (!baseUrl) {
    // eslint-disable-next-line no-console
    console.error('CcApplicationStatus: cc-apply-status missing in configs.json');
    return '';
  }

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
      return new Date(`${dateStr.substring(4, 8)}-${dateStr.substring(2, 4)}-${dateStr.substring(0, 2)}`);
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

function getidAndDob(id, dob) {
  console.log('id', id);
  console.log('dob', dob);
  const parts = dob.split(/[-/]/);
  // parts: [yyyy, mm, dd]  →  reorder to ddmmyyyy
  const ddmmyyyy = `${parts[2]}${parts[1]}${parts[0]}`;
  return `${id}${ddmmyyyy}`;
}

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
 * Formats date and time inputs into a single datetime string.
 * Accepts date in "yyyy-mm-dd" or "dd/mm/yyyy" format, and hour/minute as separate inputs.
 * Returns formatted string like "5 January 2024 14:30:00".
 *
 * @name formatDateTime
 * @param {string} date - Date string in "yyyy-mm-dd" or "dd/mm/yyyy" format
 * @param {string|number} hour - Hour component (0-23)
 * @param {string|number} minute - Minute component (0-59)
 * @returns {string} Formatted datetime string or empty string if inputs are invalid
 *
 * @example
 * formatDateTime("2024-01-05", "14", "30") // returns "5 January 2024 14:30:00"
 * formatDateTime("05/01/2024", "14", "30") // returns "5 January 2024 14:30:00"
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
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return `${Number(day)} ${months[Number(month) - 1]} ${year} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
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
  generatePayloadHash,
  fetchBranchesByProvince,
  getBranchEnum,
  getBranchEnumNames,
  getidAndDob,
  replaceOtherAndJoin,
  getSelectedLabelFromDropdown,
  CcApplicationStatus,
  getCcField,
  formatDateTime,
  updateTextCount,
};

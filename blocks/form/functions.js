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
 * Fetches province names in English from the LocationSearchService API.
 * This function retrieves a list of provinces from the backend service and returns them as an array.
 * Returns an empty array if the fetch fails or encounters an error.
 *
 * @async
 * @returns {Promise<Array<string>>} - Array of province names (strings) or empty array on error
 *
 * @example
 * // Usage 1: Populate a dropdown field with provinces on form load
 * {
 *   "fieldType": "drop-down",
 *   "name": "province",
 *   "label": { "value": "Select Province" },
 *   "events": {
 *     "custom:setOptions": [
 *       "const provinces = await getProvinceEnAsArray();",
 *       "$field.enum = provinces;",
 *       "$field.enumNames = provinces;"
 *     ]
 *   }
 * }
 *
 * @example
 * // Usage 2: Load provinces when another field changes
 * {
 *   "fieldType": "drop-down",
 *   "name": "country",
 *   "events": {
 *     "change": [
 *       "if ($field.$value === 'Thailand') {",
 *       "  const provinces = await getProvinceEnAsArray();",
 *       "  provinceField.enum = provinces;",
 *       "  provinceField.enumNames = provinces;",
 *       "}"
 *     ]
 *   }
 * }
 *
 * @example
 * // Usage 3: Use in a custom function to filter provinces
 * {
 *   "events": {
 *     "custom:loadData": [
 *       "const allProvinces = await getProvinceEnAsArray();",
 *       "const filteredProvinces = allProvinces.filter(p => p.startsWith('B'));",
 *       "$field.enum = filteredProvinces;",
 *       "$field.enumNames = filteredProvinces;"
 *     ]
 *   }
 * }
 *
 * @example
 * // Usage 4: Validate province selection against API data
 * {
 *   "events": {
 *     "change": [
 *       "const validProvinces = await getProvinceEnAsArray();",
 *       "if (!validProvinces.includes($field.$value)) {",
 *       "  $field.valid = false;",
 *       "  $field.errorMessage = 'Invalid province selected';",
 *       "}"
 *     ]
 *   }
 * }
 */
async function getProvinceEnAsArray() {
  const url = 'https://publish-p185039-e1939903.adobeaemcloud.com/api/LocationSearchService/GetProvinceEn';

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // Parse JSON response
    const data = await response.json();

    // Convert response into JS Array
    const jsArray = Array.isArray(data) ? data : Object.values(data);

    // eslint-disable-next-line no-console
    console.log(jsArray);

    return jsArray;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching provinces:', error);
    return [];
  }
}
 
// eslint-disable-next-line import/prefer-default-export
export {
  getFullName,
  days,
  submitFormArrayToString,
  getProvinceEnAsArray,
  fetchCsrfToken,
  addCsrfToken,
  addCustomHeader,
  generatePayloadHash,
};

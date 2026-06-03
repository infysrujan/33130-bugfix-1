/**
 * Double Key Dropdown Component
 *
 * Extends the standard drop-down field (fieldType: "drop-down", fd:viewType: "double-key-dropdown")
 * to render a grouped <select> where options are organised by country as <optgroup> elements.
 *
 * Authoring data (stored in fd.properties):
 *   - countryCodes      : string[]  – ISO / internal key per country (e.g. ["TH", "SG"])
 *   - countryNames      : string[]  – Display label per country
 *  (e.g. ["Thailand", "Singapore"])
 *   - universitiesData  : string[]  – Comma-separated universities per country row
 *  (e.g. ["Assumption University,Bangkok University", "NUS,NTU"])
 *
 * The component replaces the plain <select> produced by form.js with a
 * grouped one that mirrors the Sitecore HTML structure:
 * placeholder option → <optgroup label="Country"> → <option>University
 */

/**
 * Parses the authored multi-value property into a clean array.
 * Universal Editor stores multi-value fields as an array; Doc-based stores as a newline string.
 *
 * @param {string|string[]} value
 * @returns {string[]}
 */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value)
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Resolves a property value from the fd object, checking multiple storage locations:
 * 1. fd.properties[key]          – nested (standard AEM Forms runtime)
 * 2. fd['properties.' + key]     – flat dot-notation (some UE / JCR serializations)
 * 3. fd[key]                     – directly on fd (doc-based / transformed payloads)
 *
 * @param {Object} fd
 * @param {string} key  – the short property name (e.g. 'countryCodes')
 * @returns {*}
 */
function getProp(fd, key) {
  const nested = fd.properties?.[key];
  if (nested !== undefined && nested !== null && nested !== '') return nested;
  // UE may preserve the full dot-notation name as a key inside the properties object
  const nestedDot = fd.properties?.[`properties.${key}`];
  if (nestedDot !== undefined && nestedDot !== null && nestedDot !== '') return nestedDot;
  const flat = fd[`properties.${key}`];
  if (flat !== undefined && flat !== null && flat !== '') return flat;
  return fd[key];
}

/**
 * Builds an accessible grouped <select> element.
 *
 * @param {Object} fd - The field definition object from the AEM Form model
 * @param {HTMLSelectElement} originalSelect - The existing <select> created by form.js
 * @returns {HTMLSelectElement}
 */
function buildGroupedSelect(fd, originalSelect) {
  const countryCodes = toArray(getProp(fd, 'countryCodes'));
  const countryNames = toArray(getProp(fd, 'countryNames'));
  const universitiesData = toArray(getProp(fd, 'universitiesData'));

  // Re-use the existing <select> so form.js attributes (id, name, required, etc.) are preserved
  const select = originalSelect;

  // Clear any options injected by the default dropdown renderer
  select.innerHTML = '';

  // --- Placeholder option (disabled, pre-selected) ---
  const placeholderText = fd.placeholder || '--Please select--';
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = placeholderText;
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  placeholderOpt.setAttribute('aria-label', placeholderText);
  select.appendChild(placeholderOpt);

  // --- Grouped options per country ---
  countryCodes.forEach((code, index) => {
    const countryLabel = countryNames[index] || code;
    const universitiesRaw = universitiesData[index] || '';
    const universities = universitiesRaw
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (!universities.length) return;

    const group = document.createElement('optgroup');
    group.label = countryLabel;
    group.dataset.countryCode = code;

    universities.forEach((university) => {
      const opt = document.createElement('option');
      // Value encodes both country and university to allow easy back-end mapping
      opt.value = `${code}::${university}`;
      opt.textContent = university;
      opt.dataset.country = code;
      opt.dataset.countryName = countryLabel;
      group.appendChild(opt);
    });

    select.appendChild(group);
  });

  return select;
}

/**
 * Default export – called by mappings.js componentDecorator.
 *
 * @param {HTMLElement} fieldDiv  - The .field-wrapper element
 * @param {Object}      fd        - The field definition / JSON model
 * @returns {HTMLElement}
 */
export default function decorate(fieldDiv, fd) {
  const select = fieldDiv.querySelector('select');
  if (!select) return fieldDiv;

  // Rebuild select as a grouped (optgroup) dropdown
  buildGroupedSelect(fd, select);

  // Mark field wrapper so CSS can scope styles precisely
  fieldDiv.classList.add('field-double-key-dropdown');

  // Disable the select if field is not enabled or is read-only
  if (fd.enabled === false || fd.readOnly === true) {
    select.disabled = true;
    fieldDiv.classList.add('field-disabled');
  }

  // --- Accessibility: announce current selection to screen readers ---
  select.setAttribute('aria-label', fd['jcr:title'] || fd.label?.value || 'Grouped dropdown');

  // --- Change event: expose split values as data attributes on the wrapper ---
  select.addEventListener('change', () => {
    const [countryCode, universityName] = (select.value || '::').split('::');
    fieldDiv.dataset.selectedCountry = countryCode || '';
    fieldDiv.dataset.selectedUniversity = universityName || '';
  });

  // Re-append help text at the bottom if it was already in the DOM
  const helpText = fieldDiv.querySelector('.field-description');
  if (helpText) {
    fieldDiv.appendChild(helpText);
  }

  return fieldDiv;
}

/**
 * Date of Birth (Thai) Component
 *
 * Renders three native <select> dropdowns — day / month (Thai or English
 * names) / year (Christian Era) — matching the legacy "วัน / เดือน / ปี"
 * birth-date widget, and combines the selections into a single ISO
 * (yyyy-MM-dd) value written to a hidden input bound to the field model
 * (fieldType: "date-input", fd:viewType: "dob").
 *
 * Authoring data (stored in fd.properties):
 *   - minAge : number – youngest selectable age. Drives the newest year
 *              option (current year - minAge). Default 15.
 *   - maxAge : number – oldest selectable age. Drives how many year options
 *              are rendered ((maxAge - minAge) + 1 rows). Default 100.
 */

/* eslint-env browser */

const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Resolves an authored property from the fd object, checking the same
 * fallback chain used by the other components in blocks/form/components:
 *   1. fd.properties[key]              – nested (standard AEM Forms runtime)
 *   2. fd.properties['properties.key'] – dot-notation preserved inside properties
 *   3. fd['properties.key']            – flat dot-notation directly on fd
 *   4. fd[key]                         – directly on fd (core constraints / doc-based)
 */
function getProp(fd, key) {
  if (!fd) return undefined;
  const nested = fd.properties?.[key];
  if (nested !== undefined && nested !== null && nested !== '') return nested;
  const nestedDot = fd.properties?.[`properties.${key}`];
  if (nestedDot !== undefined && nestedDot !== null && nestedDot !== '') return nestedDot;
  const flat = fd[`properties.${key}`];
  if (flat !== undefined && flat !== null && flat !== '') return flat;
  return fd[key];
}

/**
 * Coerces an authored value to a plain string. label/title arrive as
 * `{ value, richText, visible }` objects; unwrap `.value` before use.
 */
function toText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && typeof v.value === 'string') {
    return v.value.replace(/<[^>]*>/g, '').trim();
  }
  return String(v);
}

function toPositiveInt(v, fallback) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getDisplayLang() {
  const raw = (document.documentElement.lang || 'en').toLowerCase().trim();
  return (raw === 'th' || raw.startsWith('th-')) ? 'th' : 'en';
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

let instanceCount = 0;

/**
 * Default export – called by mappings.js componentDecorator.
 *
 * @param {HTMLElement} block - The .field-wrapper element for this field
 * @param {Object}      fd    - The field definition / JSON model
 * @returns {HTMLElement}
 */
export default function decorate(block, fd = {}) {
  const lang = getDisplayLang();
  instanceCount += 1;
  const baseId = `dobth-${instanceCount}`;

  const labelText = toText(fd.label?.value ?? getProp(fd, 'jcr:title'))
    || (lang === 'th' ? 'ระบุวันเดือนปีเกิด (ค.ศ.)' : 'Date of birth (A.D.)');

  const hideTitle = fd.label?.visible === false
    || getProp(fd, 'hideTitle') === true
    || getProp(fd, 'hideTitle') === 'true';

  const fieldName = toText(getProp(fd, 'name')) || 'dob';
  const isDisabled = fd.enabled === false || fd.readOnly === true;

  const minAge = toPositiveInt(getProp(fd, 'minAge'), 15);
  const maxAge = toPositiveInt(getProp(fd, 'maxAge'), 100);
  const startYear = new Date().getFullYear() - minAge;
  const yearCount = Math.max(1, maxAge - minAge + 1);

  const dayLabel = lang === 'th' ? 'วัน' : 'Day';
  const monthLabel = lang === 'th' ? 'เดือน' : 'Month';
  const yearLabel = lang === 'th' ? 'ปี' : 'Year';

  /* ── Build DOM ── */
  block.innerHTML = '';
  block.classList.add('field-dob-th');
  if (isDisabled) block.classList.add('field-disabled');

  const wrapper = document.createElement('div');
  wrapper.className = 'dobth-wrapper';

  const labelEl = document.createElement('label');
  labelEl.className = 'dobth-label field-label';
  labelEl.htmlFor = `${baseId}-day`;
  labelEl.textContent = labelText;
  if (hideTitle) labelEl.dataset.visible = 'false';

  const row = document.createElement('div');
  row.className = 'dobth-row';

  function setPlaceholder(select, text) {
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = text;
    opt.disabled = true;
    opt.selected = true;
    select.appendChild(opt);
  }

  function buildSelect(idSuffix, className, ariaLabel) {
    const sel = document.createElement('select');
    sel.id = `${baseId}-${idSuffix}`;
    sel.className = `dobth-select ${className}`;
    sel.setAttribute('aria-label', ariaLabel);
    sel.disabled = isDisabled;
    return sel;
  }

  const daySelect = buildSelect('day', 'dobth-day', dayLabel);
  const monthSelect = buildSelect('month', 'dobth-month', monthLabel);
  const yearSelect = buildSelect('year', 'dobth-year', yearLabel);

  /** Rebuilds the day options for `count` days, preserving the current selection if valid. */
  function populateDays(count) {
    const currentValue = daySelect.value;
    setPlaceholder(daySelect, dayLabel);
    for (let d = 1; d <= count; d += 1) {
      const opt = document.createElement('option');
      opt.value = String(d);
      opt.textContent = String(d);
      daySelect.appendChild(opt);
    }
    if (currentValue && Number(currentValue) <= count) daySelect.value = currentValue;
  }

  setPlaceholder(monthSelect, monthLabel);
  (lang === 'th' ? MONTHS_TH : MONTHS_EN).forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx + 1).padStart(2, '0');
    opt.textContent = name;
    monthSelect.appendChild(opt);
  });

  setPlaceholder(yearSelect, yearLabel);
  for (let i = 0; i < yearCount; i += 1) {
    const year = startYear - i;
    const opt = document.createElement('option');
    opt.value = String(year);
    opt.textContent = String(year);
    yearSelect.appendChild(opt);
  }

  populateDays(31);
  row.append(daySelect, monthSelect, yearSelect);

  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = fieldName;
  // The form model binds by field id (rules engine looks fields up via `#id`), so
  // carry fd.id here so both read (submit) and write (prefill / rules) round-trip.
  if (fd?.id) hiddenInput.id = fd.id;

  wrapper.append(labelEl, row, hiddenInput);
  block.append(wrapper);

  /* ── Sync hidden value from the three selects ── */
  function commit() {
    const d = daySelect.value;
    const m = monthSelect.value;
    const y = yearSelect.value;
    hiddenInput.value = (d && m && y) ? `${y}-${m}-${String(d).padStart(2, '0')}` : '';
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Regenerate the day count when month/year narrow it (e.g. Feb 30 -> Feb 28/29),
  // clamping down without losing a still-valid selected day.
  function onMonthOrYearChange() {
    const m = monthSelect.value;
    const y = yearSelect.value;
    populateDays((m && y) ? daysInMonth(Number(y), Number(m) - 1) : 31);
    commit();
  }

  daySelect.addEventListener('change', commit);
  monthSelect.addEventListener('change', onMonthOrYearChange);
  yearSelect.addEventListener('change', onMonthOrYearChange);

  /* ── Seed from a prefilled/default value (yyyy-MM-dd) ── */
  const initial = toText(getProp(fd, 'default') ?? fd.value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(initial);
  if (match) {
    const [, y, m, d] = match;
    yearSelect.value = y;
    monthSelect.value = m;
    populateDays(daysInMonth(Number(y), Number(m) - 1));
    daySelect.value = String(Number(d));
    commit();
  }

  return block;
}

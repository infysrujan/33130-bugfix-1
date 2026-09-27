/**
 * Date of Birth (Thai) Component
 *
 * Renders three custom combobox dropdowns — day / month (Thai or English
 * names) / year (Christian Era) — matching the legacy "วัน / เดือน / ปี"
 * birth-date widget, and combines the selections into a single ISO
 * (yyyy-MM-dd) value written to a hidden input bound to the field model
 * (fieldType: "date-input", fd:viewType: "dob").
 *
 * Each dropdown is a button + self-positioned listbox panel (same pattern as
 * calendar.js's popover) rather than a native <select>: native <select>
 * option lists are sized and positioned by the OS/browser, and can grow to
 * fill most of the viewport when there are many options and little room
 * below the field — nothing an author can control via CSS. Building our own
 * panel keeps it small, height-capped, and anchored under the field in
 * every browser.
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

// Tracks whichever combobox (day/month/year) is currently open, across all
// instances on the page, so opening one always closes another. Each
// trigger's click handler calls e.stopPropagation() (see createCombobox),
// which stops that click from ever reaching another instance's own
// document-level "click outside" listener — so that listener alone can't be
// relied on to close a sibling combobox.
let closeOpenCombobox = null;

/**
 * Positions a listbox panel directly under its trigger button (fixed
 * positioning, so it escapes any clipping/overflow ancestors), flipping
 * above the trigger when there isn't room below. Mirrors calendar.js's
 * positionPopover().
 */
function positionListbox(trigger, listbox) {
  const rect = trigger.getBoundingClientRect();
  const margin = 5;
  let top = rect.bottom + margin;
  const { left } = rect;

  listbox.style.visibility = 'hidden';
  listbox.style.minWidth = `${rect.width}px`;
  listbox.style.left = `${left}px`;
  listbox.style.top = `${top}px`;

  requestAnimationFrame(() => {
    const lh = listbox.offsetHeight;
    const vh = window.innerHeight;
    if (top + lh > vh - margin && rect.top - margin - lh > margin) {
      top = rect.top - margin - lh;
    }
    listbox.style.top = `${top}px`;
    listbox.style.visibility = '';
  });
}

/**
 * Builds a single custom combobox: a button trigger showing the selected
 * label (or placeholder) plus a chevron, and a listbox panel of option
 * buttons appended to <body> and positioned under the trigger when open.
 *
 * @param {Object} config
 * @param {string} config.id - Element id for the trigger button
 * @param {string} config.ariaLabel - Accessible name (e.g. "Day")
 * @param {string} config.placeholder - Text shown while nothing is selected
 * @param {boolean} config.disabled
 * @param {(value: string) => void} config.onChange - Called after a user pick
 * @returns {{wrapper: HTMLElement, getValue: () => string,
 *   setValue: (v: string) => void,
 *   setOptions: (opts: {value:string,label:string}[], o?: {preserveValue?: boolean}) => void}}
 */
function createCombobox({
  id, ariaLabel, placeholder, disabled, onChange,
}) {
  let options = [];
  let value = '';
  let isOpen = false;

  const wrapper = document.createElement('div');
  wrapper.className = 'dobth-combo';

  // A plain <div role="button"> rather than a real <button>: this form's
  // global button styles (main .form button[type='button']:hover in
  // form-button.css) match on the button element itself, so a real <button>
  // here would get repainted solid blue on hover regardless of our own
  // classes. A div sidesteps that selector entirely.
  const trigger = document.createElement('div');
  trigger.id = id;
  trigger.className = 'dobth-combo-trigger';
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('tabindex', disabled ? '-1' : '0');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel);
  if (disabled) trigger.setAttribute('aria-disabled', 'true');

  const textEl = document.createElement('span');
  textEl.className = 'dobth-combo-text';
  textEl.dataset.placeholder = 'true';
  textEl.textContent = placeholder;

  const chevron = document.createElement('span');
  chevron.className = 'dobth-combo-chevron';
  chevron.setAttribute('aria-hidden', 'true');

  trigger.append(textEl, chevron);
  wrapper.append(trigger);

  const listbox = document.createElement('div');
  listbox.className = 'dobth-listbox';
  listbox.id = `${id}-listbox`;
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', ariaLabel);
  listbox.hidden = true;
  trigger.setAttribute('aria-controls', listbox.id);
  document.body.append(listbox);

  function renderText() {
    const found = options.find((o) => o.value === value);
    if (found) {
      textEl.textContent = found.label;
      delete textEl.dataset.placeholder;
    } else {
      textEl.textContent = placeholder;
      textEl.dataset.placeholder = 'true';
    }
  }

  function renderOptions() {
    listbox.innerHTML = '';
    // Non-selectable placeholder row at the top of the panel (e.g. "Day"),
    // matching the legacy widget's greyed-out first row. Deliberately not a
    // `.dobth-option` so it's excluded from arrow-key navigation / selection.
    const placeholderRow = document.createElement('div');
    placeholderRow.className = 'dobth-listbox-placeholder';
    placeholderRow.setAttribute('role', 'presentation');
    placeholderRow.textContent = placeholder;
    listbox.append(placeholderRow);

    options.forEach((opt) => {
      // Same reasoning as the trigger: a div avoids the form's global
      // `button` element selectors entirely.
      const item = document.createElement('div');
      item.className = 'dobth-option';
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '-1');
      item.setAttribute('aria-selected', String(opt.value === value));
      if (opt.value === value) item.classList.add('dobth-option-selected');
      item.textContent = opt.label;
      item.dataset.value = opt.value;
      listbox.append(item);
    });
  }

  function close({ refocusTrigger = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    trigger.setAttribute('aria-expanded', 'false');
    listbox.hidden = true;
    if (closeOpenCombobox === close) closeOpenCombobox = null;
    if (refocusTrigger) trigger.focus();
  }

  function open() {
    if (disabled || !options.length) return;
    // Only one of day/month/year should ever be open at a time.
    if (closeOpenCombobox && closeOpenCombobox !== close) closeOpenCombobox();
    isOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    listbox.hidden = false;
    closeOpenCombobox = close;
    positionListbox(trigger, listbox);
    const selected = listbox.querySelector('.dobth-option-selected') || listbox.querySelector('.dobth-option');
    selected?.focus();
  }

  function selectValue(newValue, { silent = false } = {}) {
    value = newValue;
    renderText();
    renderOptions();
    if (!silent) onChange(value);
  }

  function setOptions(newOptions, { preserveValue = true } = {}) {
    options = newOptions;
    if (preserveValue && value && !options.some((o) => o.value === value)) {
      value = '';
    }
    renderText();
    renderOptions();
  }

  trigger.addEventListener('click', (e) => {
    if (disabled) return;
    e.stopPropagation();
    if (isOpen) close(); else open();
  });

  trigger.addEventListener('keydown', (e) => {
    if (disabled) return;
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      open();
    }
  });

  listbox.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('.dobth-option');
    if (!btn) return;
    selectValue(btn.dataset.value);
    close({ refocusTrigger: true });
  });

  listbox.addEventListener('keydown', (e) => {
    const opts = [...listbox.querySelectorAll('.dobth-option')];
    const idx = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[Math.min(idx + 1, opts.length - 1)]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[Math.max(idx - 1, 0)]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Options are <div role="option">, not real buttons, so they don't
      // auto-fire a click on keyboard activation — select the focused one.
      e.preventDefault();
      if (idx >= 0) {
        selectValue(opts[idx].dataset.value);
        close({ refocusTrigger: true });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close({ refocusTrigger: true });
    } else if (e.key === 'Tab') {
      close();
    }
  });

  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (!listbox.contains(e.target) && !trigger.contains(e.target)) close();
  });

  const onReposition = () => { if (isOpen) positionListbox(trigger, listbox); };
  window.addEventListener('resize', onReposition);
  window.addEventListener('scroll', onReposition, true);

  return {
    wrapper,
    getValue: () => value,
    setValue: (v) => selectValue(v, { silent: true }),
    setOptions,
  };
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

  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = fieldName;
  // The form model binds by field id (rules engine looks fields up via `#id`), so
  // carry fd.id here so both read (submit) and write (prefill / rules) round-trip.
  if (fd?.id) hiddenInput.id = fd.id;

  // Forward-declared so `commit()` and `onMonthOrYearChange()` below can
  // reference them before the createCombobox(...) calls that assign them —
  // avoids eslint(no-use-before-define) while keeping the exact same
  // build/call order as before.
  let dayCombo;
  let monthCombo;
  let yearCombo;

  /* ── Sync hidden value from the three combos ── */
  function commit() {
    const d = dayCombo.getValue();
    const m = monthCombo.getValue();
    const y = yearCombo.getValue();
    if (!(d && m && y)) {
      // Incomplete selection: don't push a value to the rule engine yet.
      // The runtime's date-format validator only skips validation for a
      // `null` value — an empty string still fails the format regex, which
      // would surface a false "invalid date" error after picking just one
      // of the three dropdowns.
      hiddenInput.value = '';
      return;
    }
    hiddenInput.value = `${y}-${m}-${String(d).padStart(2, '0')}`;
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Rebuilds the day options for `count` days, preserving the current selection if valid. */
  function populateDayOptions(count, preserveValue = true) {
    const opts = [];
    for (let d = 1; d <= count; d += 1) opts.push({ value: String(d), label: String(d) });
    dayCombo.setOptions(opts, { preserveValue });
  }

  dayCombo = createCombobox({
    id: `${baseId}-day`, ariaLabel: dayLabel, placeholder: dayLabel, disabled: isDisabled, onChange: commit,
  });

  // Regenerate the day count when month/year narrow it (e.g. Feb 30 -> Feb 28/29),
  // clamping down without losing a still-valid selected day.
  function onMonthOrYearChange() {
    const m = monthCombo.getValue();
    const y = yearCombo.getValue();
    populateDayOptions((m && y) ? daysInMonth(Number(y), Number(m) - 1) : 31);
    commit();
  }

  monthCombo = createCombobox({
    id: `${baseId}-month`, ariaLabel: monthLabel, placeholder: monthLabel, disabled: isDisabled, onChange: onMonthOrYearChange,
  });
  yearCombo = createCombobox({
    id: `${baseId}-year`, ariaLabel: yearLabel, placeholder: yearLabel, disabled: isDisabled, onChange: onMonthOrYearChange,
  });

  monthCombo.setOptions((lang === 'th' ? MONTHS_TH : MONTHS_EN).map((name, idx) => ({
    value: String(idx + 1).padStart(2, '0'),
    label: name,
  })), { preserveValue: false });

  const yearOpts = [];
  for (let i = 0; i < yearCount; i += 1) {
    const year = startYear - i;
    yearOpts.push({ value: String(year), label: String(year) });
  }
  yearCombo.setOptions(yearOpts, { preserveValue: false });

  populateDayOptions(31, false);

  row.append(dayCombo.wrapper, monthCombo.wrapper, yearCombo.wrapper);
  wrapper.append(labelEl, row, hiddenInput);
  block.append(wrapper);

  /* ── Seed from a prefilled/default value (yyyy-MM-dd) ── */
  const initial = toText(getProp(fd, 'default') ?? fd.value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(initial);
  if (match) {
    const [, y, m, d] = match;
    yearCombo.setValue(y);
    monthCombo.setValue(m);
    populateDayOptions(daysInMonth(Number(y), Number(m) - 1));
    dayCombo.setValue(String(Number(d)));
    commit();
  }

  return block;
}

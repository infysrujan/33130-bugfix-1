/* eslint-env browser */

/**
 * Calendar popover for any page: attach to a text-like input, localize via `<html lang>`.
 *
 * Usage:
 *   import { attachCalendarPicker } from './utils/calendar-picker.js';
 *   attachCalendarPicker({
 *     input: document.querySelector('#as-of-date'),
 *     value: new Date(),
 *     isDateDisabled: (d) => d.getDay() === 0 || d.getDay() === 6,
 *     onChange: (d) => console.log(d),
 *   });
 *
 * Manual entry is enabled by default (`allowManualEntry: true`). While typing, the calendar
 * preview updates immediately (highlight + month navigation). `onChange` fires only on Enter
 * or when a day is picked in the grid. Blur / click-outside retains the typed value and
 * preview selection without calling `onChange` or re-fetching enabled days when the parsed
 * input matches the current selection. When `fetchEnabledDays` is set and a committed
 * manual date is not in the API response, the picker snaps to the nearest previous enabled
 * day (searching earlier months when needed). Pass `{ readOnly: true }` or
 * `{ allowManualEntry: false }` for calendar-only selection.
 * Use `type="text"`. For a separate visible label, pass `labelElement`.
 */

import {
  MONTHS_EN, MONTHS_TH, BE_OFFSET, formatLongDate,
} from './datelang.js';

const MONTHS_SHORT_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS_SHORT_TH = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export { formatLongDate };

/**
 * @param {Document} doc
 * @returns {'en' | 'th'}
 */
export function getCalendarLang(doc = document) {
  const raw = (doc.documentElement.lang || 'en').toLowerCase().trim();
  if (raw === 'th' || raw.startsWith('th-')) return 'th';
  return 'en';
}

/**
 * @param {Date} date - local date (time ignored)
 * @param {'en' | 'th'} lang
 * @returns {string} e.g. `24 Apr 2026` or `30 เม.ย. 2569`
 */
export function formatCalendarDate(date, lang) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const d = date.getDate();
  if (lang === 'th') {
    const m = MONTHS_SHORT_TH[date.getMonth()];
    const y = date.getFullYear() + BE_OFFSET;
    return `${d} ${m} ${y}`;
  }
  const m = MONTHS_SHORT_EN[date.getMonth()];
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

function padMonthHeader(year, monthIndex, lang) {
  if (lang === 'th') {
    return `${MONTHS_TH[monthIndex]} ${year + BE_OFFSET}`;
  }
  return `${MONTHS_EN[monthIndex]} ${year}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function isValidLocalDate(year, monthIndex, day) {
  const d = new Date(year, monthIndex, day);
  return d.getFullYear() === year
    && d.getMonth() === monthIndex
    && d.getDate() === day;
}

function resolveMonthIndex(token, lang) {
  const t = token.replace(/\.$/, '').trim().toLowerCase();
  if (!t) return -1;
  const short = lang === 'th' ? MONTHS_SHORT_TH : MONTHS_SHORT_EN;
  const full = lang === 'th' ? MONTHS_TH : MONTHS_EN;
  let idx = short.findIndex((m) => m.replace(/\.$/, '').toLowerCase() === t);
  if (idx >= 0) return idx;
  idx = full.findIndex((m) => m.toLowerCase() === t);
  return idx;
}

function normalizeYear(rawYear, lang) {
  const y = Number.parseInt(rawYear, 10);
  if (Number.isNaN(y)) return null;
  if (lang === 'th' && y >= 2400) return y - BE_OFFSET;
  return y;
}

/**
 * @param {string} text
 * @param {'en' | 'th'} lang
 * @returns {Date | null} local calendar day, or null when unparseable
 */
export function parseCalendarDate(text, lang) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const numeric = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const monthIndex = Number.parseInt(numeric[2], 10) - 1;
    const year = normalizeYear(numeric[3], lang);
    if (year !== null && isValidLocalDate(year, monthIndex, day)) {
      return startOfDay(new Date(year, monthIndex, day));
    }
    return null;
  }

  const labeled = trimmed.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if (labeled) {
    const day = Number.parseInt(labeled[1], 10);
    const monthIndex = resolveMonthIndex(labeled[2], lang);
    const year = normalizeYear(labeled[3], lang);
    if (year !== null && monthIndex >= 0 && isValidLocalDate(year, monthIndex, day)) {
      return startOfDay(new Date(year, monthIndex, day));
    }
  }

  return null;
}

/**
 * Best-effort parse while the user is still editing (e.g. incomplete year).
 * Falls back to `referenceDate` for missing month/year parts.
 *
 * @param {string} text
 * @param {'en' | 'th'} lang
 * @param {Date | null} referenceDate
 * @returns {Date | null}
 */
function parseCalendarDatePartial(text, lang, referenceDate = null) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const full = parseCalendarDate(trimmed, lang);
  if (full) return full;

  const ref = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? referenceDate
    : new Date();

  const numeric = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{0,4})$/);
  if (numeric) {
    const day = Number.parseInt(numeric[1], 10);
    const monthIndex = Number.parseInt(numeric[2], 10) - 1;
    const yearRaw = numeric[3];
    let year = ref.getFullYear();
    if (yearRaw.length === 4) {
      const normalized = normalizeYear(yearRaw, lang);
      if (normalized !== null) year = normalized;
    }
    if (monthIndex >= 0 && monthIndex <= 11 && isValidLocalDate(year, monthIndex, day)) {
      return startOfDay(new Date(year, monthIndex, day));
    }
    return null;
  }

  const labeled = trimmed.match(/^(\d{1,2})\s+(\S+)\s+(\d{0,4})$/);
  if (labeled) {
    const day = Number.parseInt(labeled[1], 10);
    let monthIndex = resolveMonthIndex(labeled[2], lang);
    if (monthIndex < 0) monthIndex = ref.getMonth();
    const yearRaw = labeled[3];
    let year = ref.getFullYear();
    if (yearRaw.length === 4) {
      const normalized = normalizeYear(yearRaw, lang);
      if (normalized !== null) year = normalized;
    }
    if (isValidLocalDate(year, monthIndex, day)) {
      return startOfDay(new Date(year, monthIndex, day));
    }
    return null;
  }

  const labeledNoYear = trimmed.match(/^(\d{1,2})\s+(\S+)$/);
  if (labeledNoYear) {
    const day = Number.parseInt(labeledNoYear[1], 10);
    let monthIndex = resolveMonthIndex(labeledNoYear[2], lang);
    if (monthIndex < 0) monthIndex = ref.getMonth();
    const year = ref.getFullYear();
    if (isValidLocalDate(year, monthIndex, day)) {
      return startOfDay(new Date(year, monthIndex, day));
    }
  }

  return null;
}

function positionPopover(trigger, popover, doc) {
  const rect = trigger.getBoundingClientRect();
  const { bottom, left: rectLeft, top } = rect;
  const margin = 8;
  popover.style.top = `${bottom + margin}px`;
  let left = rectLeft;
  const vw = doc.defaultView.innerWidth;
  popover.style.visibility = 'hidden';
  popover.style.left = `${left}px`;
  // measure after in DOM
  requestAnimationFrame(() => {
    const pw = popover.offsetWidth;
    if (left + pw > vw - margin) {
      left = Math.max(margin, vw - margin - pw);
      popover.style.left = `${left}px`;
    }
    const vh = doc.defaultView.innerHeight;
    const ph = popover.offsetHeight;
    let popTop = bottom + margin;
    if (popTop + ph > vh - margin && top - margin - ph > margin) {
      popTop = top - margin - ph;
      popover.style.top = `${popTop}px`;
    }
    popover.style.visibility = '';
  });
}

/**
 * @typedef {Object} CalendarPickerOptions
 * @property {HTMLInputElement} [input] - Field that opens the calendar (preferred)
 * @property {HTMLInputElement} [trigger] - Alias for `input` (deprecated name)
 * @property {Document} [doc]
 * @property {Date} [value] - Initially selected date (local calendar day)
 * @property {(date: Date) => boolean} [isDateDisabled] - Return true to grey out / block selection
 * @property {(date: Date) => void} [onChange] - Fires when a date is chosen
 * @property {HTMLElement} [labelElement] - If set, formatted date is written here instead of
 *   `input.value`
 * @property {boolean} [allowManualEntry=true] - When true, users can type dates; preview
 *   updates live, commit on Enter only
 * @property {boolean} [readOnly] - When true, calendar-only; defaults to `!allowManualEntry`
 * @property {(ctx: { year: number, month: number }) => Promise<number[] | null | undefined>}
 *   [fetchEnabledDays] - When set, only days whose calendar date (1–31) appear in the resolved
 *   array are selectable for the visible month (`month` is 0-based). Called when the popover
 *   opens and whenever prev/next month is used. While loading, all days are disabled.
 * @property {() => void} [onPopoverOpen] - Fires when the calendar popover opens.
 * @property {() => void} [onPopoverClose] - Fires when the calendar popover closes.
 * @property {HTMLElement} [openTrigger] - Extra click target that opens the calendar (e.g.
 *   `.calendar-input.icon-calendar` wrapper). When omitted, the input's parent is used when it
 *   has class `calendar-input` or `icon-calendar`.
 */

/**
 * @param {CalendarPickerOptions} options
 * @returns {{ open: () => void, close: () => void, destroy: () => void,
 *   getValue: () => Date | null, setValue: (d: Date | null) => void }}
 */
export function attachCalendarPicker(options) {
  const {
    input: inputOption,
    trigger: triggerAlias,
    doc = document,
    value: initialValue,
    isDateDisabled = () => false,
    onChange,
    labelElement: labelElementOpt,
    allowManualEntry: allowManualEntryOption = true,
    readOnly: readOnlyOption,
    fetchEnabledDays,
    onPopoverOpen,
    onPopoverClose,
    openTrigger: openTriggerOption,
  } = options;

  const input = inputOption ?? triggerAlias;
  if (!input || !(input instanceof HTMLInputElement)) {
    throw new Error('attachCalendarPicker: `input` must be an HTMLInputElement');
  }

  let openTrigger = openTriggerOption;
  if (!openTrigger) {
    const parent = input.parentElement;
    if (parent instanceof HTMLElement
      && (parent.classList.contains('calendar-input') || parent.classList.contains('icon-calendar'))) {
      openTrigger = parent;
    }
  }

  const allowManualEntry = allowManualEntryOption !== false;
  const readOnly = readOnlyOption ?? !allowManualEntry;
  if (readOnly) {
    input.readOnly = true;
  } else {
    input.readOnly = false;
  }

  let selected = initialValue ? startOfDay(initialValue) : null;
  let viewYear = (selected || new Date()).getFullYear();
  let viewMonth = (selected || new Date()).getMonth();
  let isOpen = false;
  /** @type {Set<number> | null} null while loading when fetchEnabledDays is used */
  let enabledDaysInViewMonth = null;
  let monthFetchGeneration = 0;
  let suppressBlurCommit = false;

  const getLang = () => getCalendarLang(doc);

  const popover = doc.createElement('div');
  popover.className = 'bbl-calendar-picker-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Calendar');
  popover.hidden = true;

  const header = doc.createElement('div');
  header.className = 'bbl-calendar-picker-header';

  const btnPrev = doc.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'bbl-calendar-picker-nav';
  btnPrev.setAttribute('aria-label', 'Previous month');
  btnPrev.innerHTML = '<span aria-hidden="true">‹</span>';

  const title = doc.createElement('h2');
  title.className = 'bbl-calendar-picker-title';

  const btnNext = doc.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'bbl-calendar-picker-nav';
  btnNext.setAttribute('aria-label', 'Next month');
  btnNext.innerHTML = '<span aria-hidden="true">›</span>';

  header.append(btnPrev, title, btnNext);

  const weekdaysRow = doc.createElement('div');
  weekdaysRow.className = 'bbl-calendar-picker-weekdays';

  const grid = doc.createElement('div');
  grid.className = 'bbl-calendar-picker-grid';
  grid.setAttribute('role', 'grid');

  popover.append(header, weekdaysRow, grid);
  doc.body.append(popover);

  function syncLabel() {
    const lang = getLang();
    const text = selected ? formatCalendarDate(selected, lang) : '';
    if (labelElementOpt) {
      labelElementOpt.textContent = text;
    } else {
      input.value = text;
    }
  }

  function notifyInputCommitted() {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderGrid() {
    grid.replaceChildren();
    const lang = getLang();
    title.textContent = padMonthHeader(viewYear, viewMonth, lang);

    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < startPad; i += 1) {
      const placeholder = doc.createElement('div');
      placeholder.className = 'bbl-calendar-picker-day bbl-calendar-picker-day-muted';
      placeholder.setAttribute('aria-hidden', 'true');
      grid.append(placeholder);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellDate = startOfDay(new Date(viewYear, viewMonth, day));
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'bbl-calendar-picker-day';
      btn.textContent = String(day);
      btn.setAttribute('role', 'gridcell');
      btn.dataset.day = String(day);

      const disabledByPolicy = isDateDisabled(cellDate);
      const disabledByFetch = Boolean(
        fetchEnabledDays
          && (enabledDaysInViewMonth === null || !enabledDaysInViewMonth.has(day)),
      );
      btn.disabled = disabledByPolicy || disabledByFetch;

      if (selected && sameDay(cellDate, selected)) {
        btn.classList.add('bbl-calendar-picker-day-selected');
      }

      grid.append(btn);
    }
  }

  function applyMonthAndFetchEnabledDays() {
    if (!fetchEnabledDays) {
      renderGrid();
      return;
    }
    enabledDaysInViewMonth = null;
    renderGrid();
    monthFetchGeneration += 1;
    const gen = monthFetchGeneration;
    (async () => {
      try {
        const days = await fetchEnabledDays({ year: viewYear, month: viewMonth });
        if (gen !== monthFetchGeneration) return;
        const set = new Set();
        (Array.isArray(days) ? days : []).forEach((n) => {
          const dn = Number(n);
          if (dn >= 1 && dn <= 31) set.add(dn);
        });
        enabledDaysInViewMonth = set;
      } catch {
        if (gen !== monthFetchGeneration) return;
        enabledDaysInViewMonth = new Set();
      }
      renderGrid();
    })();
  }

  function updateSelectionPreview(date) {
    const next = startOfDay(date);
    const viewChanged = next.getFullYear() !== viewYear || next.getMonth() !== viewMonth;
    const selectionChanged = !selected || !sameDay(next, selected);
    if (!viewChanged && !selectionChanged) return;

    selected = next;
    viewYear = selected.getFullYear();
    viewMonth = selected.getMonth();
    if (isOpen) {
      if (fetchEnabledDays && viewChanged) applyMonthAndFetchEnabledDays();
      else renderGrid();
    }
  }

  function commitSelectedDate(cellDate) {
    selected = startOfDay(cellDate);
    viewYear = selected.getFullYear();
    viewMonth = selected.getMonth();
    syncLabel();
    notifyInputCommitted();
    onChange?.(selected);
    if (isOpen) {
      if (fetchEnabledDays) applyMonthAndFetchEnabledDays();
      else renderGrid();
    }
  }

  async function loadEnabledDaysForMonth(year, month) {
    try {
      const days = await fetchEnabledDays({ year, month });
      return (Array.isArray(days) ? days : [])
        .map((n) => Number(n))
        .filter((n) => n >= 1 && n <= 31)
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  async function isDateAllowedByFetch(date) {
    if (!fetchEnabledDays) return true;
    const enabled = await loadEnabledDaysForMonth(date.getFullYear(), date.getMonth());
    return enabled.includes(date.getDate());
  }

  /**
   * @param {Date} date - local calendar day (start of day)
   * @returns {Promise<Date | null>}
   */
  async function findNearestPreviousEnabledDate(date) {
    if (!fetchEnabledDays) return date;

    const maxMonthsBack = 120;

    async function searchMonth(year, month, maxDay, monthsRemaining) {
      if (monthsRemaining <= 0) return null;

      const enabled = await loadEnabledDaysForMonth(year, month);
      for (let j = enabled.length - 1; j >= 0; j -= 1) {
        const day = enabled[j];
        if (day <= maxDay) {
          const resolved = startOfDay(new Date(year, month, day));
          if (!isDateDisabled(resolved)) return resolved;
        }
      }

      const previousMonth = new Date(year, month - 1, 1);
      return searchMonth(
        previousMonth.getFullYear(),
        previousMonth.getMonth(),
        31,
        monthsRemaining - 1,
      );
    }

    return searchMonth(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      maxMonthsBack,
    );
  }

  async function resolveManualEntryDate(parsed) {
    if (!fetchEnabledDays) return parsed;
    if (await isDateAllowedByFetch(parsed)) return parsed;
    return findNearestPreviousEnabledDate(parsed);
  }

  function previewManualInput() {
    if (readOnly || labelElementOpt) return;
    const lang = getLang();
    const raw = input.value.trim();
    if (!raw) return;

    const parsed = parseCalendarDatePartial(raw, lang, selected || new Date());
    if (!parsed || isDateDisabled(parsed)) return;

    updateSelectionPreview(parsed);
  }

  function retainManualInputOnBlur() {
    if (readOnly || labelElementOpt) return;
    const lang = getLang();
    const raw = input.value.trim();
    if (!raw) {
      syncLabel();
      return;
    }

    const parsed = parseCalendarDate(raw, lang);
    if (!parsed || isDateDisabled(parsed)) {
      syncLabel();
      return;
    }

    // Click-outside / blur without a committed change: keep selection, no fetch/onChange.
    if (selected && sameDay(parsed, selected)) {
      syncLabel();
      return;
    }

    if (fetchEnabledDays) {
      (async () => {
        const resolved = await resolveManualEntryDate(parsed);
        if (resolved) {
          updateSelectionPreview(resolved);
          syncLabel();
        } else {
          syncLabel();
        }
      })();
      return;
    }

    updateSelectionPreview(parsed);
  }

  function commitManualInput() {
    if (readOnly || labelElementOpt) return;
    const lang = getLang();
    const raw = input.value.trim();
    if (!raw) {
      syncLabel();
      return;
    }

    const parsed = parseCalendarDate(raw, lang);
    if (!parsed || isDateDisabled(parsed)) {
      syncLabel();
      return;
    }

    const finalize = (date) => {
      selected = startOfDay(date);
      viewYear = selected.getFullYear();
      viewMonth = selected.getMonth();
      syncLabel();
      notifyInputCommitted();
      onChange?.(selected);
      if (isOpen) {
        if (fetchEnabledDays) applyMonthAndFetchEnabledDays();
        else renderGrid();
      }
    };

    if (fetchEnabledDays) {
      (async () => {
        const resolved = await resolveManualEntryDate(parsed);
        if (resolved) finalize(resolved);
        else syncLabel();
      })();
      return;
    }

    finalize(parsed);
  }

  function renderWeekdayLabels() {
    weekdaysRow.replaceChildren();
    const lang = getLang();
    const labels = lang === 'th' ? WEEKDAYS_TH : WEEKDAYS_EN;
    labels.forEach((text) => {
      const span = doc.createElement('span');
      span.textContent = text;
      weekdaysRow.append(span);
    });
  }

  function closePopover() {
    if (!isOpen) return;
    isOpen = false;
    monthFetchGeneration += 1;
    input.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
    onPopoverClose?.();
  }

  function openPopover() {
    isOpen = true;
    input.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    if (selected) {
      viewYear = selected.getFullYear();
      viewMonth = selected.getMonth();
    }
    renderWeekdayLabels();
    onPopoverOpen?.();
    applyMonthAndFetchEnabledDays();
    positionPopover(input, popover, doc);
  }

  function onGridClick(e) {
    const btn = e.target.closest('button.bbl-calendar-picker-day');
    if (!btn || btn.disabled || !grid.contains(btn)) return;
    const day = Number.parseInt(btn.dataset.day, 10);
    if (Number.isNaN(day)) return;
    const cellDate = startOfDay(new Date(viewYear, viewMonth, day));
    commitSelectedDate(cellDate);
    closePopover();
  }

  grid.addEventListener('click', onGridClick);

  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    applyMonthAndFetchEnabledDays();
  }

  btnPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    shiftMonth(-1);
  });
  btnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    shiftMonth(1);
  });

  function onDocClick(e) {
    if (!isOpen) return;
    const t = e.target;
    if (popover.contains(t) || input.contains(t)) return;
    if (openTrigger instanceof HTMLElement && openTrigger.contains(t)) return;
    closePopover();
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && isOpen) {
      e.stopPropagation();
      closePopover();
    }
  }

  function onReposition() {
    if (isOpen) positionPopover(input, popover, doc);
  }

  doc.addEventListener('click', onDocClick);
  doc.addEventListener('keydown', onKeydown);
  doc.defaultView.addEventListener('resize', onReposition);
  doc.defaultView.addEventListener('scroll', onReposition, true);

  input.setAttribute('aria-haspopup', 'dialog');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');

  /** Calendar-only fields open on focus; editable fields open on click so tab+type works. */
  function onInputFocusIn() {
    if (readOnly && !isOpen) openPopover();
  }

  function onInputClick(e) {
    e.stopPropagation();
    if (!isOpen) openPopover();
  }

  function onOpenTriggerClick(e) {
    if (input.contains(e.target)) return;
    e.stopPropagation();
    input.focus({ preventScroll: true });
    if (!isOpen) openPopover();
  }

  function onInputInput() {
    if (readOnly) return;
    if (!isOpen) openPopover();
    previewManualInput();
  }

  function onInputKeydown(e) {
    if (readOnly) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      commitManualInput();
    }
  }

  function onInputBlur() {
    if (readOnly) return;
    window.setTimeout(() => {
      if (suppressBlurCommit) {
        suppressBlurCommit = false;
        return;
      }
      retainManualInputOnBlur();
      closePopover();
    }, 0);
  }

  function onPopoverMouseDown() {
    suppressBlurCommit = true;
  }

  popover.addEventListener('mousedown', onPopoverMouseDown);
  input.addEventListener('focusin', onInputFocusIn);
  input.addEventListener('click', onInputClick);
  if (openTrigger instanceof HTMLElement) {
    openTrigger.addEventListener('click', onOpenTriggerClick);
  }
  input.addEventListener('input', onInputInput);
  input.addEventListener('keydown', onInputKeydown);
  input.addEventListener('blur', onInputBlur);

  syncLabel();

  return {
    open: openPopover,
    close: closePopover,
    destroy() {
      monthFetchGeneration += 1;
      grid.removeEventListener('click', onGridClick);
      popover.removeEventListener('mousedown', onPopoverMouseDown);
      input.removeEventListener('focusin', onInputFocusIn);
      input.removeEventListener('click', onInputClick);
      if (openTrigger instanceof HTMLElement) {
        openTrigger.removeEventListener('click', onOpenTriggerClick);
      }
      input.removeEventListener('input', onInputInput);
      input.removeEventListener('keydown', onInputKeydown);
      input.removeEventListener('blur', onInputBlur);
      doc.removeEventListener('click', onDocClick);
      doc.removeEventListener('keydown', onKeydown);
      doc.defaultView.removeEventListener('resize', onReposition);
      doc.defaultView.removeEventListener('scroll', onReposition, true);
      popover.remove();
    },
    getValue() {
      return selected ? new Date(selected.getTime()) : null;
    },
    setValue(d) {
      selected = d ? startOfDay(d) : null;
      if (selected) {
        viewYear = selected.getFullYear();
        viewMonth = selected.getMonth();
      }
      syncLabel();
      notifyInputCommitted();
      if (isOpen) {
        if (fetchEnabledDays) applyMonthAndFetchEnabledDays();
        else renderGrid();
      }
    },
  };
}

export default attachCalendarPicker;

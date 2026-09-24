/* eslint-env browser */

/* ── Locale data ─────────────────────────────────────────────────────────── */

const BE_OFFSET = 543;

const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Calendar header always renders in Thai
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/* ── Formatting ──────────────────────────────────────────────────────────── */

/**
 * Returns the display string for the selected date in the input field.
 * TH: "1 มกราคม 2569"   (day + full Thai month + Buddhist Era year)
 * EN: "January 1, 2026" (full English month + day + comma + AD year)
 */
function formatDisplayDate(date, lang) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const d = date.getDate();
  if (lang === 'th') {
    return `${d} ${MONTHS_TH[date.getMonth()]} ${date.getFullYear() + BE_OFFSET}`;
  }
  return `${MONTHS_EN[date.getMonth()]} ${d}, ${date.getFullYear()}`;
}

/** Returns "มกราคม 2569" style header — always Thai/BE regardless of page language. */
function formatMonthHeader(year, monthIndex) {
  return `${MONTHS_TH[monthIndex]} ${year + BE_OFFSET}`;
}

/* ── Date helpers ────────────────────────────────────────────────────────── */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Formats a Date as a `yyyy-MM-dd` string using its LOCAL calendar parts.
 * Using toISOString() here would convert to UTC and can roll the date back a
 * day for users behind UTC (e.g. Bangkok, UTC+7), submitting the wrong date.
 *
 * `useBE` shifts the year to Buddhist Era (+543). The hidden input is what the
 * rules engine validates min/max against, and authored min/max stay in BE for
 * Thai forms (e.g. "2568-08-01") — submitting a Gregorian value here would
 * compare a ~2025 year against a ~2568 constraint and always fail.
 */
function toLocalISO(date, useBE = false) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear() + (useBE ? BE_OFFSET : 0);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/* ── Block config ────────────────────────────────────────────────────────── */

function parseBlockConfig(block) {
  const config = {};
  block.querySelectorAll(':scope > div').forEach((row) => {
    const cells = [...row.querySelectorAll(':scope > div')];
    if (cells.length < 2) return;
    const key = cells[0].textContent.trim().toLowerCase().replace(/\s+/g, '-');
    config[key] = cells[1].textContent.trim();
  });
  return config;
}

/**
 * Resolves an authored property from the form-definition object, checking the
 * locations AEM Forms / Universal Editor may store it in (same fallback chain
 * used by the other components in blocks/form/components):
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

/** First non-empty value among several candidate keys. */
function getFirstProp(fd, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const v = getProp(fd, keys[i]);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Coerces an authored value to a plain string. AEM Forms stores label/title and
 * similar rich fields as objects like `{ value, richText, visible }`, so writing
 * them straight into `textContent` yields "[object Object]". This unwraps `.value`
 * (and strips tags) before falling back to String().
 */
function toText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    if (typeof v.value === 'string') return v.value.replace(/<[^>]*>/g, '').trim();
    return '';
  }
  return String(v);
}

/**
 * Parses an authored config date. Accepts values in either calendar:
 *   - Gregorian (e.g. 2026-09-10 / 2026-09-10T00:00:00.000-00:00)
 *   - Thai Buddhist Era (e.g. 2569-09-10) — years >= 2400 are treated as BE
 *     and converted to Gregorian by subtracting 543.
 * The Y-M-D is read directly and rebuilt as a LOCAL calendar day, so the time
 * and UTC offset in the authored string can't shift the min/max boundary by a
 * day (the previous `new Date(str)` treated the value as UTC midnight).
 */
function parseConfigDate(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{3,4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    let year = Number.parseInt(m[1], 10);
    const monthIndex = Number.parseInt(m[2], 10) - 1;
    const day = Number.parseInt(m[3], 10);
    // BE years run ~543 ahead of Gregorian; nothing a form would legitimately
    // author as a Gregorian year reaches 2400 AD, so this threshold is safe.
    if (year >= 2400) year -= BE_OFFSET;
    const d = new Date(year, monthIndex, day);
    const valid = d.getFullYear() === year
      && d.getMonth() === monthIndex
      && d.getDate() === day;
    return valid ? startOfDay(d) : null;
  }
  // Fallback for any non ISO-like value.
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getDisplayLang() {
  const raw = (document.documentElement.lang || 'en').toLowerCase().trim();
  return (raw === 'th' || raw.startsWith('th-')) ? 'th' : 'en';
}

/* ── Popover positioning ─────────────────────────────────────────────────── */

function positionPopover(trigger, popover) {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + margin;
  // eslint-disable-next-line prefer-destructuring
  let left = rect.left;

  popover.style.visibility = 'hidden';
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  requestAnimationFrame(() => {
    const pw = popover.offsetWidth;
    const ph = popover.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left + pw > vw - margin) left = Math.max(margin, vw - margin - pw);
    if (top + ph > vh - margin && rect.top - margin - ph > margin) {
      top = rect.top - margin - ph;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.visibility = '';
  });
}

/* ── Counter for unique IDs ──────────────────────────────────────────────── */

let instanceCount = 0;

/* ── Main decorate ───────────────────────────────────────────────────────── */

export default function decorate(block, fd = {}) {
  // Legacy document-authored fallback: only meaningful when the block still has
  // key/value <div> rows. In an AEM Forms render authored values arrive via `fd`.
  const config = parseBlockConfig(block);
  const lang = getDisplayLang();

  instanceCount += 1;
  const inputId = `dpth-input-${instanceCount}`;

  const labelText = toText(
    fd.label?.value
    ?? getFirstProp(fd, ['label', 'jcr:title'])
    ?? config.label,
  ) || (lang === 'th' ? 'เลือกวันที่' : 'Select date');
  const placeholder = toText(
    getProp(fd, 'placeholder') ?? config.placeholder,
  ) || (lang === 'th' ? 'วว เดือน ปปปป' : 'Month DD, YYYY');
  const fieldName = toText(getProp(fd, 'name') ?? config.name) || 'date';

  // "Hide title": AEM sets fd.label.visible = false when the author ticks it,
  // and the model also exposes a boolean `hideTitle`. Either hides the label
  // (kept visible in edit mode via the runtime's [data-visible="false"] rule).
  const hideTitle = fd.label?.visible === false
    || getProp(fd, 'hideTitle') === true
    || getProp(fd, 'hideTitle') === 'true';

  // Authored min/max. The model exposes custom "minimumDate"/"maximumDate";
  // the core datepicker resourceType may instead surface "minimum"/"maximum".
  // Values may arrive as strings or as { value } objects, so unwrap first.
  const minDate = parseConfigDate(
    toText(getFirstProp(fd, ['minimumDate', 'minimum']) ?? config['min-date']),
  );
  const maxDate = parseConfigDate(
    toText(getFirstProp(fd, ['maximumDate', 'maximum']) ?? config['max-date']),
  ) ?? startOfDay(new Date());

  const initialDate = parseConfigDate(
    toText(getFirstProp(fd, ['default', 'value']) ?? config.value),
  );

  /* ── Build DOM ── */
  block.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'dpth-wrapper';

  const labelEl = document.createElement('label');
  labelEl.className = 'dpth-label field-label';
  labelEl.htmlFor = inputId;
  labelEl.textContent = labelText;
  if (hideTitle) {
    // Matches the runtime convention: hidden on the live form via
    // `form:not(.edit-mode) [data-visible="false"]`, still shown in edit mode.
    labelEl.dataset.visible = 'false';
  }

  const fieldEl = document.createElement('div');
  fieldEl.className = 'dpth-field';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.className = 'dpth-input';
  input.placeholder = placeholder;
  input.readOnly = true;
  input.setAttribute('aria-label', labelText);
  input.setAttribute('aria-haspopup', 'dialog');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('tabindex', '0');

  const calIcon = document.createElement('span');
  calIcon.className = 'dpth-icon icon-calendar';
  calIcon.setAttribute('aria-hidden', 'true');

  const hiddenInput = document.createElement('input');
  hiddenInput.type = 'hidden';
  hiddenInput.name = fieldName;
  // The form model binds by field id (rules engine looks fields up via `#id` and
  // the change delegation reads value from this element). Carry fd.id so both
  // read (submit) and write (prefill / rules) round-trip correctly.
  if (fd?.id) hiddenInput.id = fd.id;

  fieldEl.append(input, calIcon);
  wrapper.append(labelEl, fieldEl, hiddenInput);
  block.append(wrapper);

  /* ── Build popover ── */
  const popover = document.createElement('div');
  popover.className = 'dpth-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');
  popover.setAttribute('aria-label', lang === 'th' ? 'ปฏิทิน' : 'Calendar');
  popover.hidden = true;

  const popHeader = document.createElement('div');
  popHeader.className = 'dpth-header';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'dpth-nav';
  btnPrev.setAttribute('aria-label', lang === 'th' ? 'เดือนก่อนหน้า' : 'Previous month');
  btnPrev.innerHTML = '<span aria-hidden="true">&#8249;</span>';

  const monthTitle = document.createElement('h2');
  monthTitle.className = 'dpth-month-title';

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'dpth-nav';
  btnNext.setAttribute('aria-label', lang === 'th' ? 'เดือนถัดไป' : 'Next month');
  btnNext.innerHTML = '<span aria-hidden="true">&#8250;</span>';

  popHeader.append(btnPrev, monthTitle, btnNext);

  const weekRow = document.createElement('div');
  weekRow.className = 'dpth-weekdays';
  WEEKDAYS_TH.forEach((day) => {
    const span = document.createElement('span');
    span.textContent = day;
    weekRow.append(span);
  });

  const grid = document.createElement('div');
  grid.className = 'dpth-grid';
  grid.setAttribute('role', 'grid');

  popover.append(popHeader, weekRow, grid);
  document.body.append(popover);

  /* ── State ── */
  let selected = initialDate ? startOfDay(initialDate) : null;

  // Decide which month to open on. A selected value always wins. Otherwise start
  // from today, but clamp it into the authored [min, max] window so the picker
  // never opens on a month where every day is disabled — e.g. if the max date is
  // in an earlier year, open on the max date's month/year instead of today's.
  function initialViewDate() {
    if (selected) return selected;
    const today = startOfDay(new Date());
    if (maxDate && today > maxDate) return maxDate;
    if (minDate && today < minDate) return minDate;
    return today;
  }
  const viewSeed = initialViewDate();
  let viewYear = viewSeed.getFullYear();
  let viewMonth = viewSeed.getMonth();
  let isOpen = false;

  /* ── Render calendar grid ── */
  function renderGrid() {
    grid.replaceChildren();
    monthTitle.textContent = formatMonthHeader(viewYear, viewMonth);

    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayOfWeek; i += 1) {
      const empty = document.createElement('div');
      empty.className = 'dpth-day dpth-day--empty';
      empty.setAttribute('aria-hidden', 'true');
      grid.append(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellDate = startOfDay(new Date(viewYear, viewMonth, day));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dpth-day';
      btn.textContent = String(day);
      btn.setAttribute('role', 'gridcell');
      btn.dataset.day = String(day);

      const disabled = (minDate && cellDate < minDate) || (maxDate && cellDate > maxDate);
      btn.disabled = disabled;

      if (selected && sameDay(cellDate, selected)) {
        btn.classList.add('dpth-day--selected');
        btn.setAttribute('aria-pressed', 'true');
      }

      grid.append(btn);
    }
  }

  /* ── Commit a chosen day ── */
  function commitDay(day) {
    selected = startOfDay(new Date(viewYear, viewMonth, day));
    input.value = formatDisplayDate(selected, lang);
    // The hidden input is the ONLY element the form model reads. It must hold a
    // clean string in a format the date model accepts (yyyy-MM-dd), built from
    // local parts. The visible input must NOT dispatch change — the form binds
    // by wrapper id, so its human-readable value would overwrite the model with
    // an unparseable string and the field would save nothing.
    hiddenInput.value = toLocalISO(selected, lang === 'th');
    hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    renderGrid();
  }
  /* ── Open / close ── */
  function openPopover() {
    isOpen = true;
    if (selected) {
      viewYear = selected.getFullYear();
      viewMonth = selected.getMonth();
    }
    input.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    renderGrid();
    positionPopover(fieldEl, popover);
  }

  function closePopover() {
    if (!isOpen) return;
    isOpen = false;
    input.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
  }

  /* ── Shift month ── */
  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderGrid();
  }

  /* ── Event wiring ── */
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button.dpth-day');
    if (!btn || btn.disabled) return;
    commitDay(Number.parseInt(btn.dataset.day, 10));
    closePopover();
    input.focus();
  });

  // Keyboard: Enter/Space selects the focused day button inside the grid
  grid.addEventListener('keydown', (e) => {
    const btn = document.activeElement;
    if (!btn || !btn.classList.contains('dpth-day') || btn.disabled) return;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      commitDay(Number.parseInt(btn.dataset.day, 10));
      closePopover();
      input.focus();
      return;
    }

    // Arrow key navigation within the grid
    const days = [...grid.querySelectorAll('button.dpth-day:not([disabled])')]
      .filter((b) => !b.classList.contains('dpth-day--empty'));
    const idx = days.indexOf(btn);
    let next = -1;
    if (e.key === 'ArrowRight') next = idx + 1;
    else if (e.key === 'ArrowLeft') next = idx - 1;
    else if (e.key === 'ArrowDown') next = idx + 7;
    else if (e.key === 'ArrowUp') next = idx - 7;
    if (next >= 0 && next < days.length) {
      e.preventDefault();
      days[next].focus();
    }
  });

  btnPrev.addEventListener('click', (e) => { e.stopPropagation(); shiftMonth(-1); });
  btnNext.addEventListener('click', (e) => { e.stopPropagation(); shiftMonth(+1); });

  // Keyboard: Enter/Space on the trigger opens/closes the popover
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen) closePopover(); else openPopover();
    }
  });

  fieldEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) closePopover(); else openPopover();
  });

  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (!popover.contains(e.target) && !fieldEl.contains(e.target)) closePopover();
  });

  // Focus trap inside the dialog — Tab/Shift+Tab wraps within popover focusable elements
  popover.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closePopover(); input.focus(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...popover.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { e.stopPropagation(); closePopover(); input.focus(); }
  });

  const onReposition = () => { if (isOpen) positionPopover(fieldEl, popover); };
  window.addEventListener('resize', onReposition);
  window.addEventListener('scroll', onReposition, true);

  /* ── Set initial display value ── */
  if (selected) {
    input.value = formatDisplayDate(selected, lang);
    hiddenInput.value = toLocalISO(selected, lang === 'th');
    // Seed the form model with the default value so it submits without the user
    // re-picking it.
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ── Public API ── */
  return {
    open: openPopover,
    close: closePopover,
    getValue: () => (selected ? new Date(selected.getTime()) : null),
    setValue(d) {
      selected = d ? startOfDay(d) : null;
      if (selected) {
        viewYear = selected.getFullYear();
        viewMonth = selected.getMonth();
        input.value = formatDisplayDate(selected, lang);
        hiddenInput.value = toLocalISO(selected, lang === 'th');
      } else {
        input.value = '';
        hiddenInput.value = '';
      }
      hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
      hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
      if (isOpen) renderGrid();
    },
    destroy() {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      popover.remove();
    },
  };
}

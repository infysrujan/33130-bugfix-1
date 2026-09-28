/* eslint-env browser */
import { subscribe } from '../../rules/index.js';

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
const WEEKDAYS_SHORT_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const WEEKDAYS_FULL_TH = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
const WEEKDAYS_FULL_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ── Pattern-based format/parse ─────────────────────────────────────────────
   Handles the fixed set of pattern strings offered in _calendar.json's
   displayFormat/valueFormat select options: EEEE, MMMM, MM, M, dd, d, yyyy, y,
   plus a literal " (BE)" suffix meaning "render the year as Buddhist Era and
   use Thai month/weekday names". ── */

function stripBeSuffix(pattern) {
  const isBE = /\(BE\)\s*$/.test(pattern);
  return { isBE, basePattern: pattern.replace(/\s*\(BE\)\s*$/, '').trim() };
}

function formatByPattern(date, pattern, lang) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  if (!pattern) return date.toISOString().split('T')[0];

  const { isBE, basePattern } = stripBeSuffix(pattern);
  const useThai = isBE || lang === 'th';
  const monthNames = useThai ? MONTHS_TH : MONTHS_EN;
  const weekdayNames = useThai ? WEEKDAYS_FULL_TH : WEEKDAYS_FULL_EN;
  const year = date.getFullYear() + (isBE ? BE_OFFSET : 0);
  const day = date.getDate();
  const month = date.getMonth();

  // Longer tokens first so e.g. "MMMM" isn't partially eaten by "M".
  return basePattern
    .replace(/EEEE/g, weekdayNames[date.getDay()])
    .replace(/MMMM/g, monthNames[month])
    .replace(/MM/g, String(month + 1).padStart(2, '0'))
    .replace(/M/g, String(month + 1))
    .replace(/dd/g, String(day).padStart(2, '0'))
    .replace(/d/g, String(day))
    .replace(/yyyy/g, String(year))
    .replace(/y/g, String(year));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPatternRegex(basePattern) {
  const tokenRe = /(EEEE|MMMM|yyyy|MM|dd|M|d|y)/g;
  const groupOrder = [];
  let regexStr = '';
  let lastIndex = 0;
  let match = tokenRe.exec(basePattern);
  while (match) {
    regexStr += escapeRegExp(basePattern.slice(lastIndex, match.index));
    const token = match[0];
    if (token === 'EEEE') {
      regexStr += '\\S+';
    } else if (token === 'MMMM') {
      regexStr += '(.+?)';
      groupOrder.push('MMMM');
    } else if (token === 'yyyy' || token === 'y') {
      regexStr += '(\\d{1,4})';
      groupOrder.push('year');
    } else if (token === 'MM' || token === 'M') {
      regexStr += '(\\d{1,2})';
      groupOrder.push('month');
    } else {
      regexStr += '(\\d{1,2})'; // dd or d
      groupOrder.push('day');
    }
    lastIndex = match.index + token.length;
    match = tokenRe.exec(basePattern);
  }
  regexStr += escapeRegExp(basePattern.slice(lastIndex));
  return { regex: new RegExp(`^${regexStr}$`), groupOrder };
}

function parseByPattern(str, pattern, lang) {
  if (!str || !pattern) return null;
  const { isBE, basePattern } = stripBeSuffix(pattern);
  const { regex, groupOrder } = buildPatternRegex(basePattern);
  const m = str.trim().match(regex);
  if (!m) return null;

  const useThai = isBE || lang === 'th';
  const monthNames = useThai ? MONTHS_TH : MONTHS_EN;
  let day = 1;
  let month = 0;
  let year = null;

  groupOrder.forEach((key, i) => {
    const val = m[i + 1];
    if (key === 'day') day = parseInt(val, 10);
    else if (key === 'month') month = parseInt(val, 10) - 1;
    else if (key === 'year') year = parseInt(val, 10);
    else if (key === 'MMMM') {
      const idx = monthNames.findIndex((n) => n === val.trim());
      month = idx >= 0 ? idx : 0;
    }
  });

  if (year === null) return null;
  if (isBE) year -= BE_OFFSET;
  return startOfDay(new Date(year, month, day));
}

/* ── Date helpers ────────────────────────────────────────────────────────── */

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

function getDisplayLang() {
  const raw = (document.documentElement.lang || 'en').toLowerCase().trim();
  return (raw === 'th' || raw.startsWith('th-')) ? 'th' : 'en';
}

/* ── Popover positioning ─────────────────────────────────────────────────── */

function positionPopover(trigger, popover) {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  let top = rect.bottom + margin;
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

let instanceCount = 0;

/**
 * decorate(element, fieldJson, container, formId)
 * fieldJson.properties holds authorable props: displayFormat, valueFormat.
 * fieldJson.minimumDate / fieldJson.maximumDate come from the standard
 * date-input validation fields (ISO-parseable strings).
 */
export default function decorate(element, fieldJson, container, formId) {
  const lang = getDisplayLang();
  instanceCount += 1;
  const inputId = `dpth-input-${instanceCount}`;

  const nativeInput = element.querySelector('input[type="date"], input');
  if (!nativeInput) return element;

  nativeInput.style.display = 'none';
  nativeInput.setAttribute('aria-hidden', 'true');
  nativeInput.setAttribute('tabindex', '-1');

  const props = fieldJson?.properties || {};
  const displayFormat = props.displayFormat || 'd MMMM y (BE)';
  const valueFormat = props.valueFormat || 'd MMMM y (BE)';

  const minDate = fieldJson?.minimumDate ? startOfDay(new Date(fieldJson.minimumDate)) : null;
  const maxDate = fieldJson?.maximumDate ? startOfDay(new Date(fieldJson.maximumDate)) : null;
  const placeholder = fieldJson?.placeholder
    || (lang === 'th' ? 'วว เดือน ปปปป' : 'Month DD, YYYY');

  element.classList.add('dpth-wrapper');
  if (props.customClassName) element.classList.add(...props.customClassName.split(/\s+/).filter(Boolean));

  const fieldEl = document.createElement('div');
  fieldEl.className = 'dpth-field';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.className = 'dpth-input';
  input.placeholder = placeholder;
  input.readOnly = true;
  input.setAttribute('aria-haspopup', 'dialog');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('tabindex', '0');
  if (fieldJson?.label?.value) input.setAttribute('aria-label', fieldJson.label.value);

  const calIcon = document.createElement('span');
  calIcon.className = 'dpth-icon icon-calendar';
  calIcon.setAttribute('aria-hidden', 'true');

  fieldEl.append(input, calIcon);
  nativeInput.insertAdjacentElement('afterend', fieldEl);

  /* ── Popover ── */
  const popover = document.createElement('div');
  popover.className = 'dpth-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');
  popover.setAttribute('aria-label', lang === 'th' ? 'ปฏิทิน' : 'Calendar');
  popover.hidden = true;

  const popHeader = document.createElement('div');
  popHeader.className = 'dpth-header';

  const monthSelect = document.createElement('select');
  monthSelect.className = 'dpth-month-select';
  monthSelect.setAttribute('aria-label', lang === 'th' ? 'เลือกเดือน' : 'Select month');
  MONTHS_TH.forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = name;
    monthSelect.append(opt);
  });

  const today = new Date();
  const yearRangeStart = minDate ? minDate.getFullYear() : today.getFullYear() - 100;
  const yearRangeEnd = maxDate ? maxDate.getFullYear() : today.getFullYear() + 10;

  const yearSelect = document.createElement('select');
  yearSelect.className = 'dpth-year-select';
  yearSelect.setAttribute('aria-label', lang === 'th' ? 'เลือกปี' : 'Select year');
  for (let y = yearRangeEnd; y >= yearRangeStart; y -= 1) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y + BE_OFFSET);
    yearSelect.append(opt);
  }

  popHeader.append(monthSelect, yearSelect);

  const weekRow = document.createElement('div');
  weekRow.className = 'dpth-weekdays';
  WEEKDAYS_SHORT_TH.forEach((day) => {
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
  const initialRaw = fieldJson?.value ?? fieldJson?.default ?? null;
  let selected = initialRaw ? parseByPattern(String(initialRaw), valueFormat, lang) : null;
  let viewYear = (selected || new Date()).getFullYear();
  let viewMonth = (selected || new Date()).getMonth();
  let isOpen = false;

  function syncHeaderControls() {
    monthSelect.value = String(viewMonth);
    const clampedYear = Math.min(Math.max(viewYear, yearRangeStart), yearRangeEnd);
    yearSelect.value = String(clampedYear);
  }

  function renderGrid() {
    grid.replaceChildren();
    syncHeaderControls();

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

  subscribe(element, formId, (fieldDiv, fieldModel) => {
    function commitDay(day) {
      selected = startOfDay(new Date(viewYear, viewMonth, day));
      input.value = formatByPattern(selected, displayFormat, lang);
      fieldModel.value = formatByPattern(selected, valueFormat, lang);
      renderGrid();
    }

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('button.dpth-day');
      if (!btn || btn.disabled) return;
      commitDay(Number.parseInt(btn.dataset.day, 10));
      closePopover();
      input.focus();
    });

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

    fieldModel.subscribe((e) => {
      const { payload } = e;
      payload?.changes?.forEach((change) => {
        if (change?.propertyName === 'value') {
          selected = change.currentValue ? parseByPattern(String(change.currentValue), valueFormat, lang) : null;
          input.value = selected ? formatByPattern(selected, displayFormat, lang) : '';
          if (isOpen) renderGrid();
        }
      });
    });
  });

  monthSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    viewMonth = Number.parseInt(monthSelect.value, 10);
    renderGrid();
  });

  yearSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    viewYear = Number.parseInt(yearSelect.value, 10);
    renderGrid();
  });

  monthSelect.addEventListener('click', (e) => e.stopPropagation());
  yearSelect.addEventListener('click', (e) => e.stopPropagation());

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

  popover.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closePopover(); input.focus(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...popover.querySelectorAll('select, button:not([disabled])')];
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

  if (selected) {
    input.value = formatByPattern(selected, displayFormat, lang);
  }

  return element;
}
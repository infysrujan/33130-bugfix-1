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

function parseConfigDate(str) {
  if (!str) return null;
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

export default function decorate(block) {
  const config = parseBlockConfig(block);
  const lang = getDisplayLang();

  instanceCount += 1;
  const inputId = `dpth-input-${instanceCount}`;

  const labelText = config.label || (lang === 'th' ? 'เลือกวันที่' : 'Select date');
  const placeholder = config.placeholder || (lang === 'th' ? 'วว เดือน ปปปป' : 'Month DD, YYYY');
  const fieldName = config.name || 'date';
  const minDate = parseConfigDate(config['min-date']);
  const maxDate = parseConfigDate(config['max-date']) ?? startOfDay(new Date());
  const initialDate = parseConfigDate(config.value);

  /* ── Build DOM ── */
  block.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'dpth-wrapper';

  const labelEl = document.createElement('label');
  labelEl.className = 'dpth-label';
  labelEl.htmlFor = inputId;
  labelEl.textContent = labelText;

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
  let viewYear = (selected || new Date()).getFullYear();
  let viewMonth = (selected || new Date()).getMonth();
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
    const [datePart] = selected.toISOString().split('T');
    hiddenInput.value = datePart;
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
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
    const [datePart] = selected.toISOString().split('T');
    hiddenInput.value = datePart;
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
        const [datePart] = selected.toISOString().split('T');
        hiddenInput.value = datePart;
      } else {
        input.value = '';
        hiddenInput.value = '';
      }
      if (isOpen) renderGrid();
    },
    destroy() {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
      popover.remove();
    },
  };
}

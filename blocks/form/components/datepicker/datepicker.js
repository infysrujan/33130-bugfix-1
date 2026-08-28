/**
 * date component — blocks/form/components/date/date.js
 * Loaded via mappings.js when fd['fd:viewType'] === 'date-picker'.
 * Custom-rendered calendar (not native <input type="date">) so iOS Safari
 * works reliably and out-of-range days can be visually greyed out.
 * Display + submitted value both use the formatted string (e.g. "August 5, 2026").
 */

import { subscribe } from '../../rules/index.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseISO(value) {
  if (!value || typeof value !== 'string') return null;
  const datePart = value.split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (
    date.getFullYear() !== Number(y)
    || date.getMonth() !== Number(mo) - 1
    || date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

function toISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sameDay(a, b) {
  return !!a && !!b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatDate(date, pattern) {
  if (!date) return '';
  const parts = {
    EEEE: '',
    MMMM: MONTH_NAMES[date.getMonth()],
    MMM: MONTH_NAMES[date.getMonth()].slice(0, 3),
    MM: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    yyyy: String(date.getFullYear()),
    M: String(date.getMonth() + 1),
    d: String(date.getDate()),
    y: String(date.getFullYear()),
  };
  return pattern.replace(/EEEE|MMMM|MMM|MM|dd|yyyy|M|d|y/g, (t) => parts[t] ?? t);
}

function buildMarkup() {
  const root = document.createElement('div');
  root.className = 'date-picker';
  root.innerHTML = `
    <div class="date-picker__field">
      <input type="text" class="date-picker__display" readonly inputmode="none" autocomplete="off"
        aria-haspopup="dialog" aria-expanded="false" />
      <button type="button" class="date-picker__trigger" aria-label="Open calendar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm13 9H4v8.5c0 .28.22.5.5.5h15a.5.5 0 0 0 .5-.5V11ZM6 6H4.5a.5.5 0 0 0-.5.5V9h16V6.5a.5.5 0 0 0-.5-.5H18v1a1 1 0 1 1-2 0V6H8v1a1 1 0 1 1-2 0V6Z"/>
        </svg>
      </button>
    </div>
    <div class="date-picker__panel" role="dialog" aria-modal="true" hidden>
      <div class="date-picker__backdrop"></div>
      <div class="date-picker__sheet">
        <div class="date-picker__header">
          <span class="date-picker__month-label"></span>
          <span class="date-picker__nav-group">
            <button type="button" class="date-picker__nav date-picker__nav--prev" aria-label="Previous month">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 8l-6 6 1.4 1.4L12 10.8l4.6 4.6L18 14z"/></svg>
            </button>
            <button type="button" class="date-picker__nav date-picker__nav--next" aria-label="Next month">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 16l6-6-1.4-1.4L12 13.2l-4.6-4.6L6 10z"/></svg>
            </button>
          </span>
        </div>
        <div class="date-picker__weekdays">${WEEKDAY_SHORT.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="date-picker__grid" role="grid"></div>
        <div class="date-picker__footer">
          <button type="button" class="date-picker__clear">Clear</button>
          <button type="button" class="date-picker__today">Today</button>
        </div>
      </div>
    </div>
  `;
  return root;
}

export default async function decorate(fieldWrapper, fd, _container, formId) {
  const existingInput = fieldWrapper.querySelector('input');
  const displayFormat = fd.displayFormat || 'MMMM d, y';
  const valueFormat = fd.valueFormat || displayFormat;

  let minDate = parseISO(fd.minimumDate);
  let maxDate = parseISO(fd.maximumDate);
  let selected = parseISO(fd.value) || parseISO(fd.default) || null;

  const ui = buildMarkup();
  const displayInput = ui.querySelector('.date-picker__display');
  const trigger = ui.querySelector('.date-picker__trigger');
  const panel = ui.querySelector('.date-picker__panel');
  const backdrop = ui.querySelector('.date-picker__backdrop');
  const sheet = ui.querySelector('.date-picker__sheet');
  const monthLabel = ui.querySelector('.date-picker__month-label');
  const prevBtn = ui.querySelector('.date-picker__nav--prev');
  const nextBtn = ui.querySelector('.date-picker__nav--next');
  const grid = ui.querySelector('.date-picker__grid');
  const todayBtn = ui.querySelector('.date-picker__today');
  const clearBtn = ui.querySelector('.date-picker__clear');

  // Actual submitted input — holds the formatted string, e.g. "August 5, 2026".
  const submitInput = document.createElement('input');
  submitInput.type = 'hidden';
  submitInput.id = fd.id;
  submitInput.name = fd.name;
  if (fd.required) submitInput.dataset.required = 'true';

  existingInput?.remove();
  fieldWrapper.append(ui, submitInput);
  fieldWrapper.dataset.required = fd.required;

  const seed = selected || new Date();
  let viewYear = seed.getFullYear();
  let viewMonth = seed.getMonth();

  // The functions below (commit, onOutsideClick, onPanelKeydown, openPanel,
  // closePanel) reference each other in a closure cycle — closePanel removes
  // listeners for onOutsideClick/onPanelKeydown, and those two call closePanel
  // in turn. No linear declaration order satisfies no-use-before-define for
  // all of them; function declarations hoist, so this is safe at runtime.
  /* eslint-disable no-use-before-define */
  function isDisallowed(date) {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  }

  function renderDisplay() {
    if (selected) {
      displayInput.value = formatDate(selected, displayFormat);
      submitInput.value = formatDate(selected, valueFormat);
    } else {
      displayInput.value = '';
      submitInput.value = '';
      displayInput.placeholder = fd.placeholder || 'Select date';
    }
    displayInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function renderCalendar() {
    monthLabel.textContent = new Date(viewYear, viewMonth, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const lastOfPrevMonth = new Date(viewYear, viewMonth, 0);
    const firstOfNextMonth = new Date(viewYear, viewMonth + 1, 1);
    prevBtn.disabled = !!(minDate && lastOfPrevMonth < minDate);
    nextBtn.disabled = !!(maxDate && firstOfNextMonth > maxDate);

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = new Date();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    const cells = [];
    for (let i = 0; i < totalCells; i += 1) {
      const dayNum = i - startOffset + 1;
      const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
      if (!inMonth) {
        cells.push('<span class="date-picker__cell date-picker__cell--empty"></span>');
      } else {
        const cellDate = new Date(viewYear, viewMonth, dayNum);
        const disallowed = isDisallowed(cellDate);
        const isSelected = sameDay(cellDate, selected);
        const isToday = sameDay(cellDate, today);
        const classes = ['date-picker__cell', 'date-picker__day'];
        if (isSelected) classes.push('date-picker__day--selected');
        if (isToday) classes.push('date-picker__day--today');
        if (disallowed) {
          classes.push('date-picker__day--disabled');
        }
        cells.push(
          `<button type="button" class="${classes.join(' ')}" data-date="${toISO(cellDate)}"
            ${disallowed ? 'disabled aria-disabled="true"' : ''}
            aria-selected="${isSelected}"
            tabindex="${isSelected || (!selected && isToday) ? '0' : '-1'}">${dayNum}</button>`,
        );
      }
    }
    grid.innerHTML = cells.join('');
  }

  function commit(date, { keepOpen = false } = {}) {
    if (date && isDisallowed(date)) return;
    selected = date || null;
    renderDisplay();
    renderCalendar();
    fieldWrapper.dispatchEvent(new CustomEvent('date-picker:change', {
      bubbles: true,
      detail: {
        value: selected ? formatDate(selected, valueFormat) : '',
        iso: selected ? toISO(selected) : '',
      },
    }));
    submitInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (!keepOpen) closePanel();
  }

  function shiftMonth(delta) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    viewMonth = m;
    viewYear = y;
    renderCalendar();
  }

  function positionPanel() {
    if (window.matchMedia('(max-width: 640px)').matches) return;
    const fieldRect = ui.querySelector('.date-picker__field').getBoundingClientRect();
    const sheetHeight = sheet.offsetHeight;
    const spaceBelow = window.innerHeight - fieldRect.bottom;
    const flip = spaceBelow < sheetHeight + 16 && fieldRect.top > sheetHeight + 16;
    panel.classList.toggle('date-picker__panel--flip', flip);
  }

  function onOutsideClick(e) {
    if (!ui.contains(e.target)) closePanel();
  }

  function onPanelKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      return;
    }
    const active = document.activeElement;
    if (!active || !active.classList.contains('date-picker__day')) return;
    const deltaMap = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (e.key in deltaMap) {
      e.preventDefault();
      const current = parseISO(active.getAttribute('data-date'));
      const next = new Date(current.getTime() + deltaMap[e.key] * DAY_MS);
      if (next.getMonth() !== viewMonth || next.getFullYear() !== viewYear) {
        viewMonth = next.getMonth();
        viewYear = next.getFullYear();
        renderCalendar();
      }
      const target = grid.querySelector(`[data-date="${toISO(next)}"]`);
      if (target && !target.disabled) target.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!active.disabled) commit(parseISO(active.getAttribute('data-date')));
    }
  }

  function openPanel() {
    if (fieldWrapper.dataset.enabled === 'false') return;
    panel.hidden = false;
    displayInput.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutsideClick, true);
    panel.addEventListener('keydown', onPanelKeydown);
    document.body.classList.add('date-picker-scroll-lock');
    requestAnimationFrame(() => {
      positionPanel();
      const focusTarget = grid.querySelector('.date-picker__day--selected')
        || grid.querySelector('.date-picker__day--today')
        || grid.querySelector('.date-picker__day:not(:disabled)');
      focusTarget?.focus();
    });
  }

  function closePanel() {
    if (panel.hidden) return;
    panel.hidden = true;
    displayInput.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsideClick, true);
    panel.removeEventListener('keydown', onPanelKeydown);
    document.body.classList.remove('date-picker-scroll-lock');
  }

  /* eslint-enable no-use-before-define */

  displayInput.addEventListener('click', openPanel);
  trigger.addEventListener('click', openPanel);
  backdrop.addEventListener('click', closePanel);
  prevBtn.addEventListener('click', () => shiftMonth(-1));
  nextBtn.addEventListener('click', () => shiftMonth(1));
  clearBtn.addEventListener('click', () => commit(null));
  todayBtn.addEventListener('click', () => {
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    commit(today, { keepOpen: true });
  });
  grid.addEventListener('click', (e) => {
    const cell = e.target.closest('button[data-date]');
    if (!cell || cell.disabled) return;
    commit(parseISO(cell.getAttribute('data-date')));
  });

  renderDisplay();
  renderCalendar();

  // Manual/test hook — same effect as a rule update.
  fieldWrapper.updateDateConstraints = ({ minimum, maximum } = {}) => {
    if (minimum !== undefined) minDate = minimum ? parseISO(minimum) : null;
    if (maximum !== undefined) maxDate = maximum ? parseISO(maximum) : null;
    if (selected && isDisallowed(selected)) selected = null;
    renderDisplay();
    renderCalendar();
  };

  function setDisabled(disabled) {
    trigger.disabled = disabled;
    displayInput.disabled = disabled;
    ui.classList.toggle('date-picker--disabled', disabled);
    if (disabled) closePanel();
  }

  // Rule-engine hook — same subscribe pattern as double-key-dropdown.js.
  if (formId) {
    subscribe(fieldWrapper, formId, (el, model, eventType, payload) => {
      if (eventType === 'register') return;
      if (eventType !== 'change') return;

      const changes = payload?.changes || [];
      let boundsTouched = false;

      changes.forEach((c) => {
        switch (c.propertyName) {
          case 'minimum':
          case 'minimumDate':
            minDate = c.currentValue ? parseISO(c.currentValue) : null;
            boundsTouched = true;
            break;
          case 'maximum':
          case 'maximumDate':
            maxDate = c.currentValue ? parseISO(c.currentValue) : null;
            boundsTouched = true;
            break;
          case 'value':
            selected = c.currentValue ? parseISO(c.currentValue) : null;
            boundsTouched = true;
            break;
          case 'enabled':
            setDisabled(c.currentValue === false);
            break;
          case 'visible':
            fieldWrapper.dataset.visible = c.currentValue === false ? 'false' : undefined;
            break;
          default:
            break;
        }
      });

      if (boundsTouched) {
        if (selected && isDisallowed(selected)) selected = null;
        renderDisplay();
        renderCalendar();
      }
    }, { listenChanges: true });
  }
}

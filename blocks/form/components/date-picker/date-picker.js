/**
 * date-picker component — blocks/form/components/date-picker/date-picker.js
 * Custom-rendered calendar.
 */

import { subscribe } from '../../rules/index.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const YEAR_RANGE_PAST = 100;
const YEAR_RANGE_FUTURE = 20;
const VALID_FORMATS = ['MMMM d, y', 'MMM d, y', 'dd/MM/yyyy', 'yyyy-MM-dd'];

function sanitizeFormat(pattern) {
  return VALID_FORMATS.includes(pattern) ? pattern : 'MMMM d, y';
}

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
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function formatDate(date, pattern) {
  if (!date) return '';
  const parts = {
    MMMM: MONTH_NAMES[date.getMonth()],
    MMM: MONTH_NAMES[date.getMonth()].slice(0, 3),
    MM: pad2(date.getMonth() + 1),
    dd: pad2(date.getDate()),
    yyyy: String(date.getFullYear()),
    M: String(date.getMonth() + 1),
    d: String(date.getDate()),
    y: String(date.getFullYear()),
  };
  return pattern.replace(/MMMM|MMM|MM|dd|yyyy|M|d|y/g, (t) => parts[t] ?? t);
}

function buildMarkup() {
  const root = document.createElement('div');
  root.className = 'date-picker';
  root.innerHTML = `
    <div class="date-picker-field">
      <input type="text" class="date-picker-display" readonly inputmode="none" autocomplete="off" aria-haspopup="dialog" aria-expanded="false" />
      <button type="button" class="date-picker-trigger" aria-label="Open calendar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1.5A2.5 2.5 0 0 1 22 6.5v13A2.5 2.5 0 0 1 19.5 22h-15A2.5 2.5 0 0 1 2 19.5v-13A2.5 2.5 0 0 1 4.5 4H6V3a1 1 0 0 1 1-1Zm13 9H4v8.5c0 .28.22.5.5.5h15a.5.5 0 0 0 .5-.5V11ZM6 6H4.5a.5.5 0 0 0-.5.5V9h16V6.5a.5.5 0 0 0-.5-.5H18v1a1 1 0 1 1-2 0V6H8v1a1 1 0 1 1-2 0V6Z"/></svg>
      </button>
    </div>
    <div class="date-picker-panel" role="dialog" aria-modal="true" hidden>
      <div class="date-picker-backdrop"></div>
      <div class="date-picker-sheet">
        <div class="date-picker-header">
          <button type="button" class="date-picker-month-label">
            <span class="date-picker-month-label-text"></span>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg>
          </button>
          <span class="date-picker-nav-group">
            <button type="button" class="date-picker-nav date-picker-nav-prev" aria-label="Previous month">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 8l-6 6 1.4 1.4L12 10.8l4.6 4.6L18 14z"/></svg>
            </button>
            <button type="button" class="date-picker-nav date-picker-nav-next" aria-label="Next month">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 16l6-6-1.4-1.4L12 13.2l-4.6-4.6L6 10z"/></svg>
            </button>
          </span>
        </div>
        <div class="date-picker-yearmonth" hidden>
          <div class="date-picker-year-list" role="listbox" aria-label="Select year"></div>
          <div class="date-picker-month-grid" role="listbox" aria-label="Select month"></div>
        </div>
        <div class="date-picker-daybody">
          <div class="date-picker-weekdays">${WEEKDAY_SHORT.map((d) => `<span>${d}</span>`).join('')}</div>
          <div class="date-picker-grid" role="grid"></div>
        </div>
        <div class="date-picker-footer">
          <button type="button" class="date-picker-clear">Clear</button>
          <button type="button" class="date-picker-today">Today</button>
        </div>
      </div>
    </div>
  `;
  return root;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

export default async function decorate(fieldWrapper, fd, _container, formId) {
  try {
    const existingInput = fieldWrapper.querySelector('input');
    const displayFormat = sanitizeFormat(fd.displayFormat);
    const valueFormat = sanitizeFormat(fd.valueFormat || fd.displayFormat);

    let minDate = parseISO(fd.minimum) || parseISO(fd.minimumDate);
    let maxDate = parseISO(fd.maximum) || parseISO(fd.maximumDate);
    let selected = parseISO(fd.value) || parseISO(fd.default) || null;

    const ui = buildMarkup();
    const field = ui.querySelector('.date-picker-field');
    const displayInput = ui.querySelector('.date-picker-display');
    const trigger = ui.querySelector('.date-picker-trigger');
    const panel = ui.querySelector('.date-picker-panel');
    const backdrop = ui.querySelector('.date-picker-backdrop');
    const sheet = ui.querySelector('.date-picker-sheet');
    const monthLabelBtn = ui.querySelector('.date-picker-month-label');
    const monthLabelText = ui.querySelector('.date-picker-month-label-text');
    const prevBtn = ui.querySelector('.date-picker-nav-prev');
    const nextBtn = ui.querySelector('.date-picker-nav-next');
    const grid = ui.querySelector('.date-picker-grid');
    const weekdaysEl = ui.querySelector('.date-picker-weekdays');
    const todayBtn = ui.querySelector('.date-picker-today');
    const clearBtn = ui.querySelector('.date-picker-clear');
    const yearMonthPanel = ui.querySelector('.date-picker-yearmonth');
    const yearList = ui.querySelector('.date-picker-year-list');
    const monthGrid = ui.querySelector('.date-picker-month-grid');
    const dayBody = ui.querySelector('.date-picker-daybody');

    if (!displayInput || !trigger || !panel || !grid || !monthLabelText) {
      // eslint-disable-next-line no-console
      console.error('date-picker: markup/query mismatch, aborting decorate');
      return;
    }

    ui.querySelectorAll('[title]').forEach((el) => el.removeAttribute('title'));

    const submitInput = document.createElement('input');
    submitInput.type = 'hidden';
    submitInput.id = fd.id;
    submitInput.name = fd.name;
    if (fd.required) submitInput.dataset.required = 'true';

    existingInput?.remove();
    fieldWrapper.append(ui, submitInput);
    fieldWrapper.dataset.required = fd.required;

    const today = new Date();

    const fallbackSeed = maxDate && maxDate < today ? maxDate : today;
    const seed = selected || fallbackSeed;
    let viewYear = seed.getFullYear();
    let viewMonth = seed.getMonth();
    let yearMonthOpen = false;

    const isDisallowed = (date) => {
      if (minDate && date < minDate) return true;
      if (maxDate && date > maxDate) return true;
      return false;
    };

    const clearFieldError = () => {
      fieldWrapper.classList.remove('field-invalid');
      const desc = fieldWrapper.querySelector('.field-description');
      if (desc) {
        const requiredMsg = fieldWrapper.dataset.requiredErrorMessage;
        const minMsg = fieldWrapper.dataset.minimumErrorMessage;
        const maxMsg = fieldWrapper.dataset.maximumErrorMessage;
        if ([requiredMsg, minMsg, maxMsg].includes(desc.textContent)) {
          desc.remove();
        }
      }
    };

    const enforceLayout = () => {
      field.style.setProperty('height', '42.22px', 'important');
      field.style.setProperty('border', '1px solid #d1d5db', 'important');
      field.style.setProperty('border-radius', '4px', 'important');
      displayInput.style.setProperty('border', 'none', 'important');
      displayInput.style.setProperty('padding', '0 4px 0 20px', 'important');
      displayInput.style.setProperty('font-size', '14px', 'important');
      displayInput.style.setProperty('height', '100%', 'important');

      trigger.style.setProperty('width', '34px', 'important');
      trigger.style.setProperty('height', '100%', 'important');
      trigger.style.setProperty('min-width', '34px', 'important');
      trigger.style.setProperty('background', 'transparent', 'important');
      trigger.style.setProperty('border', 'none', 'important');
      trigger.style.setProperty(
        'display',
        ui.classList.contains('date-picker-icon-visible') ? 'flex' : 'none',
        'important',
      );

      sheet.style.setProperty('width', '230px', 'important');
      sheet.style.setProperty('max-width', '85vw', 'important');
      sheet.style.setProperty('overflow-x', 'hidden', 'important');

      if (weekdaysEl) {
        weekdaysEl.style.setProperty('display', 'grid', 'important');
        weekdaysEl.style.setProperty('grid-template-columns', 'repeat(7, 1fr)', 'important');
        weekdaysEl.style.setProperty('width', '100%', 'important');
      }

      grid.style.setProperty('display', 'grid', 'important');
      grid.style.setProperty('grid-template-columns', 'repeat(7, 1fr)', 'important');
      grid.style.setProperty('gap', '1px', 'important');
      grid.style.setProperty('width', '100%', 'important');

      grid.querySelectorAll('.date-picker-day').forEach((btn) => {
        const isSelected = btn.classList.contains('date-picker-day-selected');
        btn.style.setProperty('width', '100%', 'important');
        btn.style.setProperty('height', '100%', 'important');
        btn.style.setProperty('display', 'flex', 'important');
        btn.style.setProperty('align-items', 'center', 'important');
        btn.style.setProperty('justify-content', 'center', 'important');
        btn.style.setProperty('border-radius', '4px', 'important');
        btn.style.setProperty('box-sizing', 'border-box', 'important');
        if (isSelected) return;
        btn.style.setProperty('color', btn.disabled ? '' : '#000', 'important');
        btn.style.setProperty('background', 'transparent', 'important');
      });

      if (monthLabelBtn) {
        monthLabelBtn.style.setProperty('background', 'transparent', 'important');
        monthLabelBtn.style.setProperty('color', '#000', 'important');
        monthLabelBtn.style.setProperty('border', 'none', 'important');
      }

      ui.querySelectorAll('.date-picker-year-item').forEach((btn) => {
        const isActive = btn.classList.contains('date-picker-year-item-active');
        if (isActive) {
          btn.style.setProperty('background', '#222', 'important');
          btn.style.setProperty('color', '#fff', 'important');
          btn.style.setProperty('font-weight', '700', 'important');
        } else {
          btn.style.setProperty('background', btn.disabled ? '#f2f2f2' : '#e0e0e0', 'important');
          btn.style.setProperty('color', btn.disabled ? '#aaa' : '#000', 'important');
          btn.style.setProperty('font-weight', '400', 'important');
        }
      });

      ui.querySelectorAll('.date-picker-month-item').forEach((btn) => {
        const isActive = btn.classList.contains('date-picker-month-item-active');
        if (isActive) {
          btn.style.setProperty('background', '#333', 'important');
          btn.style.setProperty('color', '#fff', 'important');
        } else if (btn.disabled) {
          btn.style.setProperty('background', 'transparent', 'important');
          btn.style.setProperty('color', '#ccc', 'important');
        } else {
          btn.style.setProperty('background', 'transparent', 'important');
          btn.style.setProperty('color', '#000', 'important');
        }
      });

      ui.querySelectorAll('button').forEach((btn) => {
        btn.style.setProperty('min-width', '0', 'important');
        btn.removeAttribute('title');
      });
    };

    const showIcon = () => {
      ui.classList.add('date-picker-icon-visible');
      enforceLayout();
    };

    const hideIconIfClosed = () => {
      if (panel.hidden && document.activeElement !== displayInput) {
        ui.classList.remove('date-picker-icon-visible');
        enforceLayout();
      }
    };

    const renderDisplay = () => {
      if (selected) {
        displayInput.value = formatDate(selected, displayFormat);
        submitInput.value = formatDate(selected, valueFormat);
      } else {
        displayInput.value = '';
        submitInput.value = '';
      }
      displayInput.placeholder = fd.placeholder || 'MM/DD/YYYY';
      submitInput.dispatchEvent(new Event('input', { bubbles: true }));
      submitInput.dispatchEvent(new Event('change', { bubbles: true }));
      fieldWrapper.dispatchEvent(new Event('input', { bubbles: true }));
      fieldWrapper.dispatchEvent(new Event('change', { bubbles: true }));
      enforceLayout();
    };

    const renderCalendar = () => {
      monthLabelText.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const lastOfPrevMonth = new Date(viewYear, viewMonth, 0);
      const firstOfNextMonth = new Date(viewYear, viewMonth + 1, 1);
      if (prevBtn) prevBtn.disabled = !!(minDate && lastOfPrevMonth < minDate);
      if (nextBtn) nextBtn.disabled = !!(maxDate && firstOfNextMonth > maxDate);

      const firstOfMonth = new Date(viewYear, viewMonth, 1);
      const startOffset = firstOfMonth.getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

      const cells = [];
      for (let i = 0; i < totalCells; i += 1) {
        const dayNum = i - startOffset + 1;
        const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
        if (!inMonth) {
          cells.push('<span class="date-picker-cell"></span>');
        } else {
          const cellDate = new Date(viewYear, viewMonth, dayNum);
          const disallowed = isDisallowed(cellDate);
          const isSelected = sameDay(cellDate, selected);
          const isToday = sameDay(cellDate, today);
          const classes = ['date-picker-cell', 'date-picker-day'];
          if (isSelected) classes.push('date-picker-day-selected');
          if (isToday) classes.push('date-picker-day-today');
          if (disallowed) classes.push('date-picker-day-disabled');
          cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${toISO(cellDate)}" ${disallowed ? 'disabled' : ''}>${dayNum}</button>`);
        }
      }
      grid.innerHTML = cells.join('');
      enforceLayout();
    };

    const renderYearList = () => {
      if (!yearList) return;
      const nowYear = today.getFullYear();
      const startYear = minDate ? minDate.getFullYear() : nowYear - YEAR_RANGE_PAST;
      const endYear = maxDate ? maxDate.getFullYear() : nowYear + YEAR_RANGE_FUTURE;
      const items = [];
      for (let y = startYear; y <= endYear; y += 1) {
        items.push(`<button type="button" class="date-picker-year-item${y === viewYear ? ' date-picker-year-item-active' : ''}" data-year="${y}">${y}</button>`);
      }
      yearList.innerHTML = items.join('');
      requestAnimationFrame(() => {
        const target = yearList.querySelector('.date-picker-year-item-active');
        target?.scrollIntoView({ block: 'center' });
        enforceLayout();
      });
    };

    const renderMonthGrid = () => {
      if (!monthGrid) return;
      const items = MONTH_SHORT.map((label, i) => {
        const monthEnd = new Date(viewYear, i + 1, 0);
        const monthStart = new Date(viewYear, i, 1);
        const disallowed = (minDate && monthEnd < minDate) || (maxDate && monthStart > maxDate);
        const isActive = i === viewMonth;
        return `<button type="button" class="date-picker-month-item${isActive ? ' date-picker-month-item-active' : ''}" data-month="${i}" ${disallowed ? 'disabled' : ''}>${label}</button>`;
      });
      monthGrid.innerHTML = items.join('');
      enforceLayout();
    };

    const openYearMonthPicker = () => {
      if (!yearMonthPanel || !dayBody) return;
      yearMonthOpen = true;
      yearMonthPanel.hidden = false;
      dayBody.hidden = true;
      renderYearList();
      renderMonthGrid();
    };

    const closeYearMonthPicker = () => {
      if (!yearMonthPanel || !dayBody) return;
      yearMonthOpen = false;
      yearMonthPanel.hidden = true;
      dayBody.hidden = false;
    };

    let onOutsideClick;

    const closePanel = () => {
      if (panel.hidden) return;
      closeYearMonthPicker();
      panel.hidden = true;
      displayInput.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', onOutsideClick, true);
      hideIconIfClosed();
    };

    const commit = (date, { keepOpen = false } = {}) => {
      if (date && isDisallowed(date)) return;
      selected = date || null;
      renderDisplay();
      renderCalendar();
      if (selected) clearFieldError();
      if (!keepOpen) closePanel();
    };

    const shiftMonth = (delta) => {
      let m = viewMonth + delta;
      let y = viewYear;
      if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
      viewMonth = m;
      viewYear = y;
      renderCalendar();
    };

    const positionPanel = () => {
      if (window.matchMedia('(max-width: 640px)').matches) {
        panel.classList.remove('date-picker-panel-flip');
        return;
      }
      const fieldRect = field.getBoundingClientRect();
      const sheetHeight = sheet.offsetHeight || 400;
      const spaceBelow = window.innerHeight - fieldRect.bottom;
      const flip = spaceBelow < sheetHeight + 16 && fieldRect.top > sheetHeight + 16;
      panel.classList.toggle('date-picker-panel-flip', flip);
    };

    onOutsideClick = (e) => {
      if (!ui.contains(e.target)) closePanel();
    };

    const openPanel = () => {
      if (fieldWrapper.dataset.enabled === 'false') return;
      panel.hidden = false;
      displayInput.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onOutsideClick, true);
      requestAnimationFrame(positionPanel);
    };

    displayInput.addEventListener('focus', showIcon);
    displayInput.addEventListener('blur', () => {
      setTimeout(hideIconIfClosed, 150);
    });
    displayInput.addEventListener('click', openPanel);
    trigger.addEventListener('click', () => {
      openPanel();
      trigger.blur();
    });
    backdrop?.addEventListener('click', closePanel);
    monthLabelBtn?.addEventListener('click', () => (yearMonthOpen ? closeYearMonthPicker() : openYearMonthPicker()));
    prevBtn?.addEventListener('click', () => shiftMonth(-1));
    nextBtn?.addEventListener('click', () => shiftMonth(1));
    clearBtn?.addEventListener('click', () => commit(null));
    todayBtn?.addEventListener('click', () => {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      closeYearMonthPicker();
      commit(now, { keepOpen: true });
    });
    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('button[data-date]');
      if (!cell || cell.disabled) return;
      commit(parseISO(cell.getAttribute('data-date')));
    });
    yearList?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-year]');
      if (!btn) return;
      viewYear = Number(btn.getAttribute('data-year'));
      renderYearList();
      renderMonthGrid();
    });
    monthGrid?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-month]');
      if (!btn || btn.disabled) return;
      viewMonth = Number(btn.getAttribute('data-month'));
      closeYearMonthPicker();
      renderCalendar();
    });

    renderDisplay();
    renderCalendar();
    if (selected) clearFieldError();

    fieldWrapper.updateDateConstraints = ({ minimum, maximum } = {}) => {
      if (minimum !== undefined) minDate = minimum ? parseISO(minimum) : null;
      if (maximum !== undefined) maxDate = maximum ? parseISO(maximum) : null;
      if (selected && isDisallowed(selected)) selected = null;
      renderDisplay();
      renderCalendar();
    };

    if (formId) {
      subscribe(fieldWrapper, formId, (el, model, eventType, payload) => {
        if (eventType !== 'change') return;
        const changes = payload?.changes || [];
        let touched = false;
        changes.forEach((c) => {
          if (c.propertyName === 'minimum' || c.propertyName === 'minimumDate') { minDate = c.currentValue ? parseISO(c.currentValue) : null; touched = true; }
          if (c.propertyName === 'maximum' || c.propertyName === 'maximumDate') { maxDate = c.currentValue ? parseISO(c.currentValue) : null; touched = true; }
        });
        if (touched) {
          if (selected && isDisallowed(selected)) selected = null;
          renderDisplay();
          renderCalendar();
        }
      }, { listenChanges: true });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('date-picker decorate() failed:', err);
  }
}

import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import {
  buildCalendarGrid,
  buildIntlDayLabels,
  buildIntlMonthLabels,
  formatDateInputValue,
  getMonthKey,
  parseApiDate,
  parseCsvConfigList,
  parseIsoDate,
  parseTypedDate,
} from './helpers/date-helpers.js';
import {
  createApiEndpoints,
  getEnabledDays,
  getLatestRates,
  getRates,
  getUpdatesInDay,
  normalizeRates,
  trimValue,
} from './helpers/api-helpers.js';
import parseAuthoring from './helpers/authoring-helpers.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidSelectedDay(state) {
  const parsed = parseIsoDate(state.selectedDate);
  if (!parsed) return false;
  const selectedMonthKey = getMonthKey(parsed.year, parsed.month);
  const enabledDays = state.enabledDaysByMonth[selectedMonthKey] || [];
  if (!enabledDays.length) return true;
  return enabledDays.includes(parsed.day);
}

function renderDatepicker(
  state,
  monthLabels,
  dayLabels,
  buddhistYearOffset,
  prevMonthLabel,
  nextMonthLabel,
) {
  if (!state.calendarOpen) return '';

  const viewMonthKey = getMonthKey(state.viewYear, state.viewMonth);
  const viewEnabledSet = new Set(state.enabledDaysByMonth[viewMonthKey] || []);
  const calendarWeeks = buildCalendarGrid(state.viewYear, state.viewMonth);
  const maxIndex = state.maxSelectableMonth
    ? state.maxSelectableMonth.year * 12 + state.maxSelectableMonth.month
    : null;
  const viewIndex = state.viewYear * 12 + state.viewMonth;
  const nextDisabled = Boolean(maxIndex && viewIndex >= maxIndex);
  const selectedParsed = parseIsoDate(state.selectedDate);
  const now = new Date();

  const weeksMarkup = calendarWeeks.map((week) => {
    const cells = week.map((cell, index) => {
      if (!cell.inMonth) {
        const weekend = index === 0 || index === 6 ? ' is-weekend' : '';
        return `<td class="is-other-month${weekend}">&nbsp;</td>`;
      }

      const dayValue = String(cell.day).padStart(2, '0');
      const isEnabled = viewEnabledSet.has(dayValue);
      const isSelected = selectedParsed
        && Number(selectedParsed.day) === cell.day
        && Number(selectedParsed.month) === state.viewMonth
        && Number(selectedParsed.year) === state.viewYear;
      const isToday = now.getDate() === cell.day
        && now.getMonth() + 1 === state.viewMonth
        && now.getFullYear() === state.viewYear;

      const classes = [
        index === 0 || index === 6 ? 'is-weekend' : '',
        isEnabled ? 'is-enabled' : 'is-disabled',
        isSelected ? 'is-current' : '',
        isToday ? 'is-today' : '',
      ].filter(Boolean).join(' ');

      if (isEnabled) {
        return `<td class="${classes}"><button type="button" class="forex-rates-datepicker-day-btn" data-day="${cell.day}">${cell.day}</button></td>`;
      }

      return `<td class="${classes}"><span class="forex-rates-datepicker-day-text">${cell.day}</span></td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  const daysHeader = dayLabels.map((dayLabel, index) => {
    const weekend = index === 0 || index === 6 ? 'is-weekend' : '';
    return `<th class="${weekend}">${escapeHtml(dayLabel)}</th>`;
  }).join('');

  return `<div class="forex-rates-datepicker">
    <div class="forex-rates-datepicker-header">
      <button type="button" class="forex-rates-datepicker-nav forex-rates-datepicker-prev" aria-label="${escapeHtml(prevMonthLabel)}"><i class="icon-arrow-left" aria-hidden="true"></i></button>
      <div class="forex-rates-datepicker-title">
        <span class="forex-rates-datepicker-month">${escapeHtml(monthLabels[state.viewMonth - 1] || '')}</span>
        <span class="forex-rates-datepicker-year">${state.viewYear + buddhistYearOffset}</span>
      </div>
      <button type="button" class="forex-rates-datepicker-nav forex-rates-datepicker-next${nextDisabled ? ' is-disabled' : ''}" aria-label="${escapeHtml(nextMonthLabel)}"${nextDisabled ? ' disabled' : ''}><i class="icon-arrow-left" aria-hidden="true"></i></button>
    </div>
    <table class="forex-rates-datepicker-calendar">
      <thead><tr>${daysHeader}</tr></thead>
      <tbody>${weeksMarkup}</tbody>
    </table>
  </div>`;
}

function renderBlock(block, state, authoring, monthLabels, dayLabels, buddhistYearOffset) {
  const selectedUpdateObj = state.updates.find(
    (item) => trimValue(item.Update) === state.selectedUpdate,
  );
  const selectedLabel = selectedUpdateObj
    ? `${trimValue(selectedUpdateObj.Update)}: ${trimValue(selectedUpdateObj.Time)}`
    : (state.selectedUpdate || '');

  const timeItems = state.updates.map((item) => {
    const update = trimValue(item.Update);
    const time = trimValue(item.Time);
    const label = `${update}: ${time}`;
    const isActive = update === state.selectedUpdate;
    return `<li class="forex-rates-time-item${isActive ? ' is-active' : ''}" role="option" aria-selected="${isActive}" data-value="${escapeHtml(update)}">${escapeHtml(label)}</li>`;
  }).join('');

  const timeDropdownOpen = state.timeDropdownOpen ? ' is-open' : '';
  const timeDisabled = !state.updates.length ? ' is-disabled' : '';

  const rows = state.rates.map((rate) => `<tr>
    <td class="forex-rates-currency">
      <img src="/icons/${escapeHtml(rate.family)}.svg" alt="${escapeHtml(rate.family)} flag" loading="lazy" class="forex-rates-flag">
      <span>${escapeHtml(rate.family)}</span>
    </td>
    <td>${escapeHtml(rate.description)}</td>
    <td class="is-right">${escapeHtml(rate.buyingRates)}</td>
    <td class="is-right">${escapeHtml(rate.sellingRates)}</td>
    <td class="is-right">${escapeHtml(rate.sightBill)}</td>
    <td class="is-right">${escapeHtml(rate.tt)}</td>
    <td class="is-right">${escapeHtml(rate.billDdTt)}</td>
  </tr>`).join('');

  const columnWidths = ['30%', '70%', '12%', '12%', '19%', '19%', '19%'];
  const headings = authoring.columns.map((heading, i) => `<th width="${columnWidths[i] || 'auto'}">${heading}</th>`).join('');

  block.innerHTML = `<section class="forex-rates-content">
    <div class="forex-rates-controls">
      <div class="forex-rates-control-row">
        <span class="forex-rates-calendar-label">${escapeHtml(authoring.calendarLabel)}</span>
        <div class="forex-rates-date-group">
          <input id="forex-rates-date-text-input" class="forex-rates-date-text-input" type="text" inputmode="text" placeholder="DD MMM YYYY" value="${escapeHtml(state.typedDate)}" aria-label="${escapeHtml(authoring.calendarLabel)} date">
          <button type="button" class="forex-rates-date-trigger icon-calendar" title="${escapeHtml(authoring.openCalendarLabel)}" aria-label="${escapeHtml(authoring.openCalendarLabel)}"></button>
          ${renderDatepicker(state, monthLabels, dayLabels, buddhistYearOffset, authoring.prevMonthLabel, authoring.nextMonthLabel)}
        </div>
        <div class="forex-rates-time-wrap">
          <div class="forex-rates-time-dropdown${timeDropdownOpen}${timeDisabled}" role="combobox" aria-expanded="${state.timeDropdownOpen}" aria-haspopup="listbox">
            <button type="button" class="forex-rates-time-trigger" aria-label="Select time" ${state.updates.length ? '' : 'disabled'}>
              <span class="forex-rates-time-label">${escapeHtml(selectedLabel)}</span>
              <i class="icon-dropdown forex-rates-time-chevron" aria-hidden="true"></i>
            </button>
            <ul class="forex-rates-time-list" role="listbox">${timeItems}</ul>
          </div>
        </div>
        <button type="button" class="forex-rates-go-btn"${(!state.selectedDate || !state.selectedUpdate || state.loading) ? ' disabled' : ''}>${escapeHtml(authoring.ctaLabel)}</button>
        <button type="button" class="forex-rates-print-btn">${escapeHtml(authoring.printCtaLabel)}<i class="icon-print" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="forex-rates-table-wrap">
      <table class="forex-rates-table">
        <thead><tr>${headings}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="forex-rates-disclaimer">${authoring.disclaimerHtml}</div>
  </section>`;

  block.querySelectorAll('.forex-rates-flag').forEach((img) => {
    img.addEventListener('error', (event) => {
      event.target.style.display = 'none';
    });
  });
}

export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const [placeholders, configs] = await Promise.all([fetchPlaceholders(), fetchConfigs()]);

  authoring.prevMonthLabel = placeholders?.forexRatesPrevMonth || 'Previous month';
  authoring.nextMonthLabel = placeholders?.forexRatesNextMonth || 'Next month';
  authoring.openCalendarLabel = placeholders?.forexRatesOpenCalendar || 'Open calendar';
  const language = document.documentElement.lang?.split('-')[0] || 'en';
  const monthLabels = parseCsvConfigList(configs?.monthLabels, buildIntlMonthLabels(language));
  const dayLabels = parseCsvConfigList(configs?.dayLabels, buildIntlDayLabels(language));
  const buddhistYearOffset = Number(configs?.buddhistYearOffset) || 0;
  const endpoints = createApiEndpoints(configs);

  const state = {
    selectedDate: '',
    selectedUpdate: '',
    updates: [],
    rates: [],
    enabledDaysByMonth: {},
    loading: false,
    typedDate: '',
    calendarOpen: false,
    timeDropdownOpen: false,
    viewMonth: 1,
    viewYear: 1970,
    maxSelectableMonth: null,
  };

  let outsideClickHandler = null;
  let calendarFocusLock = false;

  const render = () => {
    try {
      renderBlock(block, state, authoring, monthLabels, dayLabels, buddhistYearOffset);
    } catch (e) {
      setTimeout(render, 0);
      return;
    }

    const dateGroup = block.querySelector('.forex-rates-date-group');
    const dateInput = block.querySelector('.forex-rates-date-text-input');
    const dateTrigger = block.querySelector('.forex-rates-date-trigger');
    const prevMonth = block.querySelector('.forex-rates-datepicker-prev');
    const nextMonth = block.querySelector('.forex-rates-datepicker-next');
    const dayButtons = block.querySelectorAll('.forex-rates-datepicker-day-btn');
    const timeDropdownEl = block.querySelector('.forex-rates-time-dropdown');
    const timeTrigger = block.querySelector('.forex-rates-time-trigger');
    const goButton = block.querySelector('.forex-rates-go-btn');
    const printButton = block.querySelector('.forex-rates-print-btn');

    const loadRates = async (dateIso, updateValue) => {
      const parsed = parseIsoDate(dateIso);
      if (!parsed || !updateValue) return;
      state.loading = true;
      render();

      try {
        const fxRates = await getRates(
          endpoints,
          parsed.day,
          parsed.month,
          parsed.year,
          updateValue,
          language,
        );
        state.rates = normalizeRates(fxRates);
      } finally {
        state.loading = false;
        render();
      }
    };

    const applyDateSelection = async (dateIso, shouldLoadRates = true) => {
      const parsed = parseIsoDate(dateIso);
      if (!parsed) return false;

      const monthKey = getMonthKey(parsed.year, parsed.month);
      if (!state.enabledDaysByMonth[monthKey]) {
        try {
          state.enabledDaysByMonth[monthKey] = await getEnabledDays(
            endpoints,
            parsed.year,
            parsed.month,
          );
        } catch (e) {
          state.enabledDaysByMonth[monthKey] = [];
        }
      }

      const monthDays = state.enabledDaysByMonth[monthKey] || [];
      if (monthDays.length && !monthDays.includes(parsed.day)) return false;

      state.selectedDate = dateIso;
      state.typedDate = formatDateInputValue(
        state.selectedDate,
        monthLabels,
        buddhistYearOffset,
      );
      state.viewYear = Number(parsed.year);
      state.viewMonth = Number(parsed.month);
      render();

      try {
        const updateOptions = await getUpdatesInDay(
          endpoints,
          parsed.day,
          parsed.month,
          parsed.year,
        );
        const normalizedUpdates = Array.isArray(updateOptions) ? updateOptions : [];
        state.updates = normalizedUpdates;

        const stillExists = normalizedUpdates.some(
          (item) => trimValue(item.Update) === state.selectedUpdate,
        );
        if (!stillExists) {
          state.selectedUpdate = trimValue(normalizedUpdates[normalizedUpdates.length - 1]?.Update);
        }
      } catch (e) {
        // no-op to match live-site silent behavior
      }

      render();
      if (
        shouldLoadRates
        && state.selectedDate
        && state.selectedUpdate
        && isValidSelectedDay(state)
      ) {
        await loadRates(state.selectedDate, state.selectedUpdate);
      }

      return true;
    };

    const submitTypedDateWithFetch = async () => {
      const parsed = parseTypedDate(state.typedDate, buddhistYearOffset);
      if (!parsed) {
        state.typedDate = formatDateInputValue(
          state.selectedDate,
          monthLabels,
          buddhistYearOffset,
        );
        render();
        return;
      }

      const monthKey = getMonthKey(parsed.year, parsed.month);
      if (!state.enabledDaysByMonth[monthKey]) {
        try {
          state.enabledDaysByMonth[monthKey] = await getEnabledDays(
            endpoints,
            parsed.year,
            parsed.month,
          );
        } catch (e) {
          state.enabledDaysByMonth[monthKey] = [];
        }
      }

      const monthDays = state.enabledDaysByMonth[monthKey] || [];
      if (monthDays.length && !monthDays.includes(parsed.day)) {
        state.typedDate = formatDateInputValue(
          state.selectedDate,
          monthLabels,
          buddhistYearOffset,
        );
        render();
        return;
      }

      state.loading = true;
      render();

      try {
        const updateOptions = await getUpdatesInDay(
          endpoints,
          parsed.day,
          parsed.month,
          parsed.year,
        );
        const normalizedUpdates = Array.isArray(updateOptions) ? updateOptions : [];
        const stillExists = normalizedUpdates.some(
          (item) => trimValue(item.Update) === state.selectedUpdate,
        );

        const nextUpdate = stillExists
          ? state.selectedUpdate
          : trimValue(normalizedUpdates[normalizedUpdates.length - 1]?.Update);

        if (!nextUpdate || nextUpdate === '-') {
          state.typedDate = formatDateInputValue(
            state.selectedDate,
            monthLabels,
            buddhistYearOffset,
          );
          return;
        }

        const fxRates = await getRates(
          endpoints,
          parsed.day,
          parsed.month,
          parsed.year,
          nextUpdate,
          language,
        );

        const normalizedRates = normalizeRates(fxRates);
        if (!normalizedRates.length) {
          state.typedDate = formatDateInputValue(
            state.selectedDate,
            monthLabels,
            buddhistYearOffset,
          );
          return;
        }

        state.selectedDate = parsed.iso;
        state.viewYear = Number(parsed.year);
        state.viewMonth = Number(parsed.month);
        state.updates = normalizedUpdates;
        state.selectedUpdate = nextUpdate;
        state.rates = normalizedRates;
        state.typedDate = formatDateInputValue(
          state.selectedDate,
          monthLabels,
          buddhistYearOffset,
        );
      } catch (e) {
        state.typedDate = formatDateInputValue(
          state.selectedDate,
          monthLabels,
          buddhistYearOffset,
        );
      } finally {
        state.loading = false;
        render();
      }
    };

    if (dateInput) {
      dateInput.addEventListener('input', (event) => {
        state.typedDate = event.target.value;
      });

      dateInput.addEventListener('blur', () => {
        const parsed = parseTypedDate(state.typedDate, buddhistYearOffset);
        if (!parsed) {
          state.typedDate = formatDateInputValue(
            state.selectedDate,
            monthLabels,
            buddhistYearOffset,
          );
          render();
          return;
        }

        if (parsed.iso !== state.selectedDate) {
          applyDateSelection(parsed.iso);
        }
      });

      dateInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submitTypedDateWithFetch();
      });
    }

    const openCalendar = () => {
      if (calendarFocusLock) return;
      const parsed = parseIsoDate(state.selectedDate);
      if (parsed) {
        state.viewYear = Number(parsed.year);
        state.viewMonth = Number(parsed.month);
      }

      state.calendarOpen = true;
      render();

      // Restore focus to the new input so the user can type
      calendarFocusLock = true;
      block.querySelector('.forex-rates-date-text-input')?.focus();
      calendarFocusLock = false;

      if (parsed) {
        const monthKey = getMonthKey(parsed.year, parsed.month);
        if (!state.enabledDaysByMonth[monthKey]) {
          getEnabledDays(endpoints, parsed.year, parsed.month)
            .then((days) => {
              state.enabledDaysByMonth[monthKey] = days;
              if (state.calendarOpen) render();
            })
            .catch(() => {
              state.enabledDaysByMonth[monthKey] = [];
            });
        }
      }
    };

    if (dateInput) {
      dateInput.addEventListener('focus', openCalendar);
    }

    if (dateTrigger) {
      dateTrigger.addEventListener('click', openCalendar);
    }

    if (prevMonth) {
      prevMonth.addEventListener('click', async () => {
        const month = state.viewMonth === 1 ? 12 : state.viewMonth - 1;
        const year = state.viewMonth === 1 ? state.viewYear - 1 : state.viewYear;
        state.viewMonth = month;
        state.viewYear = year;

        const monthKey = getMonthKey(year, month);
        if (!state.enabledDaysByMonth[monthKey]) {
          try {
            state.enabledDaysByMonth[monthKey] = await getEnabledDays(endpoints, year, month);
          } catch (e) {
            state.enabledDaysByMonth[monthKey] = [];
          }
        }

        render();
      });
    }

    if (nextMonth) {
      nextMonth.addEventListener('click', async () => {
        const month = state.viewMonth === 12 ? 1 : state.viewMonth + 1;
        const year = state.viewMonth === 12 ? state.viewYear + 1 : state.viewYear;
        const nextIndex = year * 12 + month;
        const maxIndex = state.maxSelectableMonth
          ? state.maxSelectableMonth.year * 12 + state.maxSelectableMonth.month
          : null;

        if (maxIndex && nextIndex > maxIndex) return;

        state.viewMonth = month;
        state.viewYear = year;

        const monthKey = getMonthKey(year, month);
        if (!state.enabledDaysByMonth[monthKey]) {
          try {
            state.enabledDaysByMonth[monthKey] = await getEnabledDays(endpoints, year, month);
          } catch (e) {
            state.enabledDaysByMonth[monthKey] = [];
          }
        }

        render();
      });
    }

    dayButtons.forEach((dayButton) => {
      dayButton.addEventListener('click', () => {
        const { day } = dayButton.dataset;
        const dateIso = `${state.viewYear}-${String(state.viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        applyDateSelection(dateIso).then((isApplied) => {
          if (!isApplied) return;
          state.calendarOpen = false;
          render();
        });
      });
    });

    const toggleTimeDropdown = (open) => {
      state.timeDropdownOpen = open;
      if (timeDropdownEl) timeDropdownEl.classList.toggle('is-open', open);
    };

    if (timeTrigger) {
      timeTrigger.addEventListener('click', () => {
        const next = !state.timeDropdownOpen;
        toggleTimeDropdown(next);
        if (next) {
          document.addEventListener('mousedown', function closeTime(e) {
            if (!timeDropdownEl || !timeDropdownEl.contains(e.target)) {
              toggleTimeDropdown(false);
            }
            document.removeEventListener('mousedown', closeTime);
          });
        }
      });
    }

    block.querySelectorAll('.forex-rates-time-item').forEach((item) => {
      item.addEventListener('click', () => {
        const prev = state.selectedUpdate;
        state.selectedUpdate = item.dataset.value;
        toggleTimeDropdown(false);
        if (prev !== state.selectedUpdate) {
          const labelEl = block.querySelector('.forex-rates-time-label');
          const selectedObj = state.updates.find(
            (u) => trimValue(u.Update) === state.selectedUpdate,
          );
          if (labelEl && selectedObj) {
            labelEl.textContent = `${trimValue(selectedObj.Update)}: ${trimValue(selectedObj.Time)}`;
          }
          block.querySelectorAll('.forex-rates-time-item').forEach((li) => {
            li.classList.toggle('is-active', li.dataset.value === state.selectedUpdate);
            li.setAttribute('aria-selected', li.dataset.value === state.selectedUpdate);
          });
          if (state.selectedDate && state.selectedUpdate && isValidSelectedDay(state)) {
            loadRates(state.selectedDate, state.selectedUpdate);
          }
        }
      });
    });

    if (goButton) {
      goButton.addEventListener('click', () => {
        if (!state.selectedDate || !state.selectedUpdate || !isValidSelectedDay(state)) return;
        loadRates(state.selectedDate, state.selectedUpdate);
      });
    }

    if (printButton) {
      printButton.addEventListener('click', () => {
        window.print();
      });
    }

    if (outsideClickHandler) {
      document.removeEventListener('mousedown', outsideClickHandler);
      outsideClickHandler = null;
    }

    if (state.calendarOpen && dateGroup) {
      outsideClickHandler = (event) => {
        if (!dateGroup.contains(event.target)) {
          state.calendarOpen = false;
          render();
        }
      };
      document.addEventListener('mousedown', outsideClickHandler);
    }
  };

  const init = async () => {
    state.loading = true;
    render();

    try {
      const latest = await getLatestRates(endpoints);
      state.rates = normalizeRates(latest);

      const latestDate = parseApiDate(latest?.[0]?.Ddate);
      if (!latestDate) return;

      state.selectedDate = latestDate.iso;
      state.viewYear = Number(latestDate.year);
      state.viewMonth = Number(latestDate.month);
      state.maxSelectableMonth = {
        year: Number(latestDate.year),
        month: Number(latestDate.month),
      };

      const latestMonthKey = getMonthKey(latestDate.year, latestDate.month);
      state.enabledDaysByMonth[latestMonthKey] = await getEnabledDays(
        endpoints,
        latestDate.year,
        latestDate.month,
      );

      const updateOptions = await getUpdatesInDay(
        endpoints,
        latestDate.day,
        latestDate.month,
        latestDate.year,
      );

      const normalizedUpdates = Array.isArray(updateOptions) ? updateOptions : [];
      state.updates = normalizedUpdates;

      const preferredUpdate = trimValue(latest?.[0]?.Update);
      const hasPreferred = normalizedUpdates
        .some((item) => trimValue(item.Update) === preferredUpdate);
      const fallback = trimValue(normalizedUpdates[normalizedUpdates.length - 1]?.Update);
      state.selectedUpdate = hasPreferred ? preferredUpdate : fallback;
      state.typedDate = formatDateInputValue(
        state.selectedDate,
        monthLabels,
        buddhistYearOffset,
      );
    } finally {
      state.loading = false;
      render();
    }
  };

  await init();
}

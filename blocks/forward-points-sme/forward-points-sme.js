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
  getFxRates,
  getLatestFwdUpdate,
  getLatestFxRates,
  getUpdatesInDay,
  normalizeFwdRates,
  normalizeFxRates,
  trimValue,
} from './helpers/api-helpers.js';
import parseAuthoring from './helpers/authoring-helpers.js';
import { getLang } from '../../scripts/scripts.js';

function printForwardPointsSme(block) {
  // Guard: remove any leftover root from a previous print (e.g. afterprint didn't fire)
  document.getElementById('fpsme-print-root')?.remove();
  document.getElementById('fpsme-print-style')?.remove();

  const content = block.cloneNode(true);

  [
    '.fpsme-print-btn',
    '.fpsme-go-btn',
    '.fpsme-datepicker',
    '.fpsme-time-list',
    '.fpsme-time-chevron',
    '.fpsme-print-logo',
  ].forEach((sel) => content.querySelectorAll(sel).forEach((el) => el.remove()));

  content.querySelectorAll('.fpsme-date-input').forEach((input) => {
    const span = document.createElement('span');
    span.className = input.className;
    span.textContent = input.value || input.placeholder;
    input.parentNode.replaceChild(span, input);
  });

  // Logo — clone directly from the live page (images already loaded, no fetch needed)
  const logoEl = document.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || document.querySelector('.brand-logo-container picture, .brand-logo-container img');
  const brandLogoHtml = logoEl ? logoEl.cloneNode(true).outerHTML : '';

  const printRoot = document.createElement('div');
  printRoot.id = 'fpsme-print-root';
  printRoot.innerHTML = `
    <div class="brand-logo-container">${brandLogoHtml}</div>
    <div class="section">${content.outerHTML}</div>
  `;

  // Inline <style> applies synchronously — no network delay unlike an external CSS file.
  // This guarantees the page isolation rule is active before window.print() fires.
  const printStyle = document.createElement('style');
  printStyle.id = 'fpsme-print-style';
  printStyle.textContent = `
    @media print {
      body > *:not(#fpsme-print-root) { display: none !important; }
      #fpsme-print-root { display: block !important; }
      #fpsme-print-root .brand-logo-container { display: block !important; }
      #fpsme-print-root .brand-logo-container img { display: block !important; height: var(--bbl-space-400) !important; width: auto !important; max-width: none !important; }
    }
  `;

  document.head.appendChild(printStyle);
  document.body.appendChild(printRoot);

  window.print();

  window.addEventListener('afterprint', () => {
    printRoot.remove();
    printStyle.remove();
  }, { once: true });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDatepicker(
  state,
  sid,
  monthLabels,
  dayLabels,
  buddhistYearOffset,
  prevLabel,
  nextLabel,
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
        return `<td class="${classes}"><button type="button" class="fpsme-dp-day-btn" data-day="${cell.day}">${cell.day}</button></td>`;
      }
      return `<td class="${classes}"><span class="fpsme-dp-day-text">${cell.day}</span></td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const daysHeader = dayLabels.map((label, index) => {
    const weekend = index === 0 || index === 6 ? 'is-weekend' : '';
    return `<th class="${weekend}">${escapeHtml(label)}</th>`;
  }).join('');

  return `<div class="fpsme-datepicker fpsme-datepicker-${sid}">
    <div class="fpsme-dp-header">
      <button type="button" class="fpsme-dp-nav fpsme-dp-prev" aria-label="${escapeHtml(prevLabel)}"><i class="icon-arrow-left" aria-hidden="true"></i></button>
      <div class="fpsme-dp-title">
        <span class="fpsme-dp-month">${escapeHtml(monthLabels[state.viewMonth - 1] || '')}</span>
        <span class="fpsme-dp-year">${state.viewYear + buddhistYearOffset}</span>
      </div>
      <button type="button" class="fpsme-dp-nav fpsme-dp-next${nextDisabled ? ' is-disabled' : ''}" aria-label="${escapeHtml(nextLabel)}"${nextDisabled ? ' disabled' : ''}><i class="icon-arrow-left" aria-hidden="true"></i></button>
    </div>
    <table class="fpsme-dp-calendar">
      <thead><tr>${daysHeader}</tr></thead>
      <tbody>${weeksMarkup}</tbody>
    </table>
  </div>`;
}

function renderControlsRow(
  state,
  sid,
  calendarLabel,
  goCtaLabel,
  monthLabels,
  dayLabels,
  buddhistYearOffset,
  prevLabel,
  nextLabel,
  openCalendarLabel,
  selectTimeLabel,
  trailingHtml = '',
) {
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
    return `<li class="fpsme-time-item${isActive ? ' is-active' : ''}" role="option" aria-selected="${isActive}" data-value="${escapeHtml(update)}">${escapeHtml(label)}</li>`;
  }).join('');

  const timeDropdownOpen = state.timeDropdownOpen ? ' is-open' : '';
  const timeDisabled = !state.updates.length ? ' is-disabled' : '';
  const goDisabled = '';

  return `<div class="fpsme-controls fpsme-controls-${sid}">
    <span class="fpsme-update-label">${escapeHtml(calendarLabel)}</span>
    <div class="fpsme-date-group fpsme-date-group-${sid}">
      <input id="fpsme-date-input-${sid}" class="fpsme-date-input" type="text" inputmode="text" placeholder="DD MMM YYYY" value="${escapeHtml(state.typedDate)}" aria-label="${escapeHtml(calendarLabel)} date">
      <button type="button" class="fpsme-date-trigger fpsme-date-trigger-${sid} icon-calendar" aria-label="${escapeHtml(openCalendarLabel)}"></button>
      ${renderDatepicker(
    state,
    sid,
    monthLabels,
    dayLabels,
    buddhistYearOffset,
    prevLabel,
    nextLabel,
  )}
    </div>
    <div class="fpsme-time-wrap">
      <div class="fpsme-time-dropdown fpsme-time-dropdown-${sid}${timeDropdownOpen}${timeDisabled}" role="combobox" aria-expanded="${state.timeDropdownOpen}" aria-haspopup="listbox">
        <button type="button" class="fpsme-time-trigger" aria-label="${escapeHtml(selectTimeLabel)}"${state.updates.length ? '' : ' disabled'}>
          <span class="fpsme-time-label">${escapeHtml(selectedLabel)}</span>
          <i class="icon-dropdown fpsme-time-chevron" aria-hidden="true"></i>
        </button>
        <ul class="fpsme-time-list" role="listbox">${timeItems}</ul>
      </div>
    </div>
    <button type="button" class="fpsme-go-btn fpsme-go-btn-${sid}"${goDisabled}>${escapeHtml(goCtaLabel)}</button>
    ${trailingHtml}
  </div>`;
}

function renderCurrencyTable(fxRates, authoring) {
  const [col0, col1, col2, col3] = authoring.section1Columns;

  const rows = fxRates.map((rate) => `<tr>
    <td class="fpsme-currency-cell">
      <img src="/icons/${escapeHtml(rate.familyIcon)}.svg" alt="${escapeHtml(rate.family)} flag" loading="lazy" class="fpsme-flag">
      <span>${escapeHtml(rate.family)}</span>
    </td>
    <td class="fpsme-td-right">${escapeHtml(rate.sightBillBuying)}</td>
    <td class="fpsme-td-right">${escapeHtml(rate.ttBuying)}</td>
    <td class="fpsme-td-right">${escapeHtml(rate.ttSelling)}</td>
  </tr>`).join('');

  return `<div class="fpsme-table-wrap">
    <table class="fpsme-table fpsme-table-currency">
      <thead>
        <tr>
          <th>${col0}</th>
          <th>${col1}</th>
          <th>${col2}</th>
          <th>${col3}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function renderFwdTable(fwdRates, authoring, tableIndex) {
  const [col0, col1, col2] = authoring.section2Columns;

  const dataRows = authoring.section2Rows.map((heading, i) => {
    const rate = fwdRates[i];
    let buying = '-';
    let selling = '-';
    if (rate) {
      buying = tableIndex === 1 ? rate.t1Buying : rate.t2Buying;
      selling = tableIndex === 1 ? rate.t1Selling : rate.t2Selling;
    }
    return `<div class="fpsme-rt-row">
      <div class="fpsme-rt-cell fpsme-rt-cell-muted fpsme-rt-period">${escapeHtml(heading)}</div>
      <div class="fpsme-rt-cell fpsme-rt-value">${escapeHtml(buying)}</div>
      <div class="fpsme-rt-cell fpsme-rt-value fpsme-rt-cell-last">${escapeHtml(selling)}</div>
    </div>`;
  }).join('');

  return `<div class="fpsme-rt">
    <div class="fpsme-rt-row fpsme-rt-header">
      <div class="fpsme-rt-cell fpsme-rt-cell-muted fpsme-rt-head fpsme-rt-period-head">${col0}</div>
      <div class="fpsme-rt-cell fpsme-rt-cell-muted fpsme-rt-head">${col1}</div>
      <div class="fpsme-rt-cell fpsme-rt-cell-muted fpsme-rt-head fpsme-rt-cell-last">${col2}</div>
    </div>
    ${dataRows}
  </div>`;
}

function renderBlock(
  block,
  s1State,
  s2State,
  authoring,
  monthLabels,
  dayLabels,
  buddhistYearOffset,
  prevLabel,
  nextLabel,
  openCalendarLabel,
  selectTimeLabel,
) {
  const printBtnHtml = `<button type="button" class="fpsme-print-btn">${escapeHtml(authoring.printCtaLabel)}<i class="icon-print" aria-hidden="true"></i></button>`;
  const s1Controls = renderControlsRow(
    s1State,
    '1',
    authoring.section1CalendarLabel,
    authoring.section1GoCtaLabel,
    monthLabels,
    dayLabels,
    buddhistYearOffset,
    prevLabel,
    nextLabel,
    openCalendarLabel,
    selectTimeLabel,
    printBtnHtml,
  );
  const s2Controls = renderControlsRow(
    s2State,
    '2',
    authoring.section2CalendarLabel,
    authoring.section2GoCtaLabel,
    monthLabels,
    dayLabels,
    buddhistYearOffset,
    prevLabel,
    nextLabel,
    openCalendarLabel,
    selectTimeLabel,
  );

  const allFxRates = normalizeFxRates(s1State.rates);
  const usdWithRates = allFxRates.filter(
    (r) => r.family.toUpperCase() === 'USD' && r.sightBillBuying !== '-',
  );
  const fxRates = usdWithRates.length
    ? usdWithRates.slice(0, 1)
    : allFxRates.filter((r) => r.family.toUpperCase() === 'USD').slice(0, 1);
  const fwdRates = normalizeFwdRates(s2State.rates);

  block.innerHTML = `<div class="fpsme-wrapper">
    <div class="fpsme-section1-bar">
      <div class="fpsme-section fpsme-section-currency">
        ${s1Controls}
        ${renderCurrencyTable(fxRates, authoring)}
      </div>
    </div>

    <div class="fpsme-section fpsme-section-fwd">
      ${s2Controls}
      <div class="fpsme-fwd-body">
        <h3 class="fpsme-fwd-title">${authoring.section2TableTitle}</h3>
        <div class="fpsme-fwd-tables">
          <div class="fpsme-fwd-table-col">
            <p class="fpsme-fwd-subtitle">${escapeHtml(authoring.section2SubTitle1)}</p>
            <div class="fpsme-table-wrap">
              ${renderFwdTable(fwdRates, authoring, 1)}
            </div>
            <p class="fpsme-unit fpsme-unit-right">${escapeHtml(authoring.section2UnitLabel)}</p>
          </div>
          <div class="fpsme-fwd-table-col">
            <p class="fpsme-fwd-subtitle">${escapeHtml(authoring.section2SubTitle2)}</p>
            <div class="fpsme-table-wrap">
              ${renderFwdTable(fwdRates, authoring, 2)}
            </div>
            <p class="fpsme-unit fpsme-unit-right">${escapeHtml(authoring.section2UnitLabel)}</p>
          </div>
        </div>
      </div>
      <div class="fpsme-remark">${authoring.remarkHtml}</div>
    </div>
  </div>`;

  block.querySelectorAll('.fpsme-flag').forEach((img) => {
    img.addEventListener('error', (e) => { e.target.style.display = 'none'; });
  });
}

// ─── Section-scoped interaction setup ─────────────────────────────────────────

function setupSection(
  block,
  state,
  sid,
  endpoints,
  isSection2,
  monthLabels,
  dayLabels,
  buddhistYearOffset,
  prevLabel,
  nextLabel,
  rerender,
) {
  const dateGroup = block.querySelector(`.fpsme-date-group-${sid}`);
  const dateInput = block.querySelector(`#fpsme-date-input-${sid}`);
  const dateTrigger = block.querySelector(`.fpsme-date-trigger-${sid}`);
  const timeDropdownEl = block.querySelector(`.fpsme-time-dropdown-${sid}`);
  const timeTrigger = timeDropdownEl?.querySelector('.fpsme-time-trigger');
  const timeList = timeDropdownEl?.querySelector('.fpsme-time-list');
  const goBtn = block.querySelector(`.fpsme-go-btn-${sid}`);

  const getEndpointUrl = (type, ...args) => {
    if (isSection2) {
      if (type === 'dayInMonth') return endpoints.fwdDayInMonth(...args);
      if (type === 'updateInDay') return endpoints.fwdUpdateInDay(...args);
      if (type === 'rates') return endpoints.fwdRates(...args);
    } else {
      if (type === 'dayInMonth') return endpoints.dayInMonth(...args);
      if (type === 'updateInDay') return endpoints.updateInDay(...args);
      if (type === 'rates') return endpoints.fxRates(...args);
    }
    return '';
  };

  // ── Partial DOM updaters — never touch the outer block ──────────────────────

  // Re-render only the datepicker popup inside the date group
  const refreshDatepicker = () => {
    if (!dateGroup) return;
    const existing = dateGroup.querySelector(`.fpsme-datepicker-${sid}`);
    if (!state.calendarOpen) {
      existing?.remove();
      return;
    }
    // eslint-disable-next-line max-len
    const html = renderDatepicker(state, sid, monthLabels, dayLabels, buddhistYearOffset, prevLabel, nextLabel);
    if (existing) {
      existing.outerHTML = html;
    } else {
      dateGroup.insertAdjacentHTML('beforeend', html);
    }
  };

  // Update only the time dropdown list and label — no full rerender
  const refreshTimeDropdown = () => {
    if (!timeDropdownEl) return;
    const list = timeDropdownEl.querySelector('.fpsme-time-list');
    const labelEl = timeDropdownEl.querySelector('.fpsme-time-label');
    const trigger = timeDropdownEl.querySelector('.fpsme-time-trigger');
    if (!list) return;

    list.innerHTML = state.updates.map((item) => {
      const update = trimValue(item.Update);
      const time = trimValue(item.Time);
      const isActive = update === state.selectedUpdate;
      return `<li class="fpsme-time-item${isActive ? ' is-active' : ''}" role="option" aria-selected="${isActive}" data-value="${escapeHtml(update)}">${escapeHtml(`${update}: ${time}`)}</li>`;
    }).join('');

    const selectedObj = state.updates.find((u) => trimValue(u.Update) === state.selectedUpdate);
    if (labelEl) {
      labelEl.textContent = selectedObj
        ? `${trimValue(selectedObj.Update)}: ${trimValue(selectedObj.Time)}`
        : (state.selectedUpdate || '');
    }
    if (trigger) trigger.disabled = !state.updates.length;
    timeDropdownEl.classList.toggle('is-disabled', !state.updates.length);
  };

  // ── Data fetch — only called by GO button ───────────────────────────────────

  const loadRates = async (dateIso, updateValue) => {
    const parsed = parseIsoDate(dateIso);
    if (!parsed || !updateValue) return;
    state.loading = true;
    rerender();
    try {
      const url = getEndpointUrl('rates', parsed.day, parsed.month, parsed.year, updateValue);
      state.rates = await getFxRates(url);
    } finally {
      state.loading = false;
      rerender();
    }
  };

  // ── Date selection — fetches enabled days + time updates, no rates fetch ────

  const applyDateSelection = async (dateIso) => {
    const parsed = parseIsoDate(dateIso);
    if (!parsed) return false;

    const monthKey = getMonthKey(parsed.year, parsed.month);
    if (!state.enabledDaysByMonth[monthKey]) {
      state.enabledDaysByMonth[monthKey] = await getEnabledDays(
        getEndpointUrl('dayInMonth', parsed.year, parsed.month),
      );
    }

    const monthDays = state.enabledDaysByMonth[monthKey] || [];
    if (monthDays.length && !monthDays.includes(parsed.day)) return false;

    state.selectedDate = dateIso;
    state.typedDate = formatDateInputValue(state.selectedDate, monthLabels, buddhistYearOffset);
    state.viewYear = Number(parsed.year);
    state.viewMonth = Number(parsed.month);
    if (dateInput) dateInput.value = state.typedDate;

    try {
      const updates = await getUpdatesInDay(
        getEndpointUrl('updateInDay', parsed.day, parsed.month, parsed.year),
      );
      state.updates = updates;
      const stillExists = updates.some((item) => trimValue(item.Update) === state.selectedUpdate);
      if (!stillExists) {
        state.selectedUpdate = trimValue(updates[updates.length - 1]?.Update);
      }
    } catch (e) {
      // silent
    }

    refreshTimeDropdown();
    return true;
  };

  // ── Date input ──────────────────────────────────────────────────────────────

  if (dateInput) {
    dateInput.addEventListener('input', (e) => { state.typedDate = e.target.value; });

    dateInput.addEventListener('blur', () => {
      const parsed = parseTypedDate(state.typedDate, buddhistYearOffset);
      if (!parsed) {
        state.typedDate = formatDateInputValue(state.selectedDate, monthLabels, buddhistYearOffset);
        dateInput.value = state.typedDate;
        return;
      }
      if (parsed.iso !== state.selectedDate) applyDateSelection(parsed.iso);
    });

    dateInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const parsed = parseTypedDate(state.typedDate, buddhistYearOffset);
      if (parsed && parsed.iso !== state.selectedDate) applyDateSelection(parsed.iso);
    });
  }

  // ── Calendar open ───────────────────────────────────────────────────────────

  const openCalendar = () => {
    const parsed = parseIsoDate(state.selectedDate);
    if (parsed) {
      state.viewYear = Number(parsed.year);
      state.viewMonth = Number(parsed.month);
    }
    state.calendarOpen = true;
    refreshDatepicker();

    if (parsed) {
      const monthKey = getMonthKey(parsed.year, parsed.month);
      if (!state.enabledDaysByMonth[monthKey]) {
        getEnabledDays(getEndpointUrl('dayInMonth', parsed.year, parsed.month))
          .then((days) => {
            state.enabledDaysByMonth[monthKey] = days;
            if (state.calendarOpen) refreshDatepicker();
          });
      }
    }
  };

  if (dateInput) dateInput.addEventListener('focus', openCalendar);
  if (dateTrigger) dateTrigger.addEventListener('click', openCalendar);

  // ── Calendar interactions via event delegation on dateGroup ────────────────

  if (dateGroup) {
    dateGroup.addEventListener('click', async (e) => {
      // Day click
      const dayBtn = e.target.closest('.fpsme-dp-day-btn');
      if (dayBtn) {
        const { day } = dayBtn.dataset;
        const dateIso = `${state.viewYear}-${String(state.viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const applied = await applyDateSelection(dateIso);
        if (applied) {
          state.calendarOpen = false;
          refreshDatepicker();
        }
        return;
      }

      // Prev month
      if (e.target.closest('.fpsme-dp-prev')) {
        const month = state.viewMonth === 1 ? 12 : state.viewMonth - 1;
        const year = state.viewMonth === 1 ? state.viewYear - 1 : state.viewYear;
        state.viewMonth = month;
        state.viewYear = year;
        const monthKey = getMonthKey(year, month);
        if (!state.enabledDaysByMonth[monthKey]) {
          state.enabledDaysByMonth[monthKey] = await getEnabledDays(
            getEndpointUrl('dayInMonth', year, month),
          );
        }
        refreshDatepicker();
        return;
      }

      // Next month
      const nextEl = e.target.closest('.fpsme-dp-next');
      if (nextEl && !nextEl.disabled && !nextEl.classList.contains('is-disabled')) {
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
          state.enabledDaysByMonth[monthKey] = await getEnabledDays(
            getEndpointUrl('dayInMonth', year, month),
          );
        }
        refreshDatepicker();
      }
    });
  }

  // Attach the outside-click listener only once per section (guard against
  // duplicate attachment caused by rerender calling setupSection repeatedly).
  // Uses live block.querySelector so it always checks the current DOM.
  const outsideKey = `_fpsme_outside_${sid}`;
  if (!block[outsideKey]) {
    block[outsideKey] = true;
    document.addEventListener('mousedown', (e) => {
      if (!state.calendarOpen) return;
      const liveGroup = block.querySelector(`.fpsme-date-group-${sid}`);
      const liveTrigger = block.querySelector(`.fpsme-date-trigger-${sid}`);
      if (!liveGroup?.contains(e.target) && !liveTrigger?.contains(e.target)) {
        state.calendarOpen = false;
        liveGroup?.querySelector(`.fpsme-datepicker-${sid}`)?.remove();
      }
    });
  }

  // ── Time dropdown ───────────────────────────────────────────────────────────

  const toggleTime = (open) => {
    state.timeDropdownOpen = open;
    timeDropdownEl?.classList.toggle('is-open', open);
  };

  if (timeTrigger) {
    timeTrigger.addEventListener('click', () => {
      const next = !state.timeDropdownOpen;
      toggleTime(next);
      if (next) {
        document.addEventListener('mousedown', function closeTime(e) {
          if (!timeDropdownEl?.contains(e.target)) toggleTime(false);
          document.removeEventListener('mousedown', closeTime);
        });
      }
    });
  }

  // Time item selection — update label + active class directly, no rerender
  if (timeList) {
    timeList.addEventListener('click', (e) => {
      const item = e.target.closest('.fpsme-time-item');
      if (!item) return;
      state.selectedUpdate = item.dataset.value;
      toggleTime(false);
      timeList.querySelectorAll('.fpsme-time-item').forEach((li) => {
        li.classList.toggle('is-active', li.dataset.value === state.selectedUpdate);
        li.setAttribute('aria-selected', String(li.dataset.value === state.selectedUpdate));
      });
      const labelEl = timeDropdownEl?.querySelector('.fpsme-time-label');
      const selectedObj = state.updates.find((u) => trimValue(u.Update) === state.selectedUpdate);
      if (labelEl && selectedObj) {
        labelEl.textContent = `${trimValue(selectedObj.Update)}: ${trimValue(selectedObj.Time)}`;
      }
    });
  }

  // ── GO button ───────────────────────────────────────────────────────────────

  if (goBtn) {
    goBtn.addEventListener('click', () => {
      if (!state.selectedDate || !state.selectedUpdate) return;
      loadRates(state.selectedDate, state.selectedUpdate);
    });
  }
}

// ─── UE authoring guard ────────────────────────────────────────────────────────
// UE can fire multiple events (patch + add + move) for a single save action.
// editor-support.js handles each independently, inserting a new block per event
// but only removing the original once — leaving duplicates. We intercept all
// matching events first (capture phase) and reload instead.

function setupUEBlockRefresh(blockEl) {
  const ueEvents = [
    'aue:content-patch',
    'aue:content-update',
    'aue:content-add',
    'aue:content-move',
  ];

  const handler = (event) => {
    const resource = event.detail?.request?.target?.resource
      || event.detail?.request?.target?.container?.resource
      || event.detail?.request?.to?.container?.resource;
    if (!resource) return;

    const blockResource = blockEl.getAttribute('data-aue-resource');
    const sectionEl = blockEl.closest('[data-aue-resource]:not(.block)');
    const sectionResource = sectionEl?.getAttribute('data-aue-resource');
    if (resource !== blockResource && resource !== sectionResource) return;

    ueEvents.forEach((e) => document.removeEventListener(e, handler, { capture: true }));
    event.stopImmediatePropagation();
    window.location.reload();
  };

  ueEvents.forEach((e) => document.addEventListener(e, handler, { capture: true }));
}

// ─── Main decorate ─────────────────────────────────────────────────────────────

export default async function decorate(block) {
  // Preload print CSS so it is ready before the first print is triggered
  const printCssHref = '/blocks/forward-points-sme/fpsme-print.css';
  if (!document.querySelector(`link[href="${printCssHref}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = printCssHref;
    document.head.appendChild(link);
  }

  const authoring = parseAuthoring(block);
  const [placeholders, configs] = await Promise.all([fetchPlaceholders(), fetchConfigs()]);

  const prevLabel = placeholders?.forwardPointsSmePrevMonth;
  const nextLabel = placeholders?.forwardPointsSmeNextMonth;
  const openCalendarLabel = placeholders?.openCalendar;
  const selectTimeLabel = placeholders?.selectTime;
  const language = getLang();
  const monthLabels = parseCsvConfigList(placeholders?.monthLabels, buildIntlMonthLabels(language));
  const dayLabels = parseCsvConfigList(placeholders?.dayLabels, buildIntlDayLabels(language));
  const buddhistYearOffset = getLang() === 'th' ? Number(configs?.sharedBuddhistYearOffset) || 0 : 0;
  const endpoints = createApiEndpoints(configs);

  const createSectionState = () => ({
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
  });

  const s1State = createSectionState();
  const s2State = createSectionState();

  const render = () => {
    renderBlock(
      block,
      s1State,
      s2State,
      authoring,
      monthLabels,
      dayLabels,
      buddhistYearOffset,
      prevLabel,
      nextLabel,
      openCalendarLabel,
      selectTimeLabel,
    );
    setupSection(
      block,
      s1State,
      '1',
      endpoints,
      false,
      monthLabels,
      dayLabels,
      buddhistYearOffset,
      prevLabel,
      nextLabel,
      render,
    );
    setupSection(
      block,
      s2State,
      '2',
      endpoints,
      true,
      monthLabels,
      dayLabels,
      buddhistYearOffset,
      prevLabel,
      nextLabel,
      render,
    );

    const printBtn = block.querySelector('.fpsme-print-btn');
    if (printBtn) printBtn.addEventListener('click', () => printForwardPointsSme(block));

    // Intercept Ctrl+P / Cmd+P so keyboard print uses the formatted popup, not the raw page
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        printForwardPointsSme(block);
      }
    });
  };

  // ── Init: load latest data for both sections ────────────────────────────────

  s1State.loading = true;
  s2State.loading = true;
  render();

  // Section 1 init
  const initSection1 = async () => {
    try {
      const latest = await getLatestFxRates(endpoints);
      s1State.rates = latest;

      const latestItem = Array.isArray(latest) ? latest[0] : null;
      const latestDate = parseApiDate(latestItem?.Ddate);
      if (!latestDate) return;

      s1State.selectedDate = latestDate.iso;
      s1State.viewYear = Number(latestDate.year);
      s1State.viewMonth = Number(latestDate.month);
      s1State.maxSelectableMonth = {
        year: Number(latestDate.year),
        month: Number(latestDate.month),
      };

      const monthKey = getMonthKey(latestDate.year, latestDate.month);
      s1State.enabledDaysByMonth[monthKey] = await getEnabledDays(
        endpoints.dayInMonth(latestDate.year, latestDate.month),
      );

      const updates = await getUpdatesInDay(
        endpoints.updateInDay(latestDate.day, latestDate.month, latestDate.year),
      );
      s1State.updates = updates;
      const preferredUpdate = trimValue(latestItem?.Update);
      const hasPreferred = updates.some((item) => trimValue(item.Update) === preferredUpdate);
      const fallback = trimValue(updates[updates.length - 1]?.Update);
      s1State.selectedUpdate = hasPreferred ? preferredUpdate : fallback;
      s1State.typedDate = formatDateInputValue(
        s1State.selectedDate,
        monthLabels,
        buddhistYearOffset,
      );
    } finally {
      s1State.loading = false;
    }
  };

  // Section 2 init
  const initSection2 = async () => {
    try {
      const latestFwd = await getLatestFwdUpdate(endpoints);
      if (!latestFwd) return;

      const latestDate = parseApiDate(latestFwd?.Ddate || latestFwd?.Date || latestFwd?.Day);
      if (!latestDate) return;

      s2State.selectedDate = latestDate.iso;
      s2State.viewYear = Number(latestDate.year);
      s2State.viewMonth = Number(latestDate.month);
      s2State.maxSelectableMonth = {
        year: Number(latestDate.year),
        month: Number(latestDate.month),
      };

      const monthKey = getMonthKey(latestDate.year, latestDate.month);
      s2State.enabledDaysByMonth[monthKey] = await getEnabledDays(
        endpoints.fwdDayInMonth(latestDate.year, latestDate.month),
      );

      const updates = await getUpdatesInDay(
        endpoints.fwdUpdateInDay(latestDate.day, latestDate.month, latestDate.year),
      );
      s2State.updates = updates;
      const preferredUpdate = trimValue(latestFwd?.Update);
      const hasPreferred = updates.some((item) => trimValue(item.Update) === preferredUpdate);
      const fallback = trimValue(updates[updates.length - 1]?.Update);
      s2State.selectedUpdate = hasPreferred ? preferredUpdate : fallback;
      s2State.typedDate = formatDateInputValue(
        s2State.selectedDate,
        monthLabels,
        buddhistYearOffset,
      );

      if (s2State.selectedDate && s2State.selectedUpdate) {
        const ratesUrl = endpoints.fwdRates(
          latestDate.day,
          latestDate.month,
          latestDate.year,
          s2State.selectedUpdate,
        );
        s2State.rates = await getFxRates(ratesUrl);
      }
    } finally {
      s2State.loading = false;
    }
  };

  await Promise.all([initSection1(), initSection2()]);
  render();

  if (window.self !== window.top) setupUEBlockRefresh(block);
}

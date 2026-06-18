import parseAuthoring, { parseTableHeading, parseMaturityTypes } from './helpers/authoring-helpers.js';
import {
  parseCsvConfigList, buildIntlMonthLabels, buildIntlDayLabels,
  formatDisplayDate, formatMaturityDate, formatRemainTerm, remainTermToMonths,
  buildCalendarGrid, formatMonthYear, formatMonthYearDisplay,
} from './helpers/date-helpers.js';
import createApiService from './helpers/api-helpers.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { moveInstrumentation, getLang } from '../../scripts/scripts.js';

const MAX_SELECTED = 5;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── formatting ───────────────────────────────────────────────────────────────
function fmtPrice(val) {
  if (!val || val === '-') return '-';
  const n = parseFloat(val);
  return Number.isNaN(n) ? val : n.toLocaleString('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

function fmtPct(val) {
  if (!val || val === '-') return '-';
  const n = parseFloat(val);
  return Number.isNaN(n) ? val : `${n.toFixed(2)}%`;
}

// ─── sort helper ──────────────────────────────────────────────────────────────
function sortValue(rate, key) {
  if (key === 'REMAIN_TERM') return remainTermToMonths(rate.REMAIN_TERM || '00.00.00');
  if (key === 'MATURITY_DATE') return new Date(rate.MATURITY_DATE).getTime();
  if (key === 'BOND_SYMBOL' || key === 'NAME_ENG') return (rate[key] || '').toLowerCase();
  const n = parseFloat(rate[key]);
  return Number.isNaN(n) ? Infinity : n;
}

// ─── state ────────────────────────────────────────────────────────────────────
function defaultFilterDates() {
  const now = new Date();
  return {
    filterFrom: { month: now.getMonth() + 1, year: now.getFullYear() },
    filterTo: { month: now.getMonth() + 1, year: now.getFullYear() + 10 },
  };
}

function createState(defaultSortKey = 'REMAIN_TERM') {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();
  return {
    date: null,
    update: 1,
    updates: [],
    timeDropdownOpen: false,
    rates: [],
    enabledDays: new Set(),
    selectedIds: [],
    sortKey: defaultSortKey,
    sortAsc: true,
    sortUserSet: false,
    calOpen: false,
    calYear: null,
    calMonth: null,
    filterOpen: false,
    filterMaturity: null,
    filterFrom: { month: curMonth, year: curYear },
    filterTo: { month: curMonth, year: curYear + 10 },
    filterDatesUserSet: false,
    mpFromMode: 'month',
    mpFromYear: curYear,
    mpToMode: 'month',
    mpToYear: curYear + 10,
    columns: [],
    maturityTypes: [],
  };
}

// ─── calendar ─────────────────────────────────────────────────────────────────
function renderCalendar(calEl, state, placeholders) {
  const {
    calYear: y, calMonth: m, enabledDays, date: sel,
  } = state;
  const cells = buildCalendarGrid(y, m);
  const today = new Date();
  const isCurMonth = today.getFullYear() === y && today.getMonth() === m;
  const selDay = sel && sel.getFullYear() === y && sel.getMonth() === m ? sel.getDate() : null;

  const rows = Array.from({ length: 6 }, (_, r) => {
    const dayCells = cells.slice(r * 7, r * 7 + 7).map(({ day, otherMonth }) => {
      if (otherMonth) return '<td class="db-cal-other">&nbsp;</td>';
      const enabled = enabledDays.has(day);
      const cls = [
        'db-cal-day',
        enabled ? 'db-cal-enabled' : 'db-cal-disabled',
        day === selDay ? 'db-cal-selected' : '',
        isCurMonth && day === today.getDate() ? 'db-cal-today' : '',
      ].filter(Boolean).join(' ');
      return enabled
        ? `<td class="${cls}"><button type="button" class="db-cal-day-btn" data-day="${day}">${day}</button></td>`
        : `<td class="${cls}"><span>${day}</span></td>`;
    }).join('');
    return `<tr>${dayCells}</tr>`;
  }).join('');

  calEl.innerHTML = `
    <div class="db-cal-header">
      <button type="button" class="db-cal-nav db-cal-prev" aria-label="${placeholders?.dynamicBoardPrevMonthAria || 'Previous month'}"><i class="icon-arrow-left" aria-hidden="true"></i></button>
      <span class="db-cal-title">${state.monthLabels[m]} ${y + state.buddhistYearOffset}</span>
      <button type="button" class="db-cal-nav db-cal-next" aria-label="${placeholders?.dynamicBoardNextMonthAria || 'Next month'}"><i class="icon-arrow-left" aria-hidden="true"></i></button>
    </div>
    <table class="db-cal-table">
      <thead><tr>${state.dayLabels.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── time dropdown ────────────────────────────────────────────────────────────
function renderTimeDropdown(timeListEl, timeLabelEl, state) {
  const cur = String(state.update);
  timeListEl.innerHTML = state.updates.map((u) => {
    const val = String(u.Update);
    const active = val === cur;
    return `<li class="db-time-item${active ? ' is-active' : ''}" role="option" aria-selected="${active}" data-value="${escapeHtml(val)}">${escapeHtml(val)}: ${escapeHtml(u.Time)}</li>`;
  }).join('');
  const selected = state.updates.find((u) => String(u.Update) === cur);
  if (timeLabelEl) timeLabelEl.textContent = selected ? `${selected.Update}: ${selected.Time}` : '--';
}

// ─── table ────────────────────────────────────────────────────────────────────
function sortIcon(key, state) {
  if (!key) return '';
  const icon = state.sortUserSet && state.sortKey === key ? 'bond-sorted' : 'bond-sort';
  return `<img src="/icons/${icon}.svg" class="db-sort-icon" width="16" height="16" alt="" aria-hidden="true">`;
}

function updateFilterBtn(btn, state) {
  const isActive = state.filterMaturity !== null || state.filterDatesUserSet;
  const img = btn.querySelector('img');
  if (img) img.src = `/icons/${isActive ? 'filter-active' : 'filter-default'}.svg`;
  btn.classList.toggle('is-active', isActive);
}

function renderThead(thead, state) {
  let row1 = '<tr>';
  let row2 = '<tr>';
  state.columns.forEach((col) => {
    const sa = col.sortKey ? `data-sort="${col.sortKey}"` : '';
    const isSorted = state.sortUserSet && col.sortKey && col.sortKey === state.sortKey;
    const sc = col.sortKey ? `db-th-sort${isSorted ? ' db-th-sorted' : ''}` : '';
    if (col.sub) {
      row1 += `<th colspan="${col.sub.length}" class="db-th-group">${escapeHtml(col.label)}</th>`;
      col.sub.forEach((s) => {
        const ssa = s.sortKey ? `data-sort="${s.sortKey}"` : '';
        const isSubSorted = state.sortUserSet && s.sortKey && s.sortKey === state.sortKey;
        const ssc = s.sortKey ? `db-th-sort${isSubSorted ? ' db-th-sorted' : ''}` : '';
        row2 += `<th ${ssa} class="${ssc}">${escapeHtml(s.label)}${sortIcon(s.sortKey, state)}</th>`;
      });
    } else {
      const cs = col.colspan > 1 ? `colspan="${col.colspan}"` : '';
      row1 += `<th rowspan="2" ${cs} ${sa} class="${sc}">${escapeHtml(col.label)}${sortIcon(col.sortKey, state)}</th>`;
    }
  });
  row1 += '<th rowspan="2" class="db-th-download"></th></tr>';
  row2 += '</tr>';
  thead.innerHTML = row1 + row2;
}

function renderRow(rate, isSelected, state) {
  const id = String(rate.AutoID);
  const sym = escapeHtml(rate.BOND_SYMBOL);
  const disabled = !isSelected && state.selectedIds.length >= MAX_SELECTED ? 'disabled' : '';
  const checked = isSelected ? 'checked' : '';
  return `
    <tr data-id="${id}">
      <td class="db-td-check">
        <input type="checkbox" class="db-row-cb" data-id="${id}" ${checked} ${disabled} aria-label="Select ${sym}">
      </td>
      <td class="db-td-symbol">${sym}</td>
      <td class="db-td-name">${escapeHtml(state.isThai ? rate.NAME_THAI : rate.NAME_ENG)}</td>
      ${state.isGov
    ? `<td class="db-td-num">${escapeHtml(rate.ISSUE_RATING || '-')}</td>
      <td class="db-td-num">${escapeHtml(rate.ISSUER_RATING || '-')}</td>`
    : `<td class="db-td-num">${escapeHtml(fmtPrice(rate.BID_PRICE))}</td>
      <td class="db-td-num">${escapeHtml(fmtPct(rate.BID_YIELD))}</td>`}
      <td class="db-td-num">${escapeHtml(fmtPrice(rate.OFFER_PRICE))}</td>
      <td class="db-td-num">${escapeHtml(fmtPct(rate.OFFER_YIELD))}</td>
      <td class="db-td-num">${escapeHtml(formatRemainTerm(rate.REMAIN_TERM || '00.00.00'))}</td>
      <td class="db-td-num">${escapeHtml(fmtPct(rate.CURRENT_COUPON))}</td>
      <td class="db-td-num">${escapeHtml(formatMaturityDate(rate.MATURITY_DATE, state.monthLabels))}</td>
      <td class="db-td-dl">
        <a href="${state.downloadUrl.replace('{{SYMBOL}}', sym)}" download aria-label="Download ${sym} factsheet">
          <img src="/icons/bond-download.svg" width="22" height="22" alt="" aria-hidden="true">
        </a>
      </td>
    </tr>`;
}

function renderTable(tbodySel, tbodyAll, state) {
  if (!state.rates?.length) {
    tbodySel.innerHTML = '';
    tbodyAll.innerHTML = `<tr><td colspan="99" class="db-no-results">${state.placeholders?.dynamicBoardNoResults || 'No results found'}</td></tr>`;
    return;
  }
  const selRates = state.rates.filter((r) => state.selectedIds.includes(String(r.AutoID)));
  const unsel = state.rates.filter((r) => !state.selectedIds.includes(String(r.AutoID)));
  unsel.sort((a, b) => {
    const av = sortValue(a, state.sortKey);
    const bv = sortValue(b, state.sortKey);
    if (av < bv) return state.sortAsc ? -1 : 1;
    if (av > bv) return state.sortAsc ? 1 : -1;
    return 0;
  });
  tbodySel.innerHTML = selRates.map((r) => renderRow(r, true, state)).join('');
  tbodyAll.innerHTML = unsel.map((r) => renderRow(r, false, state)).join('');
  const thead = tbodySel.closest('table')?.querySelector('thead');
  if (thead) {
    const theadH = thead.getBoundingClientRect().height;
    let offset = theadH;
    tbodySel.querySelectorAll('tr').forEach((tr) => {
      tr.style.top = `${offset}px`;
      offset += tr.getBoundingClientRect().height;
    });
  }
}

// ─── month picker ─────────────────────────────────────────────────────────────
function renderMonthPicker(container, which, state, placeholders) {
  const mode = which === 'from' ? state.mpFromMode : state.mpToMode;
  const year = which === 'from' ? state.mpFromYear : state.mpToYear;
  const cur = which === 'from' ? state.filterFrom : state.filterTo;

  if (mode === 'year') {
    const base = year - (((year % 12) + 12) % 12);
    const years = Array.from({ length: 12 }, (_, i) => base + i);
    container.innerHTML = `
      <div class="db-mp-header">
        <button type="button" class="db-mp-nav" data-which="${which}" data-action="prevYears">&#8249;</button>
        <button type="button" class="db-mp-title" data-which="${which}" data-action="backToMonth">${placeholders?.dynamicBoardBackToLabel || 'Back to'} ${year + state.buddhistYearOffset}</button>
        <button type="button" class="db-mp-nav" data-which="${which}" data-action="nextYears">&#8250;</button>
      </div>
      <div class="db-mp-grid">
        ${years.map((y) => `<button type="button" class="db-mp-cell${cur?.year === y ? ' db-mp-active' : ''}" data-which="${which}" data-action="selectYear" data-year="${y}">${y + state.buddhistYearOffset}</button>`).join('')}
      </div>`;
  } else {
    container.innerHTML = `
      <div class="db-mp-header">
        <button type="button" class="db-mp-nav" data-which="${which}" data-action="prevYear">&#8249;</button>
        <button type="button" class="db-mp-title" data-which="${which}" data-action="showYears">${year + state.buddhistYearOffset}</button>
        <button type="button" class="db-mp-nav" data-which="${which}" data-action="nextYear">&#8250;</button>
      </div>
      <div class="db-mp-grid">
        ${state.monthLabels.map((mon, i) => `<button type="button" class="db-mp-cell${cur?.month === i + 1 && cur?.year === year ? ' db-mp-active' : ''}" data-which="${which}" data-action="selectMonth" data-month="${i + 1}">${mon.slice(0, 3)}</button>`).join('')}
      </div>`;
  }
}

// ─── filter panel ─────────────────────────────────────────────────────────────

function renderFilterPanel(wrapper, authoring, state, placeholders) {
  const matSet = state.filterMaturity;
  const datesUserSet = state.filterDatesUserSet;

  wrapper.innerHTML = `
    <div class="db-filter-panel">
      <button type="button" class="db-filter-close" aria-label="${placeholders?.dynamicBoardCloseFilterAria || 'Close filter'}"><img src="/icons/bond-close.png" width="30" height="30" alt="" aria-hidden="true"></button>
      <h3 class="db-filter-title">${escapeHtml(authoring.filterLabel)}</h3>
      <div class="db-filter-divider"></div>
      <p class="db-filter-section-label">${escapeHtml(authoring.maturityDateLabel)}</p>
      <div class="db-filter-date-wrap">
      <div class="db-filter-row">
        <span class="db-filter-lbl">${placeholders?.dynamicBoardFromLabel || 'From'}</span>
        <div class="db-filter-input-wrap">
          <input type="text" class="db-mp-input" id="db-mp-from" readonly placeholder="${placeholders?.dynamicBoardMonthYearPlaceholder || 'MM/YYYY'}"
            value="${state.filterFrom ? formatMonthYearDisplay(state.filterFrom.month, state.filterFrom.year, state.buddhistYearOffset) : ''}"
            ${matSet ? 'disabled' : ''}>
          <button type="button" class="db-mp-cal-btn" data-which="from" aria-label="${placeholders?.dynamicBoardOpenMonthPickerAria || 'Open month picker'}" ${matSet ? 'disabled' : ''} icon-calendar"></button>
          <div class="db-mp-popup" id="db-mp-popup-from" hidden></div>
        </div>
      </div>
      <div class="db-filter-row">
        <span class="db-filter-lbl">${placeholders?.dynamicBoardToLabel || 'To'}</span>
        <div class="db-filter-input-wrap">
          <input type="text" class="db-mp-input" id="db-mp-to" readonly placeholder="${placeholders?.dynamicBoardMonthYearPlaceholder || 'MM/YYYY'}"
            value="${state.filterTo ? formatMonthYearDisplay(state.filterTo.month, state.filterTo.year, state.buddhistYearOffset) : ''}"
            ${matSet ? 'disabled' : ''}>
          <button type="button" class="db-mp-cal-btn" data-which="to" aria-label="${placeholders?.dynamicBoardOpenMonthPickerAria || 'Open month picker'}" ${matSet ? 'disabled' : ''} icon-calendar"></button>
          <div class="db-mp-popup" id="db-mp-popup-to" hidden></div>
        </div>
      </div>
      </div>
      <p class="db-filter-section-label">${escapeHtml(authoring.maturityRateLabel)}</p>
      ${state.maturityTypes.map((t) => `
        <div class="db-filter-radio-row">
          <input type="radio" id="db-mat-${t.value}" name="db-maturity" class="db-radio" value="${t.value}"
            ${state.filterMaturity === t.value ? 'checked' : ''}
            ${datesUserSet ? 'disabled' : ''}>
          <label for="db-mat-${t.value}">${escapeHtml(t.label)}</label>
        </div>`).join('')}
      <div class="db-filter-divider"></div>
      <div class="db-filter-actions">
        <button type="button" class="db-filter-apply">${placeholders?.dynamicBoardApplyLabel || 'Apply'}</button>
        <button type="button" class="db-filter-reset">${escapeHtml(authoring.clearFilterLabel)}</button>
      </div>
    </div>`;

  const today = new Date();
  state.mpFromYear = state.filterFrom?.year || today.getFullYear();
  state.mpToYear = state.filterTo?.year || today.getFullYear();
  state.mpFromMode = 'month';
  state.mpToMode = 'month';
}

// ─── remarks expand/collapse (mobile only) ────────────────────────────────────
function initRemarks(remarksEl, placeholders) {
  const content = remarksEl.querySelector('.db-remarks-content');
  const shadow = remarksEl.querySelector('.db-remarks-shadow');
  const toggle = remarksEl.querySelector('.db-remarks-toggle');
  if (!toggle) return;

  const viewMore = placeholders?.dynamicBoardViewMore || 'View More';
  const viewLess = placeholders?.dynamicBoardViewLess || 'View Less';
  toggle.innerHTML = `<span class="db-remarks-label">${viewMore}</span><i class="icon-dropdown db-remarks-arrow" aria-hidden="true"></i>`;

  let expanded = false;
  toggle.addEventListener('click', () => {
    expanded = !expanded;
    content.classList.toggle('db-remarks-expanded', expanded);
    if (shadow) shadow.hidden = expanded;
    toggle.querySelector('.db-remarks-label').textContent = expanded ? viewLess : viewMore;
    toggle.classList.toggle('is-expanded', expanded);
  });
}

// ─── data loaders ─────────────────────────────────────────────────────────────
async function loadEnabledDays(state) {
  try {
    const calDate = new Date(state.calYear, state.calMonth, 1);
    const data = await state.api.getDayInMonth(calDate);
    state.enabledDays = new Set(data.map((d) => parseInt(d.Day, 10)));
  } catch {
    state.enabledDays = new Set();
  }
}

async function loadUpdates(state) {
  try {
    const data = await state.api.getUpdatesInDay(state.date);
    state.updates = data;
    state.update = data[data.length - 1]?.Update ?? 1;
  } catch {
    state.updates = [];
  }
}

async function loadRates(state) {
  state.rates = await state.api.getRatesByDate(state.date, state.update);
}

async function loadFilteredRates(state) {
  const maturity = state.filterMaturity || '-';
  const useDates = state.filterDatesUserSet && !state.filterMaturity;
  const from = useDates && state.filterFrom
    ? formatMonthYear(state.filterFrom.month, state.filterFrom.year) : '-';
  const to = useDates && state.filterTo
    ? formatMonthYear(state.filterTo.month, state.filterTo.year) : '-';
  state.rates = await state.api.getRatesByDateWithFilter(
    state.date,
    state.update,
    maturity,
    from,
    to,
  );
}

// ─── filter panel events ──────────────────────────────────────────────────────
function wireFilterEvents(
  wrapper,
  state,
  thead,
  tbodySel,
  tbodyAll,
  placeholders,
  filterBtn,
  signal,
  onReset,
) {
  const opts = { signal };

  wrapper.querySelector('.db-filter-close')?.addEventListener('click', () => {
    wrapper.hidden = true;
  }, opts);

  wrapper.addEventListener('change', (e) => {
    if (e.target.name !== 'db-maturity') return;
    state.filterMaturity = e.target.value;
    ['from', 'to'].forEach((w) => {
      const inp = wrapper.querySelector(`#db-mp-${w}`);
      if (inp) inp.disabled = true;
      const calBtn = wrapper.querySelector(`.db-mp-cal-btn[data-which="${w}"]`);
      if (calBtn) calBtn.disabled = true;
      const popup = wrapper.querySelector(`#db-mp-popup-${w}`);
      if (popup) popup.hidden = true;
    });
  }, opts);

  wrapper.addEventListener('click', (e) => {
    const mpInput = e.target.closest('#db-mp-from, #db-mp-to');
    const mpCalBtn = e.target.closest('.db-mp-cal-btn');
    const trigger = mpInput || mpCalBtn;
    if (trigger && !trigger.disabled) {
      let which;
      if (mpInput) {
        which = mpInput.id === 'db-mp-from' ? 'from' : 'to';
      } else {
        which = mpCalBtn.dataset.which;
      }
      const popup = wrapper.querySelector(`#db-mp-popup-${which}`);
      if (popup) {
        const isOpen = !popup.hidden;
        ['from', 'to'].filter((w) => w !== which).forEach((w) => {
          const other = wrapper.querySelector(`#db-mp-popup-${w}`);
          if (other) other.hidden = true;
        });
        popup.hidden = isOpen;
        if (!popup.hidden) {
          const ref = wrapper.querySelector(`#db-mp-${which}`) || trigger;
          const rect = ref.getBoundingClientRect();
          const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const popupW = 16 * rootFontSize;
          const left = Math.min(rect.left, window.innerWidth - popupW - 8);
          popup.style.top = `${rect.bottom + 4}px`;
          popup.style.left = `${Math.max(8, left)}px`;
          renderMonthPicker(popup, which, state, placeholders);

          const inputEl = wrapper.querySelector(`#db-mp-${which}`);
          const calBtnEl = wrapper.querySelector(`.db-mp-cal-btn[data-which="${which}"]`);
          const closeMpOnOutside = (ev) => {
            if (
              !popup.contains(ev.target)
              && ev.target !== inputEl
              && ev.target !== calBtnEl
            ) {
              popup.hidden = true;
              document.removeEventListener('mousedown', closeMpOnOutside);
            }
          };
          document.addEventListener('mousedown', closeMpOnOutside);
        }
      }
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const {
      action, which, year, month,
    } = btn.dataset;
    const popup = wrapper.querySelector(`#db-mp-popup-${which}`);

    const adj = (field, delta) => {
      if (which === 'from') state[`mpFrom${field}`] += delta;
      else state[`mpTo${field}`] += delta;
    };

    if (action === 'prevYear') adj('Year', -1);
    else if (action === 'nextYear') adj('Year', 1);
    else if (action === 'prevYears') adj('Year', -12);
    else if (action === 'nextYears') adj('Year', 12);
    else if (action === 'showYears') {
      if (which === 'from') state.mpFromMode = 'year';
      else state.mpToMode = 'year';
    } else if (action === 'backToMonth') {
      if (which === 'from') state.mpFromMode = 'month';
      else state.mpToMode = 'month';
    } else if (action === 'selectYear') {
      const y = parseInt(year, 10);
      if (which === 'from') {
        state.mpFromYear = y;
        state.mpFromMode = 'month';
      } else {
        state.mpToYear = y;
        state.mpToMode = 'month';
      }
    } else if (action === 'selectMonth') {
      const mo = parseInt(month, 10);
      const y = which === 'from' ? state.mpFromYear : state.mpToYear;
      if (which === 'from') state.filterFrom = { month: mo, year: y };
      else state.filterTo = { month: mo, year: y };
      state.filterDatesUserSet = true;
      const inp = wrapper.querySelector(`#db-mp-${which}`);
      if (inp) inp.value = formatMonthYearDisplay(mo, y, state.buddhistYearOffset);
      if (popup) popup.hidden = true;
      wrapper.querySelectorAll('.db-radio').forEach((r) => { r.disabled = true; r.checked = false; });
      ['from', 'to'].forEach((w) => {
        const inpEl = wrapper.querySelector(`#db-mp-${w}`);
        if (inpEl) inpEl.disabled = false;
        const calBtn = wrapper.querySelector(`.db-mp-cal-btn[data-which="${w}"]`);
        if (calBtn) calBtn.disabled = false;
      });
      state.filterMaturity = null;
      return;
    }

    if (popup) renderMonthPicker(popup, which, state, placeholders);
  }, opts);

  wrapper.querySelector('.db-filter-apply')?.addEventListener('click', async () => {
    wrapper.hidden = true;
    updateFilterBtn(filterBtn, state);
    try {
      await loadFilteredRates(state);
      state.selectedIds = [];
      renderThead(thead, state);
      renderTable(tbodySel, tbodyAll, state);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Filter apply failed:', err);
    }
  });

  wrapper.querySelector('.db-filter-reset')?.addEventListener('click', () => {
    state.filterMaturity = null;
    Object.assign(state, defaultFilterDates());
    state.filterDatesUserSet = false;
    updateFilterBtn(filterBtn, state);
    onReset();
  });
}

// ─── main decorate ────────────────────────────────────────────────────────────
export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const state = createState(configs?.dynamicBoardDefaultSortKey);
  const language = getLang();
  state.monthLabels = parseCsvConfigList(placeholders?.monthLabels, buildIntlMonthLabels(language));
  state.dayLabels = parseCsvConfigList(placeholders?.dayLabels, buildIntlDayLabels(language));
  state.buddhistYearOffset = language === 'th' ? Number(configs?.sharedBuddhistYearOffset) || 0 : 0;
  const isGov = authoring.boardType.toLowerCase().includes('government');
  state.api = createApiService(configs, authoring.boardType);
  state.placeholders = placeholders;
  state.downloadUrl = isGov
    ? configs?.dynamicBoardCorpBondDownloadUrl
    : configs?.dynamicBoardBondRatesDownloadUrl;
  state.isGov = isGov;
  state.isThai = language === 'th';
  state.columns = parseTableHeading(authoring.tableHeadingEl, isGov);
  state.maturityTypes = parseMaturityTypes(authoring.maturityTypesEl);

  const authoringRows = [...block.children];

  block.innerHTML = `
    <div class="db-controls">
      <div class="db-controls-left">
        <span class="db-cal-label">${escapeHtml(authoring.calendarLabel)}</span>
        <div class="db-date-wrap">
          <button type="button" class="db-date-display" id="db-date-display" aria-label="${placeholders?.dynamicBoardSelectDateAria || 'Select date'}" aria-expanded="false">--</button>
          <button type="button" class="db-cal-icon icon-calendar" aria-label="${escapeHtml(authoring.calendarLabel)}" aria-expanded="false"></button>
          <div class="db-calendar" id="db-calendar" hidden aria-label="${placeholders?.dynamicBoardDatePickerAria || 'Date picker'}"></div>
        </div>
        <div class="db-time-wrap">
          <div class="db-time-dropdown" id="db-time-dropdown" role="combobox" aria-expanded="false" aria-haspopup="listbox">
            <button type="button" class="db-time-trigger" id="db-time-trigger" aria-label="${placeholders?.dynamicBoardSelectTimeAria || 'Select time update'}">
              <span class="db-time-label" id="db-time-label">--</span>
              <i class="icon-dropdown db-time-chevron" aria-hidden="true"></i>
            </button>
            <ul class="db-time-list" id="db-time-list" role="listbox"></ul>
          </div>
        </div>
        <button type="button" class="db-go-btn" id="db-go-btn">${escapeHtml(authoring.ctaButtonLabel)}</button>
      </div>
      <div class="db-controls-right">
        <button type="button" class="db-filter-btn" id="db-filter-btn">
          ${escapeHtml(authoring.filterLabel)}
          <img src="/icons/filter-default.svg" width="18" height="18" alt="" aria-hidden="true">
        </button>
        <button type="button" class="db-clear-btn" id="db-clear-btn">
          ${escapeHtml(authoring.clearFilterLabel)}
          <img src="/icons/filter-clear-default.svg" width="18" height="18" alt="" aria-hidden="true">
        </button>
        <button type="button" class="db-print-btn" id="db-print-btn">
          ${escapeHtml(authoring.printLabel)}
          <i class="icon-print" aria-hidden="true"></i>
        </button>
      </div>
    </div>
    <div class="db-filter-wrapper" id="db-filter-wrapper" hidden></div>
    <div class="db-table-wrap">
      <table class="db-table">
        <thead id="db-thead"></thead>
        <tbody id="db-tbody-sel" class="db-tbody-selected"></tbody>
        <tbody id="db-tbody-all"></tbody>
      </table>
    </div>
    <div class="db-remarks" id="db-remarks">
      <div class="db-remarks-content">${authoring.remarksHtml}</div>
      <div class="db-remarks-shadow" aria-hidden="true"></div>
      <div class="db-remarks-controls">
        <button type="button" class="db-remarks-toggle"></button>
      </div>
    </div>`;

  [
    [authoringRows[0], block.querySelector('.db-controls')],
    [authoringRows[1], block.querySelector('.db-cal-label')],
    [authoringRows[2], block.querySelector('#db-filter-btn')],
    [authoringRows[3], block.querySelector('#db-clear-btn')],
    [authoringRows[4], block.querySelector('#db-print-btn')],
    [authoringRows[5], block.querySelector('#db-go-btn')],
    [authoringRows[6], block.querySelector('#db-thead')],
    [authoringRows[7], block.querySelector('.db-remarks-content')],
    [authoringRows[8], block.querySelector('.db-remarks')],
    [authoringRows[9], block.querySelector('.db-remarks')],
    [authoringRows[10], block.querySelector('.db-remarks')],
  ].forEach(([src, dst]) => {
    if (src && dst) moveInstrumentation(src, dst);
  });

  const calEl = block.querySelector('#db-calendar');
  const dateDisplay = block.querySelector('#db-date-display');
  const calIcon = block.querySelector('.db-cal-icon');
  const timeDropdownEl = block.querySelector('#db-time-dropdown');
  const timeTrigger = block.querySelector('#db-time-trigger');
  const timeLabelEl = block.querySelector('#db-time-label');
  const timeListEl = block.querySelector('#db-time-list');
  const goBtn = block.querySelector('#db-go-btn');
  const filterBtn = block.querySelector('#db-filter-btn');
  const clearBtn = block.querySelector('#db-clear-btn');
  const printBtn = block.querySelector('#db-print-btn');
  const filterWrapper = block.querySelector('#db-filter-wrapper');
  const thead = block.querySelector('#db-thead');
  const tbodySel = block.querySelector('#db-tbody-sel');
  const tbodyAll = block.querySelector('#db-tbody-all');

  renderThead(thead, state);

  // ── initial data load ──
  try {
    const [lastUpdateArr, latestRates] = await Promise.all([
      state.api.getLastUpdate(), state.api.getLatestRates(),
    ]);
    const lu = Array.isArray(lastUpdateArr) ? lastUpdateArr[0] : lastUpdateArr;
    if (lu?.Day) {
      const [d, mo, y] = lu.Day.split('/').map(Number);
      state.date = new Date(y, mo - 1, d);
    } else {
      state.date = new Date();
    }
    state.update = lu?.Update ?? 1;
    state.updates = lu ? [{ Day: lu.Day, Update: lu.Update, Time: lu.Time }] : [];
    state.rates = Array.isArray(latestRates) ? latestRates : [];

    state.calYear = state.date.getFullYear();
    state.calMonth = state.date.getMonth();

    dateDisplay.textContent = formatDisplayDate(state.date, state.monthLabels);
    renderTimeDropdown(timeListEl, timeLabelEl, state);
    renderThead(thead, state);
    renderTable(tbodySel, tbodyAll, state);

    // preload enabled days in background
    loadEnabledDays(state);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Dynamic board init failed:', err);
  }

  // ── calendar open/close ──
  function setCalOpen(open) {
    state.calOpen = open;
    calEl.hidden = !open;
    dateDisplay.setAttribute('aria-expanded', String(open));
    calIcon.setAttribute('aria-expanded', String(open));
    if (open) renderCalendar(calEl, state, placeholders);
  }

  async function toggleCal() {
    if (!state.calOpen) {
      if (!state.date) state.date = new Date();
      state.calYear = state.calYear || state.date.getFullYear();
      state.calMonth = state.calMonth ?? state.date.getMonth();
      if (!state.enabledDays.size) await loadEnabledDays(state);
      setCalOpen(true);
    } else {
      setCalOpen(false);
    }
  }

  dateDisplay.addEventListener('click', (e) => { e.stopPropagation(); toggleCal(); });
  calIcon.addEventListener('click', (e) => { e.stopPropagation(); toggleCal(); });

  calEl.addEventListener('click', async (e) => {
    e.stopPropagation();
    const btn = e.target.closest('.db-cal-day-btn, .db-cal-nav');
    if (!btn) return;

    if (btn.classList.contains('db-cal-prev')) {
      state.calMonth -= 1;
      if (state.calMonth < 0) { state.calMonth = 11; state.calYear -= 1; }
      await loadEnabledDays(state);
      renderCalendar(calEl, state, placeholders);
    } else if (btn.classList.contains('db-cal-next')) {
      state.calMonth += 1;
      if (state.calMonth > 11) { state.calMonth = 0; state.calYear += 1; }
      await loadEnabledDays(state);
      renderCalendar(calEl, state, placeholders);
    } else if (btn.dataset.day) {
      const day = parseInt(btn.dataset.day, 10);
      state.date = new Date(state.calYear, state.calMonth, day);
      dateDisplay.textContent = formatDisplayDate(state.date, state.monthLabels);
      setCalOpen(false);
      await loadUpdates(state);
      renderTimeDropdown(timeListEl, timeLabelEl, state);
    }
  });

  document.addEventListener('click', () => { if (state.calOpen) setCalOpen(false); });

  // ── time dropdown ──
  const toggleTimeDropdown = (open) => {
    state.timeDropdownOpen = open;
    timeDropdownEl.classList.toggle('is-open', open);
    timeDropdownEl.setAttribute('aria-expanded', String(open));
  };

  timeTrigger.addEventListener('click', () => {
    const next = !state.timeDropdownOpen;
    toggleTimeDropdown(next);
    if (next) {
      document.addEventListener('mousedown', function closeTime(e) {
        if (!timeDropdownEl.contains(e.target)) toggleTimeDropdown(false);
        document.removeEventListener('mousedown', closeTime);
      });
    }
  });

  timeListEl.addEventListener('click', (e) => {
    const item = e.target.closest('.db-time-item');
    if (!item) return;
    const prev = state.update;
    state.update = parseInt(item.dataset.value, 10);
    toggleTimeDropdown(false);
    if (prev !== state.update) {
      timeLabelEl.textContent = item.textContent;
      timeListEl.querySelectorAll('.db-time-item').forEach((li) => {
        li.classList.toggle('is-active', li.dataset.value === item.dataset.value);
        li.setAttribute('aria-selected', li.dataset.value === item.dataset.value);
      });
    }
  });

  // ── GO ──
  goBtn.addEventListener('click', async () => {
    if (!state.date) return;
    try {
      await loadRates(state);
      state.selectedIds = [];
      renderTable(tbodySel, tbodyAll, state);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Load rates failed:', err);
    }
  });

  // ── sort ──
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (state.sortKey === key) state.sortAsc = !state.sortAsc;
    else { state.sortKey = key; state.sortAsc = true; }
    state.sortUserSet = true;
    renderThead(thead, state);
    renderTable(tbodySel, tbodyAll, state);
  });

  // ── checkboxes ──
  function handleCb(e) {
    const cb = e.target.closest('.db-row-cb');
    if (!cb) return;
    const { id } = cb.dataset;
    if (cb.checked) {
      if (state.selectedIds.length >= MAX_SELECTED) { cb.checked = false; return; }
      state.selectedIds.push(id);
    } else {
      state.selectedIds = state.selectedIds.filter((s) => s !== id);
    }
    renderTable(tbodySel, tbodyAll, state);
  }
  tbodySel.addEventListener('change', handleCb);
  tbodyAll.addEventListener('change', handleCb);

  // ── filter open ──
  let filterAc = null;

  function openFilter() {
    if (filterAc) filterAc.abort();
    filterAc = new AbortController();
    renderFilterPanel(filterWrapper, authoring, state, placeholders);
    wireFilterEvents(
      filterWrapper,
      state,
      thead,
      tbodySel,
      tbodyAll,
      placeholders,
      filterBtn,
      filterAc.signal,
      openFilter,
    );
    filterWrapper.hidden = false;
  }

  filterBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!filterWrapper.hidden) {
      filterWrapper.hidden = true;
      return;
    }
    openFilter();
  });

  // ── clear filter (top bar) ──
  clearBtn.addEventListener('click', async () => {
    state.filterMaturity = null;
    Object.assign(state, defaultFilterDates());
    state.filterDatesUserSet = false;
    state.sortKey = configs?.dynamicBoardDefaultSortKey;
    state.sortAsc = true;
    state.sortUserSet = false;
    updateFilterBtn(filterBtn, state);
    renderThead(thead, state);
    try {
      await loadRates(state);
      state.selectedIds = [];
      renderTable(tbodySel, tbodyAll, state);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Clear filter failed:', err);
    }
  });

  // ── print ──
  printBtn.addEventListener('click', () => window.print());

  // ── remarks ──
  initRemarks(block.querySelector('#db-remarks'), placeholders);
}

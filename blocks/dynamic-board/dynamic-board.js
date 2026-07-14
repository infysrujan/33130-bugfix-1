import parseAuthoring, { parseTableHeading, parseMaturityTypes } from './helpers/authoring-helpers.js';
import {
  parseCsvConfigList, buildIntlMonthLabels,
  formatMaturityDate, formatRemainTerm, remainTermToMonths,
  formatMonthYear, formatMonthYearDisplay,
} from './helpers/date-helpers.js';
import createApiService from './helpers/api-helpers.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { moveInstrumentation, getLang } from '../../scripts/scripts.js';
import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';

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

// Tolerates minor authoring variations like {{ SYMBOL }} or {{symbol}}, and
// warns instead of silently 404ing when the template is missing the token.
const SYMBOL_PLACEHOLDER = /\{\{\s*SYMBOL\s*\}\}/i;

function buildDownloadHref(downloadUrl, symbol) {
  if (!downloadUrl) return '';
  if (!SYMBOL_PLACEHOLDER.test(downloadUrl)) {
    // eslint-disable-next-line no-console
    console.warn('dynamic-board: download URL is missing a {{SYMBOL}} placeholder:', downloadUrl);
    return downloadUrl;
  }
  const resolved = downloadUrl.replace(SYMBOL_PLACEHOLDER, symbol.toLowerCase());
  // A path missing its leading slash resolves relative to the current page's
  // directory (e.g. /en/...) instead of the site root, so force it root-relative
  // here rather than relying on every config value being typed exactly right.
  return /^(https?:)?\//.test(resolved) ? resolved : `/${resolved}`;
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
    selectedIds: [],
    sortKey: defaultSortKey,
    sortAsc: true,
    sortUserSet: false,
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
  row1 += '</tr>';
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
      <td class="db-td-num db-td-maturity">
        ${escapeHtml(formatMaturityDate(rate.MATURITY_DATE, state.monthLabels))}
        <a class="db-td-dl" href="${buildDownloadHref(state.downloadUrl, sym)}" download aria-label="Download ${sym} factsheet">
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

// ─── print ────────────────────────────────────────────────────────────────────
/** Same approach as blocks/bcap/bcap.js: print an isolated document instead of
 * the live page, so the fixed header/nav and the site's max-width layout
 * don't shrink the table or swallow the logo. */
function printElement(block) {
  const section = block.closest('.section') || block;
  const content = section.cloneNode(true);

  // Heading centering is handled separately below via the always-present
  // `table-container` class rather than depending on authored classes here.
  const sectionClasses = new Set(content.classList);
  sectionClasses.add('table-container');

  content.querySelectorAll([
    '.db-controls-right',
    '.db-filter-wrapper',
    '.db-mp-popup',
    '.db-go-btn',
    '.db-sort-icon',
    '.db-td-check',
    '.db-th-download',
    '.db-td-dl',
  ].join(', ')).forEach((el) => el.remove());

  // The live header's first column has colspan=2 for layout reasons the body
  // doesn't match (only one Symbol cell), which shifts every later column
  // out of alignment — drop it only where it's paired with rowspan=2.
  content.querySelectorAll('.db-table thead th[rowspan="2"][colspan="2"]')
    .forEach((th) => th.removeAttribute('colspan'));

  content.querySelectorAll('.db-time-chevron, .db-time-list').forEach((el) => el.remove());

  // Authored rich text renders the first remark paragraph's bold as an
  // inline style; strip it here (on the print clone only) so font-weight
  // is controlled by printCss instead.
  content.querySelector('.db-remarks-content p:first-child')?.removeAttribute('style');

  // cloneNode carries over an <input>'s live value as a DOM property, but
  // content.innerHTML below only serializes attributes — promote it so the
  // date survives that string round-trip into the print window.
  const dateInput = content.querySelector('.db-date-display');
  if (dateInput) dateInput.setAttribute('value', dateInput.value);

  const logoEl = document.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || document.querySelector('.brand-logo-container picture, .brand-logo-container img');
  if (!logoEl) return;
  // A cloned <picture>'s relative srcset can fail to resolve in the print
  // window, so use the browser's already-resolved absolute image URL.
  const logoImg = logoEl.tagName === 'IMG' ? logoEl : logoEl.querySelector('img');
  if (!logoImg) return;
  const logoSrc = logoImg.currentSrc || logoImg.src;
  const brandLogo = `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(logoImg.alt || 'Bangkok Bank')}">`;

  const printWindow = window.open('', '', 'height=500,width=800');

  const printCss = `
    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    /* Chrome's "Background graphics" print toggle is off by default and
       would otherwise drop background-color/-image, e.g. the underline
       below, even though it renders fine in a normal on-screen view. */
    html, body, * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .header,
    .header-wrapper,
    .main-nav-desktop,
    .brand-logo,
    .brand-logo-container {
      display: block;
      visibility: visible;
      position: static;
    }

    .brand-logo-container {
      width: 12.5rem;
      height: 3.125rem;
      margin-block: 3rem 1rem;
    }

    .brand-logo-container img {
      display: block;
      width: 12.5rem;
      height: 3.125rem;
      object-fit: contain;
    }

    /* Scoped to the always-present .table-container rather than
       center-title/underline-title, so it centers regardless of authoring. */
    .table-container .default-content-wrapper > :is(h1, h2, h3, h4, h5, h6):first-child {
      position: relative;
      margin: 0;
      padding: 0 0 1.875rem;
      font-size: 2rem;
      text-align: center;
    }

    .table-container .default-content-wrapper > :is(h1, h2, h3, h4, h5, h6):first-child::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 2.25rem;
      height: 0.125rem;
      background-color: black;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .dynamic-board {
      margin-top: 2rem;
    }

    /* A4's print width falls under the 47.5rem breakpoint where these are
       each width:100% (stacked), so shrink them to sit side by side. */
    .dynamic-board .db-date-wrap,
    .dynamic-board .db-time-wrap {
      width: auto;
      flex: 0 1 auto;
    }

    .dynamic-board .db-time-label {
      color: var(--bbl-color-black) !important;
    }

    .dynamic-board .db-table {
      width: 90%;
      /* table-layout: fixed was tried here, but it only measures the FIRST
         header row's cells to size columns — this table's first row has
         colspan="2" group headers (Bidding/Offering Price) whose real
         sub-column split only exists in the second row, so fixed layout
         can't place that split and the sub-headers overlap. table-layout:
         auto (the default) measures every row correctly; combined with
         overflow-wrap/word-break below and min-width:0 (already reset by
         dynamic-board.css's own @media print block) it still shrinks to
         fit the page instead of overflowing. */
      border: 2px solid #c8c8cc;
      /* Outline as a fallback outer border — it can't be partially
         overridden by any single cell's border like border-collapse can. */
      outline: 2px solid #c8c8cc;
      outline-offset: -0.0625rem;
      border-collapse: collapse;
      font-size: 0.6875rem;
      color: #78787D;
    }

    .dynamic-board .db-table th,
    .dynamic-board .db-table td {
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .dynamic-board .db-table thead,
    .dynamic-board .db-table thead th {
      position: static;
      top: auto;
    }

    .dynamic-board .db-table thead th,
    .dynamic-board .db-table thead tr:first-child th,
    .dynamic-board .db-table thead tr:last-child th {
      /* Chrome's print engine frequently drops a background painted at the
         thead/tr level even with print-color-adjust: exact set globally —
         setting it directly on each th is what actually survives printing.
         Hard-coded hex (not var()) so it doesn't depend on the popup having
         fully resolved the site's CSS custom properties before printing. */
      background-color: white;
      font-size: 0.6875rem;
      font-weight: 700 !important;
      height: auto;
      padding: 0.1875rem 0.25rem;
      border: 0.125rem solid var(--bbl-color-grey-10) !important;
    }

    .dynamic-board .db-table tbody td {
      border: 0.125rem solid var(--bbl-color-grey-30) !important;
      border-right-color: var(--bbl-color-white) !important;
      color: black !important;
      padding: 0.1875rem 0.25rem;
      vertical-align: middle;
      font-size: 0.6875rem;
    }

    /* Same as the thead case above: set row-striping/selection backgrounds
       on the td itself, since a tr-level background can fail to print. */
    .dynamic-board .db-table tbody tr:nth-child(even) td {
      background-color: white;
    }

    .dynamic-board .db-table-wrap .db-table .db-tbody-selected tr td {
      background-color: #e5edf4;
    }

    /* The live table strips the last header cell's border-right; restore it. */
    .dynamic-board .db-table thead th:last-child {
      border-right: 0.125rem solid var(--bbl-color-grey-10) !important;
    }

    .dynamic-board .db-table tbody tr:nth-child(even),
    .dynamic-board .db-table-wrap .db-table .db-tbody-selected tr {
      position: static;
    }

    .dynamic-board .db-remarks-content {
      height: auto;
      overflow: visible;
      font-size: 0.75rem;
      line-height: 1.25rem !important;
    }

    .dynamic-board .db-remarks-content p {
      color: black !important;
    }

    .dynamic-board .db-remarks-content p:first-child {
      font-weight: 900 !important;
    }

    @media print {
      .dynamic-board .db-table thead {
        display: table-header-group;
      }

      .dynamic-board .db-table tbody {
        display: table-row-group;
      }

      .dynamic-board .db-table {
        break-inside: auto;
      }

      .dynamic-board .db-table tbody tr {
        break-inside: avoid;
      }
    }
  `;

  const printHtml = `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8"/>
      <title>Print</title>
      <link rel="stylesheet" href="/styles/styles.css">
      <link rel="stylesheet" href="/styles/fonts.css">
      <link rel="stylesheet" href="/blocks/header/header.css">
      <link rel="stylesheet" href="/blocks/brand-logo/brand-logo.css">
      <link rel="stylesheet" href="/blocks/dynamic-board/dynamic-board.css">
      <style>${printCss}</style>
    </head>
    <body class="appear">
      <header class="header-wrapper">
        <div class="header block" data-block-status="loaded">
          <div class="header-content">
            <div class="main-nav-desktop">
              <div class="brand-logo block" data-block-status="loaded">
                <div class="brand-logo-container">
                  ${brandLogo}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main>
        <div class="${[...sectionClasses].join(' ')}">
          ${content.innerHTML.trim()}
        </div>
      </main>
    </body>
  </html>
  `;
  printWindow.document.write(printHtml);
  printWindow.document.close();

  // readyState/rAF/a flat 100ms timer used to race against the popup's own
  // <link> stylesheets and web fonts, printing with default UA styles
  // whenever the CSS hadn't finished loading yet (e.g. on a cold cache).
  // Wait on the actual load signals instead, capped by a safety timeout.
  const waitForStylesheets = () => Promise.all(
    [...printWindow.document.querySelectorAll('link[rel="stylesheet"]')].map((link) => (
      link.sheet
        ? Promise.resolve()
        : new Promise((resolve) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', resolve, { once: true });
        })
    )),
  );
  const waitForFonts = () => printWindow.document.fonts?.ready ?? Promise.resolve();
  const timeout = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  Promise.race([
    Promise.all([waitForStylesheets(), waitForFonts()]),
    timeout(3000),
  ]).then(() => {
    printWindow.focus();
    requestAnimationFrame(() => {
      printWindow.print();
      printWindow.close();
    });
  });
}

// ─── main decorate ────────────────────────────────────────────────────────────
export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const state = createState(configs?.dynamicBoardDefaultSortKey);
  const language = getLang();
  state.monthLabels = parseCsvConfigList(placeholders?.monthLabels, buildIntlMonthLabels(language));
  state.buddhistYearOffset = language === 'th' ? Number(configs?.sharedBuddhistYearOffset) || 0 : 0;
  const isGov = authoring.boardType.toLowerCase().includes('government');
  state.api = createApiService(configs, authoring.boardType);
  state.placeholders = placeholders;
  // Relative /content/dam paths resolve directly on this domain (same as the
  // download-file block's authored links), so no base URL needs prepending.
  state.downloadUrl = (isGov
    ? configs?.dynamicBoardCorpBondDownloadUrl
    : configs?.dynamicBoardBondRatesDownloadUrl) || '';
  // eslint-disable-next-line no-console
  console.log('Config Download URL:', state.downloadUrl);
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
          <input type="text" class="db-date-display" id="db-date-display" readonly aria-label="${placeholders?.dynamicBoardSelectDateAria || 'Select date'}">
          <button type="button" class="db-cal-icon icon-calendar" aria-label="${escapeHtml(authoring.calendarLabel)}" aria-expanded="false"></button>
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

    renderTimeDropdown(timeListEl, timeLabelEl, state);
    renderThead(thead, state);
    renderTable(tbodySel, tbodyAll, state);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Dynamic board init failed:', err);
  }

  // ── calendar ── (same picker as blocks/bcap/bcap.js, via scripts/utils/calendar-picker.js)
  if (!state.date) state.date = new Date();
  const datePicker = attachCalendarPicker({
    input: dateDisplay,
    value: state.date,
    fetchEnabledDays: async ({ year, month }) => {
      try {
        const days = await state.api.getDayInMonth(new Date(year, month, 1));
        return days.map((d) => parseInt(d.Day, 10));
      } catch {
        return [];
      }
    },
    onChange: async (selectedDate) => {
      state.date = selectedDate;
      await loadUpdates(state);
      renderTimeDropdown(timeListEl, timeLabelEl, state);
    },
  });

  calIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    datePicker.open();
  });

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
  printBtn.addEventListener('click', () => printElement(block));

  // ── remarks ──
  initRemarks(block.querySelector('#db-remarks'), placeholders);
}

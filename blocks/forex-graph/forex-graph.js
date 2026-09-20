import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
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
} from '../../scripts/utils/date-helpers.js';
import {
  createApiEndpoints,
  getChartRates,
  getDownloadUrl,
  getEnabledDays,
  getFxFamily,
  getLatestRates,
  normalizeChartData,
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

function buildGraphTitle(template, currName, currFamily, fromIso, toIso, buddhistYearOffset = 0) {
  const formatTitleDate = (parsed) => {
    if (!parsed) return '';
    // Thai: day/month/Buddhist-year, no leading zeros (e.g. 1/9/2569).
    if (buddhistYearOffset) {
      const day = Number(parsed.day);
      const month = Number(parsed.month);
      const year = Number(parsed.year) + buddhistYearOffset;
      return `${day}/${month}/${year}`;
    }
    // Other locales: keep the original month/day/year format (e.g. 09/01/2026).
    return `${parsed.month}/${parsed.day}/${parsed.year}`;
  };
  const startDate = formatTitleDate(parseIsoDate(fromIso));
  const endDate = formatTitleDate(parseIsoDate(toIso));

  // Normalise template: ensure spaces around family code, colon and dash
  const base = template
    || 'Graph displaying Bank Note Rates in "{{CURR_NAME}}" {{CURR_FAMILY}} : {{START_DATE}} - {{END_DATE}}';
  const normalised = base
    .replace(/("?\{\{CURR_NAME\}\}"?)(\{\{CURR_FAMILY\}\})/, '$1 $2')
    .replace(/(\{\{CURR_FAMILY\}\}):/, '$1 : ')
    .replace(/:(\{\{START_DATE\}\})/, ': $1')
    .replace(/(\{\{START_DATE\}\})-/, '$1 - ')
    .replace(/-(\{\{END_DATE\}\})/, '- $1');

  return normalised
    .replace('{{CURR_NAME}}', currName)
    .replace('{{CURR_FAMILY}}', currFamily)
    .replace('{{START_DATE}}', startDate)
    .replace('{{END_DATE}}', endDate);
}

/**
 * Print just the chart (title + legend + graph + disclaimer) in an isolated
 * iframe, mirroring forex-rates. A bare window.print() would print the whole
 * live page (Currency Calculator, Forward Points, footer, …).
 * @param {HTMLElement} block
 * @param {object} state - decorate() state; state.chartInstance holds the Chart
 */
function printForexGraph(block, state) {
  const content = block.querySelector('.forex-graph-content');
  if (!content) return;

  const doc = block.ownerDocument;
  const cloned = content.cloneNode(true);

  // Keep the currency + From/To fields as read-only context; strip only the
  // interactive/error bits (dropdown list, calendar popups, text inputs, buttons).
  cloned.querySelectorAll('.forex-graph-error').forEach((el) => el.remove());
  cloned.querySelectorAll(
    '.forex-graph-dropdown-list, .forex-graph-dropdown-chevron, .forex-graph-datepicker, .forex-graph-date-input, .forex-graph-go-btn, .forex-graph-print-btn',
  ).forEach((el) => el.remove());

  // <canvas> pixels do not survive cloneNode — swap in a snapshot image.
  const canvasWrap = cloned.querySelector('.forex-graph-canvas-wrap');
  if (canvasWrap) {
    canvasWrap.innerHTML = '';
    if (state.chartInstance && window.ForexChart) {
      const { config } = state.chartInstance;
      const printCanvas = doc.createElement('canvas');
      printCanvas.width = 1600;
      printCanvas.height = 600;
      const printChart = new window.ForexChart(printCanvas, {
        type: config.type,
        data: JSON.parse(JSON.stringify(config.data)),
        options: {
          ...config.options,
          responsive: false,
          maintainAspectRatio: false,
          animation: false,
          devicePixelRatio: 1,
        },
        plugins: config.plugins,
      });
      printChart.draw();

      const img = doc.createElement('img');
      img.src = printChart.toBase64Image();
      img.className = 'forex-graph-print-chart';
      canvasWrap.appendChild(img);

      printChart.destroy();
    }
  }

  const logoEl = doc.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || doc.querySelector('.brand-logo-container picture, .brand-logo-container img');
  const brandLogo = logoEl ? logoEl.cloneNode(true).outerHTML : '';

  const pageTitle = doc.querySelector('main h1, main h2')?.textContent?.trim() || 'Foreign Exchange Rates';

  const tabsHtml = (() => {
    const tabs = [...doc.querySelectorAll('.tabs-nav [role="tab"]')]
      .map((b) => ({
        text: b.textContent.trim(),
        active: b.classList.contains('active') || b.getAttribute('aria-selected') === 'true',
      }))
      .filter((t) => t.text);
    if (!tabs.length) return '';
    return `<div class="print-tabs">${tabs
      .map((t) => `<span class="print-tab${t.active ? ' is-active' : ''}">${escapeHtml(t.text)}</span>`)
      .join('')}</div>`;
  })();

  const calcHtml = (() => {
    const calcBlock = doc.querySelector('.currency-converter-expanded');
    if (!calcBlock) return '';
    const section = calcBlock.closest('.section');
    const calcTitle = section?.querySelector('h1, h2, h3, h4')?.textContent?.trim() || 'Currency Calculator';
    const calcSubtitle = section?.querySelector('.default-content-wrapper p')?.textContent?.trim() || '';
    const rowHtml = (group) => {
      if (!group) return '';
      const label = group.querySelector('.guide-txt')?.textContent?.trim() || '';
      const code = group.querySelector('.code')?.textContent?.trim() || '';
      const iconSrc = group.querySelector('.country-select img')?.getAttribute('src') || '';
      return `<div class="print-calc-row">
        <span class="print-calc-label">${escapeHtml(label)}</span>
        <span class="print-calc-value">${iconSrc ? `<img src="${escapeHtml(iconSrc)}" alt="" loading="eager">` : ''}<span>${escapeHtml(code)}</span><i class="icon-dropdown print-calc-chevron" aria-hidden="true"></i></span>
      </div>`;
    };
    const amountGroup = calcBlock.querySelector('.amount-input')?.closest('.convert-group');
    const amountLabel = amountGroup?.querySelector('.guide-txt')?.textContent?.trim() || 'AMOUNT';
    return `<div class="print-page-break"></div>
      <h1 class="print-title">${escapeHtml(calcTitle)}</h1>
      ${calcSubtitle ? `<p class="print-calc-subtitle">${escapeHtml(calcSubtitle)}</p>` : ''}
      <div class="print-calc">
        ${rowHtml(calcBlock.querySelector('#currency1'))}
        ${rowHtml(calcBlock.querySelector('#currency2'))}
        <div class="print-calc-row">
          <span class="print-calc-label">${escapeHtml(amountLabel)}</span>
          <span class="print-calc-amount-box"></span>
        </div>
      </div>`;
  })();

  const printCss = `
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: sans-serif; margin: 0; padding: 0; }
    /* Print background colors (title underline) — off by default */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    .print-logo { margin-bottom: 0.75rem; }
    .print-logo img { height: 1.75rem; width: auto; }

    .print-title {
      font-size: 2.25rem; font-weight: 500; color: var(--bbl-color-black);
      margin: 0.25rem 0 1rem; position: relative; padding-bottom: 0.5rem;
    }
    .print-title::after {
      content: ''; position: absolute; left: 0; bottom: 0;
      width: 2.25rem; height: 0.1875rem; background: var(--bbl-color-blue-105);
    }

    .print-tabs {
      display: flex; justify-content: center; gap: 1.25rem;
      margin: 0 0 1rem;
    }
    .print-tab { font-size: 0.5625rem; font-weight: 700; color: var(--bbl-color-grey-90); }
    .print-tab.is-active { color: var(--bbl-color-black); }

    /* Read-only controls (currency + From/To) */
    .forex-graph-control-row {
      display: flex; flex-direction: column; align-items: flex-start;
      gap: 0.75rem; margin-bottom: 1.25rem; position: relative;
    }
    .forex-graph-dropdown { position: static; margin-left: 1.25rem; }
    .forex-graph-dropdown-trigger {
      display: inline-flex; align-items: center; gap: 0.25rem;
      border: 0.0625rem solid var(--bbl-color-grey-40); border-radius: 0.375rem;
      background: none; padding: 0.5rem 0.75rem;
      font-size: 0.8125rem; font-weight: 700; color: var(--bbl-color-black);
    }
    .forex-graph-date-fields { display: flex; flex-direction: column; gap: 0.75rem; }
    .forex-graph-date-field { display: flex; flex-direction: column; align-items: flex-start; gap: 0.75rem; }
    .forex-graph-date-label { display: block; margin: 0; font-size: 0.8125rem; font-weight: 400; color: var(--bbl-color-black); }
    .forex-graph-date-group {
      position: static; display: inline-flex; align-items: center; gap: 0.4rem;
      margin-left: 1.25rem;
      border: 0.0625rem solid var(--bbl-color-grey-40); border-radius: 0.375rem;
      padding: 0.5rem 0.75rem;
    }
    .forex-graph-date-display {
      display: inline-block; font-size: 0.8125rem; color: var(--bbl-color-black);
      border: none; padding: 0;
    }
    .forex-graph-date-trigger {
      position: static; transform: none; width: auto; height: auto;
      padding: 0; border: none; background: none;
      color: var(--bbl-color-gray-142); font-size: 0.85rem;
      display: inline-flex; align-items: center;
    }
    /* Keep the Download link visible in print (Print button is stripped),
       pinned to the top-right on the currency-dropdown row like the client. */
    .forex-graph-actions { position: absolute; top: 0; right: 0; display: flex; gap: 0.5rem; }
    .forex-graph-print-btn { display: none; }
    .forex-graph-download-btn {
      display: inline-flex; flex-direction: row-reverse; align-items: center; gap: 0.5rem;
      background: none; border: none; padding: 0;
      font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.0313rem;
      text-transform: uppercase; color: var(--bbl-color-black);
    }

    .forex-graph-chart-section {
      border: 0.0625rem solid var(--bbl-color-grey-22);
      border-radius: 0.375rem; padding: 0.85rem; box-sizing: border-box;
    }
    .forex-graph-chart-header {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: var(--bbl-space-100); margin-bottom: var(--bbl-space-075);
    }
    .forex-graph-chart-title { font-size: 0.75rem; font-weight: 700; color: var(--bbl-color-black); margin: 0; }
    .forex-graph-legend { display: none; }
    .forex-graph-legend-buying { color: #002087; }
    .forex-graph-legend-selling { color: #ff6e00; }

    .forex-graph-canvas-wrap { width: 100%; }
    .forex-graph-print-chart { display: block; width: 100%; height: auto; }

    .forex-graph-disclaimer { font-size: 0.5rem; line-height: 1.4; margin-top: 1.5rem; color: #555; }
    .forex-graph-disclaimer p { margin: 0; }
    .forex-graph-disclaimer p:first-child { font-weight: 700; color: var(--bbl-color-black); padding-bottom: 0.2rem; }

    /* Currency Calculator (second page) */
    .print-page-break { break-before: page; }
    .print-calc-subtitle { color: var(--bbl-color-blue-105); font-size: 0.8125rem; margin: 0 0 1.5rem; }
    .print-calc { display: flex; flex-direction: column; gap: 1.25rem; max-width: 24rem; }
    .print-calc-row { display: flex; align-items: center; gap: 1rem; }
    .print-calc-label { width: 9rem; font-size: 0.8125rem; font-weight: 700; text-transform: uppercase; color: var(--bbl-color-black); }
    .print-calc-value { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; font-weight: 700; color: var(--bbl-color-black); }
    .print-calc-value img { width: 1.25rem; height: 1.25rem; object-fit: contain; }
    .print-calc-chevron { font-size: 0.375rem; color: var(--bbl-color-black); margin-left: 0.5rem; }
    .print-calc-amount-box { display: inline-block; width: 10rem; height: 2rem; border: 0.0625rem solid var(--bbl-color-grey-40); border-radius: 0.375rem; }
  `;

  const printHtml = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(doc.title || pageTitle)}</title>
      <link rel="stylesheet" href="/styles/tokens.css">
      <link rel="stylesheet" href="/styles/fonts.css">
      <link rel="stylesheet" href="/styles/icomoon.css">
      <style>${printCss}</style>
    </head>
    <body>
      <div class="print-logo">${brandLogo}</div>
      <h1 class="print-title">${escapeHtml(pageTitle)}</h1>
      ${tabsHtml}
      <div class="forex-graph block" data-block-status="loaded">
        ${cloned.outerHTML}
      </div>
      ${calcHtml}
    </body>
  </html>`;

  const iframe = doc.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
  doc.body.appendChild(iframe);

  iframe.onload = () => {
    try {
      iframe.contentWindow.history.replaceState(null, '', window.location.href);
    } catch (e) { /* fall back to about:blank */ }
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 300);
    window.addEventListener('afterprint', () => {
      if (doc.body.contains(iframe)) doc.body.removeChild(iframe);
    }, { once: true });
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();
}

// eslint-disable-next-line import/no-unresolved
const CHARTJS_ESM = 'https://cdn.jsdelivr.net/npm/chart.js@4/+esm';

// Pick `intermediateCount` indices evenly spaced by position between first/last, so
// ticks land at equal gaps on the (category) x-axis regardless of actual date gaps.
function pickEvenlySpacedIndices(length, intermediateCount = 6) {
  const lastIndex = length - 1;
  if (lastIndex <= 0) return Array.from({ length }, (_, index) => index);

  const segments = intermediateCount + 1;
  const step = Math.floor(lastIndex / segments);
  const indices = [0];

  for (let k = 1; k <= intermediateCount; k += 1) {
    const idx = step * k;
    const lastPicked = indices[indices.length - 1];
    if (idx > lastPicked && idx < lastIndex) {
      indices.push(idx);
    }
  }

  indices.push(lastIndex);
  return indices;
}

async function loadChartJs() {
  if (window.ForexChart) return window.ForexChart;
  // eslint-disable-next-line import/no-unresolved
  const module = await import(/* webpackIgnore: true */ CHARTJS_ESM);
  const { Chart, registerables } = module;
  Chart.register(...registerables);
  window.ForexChart = Chart;
  return Chart;
}

function renderDatepicker(pick, pickerState, monthLabels, dayLabels, buddhistYearOffset) {
  if (!pickerState.calendarOpen) return '';

  const viewMonthKey = getMonthKey(pickerState.viewYear, pickerState.viewMonth);
  const viewEnabledSet = new Set(pickerState.enabledDaysByMonth[viewMonthKey] || []);
  const calendarWeeks = buildCalendarGrid(pickerState.viewYear, pickerState.viewMonth);
  const selectedParsed = parseIsoDate(pickerState.selectedDate);
  const now = new Date();
  const nextDisabled = pickerState.viewYear === now.getFullYear()
    && pickerState.viewMonth === now.getMonth() + 1;

  const weeksMarkup = calendarWeeks.map((week) => {
    const cells = week.map((cell, index) => {
      if (!cell.inMonth) {
        const weekend = index === 0 || index === 6 ? ' is-weekend' : '';
        return `<td class="is-other-month${weekend}">&nbsp;</td>`;
      }

      const dayValue = String(cell.day).padStart(2, '0');
      const isEnabled = viewEnabledSet.size === 0 || viewEnabledSet.has(dayValue);
      const isSelected = selectedParsed
        && Number(selectedParsed.day) === cell.day
        && Number(selectedParsed.month) === pickerState.viewMonth
        && Number(selectedParsed.year) === pickerState.viewYear;

      const classes = [
        index === 0 || index === 6 ? 'is-weekend' : '',
        isEnabled ? 'is-enabled' : 'is-disabled',
        isSelected ? 'is-current' : '',
      ].filter(Boolean).join(' ');

      if (isEnabled) {
        return `<td class="${classes}"><button type="button" class="forex-graph-datepicker-day-btn" data-day="${cell.day}" data-pick="${pick}">${cell.day}</button></td>`;
      }

      return `<td class="${classes}"><span class="forex-graph-datepicker-day-text">${cell.day}</span></td>`;
    }).join('');

    return `<tr>${cells}</tr>`;
  }).join('');

  const daysHeader = dayLabels.map((dayLabel, index) => {
    const weekend = index === 0 || index === 6 ? 'is-weekend' : '';
    return `<th class="${weekend}">${escapeHtml(dayLabel)}</th>`;
  }).join('');

  return `<div class="forex-graph-datepicker">
    <div class="forex-graph-datepicker-header">
      <button type="button" class="forex-graph-datepicker-nav forex-graph-datepicker-prev" data-pick="${pick}" aria-label="Previous month"><i class="icon-arrow-left" aria-hidden="true"></i></button>
      <div class="forex-graph-datepicker-title">
        <span class="forex-graph-datepicker-month">${escapeHtml(monthLabels[pickerState.viewMonth - 1] || '')}</span>
        <span class="forex-graph-datepicker-year">${pickerState.viewYear + buddhistYearOffset}</span>
      </div>
      <button type="button" class="forex-graph-datepicker-nav forex-graph-datepicker-next${nextDisabled ? ' is-disabled' : ''}" data-pick="${pick}" aria-label="Next month"${nextDisabled ? ' disabled' : ''}><i class="icon-arrow-left" aria-hidden="true"></i></button>
    </div>
    <table class="forex-graph-datepicker-calendar">
      <thead><tr>${daysHeader}</tr></thead>
      <tbody>${weeksMarkup}</tbody>
    </table>
  </div>`;
}

function renderBlock(
  block,
  state,
  authoring,
  monthLabels,
  dayLabels,
  buddhistYearOffset,
  placeholders,
) {
  const selectedFamilyObj = state.families.find((f) => f.Family === state.selectedFamily);
  const selectedLabel = selectedFamilyObj?.Description || state.selectedFamily;
  const currName = selectedLabel;

  const familyItems = state.families.map((f) => {
    const isActive = f.Family === state.selectedFamily;
    return `<li class="forex-graph-dropdown-item${isActive ? ' is-active' : ''}" role="option" aria-selected="${isActive}" data-value="${escapeHtml(f.Family)}">${escapeHtml(f.Description)}</li>`;
  }).join('');

  const fromDisplayDate = formatDateInputValue(
    state.from.selectedDate,
    monthLabels,
    buddhistYearOffset,
  );
  const toDisplayDate = formatDateInputValue(
    state.to.selectedDate,
    monthLabels,
    buddhistYearOffset,
  );

  const graphTitle = buildGraphTitle(
    placeholders.forexGraphTitle,
    currName,
    state.selectedFamily,
    state.from.selectedDate,
    state.to.selectedDate,
    buddhistYearOffset,
  );

  const errorStyle = state.error ? '' : ' style="display:none"';
  const dropdownOpen = state.dropdownOpen ? ' is-open' : '';
  const showNoData = state.hasSearched && !state.loading && !state.chartData.length;
  const noDataStyle = showNoData ? '' : ' style="display:none"';

  block.innerHTML = `<section class="forex-graph-content">
    <div class="forex-graph-controls">
      <div class="forex-graph-control-row">
        <div class="forex-graph-currency-wrap">
          <div class="forex-graph-dropdown${dropdownOpen}" role="combobox" aria-expanded="${state.dropdownOpen}" aria-haspopup="listbox">
            <button type="button" class="forex-graph-dropdown-trigger" aria-label="Select currency">
              <span class="forex-graph-dropdown-label">${escapeHtml(selectedLabel)}</span>
              <i class="icon-dropdown forex-graph-dropdown-chevron" aria-hidden="true"></i>
            </button>
            <ul class="forex-graph-dropdown-list" role="listbox">${familyItems}</ul>
          </div>
        </div>
        <div class="forex-graph-date-fields">
          <div class="forex-graph-date-field">
            <label class="forex-graph-date-label">${escapeHtml(placeholders.fromLabel || 'From')}</label>
            <div class="forex-graph-date-group forex-graph-from-group">
              <span class="forex-graph-date-display">${escapeHtml(fromDisplayDate)}</span>
              <input type="text" class="forex-graph-date-input forex-graph-from-input" inputmode="text" value="${escapeHtml(state.from.typedDate)}" aria-label="From date" data-pick="from">
              <button type="button" class="forex-graph-date-trigger icon-calendar" aria-label="Open from calendar" data-pick="from"></button>
              ${renderDatepicker('from', state.from, monthLabels, dayLabels, buddhistYearOffset)}
            </div>
          </div>
          <div class="forex-graph-date-field">
            <label class="forex-graph-date-label">${escapeHtml(placeholders.toLabel || 'To')}</label>
            <div class="forex-graph-date-group forex-graph-to-group">
              <span class="forex-graph-date-display">${escapeHtml(toDisplayDate)}</span>
              <input type="text" class="forex-graph-date-input forex-graph-to-input" inputmode="text" value="${escapeHtml(state.to.typedDate)}" aria-label="To date" data-pick="to">
              <button type="button" class="forex-graph-date-trigger icon-calendar" aria-label="Open to calendar" data-pick="to"></button>
              ${renderDatepicker('to', state.to, monthLabels, dayLabels, buddhistYearOffset)}
            </div>
          </div>
        </div>
        <button type="button" class="forex-graph-go-btn"${(state.loading || !state.from.selectedDate || !state.to.selectedDate) ? ' disabled' : ''}>${escapeHtml(authoring.goLabel)}</button>
        <div class="forex-graph-actions">
          <button type="button" class="forex-graph-print-btn icon-print">${escapeHtml(authoring.printLabel)}</button>
          <button type="button" class="forex-graph-download-btn icon-download">${escapeHtml(authoring.downloadLabel)}</button>
        </div>
      </div>
    </div>
    <div class="forex-graph-error"${errorStyle}><p class="forex-graph-error-text">${escapeHtml(state.error)}</p></div>
    <p class="forex-graph-no-data"${noDataStyle}>${escapeHtml(placeholders.noDataLabel || 'No Data')}</p>
    <div class="forex-graph-chart-section">
      <div class="forex-graph-chart-header">
        <h5 class="forex-graph-chart-title">${escapeHtml(graphTitle)}</h5>
        <div class="forex-graph-legend">
          <span class="forex-graph-legend-buying">${escapeHtml(placeholders.buyingLabel || 'Buying')}</span>
          <span class="forex-graph-legend-selling">${escapeHtml(placeholders.sellingLabel || 'Selling')}</span>
        </div>
      </div>
      <div class="forex-graph-canvas-wrap">
        <canvas class="forex-graph-canvas" id="forex-graph-canvas"></canvas>
      </div>
    </div>
    <div class="forex-graph-disclaimer">${authoring.disclaimerHtml}</div>
  </section>`;
}

export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const language = getLang();
  const monthLabels = parseCsvConfigList(placeholders?.monthLabels, buildIntlMonthLabels(language));
  const dayLabels = parseCsvConfigList(placeholders?.dayLabels, buildIntlDayLabels(language));
  const buddhistYearOffset = getLang() === 'th' ? Number(configs?.sharedBuddhistYearOffset) || 0 : 0;
  const endpoints = createApiEndpoints(configs);

  function createPickerState() {
    const now = new Date();
    return {
      selectedDate: '',
      typedDate: '',
      calendarOpen: false,
      viewYear: now.getFullYear(),
      viewMonth: now.getMonth() + 1,
      enabledDaysByMonth: {},
    };
  }

  const state = {
    families: [],
    selectedFamily: 'USD1',
    dropdownOpen: false,
    from: createPickerState(),
    to: createPickerState(),
    chartData: [],
    loading: false,
    error: '',
    chartInstance: null,
    // False until the user clicks GO: the chart stays blank (no chart drawn, no
    // "No Data" text). "No Data" only shows after a search returns nothing.
    hasSearched: false,
  };

  let outsideClickHandlers = {};
  let rendering = false;

  async function fetchAndRenderChart() {
    const fromParsed = parseIsoDate(state.from.selectedDate);
    const toParsed = parseIsoDate(state.to.selectedDate);
    if (!fromParsed || !toParsed) return;

    state.error = '';
    state.loading = true;

    try {
      const raw = await getChartRates(
        endpoints,
        fromParsed.day,
        fromParsed.month,
        fromParsed.year,
        toParsed.day,
        toParsed.month,
        toParsed.year,
        state.selectedFamily,
        language,
      );
      state.chartData = normalizeChartData(raw, language);
    } finally {
      state.loading = false;
    }
  }

  async function drawChart() {
    const canvas = block.querySelector('.forex-graph-canvas');
    if (!canvas) return;

    // Before the first GO, leave the chart area blank (no axes, no "No Data").
    if (!state.hasSearched) {
      if (state.chartInstance) {
        state.chartInstance.destroy();
        state.chartInstance = null;
      }
      return;
    }

    const Chart = await loadChartJs();

    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }

    const labels = state.chartData.map((d) => d.date);
    const buyingData = state.chartData.map((d) => d.buyingRate);
    const sellingData = state.chartData.map((d) => d.sellingRate);

    // Single-day range (or no data at all) pins to the axis origin;
    if (labels.length <= 1) {
      labels.unshift('');
      labels.push('');
      buyingData.unshift(null);
      buyingData.push(null);
      sellingData.unshift(null);
      sellingData.push(null);
    }

    const allValues = [...buyingData, ...sellingData].filter((v) => v !== null);
    const hasData = allValues.length > 0;
    const minVal = hasData ? Math.min(...allValues) - 0.5 : -1;
    const maxVal = hasData ? Math.ceil(Math.max(...allValues)) : 1;

    // Breakpoints (see forex-graph.css): mobile < 760px, tablet 760–1024px, desktop 1024px+.
    const viewportWidth = window.innerWidth;
    const isMobileViewport = viewportWidth <= 760;
    const isTabletViewport = viewportWidth > 760 && viewportWidth < 1024;

    const fromParsedForMonth = parseIsoDate(state.from.selectedDate);
    const toParsedForMonth = parseIsoDate(state.to.selectedDate);
    const sameMonth = !!(fromParsedForMonth && toParsedForMonth
      && fromParsedForMonth.year === toParsedForMonth.year
      && fromParsedForMonth.month === toParsedForMonth.month);
    const monthDiff = (fromParsedForMonth && toParsedForMonth)
      ? (Number(toParsedForMonth.year) * 12 + Number(toParsedForMonth.month))
        - (Number(fromParsedForMonth.year) * 12 + Number(fromParsedForMonth.month))
      : null;
    const isPrevMonthRange = monthDiff === 1;

    // Mobile wants 6 evenly (position-)spaced labels for a ~1-month-or-less range,
    // 7 for longer ranges, instead of index-based autoSkip.
    const rangeDays = (new Date(state.to.selectedDate) - new Date(state.from.selectedDate))
      / (1000 * 60 * 60 * 24);
    const mobileIntermediateCount = rangeDays > 31 ? 5 : 4;
    const mobileTickIndices = isMobileViewport
      ? new Set(pickEvenlySpacedIndices(labels.length, mobileIntermediateCount))
      : null;

    // Tablet: a same-month range shows every working day
    let tabletTickIndices = null;
    if (isTabletViewport && isPrevMonthRange) {
      tabletTickIndices = new Set(pickEvenlySpacedIndices(labels.length, 8));
    }

    const customTickIndices = mobileTickIndices || tabletTickIndices;

    // Tablet + desktop: for a same-month range show every working day instead of
    // autoSkipping (matches the client, which lists all days rotated on tablet).
    const sameMonthNoSkip = !isMobileViewport && sameMonth;

    // Plugin: draw halo on the cross-dataset point at the same index
    const crossHighlightPlugin = {
      id: 'crossHighlight',
      afterDraw(chart) {
        const { tooltip } = chart;
        if (!tooltip) return;
        const activeElements = tooltip.getActiveElements();
        if (!activeElements.length) return;
        const active = activeElements[0];
        const otherIdx = active.datasetIndex === 0 ? 1 : 0;
        const otherMeta = chart.getDatasetMeta(otherIdx);
        const otherPoint = otherMeta.data[active.index];
        if (!otherPoint) return;
        const color = otherIdx === 0
          ? 'rgba(0,32,135,0.35)' : 'rgba(255,110,0,0.35)';
        const { ctx } = chart;
        ctx.save();
        ctx.beginPath();
        ctx.arc(otherPoint.x, otherPoint.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      },
    };

    // Plugin: draw a vertical gridline only at the labeled (auto-skipped)
    // x-axis ticks, so the number of gridlines matches the visible dates.
    const pointGridPlugin = {
      id: 'pointGrid',
      beforeDatasetsDraw(chart) {
        if (!hasData) return; // empty state: horizontal gridlines only, no vertical ticks
        const { ctx, chartArea, scales } = chart;
        const xScale = scales.x;
        const meta = chart.getDatasetMeta(0);
        if (!xScale || !meta || !meta.data.length) return;
        const lineBottom = chartArea.bottom + 10;
        ctx.save();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 1;
        // Mobile/tablet: use our position-based ticks; else mirror autoSkip + last point.
        const indices = customTickIndices
          ? new Set(customTickIndices)
          : new Set(xScale.ticks.map((tick) => tick.value));
        indices.add(meta.data.length - 1);
        indices.forEach((index) => {
          const point = meta.data[index];
          if (!point) return;
          ctx.beginPath();
          ctx.moveTo(point.x, chartArea.top);
          ctx.lineTo(point.x, lineBottom);
          ctx.stroke();
        });

        const lineLeft = chartArea.left - 10;
        scales.y.ticks.forEach((_tick, i) => {
          const y = scales.y.getPixelForTick(i);
          ctx.beginPath();
          ctx.moveTo(lineLeft, y);
          ctx.lineTo(chartArea.left, y);
          ctx.stroke();
        });
        ctx.restore();
      },

      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        const yScale = scales.y;
        ctx.save();
        ctx.font = `700 13px ${Chart.defaults.font.family}`;
        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        yScale.ticks.forEach((tick, i) => {
          if (!Number.isInteger(tick.value)) return;
          // Empty state: don't render negative placeholder ticks (matches the
          // y-axis callback), so the "No Data" view shows no stray numbers.
          if (!hasData && tick.value < 0) return;
          ctx.fillText(String(tick.value), 0, yScale.getPixelForTick(i));
        });
        ctx.restore();
      },
    };

    state.chartInstance = new Chart(canvas, {
      type: 'line',
      plugins: [crossHighlightPlugin, pointGridPlugin],
      data: {
        labels,
        datasets: [
          {
            label: placeholders.buyingLabel || 'Buying',
            data: buyingData,
            borderColor: '#002087',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#002087',
            pointBorderColor: '#002087',
            pointRadius: 1.5,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#002087',
            pointHoverBorderColor: 'rgba(0,32,135,0.35)',
            pointHoverBorderWidth: 8,
            borderWidth: 2,
            tension: 0.3,
          },
          {
            label: placeholders.sellingLabel || 'Selling',
            data: sellingData,
            borderColor: '#ff6e00',
            backgroundColor: 'transparent',
            pointBackgroundColor: '#ff6e00',
            pointBorderColor: '#ff6e00',
            pointRadius: 1.5,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: '#ff6e00',
            pointHoverBorderColor: 'rgba(255,110,0,0.35)',
            pointHoverBorderWidth: 8,
            borderWidth: 2,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: false,
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#2c3e63',
            titleColor: 'rgba(255,255,255,0.65)',
            bodyColor: '#fff',
            titleFont: { size: 14, weight: '700' },
            bodyFont: { size: 15, weight: '700' },
            padding: { x: 18, y: 14 },
            cornerRadius: 4,
            borderWidth: 0,
            displayColors: false,
            callbacks: {
              title: (items) => items[0]?.label || '',
              label: (item) => `${item.formattedValue}`,
            },
          },
        },
        scales: {
          x: {
            // autoSkip can drop the last tick; force it back in before fit sizes/rotates labels.
            beforeFit: (axis) => {
              const lastIndex = labels.length - 1;
              const { ticks } = axis;
              if (ticks.length && ticks[ticks.length - 1].value !== lastIndex) {
                // Drop the previously-last tick so it doesn't crowd/overlap the
                // forced-in last one.
                ticks.pop();
                ticks.push({ value: lastIndex, label: axis.getLabelForValue(lastIndex) });
                // eslint-disable-next-line no-underscore-dangle
                axis._labelSizes = null;
              }
            },
            grid: {
              display: false,
            },
            ticks: {
              maxRotation: (isMobileViewport || isTabletViewport) ? 50 : 45,
              minRotation: (isMobileViewport || isTabletViewport) ? 50 : 0,
              // Mobile/tablet: blank labels outside our indices via callback; else autoSkip.
              autoSkip: !customTickIndices && !sameMonthNoSkip,
              autoSkipPadding: 10,
              callback: (value) => (
                customTickIndices && !customTickIndices.has(value) ? null : labels[value]
              ),
              font: { size: 13, weight: '700' },
              color: '#000',
            },
          },
          y: {
            min: minVal,
            max: maxVal,
            grid: {
              display: true,
              color: 'rgba(0,0,0,0.08)',
              tickLength: 22,
              tickColor: 'transparent',
            },
            border: {
              display: hasData,
            },
            ticks: {
              stepSize: 1,
              padding: 0,
              font: { size: 13, weight: '700' },
              // Labels are hidden here and redrawn flush-left by the pointGrid
              // plugin; transparent keeps their reserved width (and the plot gap).
              color: 'transparent',
              callback: (value) => {
                if (!hasData && value < 0) return null;
                return Number.isInteger(value) ? value : null;
              },
            },
          },
        },
      },
    });
  }

  // Tick strategy is decided once at build time; rebuild when the breakpoint tier actually changes.
  const getBreakpointTier = () => {
    const width = window.innerWidth;
    if (width <= 760) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };
  let breakpointTier = getBreakpointTier();
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const nowTier = getBreakpointTier();
      if (nowTier !== breakpointTier) {
        breakpointTier = nowTier;
        drawChart();
      }
    }, 200);
  });

  const render = ({ redrawChart = false } = {}) => {
    if (rendering) return;
    rendering = true;

    // Preserve the existing chart section (title, legend, canvas/chart) unless data changed.
    const existingChartSection = !redrawChart
      ? block.querySelector('.forex-graph-chart-section')
      : null;

    if (redrawChart && state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }

    renderBlock(
      block,
      state,
      authoring,
      monthLabels,
      dayLabels,
      buddhistYearOffset,
      placeholders,
    );

    if (existingChartSection) {
      const freshChartSection = block.querySelector('.forex-graph-chart-section');
      if (freshChartSection) freshChartSection.replaceWith(existingChartSection);
    }

    const dropdownEl = block.querySelector('.forex-graph-dropdown');
    const dropdownTrigger = block.querySelector('.forex-graph-dropdown-trigger');
    const goButton = block.querySelector('.forex-graph-go-btn');
    const printButton = block.querySelector('.forex-graph-print-btn');
    const downloadButton = block.querySelector('.forex-graph-download-btn');

    // ── Custom currency dropdown ─────────────────────────────────────────────
    const toggleDropdown = (open) => {
      state.dropdownOpen = open;
      if (dropdownEl) dropdownEl.classList.toggle('is-open', open);
    };

    if (dropdownTrigger) {
      dropdownTrigger.addEventListener('click', () => {
        const next = !state.dropdownOpen;
        toggleDropdown(next);
        if (next) {
          document.addEventListener('mousedown', function closeDropdown(e) {
            if (!dropdownEl || !dropdownEl.contains(e.target)) {
              toggleDropdown(false);
            }
            document.removeEventListener('mousedown', closeDropdown);
          });
        }
      });
    }

    block.querySelectorAll('.forex-graph-dropdown-item').forEach((item) => {
      item.addEventListener('click', () => {
        const prev = state.selectedFamily;
        state.selectedFamily = item.dataset.value;
        toggleDropdown(false);
        // only re-render controls (label update), not the chart
        if (prev !== state.selectedFamily) {
          const labelEl = block.querySelector('.forex-graph-dropdown-label');
          const selectedObj = state.families.find((f) => f.Family === state.selectedFamily);
          if (labelEl) labelEl.textContent = selectedObj?.Description || state.selectedFamily;
          block.querySelectorAll('.forex-graph-dropdown-item').forEach((li) => {
            li.classList.toggle('is-active', li.dataset.value === state.selectedFamily);
            li.setAttribute('aria-selected', li.dataset.value === state.selectedFamily);
          });
        }
      });
    });

    // ── Date inputs ──────────────────────────────────────────────────────────
    block.querySelectorAll('.forex-graph-date-input').forEach((input) => {
      const { pick } = input.dataset;

      input.addEventListener('input', (e) => {
        state[pick].typedDate = e.target.value;
      });

      input.addEventListener('blur', () => {
        // Defer so any pending click events (e.g. GO button) fire before render
        // replaces the DOM — otherwise the clicked element gets detached first.
        setTimeout(() => {
          // Skip blur handling while calendar is open — mousedown on a day button
          // triggers blur before the click fires, and re-rendering here detaches
          // the day button so its click handler never runs.
          if (state[pick].calendarOpen) return;
          const parsed = parseTypedDate(state[pick].typedDate, buddhistYearOffset);
          if (!parsed) {
            if (!state[pick].typedDate.trim()) {
              state[pick].selectedDate = '';
            } else {
              state[pick].typedDate = formatDateInputValue(
                state[pick].selectedDate,
                monthLabels,
                buddhistYearOffset,
              );
            }
            render();
            return;
          }
          if (parsed.iso !== state[pick].selectedDate) {
            state[pick].selectedDate = parsed.iso;
            state[pick].typedDate = formatDateInputValue(
              parsed.iso,
              monthLabels,
              buddhistYearOffset,
            );
            state[pick].viewYear = Number(parsed.year);
            state[pick].viewMonth = Number(parsed.month);
            render();
          }
        }, 0);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        input.blur();
      });
    });

    // ── Calendar triggers ────────────────────────────────────────────────────
    const openCalendar = (pick) => {
      const pickerState = state[pick];
      const parsed = parseIsoDate(pickerState.selectedDate);
      if (parsed) {
        pickerState.viewYear = Number(parsed.year);
        pickerState.viewMonth = Number(parsed.month);
      }
      pickerState.calendarOpen = true;
      render();

      const inputEl = block.querySelector(`.forex-graph-${pick}-input`);
      if (inputEl) inputEl.focus();

      if (parsed) {
        const monthKey = getMonthKey(parsed.year, parsed.month);
        if (!pickerState.enabledDaysByMonth[monthKey]) {
          getEnabledDays(endpoints, parsed.year, parsed.month)
            .then((days) => {
              pickerState.enabledDaysByMonth[monthKey] = days;
              if (pickerState.calendarOpen) render();
            })
            .catch(() => {
              pickerState.enabledDaysByMonth[monthKey] = [];
            });
        }
      }
    };

    block.querySelectorAll('.forex-graph-date-trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => openCalendar(trigger.dataset.pick));
    });

    block.querySelectorAll('.forex-graph-date-input').forEach((input) => {
      input.addEventListener('focus', () => {
        if (!state[input.dataset.pick].calendarOpen) openCalendar(input.dataset.pick);
      });
    });

    // ── Calendar nav (prev/next month) ───────────────────────────────────────
    block.querySelectorAll('.forex-graph-datepicker-prev').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { pick } = btn.dataset;
        const ps = state[pick];
        const month = ps.viewMonth === 1 ? 12 : ps.viewMonth - 1;
        const year = ps.viewMonth === 1 ? ps.viewYear - 1 : ps.viewYear;
        ps.viewMonth = month;
        ps.viewYear = year;

        const monthKey = getMonthKey(year, month);
        if (!ps.enabledDaysByMonth[monthKey]) {
          try {
            ps.enabledDaysByMonth[monthKey] = await getEnabledDays(endpoints, year, month);
          } catch (e) {
            ps.enabledDaysByMonth[monthKey] = [];
          }
        }
        render();
      });
    });

    block.querySelectorAll('.forex-graph-datepicker-next').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { pick } = btn.dataset;
        const ps = state[pick];
        const month = ps.viewMonth === 12 ? 1 : ps.viewMonth + 1;
        const year = ps.viewMonth === 12 ? ps.viewYear + 1 : ps.viewYear;
        ps.viewMonth = month;
        ps.viewYear = year;

        const monthKey = getMonthKey(year, month);
        if (!ps.enabledDaysByMonth[monthKey]) {
          try {
            ps.enabledDaysByMonth[monthKey] = await getEnabledDays(endpoints, year, month);
          } catch (e) {
            ps.enabledDaysByMonth[monthKey] = [];
          }
        }
        render();
      });
    });

    // ── Day selection ────────────────────────────────────────────────────────
    block.querySelectorAll('.forex-graph-datepicker-day-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { pick } = btn.dataset;
        const ps = state[pick];
        const { day } = btn.dataset;
        const iso = `${ps.viewYear}-${String(ps.viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        ps.selectedDate = iso;
        ps.typedDate = formatDateInputValue(iso, monthLabels, buddhistYearOffset);
        ps.calendarOpen = false;
        render();
      });
    });

    // ── GO button ────────────────────────────────────────────────────────────
    if (goButton) {
      goButton.addEventListener('click', async () => {
        if (state.loading) return;
        state.hasSearched = true;
        await fetchAndRenderChart();
        render({ redrawChart: true });
      });
    }

    // ── Print button ─────────────────────────────────────────────────────────
    if (printButton) {
      printButton.addEventListener('click', () => {
        printForexGraph(block, state);
      });
    }

    // ── Download button ──────────────────────────────────────────────────────
    if (downloadButton) {
      downloadButton.addEventListener('click', async () => {
        const fromParsed = parseIsoDate(state.from.selectedDate);
        const toParsed = parseIsoDate(state.to.selectedDate);
        if (!fromParsed || !toParsed) return;
        const url = getDownloadUrl(
          endpoints,
          fromParsed.day,
          fromParsed.month,
          fromParsed.year,
          toParsed.day,
          toParsed.month,
          toParsed.year,
          state.selectedFamily,
          language,
        );
        if (!url) return;
        try {
          const data = await fetchGet(url, { throwOnError: false });
          if (!data) return;
          const rows = Array.isArray(data) ? data : [];
          if (!rows.length) return;
          // Map raw API keys to standard CSV column names
          const formattedRows = rows.map((r) => ({
            Currency: r.Currency || r.Family || '',
            Date: r.Date || [r.Ddate, r.DTime || r.Dtime].filter(Boolean).join(' '),
            'Bank Note: Buying Rates': r['Bank Note: Buying Rates'] || r.BuyingRates || '',
            'Bank Note: Selling Rates': r['Bank Note: Selling Rates'] || r.SellingRates || '',
            'Buying Rates: SightBill': r['Buying Rates: SightBill'] || r.SightBill || '',
            'Buying Rates: TT': r['Buying Rates: TT'] || r.TT || '',
            'Selling Rates: Bill-DD-TT': r['Selling Rates: Bill-DD-TT'] || r.Bill_DD_TT || '',
          }));
          const keys = Object.keys(formattedRows[0]);
          const header = keys.join(',');
          const lines = formattedRows.map((row) => keys.map((k) => {
            const val = row[k] ?? '';
            return String(val).includes(',') ? `"${val}"` : val;
          }).join(','));
          const csvText = [header, ...lines].join('\r\n');
          const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
          const objectUrl = URL.createObjectURL(blob);
          // Create anchor without appending to DOM to avoid bbl-decorators interception
          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = placeholders.forexGraphDownloadFilename || 'FxData.csv';
          anchor.dispatchEvent(new MouseEvent('click', { bubbles: false }));
          URL.revokeObjectURL(objectUrl);
        } catch (e) {
          // silently fail
        }
      });
    }

    // ── Outside click to close calendars ────────────────────────────────────
    Object.values(outsideClickHandlers).forEach((handler) => {
      document.removeEventListener('mousedown', handler);
    });
    outsideClickHandlers = {};

    ['from', 'to'].forEach((pick) => {
      if (!state[pick].calendarOpen) return;
      const group = block.querySelector(`.forex-graph-${pick}-group`);
      if (!group) return;
      const handler = (e) => {
        if (!group.contains(e.target)) {
          state[pick].calendarOpen = false;
          // If the click is inside the block (e.g. GO button), don't render here —
          // the element's own click handler will call render(). Rendering now would
          // replace the DOM before that click fires, detaching the target.
          if (!block.contains(e.target)) {
            render();
          }
        }
      };
      outsideClickHandlers[pick] = handler;
      document.addEventListener('mousedown', handler);
    });

    // Only (re)draw the chart when the data actually changed, not on every controls interaction.
    rendering = false;
    if (redrawChart || !state.chartInstance) {
      drawChart();
    }
  };

  const init = async () => {
    state.loading = true;
    render();

    try {
      // Load families and the latest available rates date in parallel. The latest
      // rates endpoint (shared with forex-rates) tells us the most recent date FX
      // data actually exists for, so the "To" date doesn't default to today when
      // today is a weekend/holiday with no data.
      const [families, latest] = await Promise.all([
        getFxFamily(endpoints).catch(() => []),
        getLatestRates(endpoints).catch(() => null),
      ]);

      const now = new Date();
      const latestDate = parseApiDate(latest?.[0]?.Ddate);
      const year = latestDate ? Number(latestDate.year) : now.getFullYear();
      const month = latestDate ? Number(latestDate.month) : now.getMonth() + 1;

      const enabledDays = await getEnabledDays(endpoints, year, month).catch(() => []);

      const EXCLUDED_FAMILIES = ['MMK', 'INR', 'LAK'];
      state.families = (Array.isArray(families) ? families : [])
        .filter((f) => !EXCLUDED_FAMILIES.includes(f.Family));
      state.selectedFamily = state.families[0]?.Family || 'USD1';

      // Cache enabled days for current month in both pickers
      const monthKey = getMonthKey(year, month);
      state.from.enabledDaysByMonth[monthKey] = enabledDays;
      state.to.enabledDaysByMonth[monthKey] = enabledDays;

      // Set default dates: 1st of month (even if not itself an enabled day) → latest available date
      const monthStr = String(month).padStart(2, '0');
      const toDayStr = latestDate ? latestDate.day : String(now.getDate()).padStart(2, '0');
      state.from.selectedDate = `${year}-${monthStr}-01`;
      state.to.selectedDate = `${year}-${monthStr}-${toDayStr}`;

      // Format typed date display values
      state.from.typedDate = formatDateInputValue(
        state.from.selectedDate,
        monthLabels,
        buddhistYearOffset,
      );
      state.to.typedDate = formatDateInputValue(
        state.to.selectedDate,
        monthLabels,
        buddhistYearOffset,
      );

      // Set calendar view to current month
      state.from.viewYear = year;
      state.from.viewMonth = month;
      state.to.viewYear = year;
      state.to.viewMonth = month;

      // No auto-generate: the chart stays in its empty "No Data" state until the
      // user picks a range and clicks GO.
    } finally {
      state.loading = false;
      render({ redrawChart: true });
    }
  };

  await init();
}

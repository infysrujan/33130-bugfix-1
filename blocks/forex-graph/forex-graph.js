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
  parseCsvConfigList,
  parseIsoDate,
  parseTypedDate,
} from '../forex-rates/helpers/date-helpers.js';
import {
  createApiEndpoints,
  getChartRates,
  getDownloadUrl,
  getEnabledDays,
  getFxFamily,
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

function isDateRangeOver3Years(fromIso, toIso) {
  if (!fromIso || !toIso) return false;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const diffMs = to.getTime() - from.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 365.25 * 3;
}

function buildGraphTitle(template, currName, currFamily, fromIso, toIso) {
  const fromParsed = parseIsoDate(fromIso);
  const toParsed = parseIsoDate(toIso);
  const startDate = fromParsed ? `${fromParsed.month}/${fromParsed.day}/${fromParsed.year}` : '';
  const endDate = toParsed ? `${toParsed.month}/${toParsed.day}/${toParsed.year}` : '';

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

// eslint-disable-next-line import/no-unresolved
const CHARTJS_ESM = 'https://cdn.jsdelivr.net/npm/chart.js@4/+esm';

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
      const isToday = now.getDate() === cell.day
        && now.getMonth() + 1 === pickerState.viewMonth
        && now.getFullYear() === pickerState.viewYear;

      const classes = [
        index === 0 || index === 6 ? 'is-weekend' : '',
        isEnabled ? 'is-enabled' : 'is-disabled',
        isSelected ? 'is-current' : '',
        isToday ? 'is-today' : '',
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
  );

  const dropdownOpen = state.dropdownOpen ? ' is-open' : '';

  let contentSec = block.querySelector('.forex-graph-content');
  if (!contentSec) {
    block.innerHTML = `<section class="forex-graph-content">
      <div class="forex-graph-controls">
        <div class="forex-graph-control-row">
          <div class="forex-graph-currency-wrap">
            <div class="forex-graph-dropdown" role="combobox" aria-expanded="false" aria-haspopup="listbox">
              <button type="button" class="forex-graph-dropdown-trigger" aria-label="Select currency">
                <span class="forex-graph-dropdown-label"></span>
                <i class="icon-dropdown forex-graph-dropdown-chevron" aria-hidden="true"></i>
              </button>
              <ul class="forex-graph-dropdown-list" role="listbox"></ul>
            </div>
          </div>
          <div class="forex-graph-date-fields">
            <div class="forex-graph-date-field">
              <label class="forex-graph-date-label">${escapeHtml(placeholders.fromLabel || 'From')}</label>
              <div class="forex-graph-date-group forex-graph-from-group">
                <span class="forex-graph-date-display"></span>
                <input type="text" class="forex-graph-date-input forex-graph-from-input" inputmode="text" aria-label="From date" data-pick="from">
                <button type="button" class="forex-graph-date-trigger icon-calendar" aria-label="Open from calendar" data-pick="from"></button>
                <div class="forex-graph-datepicker-container" data-pick="from"></div>
              </div>
            </div>
            <div class="forex-graph-date-field">
              <label class="forex-graph-date-label">${escapeHtml(placeholders.toLabel || 'To')}</label>
              <div class="forex-graph-date-group forex-graph-to-group">
                <span class="forex-graph-date-display"></span>
                <input type="text" class="forex-graph-date-input forex-graph-to-input" inputmode="text" aria-label="To date" data-pick="to">
                <button type="button" class="forex-graph-date-trigger icon-calendar" aria-label="Open to calendar" data-pick="to"></button>
                <div class="forex-graph-datepicker-container" data-pick="to"></div>
              </div>
            </div>
          </div>
          <button type="button" class="forex-graph-go-btn"></button>
          <div class="forex-graph-actions">
            <button type="button" class="forex-graph-print-btn icon-print"></button>
            <button type="button" class="forex-graph-download-btn icon-download"></button>
          </div>
        </div>
      </div>
      <div class="forex-graph-error"><p class="forex-graph-error-text"></p></div>
      <div class="forex-graph-chart-section">
        <div class="forex-graph-chart-header">
          <h5 class="forex-graph-chart-title"></h5>
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
    contentSec = block.querySelector('.forex-graph-content');
  }

  // 1. Update dropdown
  const dropdown = contentSec.querySelector('.forex-graph-dropdown');
  if (dropdown) {
    dropdown.className = `forex-graph-dropdown${dropdownOpen}`;
    dropdown.setAttribute('aria-expanded', state.dropdownOpen);
    const label = dropdown.querySelector('.forex-graph-dropdown-label');
    if (label) label.textContent = selectedLabel;
    const list = dropdown.querySelector('.forex-graph-dropdown-list');
    if (list) list.innerHTML = familyItems;
  }

  // 2. Update inputs (when not active element)
  const fromInput = contentSec.querySelector('.forex-graph-from-input');
  if (fromInput) {
    if (document.activeElement !== fromInput && fromInput.value !== state.from.typedDate) {
      fromInput.value = state.from.typedDate;
    }
    fromInput.setAttribute('value', state.from.typedDate);
  }
  const toInput = contentSec.querySelector('.forex-graph-to-input');
  if (toInput) {
    if (document.activeElement !== toInput && toInput.value !== state.to.typedDate) {
      toInput.value = state.to.typedDate;
    }
    toInput.setAttribute('value', state.to.typedDate);
  }

  // 3. Update displays
  const fromDisplay = contentSec.querySelector('.forex-graph-from-group .forex-graph-date-display');
  if (fromDisplay) fromDisplay.textContent = fromDisplayDate;
  const toDisplay = contentSec.querySelector('.forex-graph-to-group .forex-graph-date-display');
  if (toDisplay) toDisplay.textContent = toDisplayDate;

  // 4. Update datepicker containers
  const fromContainer = contentSec.querySelector('.forex-graph-datepicker-container[data-pick="from"]');
  if (fromContainer) {
    fromContainer.innerHTML = renderDatepicker('from', state.from, monthLabels, dayLabels, buddhistYearOffset);
  }
  const toContainer = contentSec.querySelector('.forex-graph-datepicker-container[data-pick="to"]');
  if (toContainer) {
    toContainer.innerHTML = renderDatepicker('to', state.to, monthLabels, dayLabels, buddhistYearOffset);
  }

  // 5. Update buttons
  const goBtn = contentSec.querySelector('.forex-graph-go-btn');
  if (goBtn) {
    goBtn.disabled = state.loading || !state.from.selectedDate || !state.to.selectedDate;
    goBtn.textContent = authoring.goLabel;
  }
  const printBtn = contentSec.querySelector('.forex-graph-print-btn');
  if (printBtn) printBtn.textContent = authoring.printLabel;
  const downloadBtn = contentSec.querySelector('.forex-graph-download-btn');
  if (downloadBtn) downloadBtn.textContent = authoring.downloadLabel;

  // 6. Update error message
  const errorDiv = contentSec.querySelector('.forex-graph-error');
  if (errorDiv) {
    errorDiv.style.display = state.error ? '' : 'none';
    const errorText = errorDiv.querySelector('.forex-graph-error-text');
    if (errorText) errorText.textContent = state.error;
  }

  // 7. Update chart title
  const chartTitle = contentSec.querySelector('.forex-graph-chart-title');
  if (chartTitle) chartTitle.textContent = graphTitle;
}

export default async function decorate(block) {
  const allBlocks = Array.from(document.querySelectorAll('.forex-graph'));
  const blockIndex = allBlocks.indexOf(block) >= 0 ? allBlocks.indexOf(block) : 0;

  window.forexGraphStatesList = window.forexGraphStatesList || [];
  let state = window.forexGraphStatesList[blockIndex];
  let blockId;
  let isNewState = false;

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

  if (!state) {
    isNewState = true;
    blockId = block.dataset.forexId || `fg-${Math.random().toString(36).slice(2, 9)}`;
    state = {
      blockId,
      blockIndex,
      families: [],
      selectedFamily: 'USD1',
      dropdownOpen: false,
      from: createPickerState(),
      to: createPickerState(),
      chartData: [],
      loading: false,
      error: '',
      chartInstance: null,
      listenersAdded: false,
    };
    window.forexGraphStatesList[blockIndex] = state;
  } else {
    blockId = state.blockId;
  }

  block.setAttribute('data-forex-id', blockId);

  const getLiveBlock = () => document.querySelector(`.forex-graph[data-forex-id="${blockId}"]`) || block;

  const authoring = parseAuthoring(block);
  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const language = getLang();
  const monthLabels = parseCsvConfigList(placeholders?.monthLabels, buildIntlMonthLabels(language));
  const dayLabels = parseCsvConfigList(placeholders?.dayLabels, buildIntlDayLabels(language));
  const buddhistYearOffset = getLang() === 'th' ? Number(configs?.sharedBuddhistYearOffset) || 0 : 0;
  const endpoints = createApiEndpoints(configs);

  window.forexGraphState = state;
  window.forexGraphStates = window.forexGraphStates || new Map();
  window.forexGraphStates.set(blockId, state);

  let rendering = false;

  async function fetchAndRenderChart() {
    const fromParsed = parseIsoDate(state.from.selectedDate);
    const toParsed = parseIsoDate(state.to.selectedDate);
    if (!fromParsed || !toParsed) return;

    if (isDateRangeOver3Years(state.from.selectedDate, state.to.selectedDate)) {
      state.error = placeholders.datepickerYearValidation || 'Date range should be between 3 years';
      state.chartData = [];
      return;
    }

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
      state.chartData = normalizeChartData(raw);
    } finally {
      state.loading = false;
    }
  }

  async function drawChart() {
    const liveBlock = getLiveBlock();
    const canvas = liveBlock.querySelector('.forex-graph-canvas');
    if (!canvas || !state.chartData.length) return;

    const Chart = await loadChartJs();

    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }

    // API returns MM/DD/YYYY — reformat to DD/MM/YYYY for display
    const labels = state.chartData.map((d) => {
      const parts = d.date.split('/');
      return parts.length === 3 ? `${parts[1]}/${parts[0]}/${parts[2]}` : d.date;
    });
    const buyingData = state.chartData.map((d) => d.buyingRate);
    const sellingData = state.chartData.map((d) => d.sellingRate);

    const allValues = [...buyingData, ...sellingData].filter((v) => v !== null);
    const minVal = Math.floor(Math.min(...allValues)) - 1;
    const maxVal = Math.ceil(Math.max(...allValues)) + 1;

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

    state.chartInstance = new Chart(canvas, {
      type: 'line',
      plugins: [crossHighlightPlugin],
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
            pointRadius: 2,
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
            pointRadius: 2,
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
            grid: {
              display: true,
              color: 'rgba(0,0,0,0.08)',
            },
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              autoSkip: true,
              maxTicksLimit: 6,
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
            },
            ticks: {
              stepSize: 1,
              font: { size: 13, weight: '700' },
              color: '#000',
              callback: (value) => (Number.isInteger(value) ? value : null),
            },
          },
        },
      },
    });
  }

  const render = () => {
    if (rendering) return;
    rendering = true;

    const liveBlock = getLiveBlock();

    renderBlock(
      liveBlock,
      state,
      authoring,
      monthLabels,
      dayLabels,
      buddhistYearOffset,
      placeholders,
    );

    // Draw chart after DOM is updated
    rendering = false;
    drawChart();
  };
  state.render = render;

  // -- Calendar helper --
  const openCalendar = (pick) => {
    const pickerState = state[pick];
    const parsed = parseIsoDate(pickerState.selectedDate);
    if (parsed) {
      pickerState.viewYear = Number(parsed.year);
      pickerState.viewMonth = Number(parsed.month);
    }
    pickerState.calendarOpen = true;
    render();

    const liveBlock = getLiveBlock();
    const inputEl = liveBlock.querySelector(`.forex-graph-${pick}-input`);
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

  let blurTimeoutId = null;

  const clearBlurTimeout = () => {
    if (blurTimeoutId) {
      clearTimeout(blurTimeoutId);
      blurTimeoutId = null;
    }
  };

  // -- Event delegation on document (survives block cloning/replacements) --

  if (!state.listenersAdded) {
    state.listenersAdded = true;

    // Click delegation
    document.addEventListener('click', (e) => {
      const targetBlock = e.target.closest('.forex-graph');
      if (!targetBlock || targetBlock.getAttribute('data-forex-id') !== blockId) return;

      // 1. Currency dropdown trigger
      if (e.target.closest('.forex-graph-dropdown-trigger')) {
        clearBlurTimeout();
        state.dropdownOpen = !state.dropdownOpen;
        render();
        return;
      }

      // 2. Currency dropdown item selection
      const dropdownItem = e.target.closest('.forex-graph-dropdown-item');
      if (dropdownItem) {
        clearBlurTimeout();
        const prev = state.selectedFamily;
        state.selectedFamily = dropdownItem.dataset.value;
        state.dropdownOpen = false;
        if (prev !== state.selectedFamily) {
          (async () => {
            await fetchAndRenderChart();
            render();
          })();
        }
        return;
      }

      // 3. Calendar day selection
      const dayBtn = e.target.closest('.forex-graph-datepicker-day-btn');
      if (dayBtn) {
        clearBlurTimeout();
        const { pick, day } = dayBtn.dataset;
        const ps = state[pick];
        const iso = `${ps.viewYear}-${String(ps.viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        ps.selectedDate = iso;
        ps.typedDate = formatDateInputValue(iso, monthLabels, buddhistYearOffset);
        ps.calendarOpen = false;
        render();
        return;
      }

      // 4. Previous month navigation
      const prevBtn = e.target.closest('.forex-graph-datepicker-prev');
      if (prevBtn) {
        clearBlurTimeout();
        const { pick } = prevBtn.dataset;
        const ps = state[pick];
        const month = ps.viewMonth === 1 ? 12 : ps.viewMonth - 1;
        const year = ps.viewMonth === 1 ? ps.viewYear - 1 : ps.viewYear;
        ps.viewMonth = month;
        ps.viewYear = year;

        const monthKey = getMonthKey(year, month);
        if (!ps.enabledDaysByMonth[monthKey]) {
          getEnabledDays(endpoints, year, month)
            .then((days) => {
              ps.enabledDaysByMonth[monthKey] = days;
              render();
            })
            .catch(() => {
              ps.enabledDaysByMonth[monthKey] = [];
              render();
            });
        } else {
          render();
        }
        return;
      }

      // 5. Next month navigation
      const nextBtn = e.target.closest('.forex-graph-datepicker-next');
      if (nextBtn) {
        clearBlurTimeout();
        const { pick } = nextBtn.dataset;
        const ps = state[pick];
        const month = ps.viewMonth === 12 ? 1 : ps.viewMonth + 1;
        const year = ps.viewMonth === 12 ? ps.viewYear + 1 : ps.viewYear;
        const nextIndex = year * 12 + month;
        const now = new Date();
        const maxIndex = now.getFullYear() * 12 + (now.getMonth() + 1);
        if (nextIndex > maxIndex) return;

        ps.viewMonth = month;
        ps.viewYear = year;

        const monthKey = getMonthKey(year, month);
        if (!ps.enabledDaysByMonth[monthKey]) {
          getEnabledDays(endpoints, year, month)
            .then((days) => {
              ps.enabledDaysByMonth[monthKey] = days;
              render();
            })
            .catch(() => {
              ps.enabledDaysByMonth[monthKey] = [];
              render();
            });
        } else {
          render();
        }
        return;
      }

      // 6. Calendar triggers
      const trigger = e.target.closest('.forex-graph-date-trigger');
      if (trigger) {
        clearBlurTimeout();
        const { pick } = trigger.dataset;
        if (state[pick].calendarOpen) {
          state[pick].calendarOpen = false;
          render();
        } else {
          openCalendar(pick);
        }
        return;
      }

      // 7. GO button
      if (e.target.closest('.forex-graph-go-btn')) {
        clearBlurTimeout();
        state.from.calendarOpen = false;
        state.to.calendarOpen = false;
        if (state.loading) return;
        (async () => {
          await fetchAndRenderChart();
          render();
        })();
        return;
      }

      // 8. Print button
      if (e.target.closest('.forex-graph-print-btn')) {
        clearBlurTimeout();
        state.from.calendarOpen = false;
        state.to.calendarOpen = false;
        window.print();
        return;
      }

      // 9. Download button
      if (e.target.closest('.forex-graph-download-btn')) {
        clearBlurTimeout();
        state.from.calendarOpen = false;
        state.to.calendarOpen = false;
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
        (async () => {
          try {
            const data = await fetchGet(url, { throwOnError: false });
            if (!data) return;
            const rows = Array.isArray(data) ? data : [];
            if (!rows.length) return;
            const keys = Object.keys(rows[0]);
            const header = keys.join(',');
            const lines = rows.map((row) => keys.map((k) => {
              const val = row[k] ?? '';
              return String(val).includes(',') ? `"${val}"` : val;
            }).join(','));
            const csvText = [header, ...lines].join('\r\n');
            const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = placeholders.forexGraphDownloadFilename || 'FxData.csv';
            anchor.dispatchEvent(new MouseEvent('click', { bubbles: false }));
            URL.revokeObjectURL(objectUrl);
          } catch (err) {
          // silently fail
          }
        })();
      }
    });

    // Focusin delegation
    document.addEventListener('focusin', (e) => {
      const targetBlock = e.target.closest('.forex-graph');
      if (!targetBlock || targetBlock.getAttribute('data-forex-id') !== blockId) return;

      if (!e.target.matches('.forex-graph-date-input')) return;
      const { pick } = e.target.dataset;
      clearBlurTimeout();
      if (!state[pick].calendarOpen) {
        openCalendar(pick);
      }
    });

    // Input delegation
    document.addEventListener('input', (e) => {
      const targetBlock = e.target.closest('.forex-graph');
      if (!targetBlock || targetBlock.getAttribute('data-forex-id') !== blockId) return;

      if (!e.target.matches('.forex-graph-date-input')) return;
      const { pick } = e.target.dataset;
      state[pick].typedDate = e.target.value;
    });

    // Focusout/blur delegation with timeout to allow click events first
    document.addEventListener('focusout', (e) => {
      const targetBlock = e.target.closest('.forex-graph');
      if (!targetBlock || targetBlock.getAttribute('data-forex-id') !== blockId) return;

      if (!e.target.matches('.forex-graph-date-input')) return;
      const { pick } = e.target.dataset;

      const liveBlock = targetBlock;
      const group = liveBlock.querySelector(`.forex-graph-${pick}-group`);
      if (e.relatedTarget && group && group.contains(e.relatedTarget)) {
        return;
      }

      clearBlurTimeout();
      blurTimeoutId = setTimeout(() => {
        blurTimeoutId = null;
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
      }, 150);
    });

    // Keydown delegation
    document.addEventListener('keydown', (e) => {
      const targetBlock = e.target.closest('.forex-graph');
      if (!targetBlock || targetBlock.getAttribute('data-forex-id') !== blockId) return;

      if (!e.target.matches('.forex-graph-date-input')) return;
      if (e.key !== 'Enter') return;
      e.preventDefault();
      clearBlurTimeout();
      e.target.blur();
    });

    // Document click listener for outside clicks (capture phase)
    document.addEventListener('click', (e) => {
      const liveBlock = getLiveBlock();

      // Close currency dropdown
      if (state.dropdownOpen) {
        const dropdownEl = liveBlock.querySelector('.forex-graph-dropdown');
        if (dropdownEl && !dropdownEl.contains(e.target)) {
          state.dropdownOpen = false;
          render();
        }
      }

      // Close calendar pickers
      ['from', 'to'].forEach((pick) => {
        if (state[pick].calendarOpen) {
          const group = liveBlock.querySelector(`.forex-graph-${pick}-group`);
          if (group && !group.contains(e.target)) {
            state[pick].calendarOpen = false;
            render();
          }
        }
      });
    }, true);
  }

  // -- Initialisation --
  const init = async () => {
    state.loading = true;
    render();

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [families, enabledDays] = await Promise.all([
        getFxFamily(endpoints).catch(() => []),
        getEnabledDays(endpoints, year, month).catch(() => []),
      ]);

      state.families = Array.isArray(families) ? families : [];
      state.selectedFamily = state.families[0]?.Family || 'USD1';

      const monthKey = getMonthKey(year, month);
      state.from.enabledDaysByMonth[monthKey] = enabledDays;
      state.to.enabledDaysByMonth[monthKey] = enabledDays;

      const monthStr = String(month).padStart(2, '0');
      if (enabledDays.length) {
        state.from.selectedDate = `${year}-${monthStr}-${enabledDays[0]}`;
        state.to.selectedDate = `${year}-${monthStr}-${enabledDays[enabledDays.length - 1]}`;
      } else {
        state.from.selectedDate = `${year}-${monthStr}-01`;
        const todayStr = String(now.getDate()).padStart(2, '0');
        state.to.selectedDate = `${year}-${monthStr}-${todayStr}`;
      }

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

      state.from.viewYear = year;
      state.from.viewMonth = month;
      state.to.viewYear = year;
      state.to.viewMonth = month;

      await fetchAndRenderChart();
    } finally {
      state.loading = false;
      render();
    }
  };

  if (isNewState) {
    await init();
  } else {
    render();
  }
}

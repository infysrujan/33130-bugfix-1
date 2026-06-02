import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
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

  const errorStyle = state.error ? '' : ' style="display:none"';
  const dropdownOpen = state.dropdownOpen ? ' is-open' : '';

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
  };

  let outsideClickHandlers = {};
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
    const canvas = block.querySelector('.forex-graph-canvas');
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
    if (state.chartInstance) {
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
        await fetchAndRenderChart();
        render();
      });
    }

    // ── Print button ─────────────────────────────────────────────────────────
    if (printButton) {
      printButton.addEventListener('click', () => {
        window.print();
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
          const response = await fetch(url);
          if (!response.ok) return;
          const data = await response.json();
          const rows = Array.isArray(data) ? data : [];
          if (!rows.length) return;
          // Build CSV from all keys in the first row
          const keys = Object.keys(rows[0]);
          const header = keys.join(',');
          const lines = rows.map((row) => keys.map((k) => {
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

    // Draw chart after DOM is updated
    rendering = false;
    drawChart();
  };

  const init = async () => {
    state.loading = true;
    render();

    try {
      // Load families and enabled days in parallel
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const [families, enabledDays] = await Promise.all([
        getFxFamily(endpoints).catch(() => []),
        getEnabledDays(endpoints, year, month).catch(() => []),
      ]);

      state.families = Array.isArray(families) ? families : [];
      state.selectedFamily = state.families[0]?.Family || 'USD1';

      // Cache enabled days for current month in both pickers
      const monthKey = getMonthKey(year, month);
      state.from.enabledDaysByMonth[monthKey] = enabledDays;
      state.to.enabledDaysByMonth[monthKey] = enabledDays;

      // Set default dates: first valid day of month → last valid day
      const monthStr = String(month).padStart(2, '0');
      if (enabledDays.length) {
        state.from.selectedDate = `${year}-${monthStr}-${enabledDays[0]}`;
        state.to.selectedDate = `${year}-${monthStr}-${enabledDays[enabledDays.length - 1]}`;
      } else {
        state.from.selectedDate = `${year}-${monthStr}-01`;
        const todayStr = String(now.getDate()).padStart(2, '0');
        state.to.selectedDate = `${year}-${monthStr}-${todayStr}`;
      }

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
    } finally {
      state.loading = false;
      render();
    }
  };

  await init();
}

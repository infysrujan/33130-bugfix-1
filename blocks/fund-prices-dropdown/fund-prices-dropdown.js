import { attachCalendarPicker, formatCalendarDate, getCalendarLang } from '../../scripts/utils/calendar-picker.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

export const MAX_FUND_PRICE_HISTORY_YEARS = 3;

function parseLocalDateFromYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDMY(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatPrintDate(date = new Date()) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function formatPrintTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDatePath(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function isRangeExceedsLimit(fromDate, toDate) {
  const limitedFrom = new Date(
    toDate.getFullYear() - MAX_FUND_PRICE_HISTORY_YEARS,
    toDate.getMonth(),
    toDate.getDate(),
  );
  return fromDate < limitedFrom;
}

function isToBeforeFrom(fromDate, toDate) {
  return toDate < fromDate;
}

function isWeekendOrAfterYesterday(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return true;
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return date > yesterday;
}

async function fetchFundDetailStats(fundId, fromDate, toDate) {
  const configs = await fetchConfigs();
  const apiBase = configs.fundPricesApiUrl || '';
  const data = await fetchGet(`${apiBase}/Fund_Nav/${fundId}/${formatDatePath(fromDate)}/${formatDatePath(toDate)}/N`);
  return Array.isArray(data) ? data[0] : data;
}

async function fetchFundDetailHistory(fundId, fromDate, toDate) {
  const configs = await fetchConfigs();
  const apiBase = configs.fundPricesApiUrl || '';
  const data = await fetchGet(`${apiBase}/FundPrice/${fundId}/${formatDatePath(fromDate)}/${formatDatePath(toDate)}/N`);
  return Array.isArray(data) ? data : [];
}

function fmtNav(v) {
  const num = Number(v);
  if (!Number.isNaN(num) && num === 0) return 'N/A';
  return typeof v === 'number' ? v.toFixed(4) : (v ?? 'N/A');
}

function fmtHistDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function renderStatTables(stats, highTbody, lowTbody, rowLabels, noDataLabel) {
  const rows = [
    {
      label: rowLabels[0],
      hi: stats.MaxSelected_mfr_fNav,
      hiDate: stats.MaxSelected_mfr_dDataDate,
      lo: stats.MinSelected_mfr_fNav,
      loDate: stats.MinSelected_mfr_dDataDate,
    },
    {
      label: rowLabels[1],
      hi: stats.MaxYear_mfr_fNav,
      hiDate: stats.MaxYear_mfr_dDataDate,
      lo: stats.MinYear_mfr_fNav,
      loDate: stats.MinYear_mfr_dDataDate,
    },
    {
      label: rowLabels[2],
      hi: stats.MaxSince_mfr_fNav,
      hiDate: stats.MaxSince_mfr_dDataDate,
      lo: stats.MinSince_mfr_fNav,
      loDate: stats.MinSince_mfr_dDataDate,
    },
  ];

  [highTbody, lowTbody].forEach((tbody) => {
    // eslint-disable-next-line no-param-reassign
    tbody.innerHTML = '';
  });

  const allHiNA = rows.every(({ hi }) => fmtNav(hi) === 'N/A');
  const allLoNA = rows.every(({ lo }) => fmtNav(lo) === 'N/A');

  if (allHiNA) {
    const tr = highTbody.ownerDocument.createElement('tr');
    tr.innerHTML = `<td colspan="2" class="stat-no-data">${noDataLabel}</td>`;
    highTbody.appendChild(tr);
  }
  if (allLoNA) {
    const tr = lowTbody.ownerDocument.createElement('tr');
    tr.innerHTML = `<td colspan="2" class="stat-no-data">${noDataLabel}</td>`;
    lowTbody.appendChild(tr);
  }

  rows.forEach(({
    label, hi, hiDate, lo, loDate,
  }) => {
    const targets = [
      [highTbody, hi, hiDate, allHiNA],
      [lowTbody, lo, loDate, allLoNA],
    ];
    targets.forEach(([tbody, val, date, skip]) => {
      if (skip) return;
      const tr = tbody.ownerDocument.createElement('tr');
      const navStr = fmtNav(val);
      const isNoData = navStr === 'N/A';
      let dateStr = '';
      if (isNoData) dateStr = ' "-"';
      else if (date) dateStr = ` "${fmtHistDate(date)}"`;
      const navDisplay = isNoData ? noDataLabel : navStr;
      tr.innerHTML = `<td>${label}${dateStr}</td><td class="stat-nav-val">${navDisplay}</td>`;
      tbody.appendChild(tr);
    });
  });
}

function renderChart(svgEl, history, period, noDataLabel) {
  svgEl.innerHTML = '';
  const doc = svgEl.ownerDocument;
  const ns = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const e = doc.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  const hasHistory = history && history.length > 0;
  const hasData = hasHistory && history.some((d) => Number(d.mfr_fNav) !== 0);
  const points = hasHistory ? history : [{ mfr_fNav: 0, mfr_dDataDate: '' }];

  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;
  const useRotation = hasData && period !== '1W' && points.length > 1;
  const padB = useRotation ? 70 : 40;
  const H = useRotation ? 360 : 300;
  const padL = 58;
  const padR = useRotation ? 20 : 8;
  const padT = 20;
  const chartWrap = svgEl.parentElement;
  const wrapStyle = chartWrap ? getComputedStyle(chartWrap) : null;
  const wrapPadH = wrapStyle
    ? parseFloat(wrapStyle.paddingLeft) + parseFloat(wrapStyle.paddingRight)
    : 0;
  const W = isMobileView ? Math.max((chartWrap?.clientWidth || 400) - wrapPadH, 280) : 940;
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.style.minWidth = '';
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const navs = points.map((d) => d.mfr_fNav);
  const rawMin = Math.min(...navs);
  const rawMax = Math.max(...navs);
  const tickStep = 0.5;
  const yMax = hasData ? Math.ceil(rawMax) : 0.5;
  const yMin = hasData ? Math.floor(rawMin / tickStep) * tickStep - tickStep : 0;

  const xPos = (i) => (points.length > 1
    ? padL + (i / (points.length - 1)) * innerW
    : padL + innerW / 2);
  const yPos = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const ticks = [];
  for (let v = yMin; v <= yMax + 0.0001; v = Math.round((v + tickStep) * 10) / 10) ticks.push(v);
  ticks.forEach((v) => {
    const y = yPos(v);
    el('line', {
      x1: padL,
      y1: y,
      x2: W - padR,
      y2: y,
      stroke: '#E8E8E8',
      'stroke-width': 1,
    }, svgEl);
    el('text', {
      x: padL - 8,
      y: y + 4,
      'text-anchor': 'end',
      'font-size': 11,
      fill: '#78787D',
      'font-family': 'BangkokBank-Regular,Arial,sans-serif',
    }, svgEl).textContent = v.toFixed(1);
  });

  const lastIdx = points.length - 1;
  let labelSet;
  if (!useRotation) {
    // 1W: show every data point
    labelSet = new Set(points.map((_, i) => i));
  } else {
    const labelSpacing = isMobileView ? 38 : 50;
    const maxXLabels = Math.min(points.length, Math.floor(innerW / labelSpacing));
    const xLabelStep = Math.max(1, Math.ceil(points.length / maxXLabels));
    const prevRegularIdx = Math.floor(lastIdx / xLabelStep) * xLabelStep;
    const pixelGap = lastIdx > 0 ? (xPos(lastIdx) - xPos(prevRegularIdx)) : Infinity;
    const tooClose = prevRegularIdx !== lastIdx && pixelGap < labelSpacing;
    labelSet = new Set();
    for (let i = 0; i <= lastIdx; i += xLabelStep) {
      if (!tooClose || i !== prevRegularIdx) labelSet.add(i);
    }
    labelSet.add(lastIdx);
  }

  points.forEach((d, i) => {
    const x = xPos(i);
    const isLabelPoint = labelSet.has(i);
    if (isLabelPoint) {
      el('line', {
        x1: x,
        y1: padT,
        x2: x,
        y2: H - padB,
        stroke: '#E8E8E8',
        'stroke-width': 1,
      }, svgEl);
      // eslint-disable-next-line no-nested-ternary
      const anchor = !hasData ? 'middle' : (useRotation ? 'end' : (i === lastIdx ? 'end' : (i === 0 ? 'start' : 'middle')));
      const clampedX = (hasData && !useRotation && i === lastIdx) ? Math.min(x, W - 4) : x;
      const txtAttrs = {
        x: clampedX,
        y: H - padB + (useRotation ? 14 : 20),
        'text-anchor': anchor,
        'font-size': 11,
        fill: '#002850',
        'font-weight': 'bold',
        'font-family': 'BangkokBank-Bold,Arial,sans-serif',
      };
      if (useRotation) txtAttrs.transform = `rotate(-45, ${clampedX}, ${H - padB + 14})`;
      const txt = el('text', txtAttrs, svgEl);
      txt.textContent = hasData ? fmtHistDate(d.mfr_dDataDate) : (noDataLabel || 'No data found');
    }
  });

  const pts = points.map((d, i) => `${xPos(i)},${yPos(d.mfr_fNav)}`).join(' ');

  points.forEach((d, i) => {
    const cx = xPos(i);
    const cy = yPos(d.mfr_fNav);
    el('circle', {
      cx,
      cy,
      r: 1.8,
      fill: '#002850',
      stroke: '#002850',
      'stroke-width': 1,
    }, svgEl);
  });

  el('polyline', {
    points: pts,
    fill: 'none',
    stroke: '#002850',
    'stroke-width': 2,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  }, svgEl);

  const tooltipG = el('g', { style: 'display:none; pointer-events:none' }, svgEl);
  el('rect', {
    width: 120,
    height: 54,
    rx: 6,
    fill: '#1a2e4a',
  }, tooltipG);
  const tooltipDate = el('text', {
    x: 10,
    y: 20,
    fill: '#b0c4d8',
    'font-size': 11,
    'font-family': 'BangkokBank-Regular,Arial,sans-serif',
  }, tooltipG);
  const tooltipVal = el('text', {
    x: 10,
    y: 42,
    fill: '#ffffff',
    'font-size': 15,
    'font-family': 'BangkokBank-Medium,Arial,sans-serif',
  }, tooltipG);

  if (hasData) {
    points.forEach((d, i) => {
      const cx = xPos(i);
      const cy = yPos(d.mfr_fNav);
      const hit = el('circle', {
        cx,
        cy,
        r: 14,
        fill: 'transparent',
        style: 'cursor:pointer',
      }, svgEl);
      hit.addEventListener('mouseenter', () => {
        tooltipG.style.display = '';
        let tx = cx + 12;
        let ty = cy - 62;
        if (tx + 124 > W) tx = cx - 132;
        if (ty < 0) ty = cy + 10;
        tooltipG.setAttribute('transform', `translate(${tx},${ty})`);
        tooltipDate.textContent = fmtHistDate(d.mfr_dDataDate);
        tooltipVal.textContent = fmtNav(d.mfr_fNav);
      });
      hit.addEventListener('mouseleave', () => { tooltipG.style.display = 'none'; });
    });
  } else {
    const label = noDataLabel || 'No data found';
    const textW = Math.max(60, label.length * 6.5 + 20);
    const boxH = 30;
    const noDataTooltipG = el('g', { style: 'display:none; pointer-events:none' }, svgEl);
    el('rect', {
      x: -textW / 2,
      y: -boxH - 8,
      width: textW,
      height: boxH,
      rx: 6,
      fill: '#1a2e4a',
    }, noDataTooltipG);
    el('path', {
      d: `M -5,${-8} L 5,${-8} L 0,${-2} Z`,
      fill: '#1a2e4a',
    }, noDataTooltipG);
    el('text', {
      x: 0,
      y: -boxH / 2 - 8 + 4,
      'text-anchor': 'middle',
      fill: '#ffffff',
      'font-size': 12,
      'font-family': 'BangkokBank-Medium,Arial,sans-serif',
    }, noDataTooltipG).textContent = label;

    points.forEach((d, i) => {
      const cx = xPos(i);
      const cy = yPos(d.mfr_fNav);
      const hit = el('circle', {
        cx,
        cy,
        r: 14,
        fill: 'transparent',
        style: 'cursor:pointer',
      }, svgEl);
      hit.addEventListener('mouseenter', () => {
        noDataTooltipG.style.display = '';
        noDataTooltipG.setAttribute('transform', `translate(${cx},${cy})`);
      });
      hit.addEventListener('mouseleave', () => { noDataTooltipG.style.display = 'none'; });
    });
  }
}

function renderHistTable(tbody, history, noDataLabel) {
  tbody.innerHTML = '';
  history.forEach((d) => {
    const tr = tbody.ownerDocument.createElement('tr');
    const isNoData = fmtNav(d.mfr_fNav) === 'N/A';
    const dateDisplay = isNoData ? '' : fmtHistDate(d.mfr_dDataDate);
    const navDisplay = isNoData ? noDataLabel : fmtNav(d.mfr_fNav);
    const selDisplay = isNoData ? noDataLabel : fmtNav(d.mfr_fSel);
    const buyDisplay = isNoData ? noDataLabel : fmtNav(d.mfr_fBuy);
    tr.innerHTML = `<td>${dateDisplay}</td>`
      + `<td>${navDisplay}</td>`
      + `<td>${selDisplay}</td>`
      + `<td>${buyDisplay}</td>`;
    tbody.appendChild(tr);
  });
}

export default async function decorate(block) {
  const ph = await fetchPlaceholders();
  function txt(phKey) {
    return ph[phKey];
  }
  const labels = {
    title: txt('fundPricesDropdownTitle'),
    printLabel: txt('fundPricesDropdownPrint'),
    backLabel: txt('fundPricesDropdownBack'),
    statHighHeader: txt('fundPricesDropdownStatHigh'),
    statLowHeader: txt('fundPricesDropdownStatLow'),
    navColHeader: txt('fundPricesDropdownNav'),
    graphTab: txt('fundPricesDropdownGraph'),
    tableTab: txt('fundPricesDropdownTable'),
    beginNavLabel: txt('fundPricesDropdownBeginNav'),
    endNavLabel: txt('fundPricesDropdownEndNav'),
    histDateHeader: txt('fundPricesDropdownHistDate'),
    histSellHeader: txt('fundPricesDropdownHistSell'),
    histRedeemHeader: txt('fundPricesDropdownHistRedeem'),
    statRowSelected: txt('fundPricesDropdownStatSelected'),
    statRowYear: txt('fundPricesDropdownStatYear'),
    statRowInception: txt('fundPricesDropdownStatInception'),
    noDataFound: txt('fundPricesDropdownNoData'),
    fromLabel: txt('fundPricesDropdownFrom'),
    toLabel: txt('fundPricesDropdownTo'),
    rangeError: txt('fundPricesDropdownRangeError'),
    toBeforeFromError: txt('fundPricesDropdownToBeforeFromError'),
    period1w: txt('fundPricesDropdownPeriod1w'),
    period1m: txt('fundPricesDropdownPeriod1m'),
    period3m: txt('fundPricesDropdownPeriod3m'),
    period6m: txt('fundPricesDropdownPeriod6m'),
    period1y: txt('fundPricesDropdownPeriod1y'),
    period3y: txt('fundPricesDropdownPeriod3y'),
    periodDr: txt('fundPricesDropdownPeriodDr'),
  };
  const PERIOD_OPTIONS = [
    { code: '1W', label: labels.period1w },
    { code: '1M', label: labels.period1m },
    { code: '3M', label: labels.period3m },
    { code: '6M', label: labels.period6m },
    { code: '1Y', label: labels.period1y },
    { code: '3Y', label: labels.period3y },
    { code: 'DR', label: labels.periodDr },
  ];

  block.innerHTML = `
    <div class="fdd-print-masthead" aria-hidden="true">
      <div class="fdd-print-datetime"></div>
      <div class="fdd-print-page-title">Fund Prices - BBL Asset Management</div>
      <div></div>
      <div class="fdd-print-logo"></div>
      <div></div>
      <div class="fdd-print-search">${labels.backLabel === 'Fund Prices' ? 'Search Fund' : labels.backLabel}</div>
    </div>
    <div class="fdd-header">
      <div class="fdd-header-top">
        <button class="fdd-back-btn" aria-label="Back to ${labels.backLabel}">&#8249; ${labels.backLabel}</button>
      </div>
      <div class="fdd-title">${labels.title}</div>
      <hr class="fdd-title-rule" />
    </div>

    <div class="fdd-period-bar">
      <div class="period-select-wrapper">
        <button class="period-select-btn">
          <span class="period-select-label">${labels.period1w}</span>
          <span class="icon-dropdown"></span>
        </button>
        <ul class="period-dropdown-list">
          ${PERIOD_OPTIONS.map((p) => `<li data-period="${p.code}">${p.label}</li>`).join('')}
        </ul>
      </div>
      <div class="period-date-range hidden">
        <label>${labels.fromLabel}</label>
        <div class="calendar-input icon-calendar"><input type="text" id="fdd-dr-from" /></div>
        <label>${labels.toLabel}</label>
        <div class="calendar-input icon-calendar"><input type="text" id="fdd-dr-to" /></div>
      </div>
      <div class="fdd-range-error hidden" role="alert"></div>
    </div>

    <div class="fdd-print-date-range" aria-hidden="true">
      <div>
        <span>${labels.fromLabel}</span>
        <strong class="fdd-print-from"></strong>
      </div>
      <div>
        <span>${labels.toLabel}</span>
        <strong class="fdd-print-to"></strong>
      </div>
    </div>

    <div class="stat-tables-print-row">
      <div class="fdd-fund-label"></div>
      <div class="fund-prices-print-label icon-print"><p>${labels.printLabel}</p></div>
    </div>
    <div class="stat-tables-row">
      <div class="stat-table-card">
        <table class="stat-table" id="fdd-stat-high">
          <thead><tr><th>${labels.statHighHeader}</th><th class="stat-th-nav">${labels.navColHeader}</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="stat-table-card">
        <table class="stat-table" id="fdd-stat-low">
          <thead><tr><th>${labels.statLowHeader}</th><th class="stat-th-nav">${labels.navColHeader}</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="tab-switcher">
      <button class="tab-btn active" data-tab="graph">${labels.graphTab}</button>
      <button class="tab-btn" data-tab="table">${labels.tableTab}</button>
    </div>

    <div class="fdd-chart-panel">
      <div class="chart-wrap">
        <div class="chart-header">
          <span class="chart-subtitle"></span>
          <div class="chart-nav-labels">
            <span class="chart-nav-item">${labels.beginNavLabel} <span class="chart-begin-nav"></span></span>
            <span class="chart-nav-item">${labels.endNavLabel} <span class="chart-end-nav"></span></span>
          </div>
        </div>
        <svg class="detail-chart-svg" viewBox="0 0 940 300" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
    </div>

    <div class="fdd-table-panel hidden">
      <table class="detail-hist-table">
        <thead>
          <tr>
            <th>${labels.histDateHeader}</th>
            <th>${labels.navColHeader}</th>
            <th>${labels.histSellHeader}</th>
            <th>${labels.histRedeemHeader}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  block.classList.add('hidden');
  block.hidden = true;

  const backBtn = block.querySelector('.fdd-back-btn');
  const fundLabel = block.querySelector('.fdd-fund-label');
  const printBtn = block.querySelector('.fund-prices-print-label');
  const periodSelectBtn = block.querySelector('.period-select-btn');
  const periodSelectLabel = block.querySelector('.period-select-label');
  const periodDropList = block.querySelector('.period-dropdown-list');
  const periodDateRangeEl = block.querySelector('.period-date-range');
  const rangeError = block.querySelector('.fdd-range-error');
  const highTbody = block.querySelector('#fdd-stat-high tbody');
  const lowTbody = block.querySelector('#fdd-stat-low tbody');
  const chartSvg = block.querySelector('.detail-chart-svg');
  const chartSubtitle = block.querySelector('.chart-subtitle');
  const chartBeginNav = block.querySelector('.chart-begin-nav');
  const chartEndNav = block.querySelector('.chart-end-nav');
  const printDateTime = block.querySelector('.fdd-print-datetime');
  const printFrom = block.querySelector('.fdd-print-from');
  const printTo = block.querySelector('.fdd-print-to');
  const chartPanel = block.querySelector('.fdd-chart-panel');
  const tablePanel = block.querySelector('.fdd-table-panel');
  const histTbody = block.querySelector('.detail-hist-table tbody');
  const drFromInput = block.querySelector('#fdd-dr-from');
  const drToInput = block.querySelector('#fdd-dr-to');

  let currentFund = null;
  let currentPeriod = '1W';
  let latestMdate = null;
  let drFrom = new Date();
  let drTo = new Date();
  let currentFromDate = null;
  let currentToDate = null;

  function periodDateRange(periodCode) {
    const end = latestMdate ? (parseLocalDateFromYmd(latestMdate) ?? new Date()) : new Date();
    const y = end.getFullYear();
    const mo = end.getMonth();
    const d = end.getDate();
    const from = {
      '1W': new Date(y, mo, d - 7),
      '1M': new Date(y, mo - 1, d),
      '3M': new Date(y, mo - 3, d),
      '6M': new Date(y, mo - 6, d),
      '1Y': new Date(y - 1, mo, d),
      '3Y': new Date(y - 3, mo, d),
    }[periodCode] ?? end;
    return { from, to: end };
  }

  function buildSubtitle(fromDate, toDate) {
    return `"${currentFund?.name}" Open-end Fund : ${formatDMY(fromDate)} - ${formatDMY(toDate)}`;
  }

  async function renderDetail(fromDate, toDate) {
    const subtitle = buildSubtitle(fromDate, toDate);
    currentFromDate = fromDate;
    currentToDate = toDate;
    fundLabel.textContent = subtitle;
    printFrom.textContent = formatCalendarDate(fromDate, getCalendarLang());
    printTo.textContent = formatCalendarDate(toDate, getCalendarLang());
    const now = new Date();
    printDateTime.textContent = `${formatPrintDate(now)}, ${formatPrintTime(now)}`;

    const [statsResult, historyResult] = await Promise.allSettled([
      fetchFundDetailStats(currentFund.id, fromDate, toDate),
      fetchFundDetailHistory(currentFund.id, fromDate, toDate),
    ]);

    const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
    const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
    const sorted = [...history].sort((a, b) => a.mfr_dDataDate.localeCompare(b.mfr_dDataDate));
    const statLabels = [labels.statRowSelected, labels.statRowYear, labels.statRowInception];
    renderStatTables(stats, highTbody, lowTbody, statLabels, labels.noDataFound);
    chartSubtitle.textContent = subtitle;
    chartBeginNav.textContent = fmtNav(stats.Begin_mfr_fNav);
    chartEndNav.textContent = fmtNav(stats.End_mfr_fNav);
    renderChart(chartSvg, sorted, currentPeriod, labels.noDataFound);
    renderHistTable(histTbody, sorted, labels.noDataFound);

    if (chartSvg.chartResizeObserver) chartSvg.chartResizeObserver.disconnect();
    if (window.innerWidth < 768) {
      chartSvg.chartResizeObserver = new ResizeObserver(() => {
        if (sorted?.length) renderChart(chartSvg, sorted, currentPeriod, labels.noDataFound);
      });
      chartSvg.chartResizeObserver.observe(chartSvg.parentElement);
    }
  }

  function validateAndRenderDetail() {
    if (currentPeriod === 'DR') {
      if (drFrom && drTo && isToBeforeFrom(drFrom, drTo)) {
        rangeError.textContent = labels.toBeforeFromError;
        rangeError.classList.remove('hidden');
        return;
      }
      if (drFrom && drTo && isRangeExceedsLimit(drFrom, drTo)) {
        rangeError.textContent = labels.rangeError;
        rangeError.classList.remove('hidden');
        return;
      }
      rangeError.classList.add('hidden');
      if (drFrom && drTo) renderDetail(drFrom, drTo);
    } else {
      rangeError.classList.add('hidden');
      const { from, to } = periodDateRange(currentPeriod);
      renderDetail(from, to);
    }
  }

  /* Calendar pickers for date range */
  attachCalendarPicker({
    input: drFromInput,
    value: drFrom,
    isDateDisabled: isWeekendOrAfterYesterday,
    onChange: (d) => { drFrom = d; validateAndRenderDetail(); },
  });
  attachCalendarPicker({
    input: drToInput,
    value: drTo,
    isDateDisabled: isWeekendOrAfterYesterday,
    onChange: (d) => { drTo = d; validateAndRenderDetail(); },
  });

  /* Period dropdown */
  periodSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    periodDropList.classList.toggle('open');
  });
  block.ownerDocument.addEventListener('click', () => periodDropList.classList.remove('open'));

  periodDropList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const { period } = li.dataset;
    periodDropList.querySelectorAll('li').forEach((l) => l.classList.toggle('active', l === li));
    const opt = PERIOD_OPTIONS.find((p) => p.code === period);
    periodSelectLabel.textContent = opt?.label ?? period;
    periodDropList.classList.remove('open');
    currentPeriod = period;
    periodSelectBtn.classList.toggle('active', period === 'DR');
    if (period === 'DR') {
      const end = latestMdate ? (parseLocalDateFromYmd(latestMdate) ?? new Date()) : new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      drFrom = start;
      drTo = end;
      const lang = getCalendarLang();
      drFromInput.value = formatCalendarDate(start, lang);
      drToInput.value = formatCalendarDate(end, lang);
      periodDateRangeEl.classList.remove('hidden');
      validateAndRenderDetail();
    } else {
      periodDateRangeEl.classList.add('hidden');
      validateAndRenderDetail();
    }
  });

  /* Tab switcher */
  const tabSwitcher = block.querySelector('.tab-switcher');
  block.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const isMobile = window.innerWidth < 768;
      if (isMobile && !tabSwitcher.classList.contains('open')) {
        tabSwitcher.classList.add('open');
        return;
      }
      tabSwitcher.classList.remove('open');
      block.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.tab === 'graph') {
        chartPanel.classList.remove('hidden');
        tablePanel.classList.add('hidden');
      } else {
        tablePanel.classList.remove('hidden');
        chartPanel.classList.add('hidden');
      }
    });
  });

  document.addEventListener('click', (e) => {
    if (!tabSwitcher.contains(e.target)) tabSwitcher.classList.remove('open');
  });

  /* Print */
  printBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    const { body, defaultView } = block.ownerDocument;
    const printRoot = block.cloneNode(true);
    const logoEl = block.ownerDocument.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
      || block.ownerDocument.querySelector('.brand-logo-container picture, .brand-logo-container img');
    const printLogoEl = printRoot.querySelector('.fdd-print-logo');
    if (logoEl && printLogoEl) printLogoEl.appendChild(logoEl.cloneNode(true));
    const disclaimer = block.closest('.section')?.querySelector('.fund-prices-disclaimer-text')?.cloneNode(true);
    const printFooter = block.ownerDocument.createElement('div');
    printRoot.id = 'fdd-print-root';
    printRoot.classList.remove('hidden');
    printRoot.classList.toggle('fdd-print-custom-range', currentPeriod === 'DR');
    printRoot.hidden = false;
    printRoot.querySelectorAll('.fund-prices-print-label, .fdd-back-btn').forEach((el) => el.remove());
    if (currentFromDate && currentToDate) {
      const printSubtitle = buildSubtitle(currentFromDate, currentToDate);
      printRoot.querySelectorAll('.fdd-fund-label, .chart-subtitle')
        .forEach((el) => { el.textContent = printSubtitle; });
    }
    if (disclaimer) printRoot.appendChild(disclaimer);
    printFooter.className = 'fdd-print-footer';
    printFooter.innerHTML = '<span>https://www.bangkokbank.com/en/Personal/Save-And-Invest/Mutual-Funds/Fund-Prices</span><span>1/2</span>';
    printRoot.appendChild(printFooter);

    const cleanupPrint = () => {
      body.classList.remove('fdd-printing');
      printRoot.remove();
      defaultView?.removeEventListener('afterprint', cleanupPrint);
    };

    body.classList.add('fdd-printing');
    body.appendChild(printRoot);
    defaultView?.addEventListener('afterprint', cleanupPrint, { once: true });
    window.print();
    setTimeout(cleanupPrint, 1000);
  });

  /* Back button */
  backBtn?.addEventListener('click', () => {
    block.dispatchEvent(new CustomEvent('fund-prices-dropdown:back', { bubbles: true }));
  });

  /* Show / hide events dispatched by fund-prices.js */
  block.addEventListener('fund-prices-dropdown:show', (e) => {
    const { fund, mdate } = e.detail;
    currentFund = fund;
    latestMdate = mdate;
    currentPeriod = '1W';
    periodSelectLabel.textContent = labels.period1w;
    periodSelectBtn.classList.remove('active');
    periodDropList.querySelectorAll('li')
      .forEach((l) => l.classList.toggle('active', l.dataset.period === '1W'));
    periodDateRangeEl.classList.add('hidden');
    rangeError.classList.add('hidden');
    block.querySelector('.tab-btn[data-tab="graph"]').classList.add('active');
    block.querySelector('.tab-btn[data-tab="table"]').classList.remove('active');
    chartPanel.classList.remove('hidden');
    tablePanel.classList.add('hidden');

    block.classList.remove('hidden');
    block.hidden = false;
    block.ownerDocument.body.classList.add('fund-prices-detail-active');
    validateAndRenderDetail();
  });

  block.addEventListener('fund-prices-dropdown:hide', () => {
    block.classList.add('hidden');
    block.hidden = true;
    block.ownerDocument.body.classList.remove('fund-prices-detail-active');
  });
}

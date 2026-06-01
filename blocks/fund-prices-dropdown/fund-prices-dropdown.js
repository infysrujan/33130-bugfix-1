import { attachCalendarPicker, formatCalendarDate, getCalendarLang } from '../../scripts/utils/calendar-picker.js';
import { parseLocalDateFromYmd, getApiUrls } from '../fund-prices-table/fund-prices-table.js';

export const MAX_FUND_PRICE_HISTORY_YEARS = 3;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatDMY(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
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

async function fetchFundDetailStats(fundId, fromDate, toDate) {
  const { apiBase } = await getApiUrls();
  const res = await fetch(`${apiBase}/Fund_Nav/${fundId}/${formatDatePath(fromDate)}/${formatDatePath(toDate)}/N`);
  if (!res.ok) throw new Error(`FundDetailStats ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function fetchFundDetailHistory(fundId, fromDate, toDate) {
  const { apiBase } = await getApiUrls();
  const res = await fetch(`${apiBase}/FundPrice/${fundId}/${formatDatePath(fromDate)}/${formatDatePath(toDate)}/N`);
  if (!res.ok) throw new Error(`FundDetailHistory ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function fmtNav(v) {
  return typeof v === 'number' ? v.toFixed(4) : (v ?? 'N/A');
}

function fmtHistDate(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function renderStatTables(stats, highTbody, lowTbody, rowLabels) {
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

  rows.forEach(({
    label, hi, hiDate, lo, loDate,
  }) => {
    [[highTbody, hi, hiDate], [lowTbody, lo, loDate]].forEach(([tbody, val, date]) => {
      const tr = tbody.ownerDocument.createElement('tr');
      const dateStr = date ? ` "${fmtHistDate(date)}"` : '';
      tr.innerHTML = `<td>${label}${dateStr}</td><td class="stat-nav-val">${fmtNav(val)}</td>`;
      tbody.appendChild(tr);
    });
  });
}

function renderChart(svgEl, history, period) {
  svgEl.innerHTML = '';
  const doc = svgEl.ownerDocument;
  const ns = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    const e = doc.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  if (!history || history.length < 2) {
    el('text', {
      x: '50%',
      y: '50%',
      'text-anchor': 'middle',
      'font-size': 14,
      fill: '#999',
    }, svgEl).textContent = 'No data';
    return;
  }

  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;
  const useRotation = period !== '1W';
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

  const navs = history.map((d) => d.mfr_fNav);
  const rawMin = Math.min(...navs);
  const rawMax = Math.max(...navs);
  const tickStep = 0.5;
  const yMax = Math.ceil(rawMax);
  const yMin = Math.floor(rawMin / tickStep) * tickStep - tickStep;

  const xPos = (i) => padL + (i / (history.length - 1)) * innerW;
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

  const lastIdx = history.length - 1;
  let labelSet;
  if (!useRotation) {
    // 1W: always show first, middle, last
    const midIdx = Math.round(lastIdx / 2);
    labelSet = new Set([0, midIdx, lastIdx]);
  } else {
    const labelSpacing = isMobileView ? 38 : 50;
    const maxXLabels = Math.min(history.length, Math.floor(innerW / labelSpacing));
    const xLabelStep = Math.max(1, Math.ceil(history.length / maxXLabels));
    const prevRegularIdx = Math.floor(lastIdx / xLabelStep) * xLabelStep;
    const pixelGap = lastIdx > 0 ? (xPos(lastIdx) - xPos(prevRegularIdx)) : Infinity;
    const tooClose = prevRegularIdx !== lastIdx && pixelGap < labelSpacing;
    labelSet = new Set();
    for (let i = 0; i <= lastIdx; i += xLabelStep) {
      if (!tooClose || i !== prevRegularIdx) labelSet.add(i);
    }
    labelSet.add(lastIdx);
  }

  history.forEach((d, i) => {
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
      const anchor = useRotation ? 'end' : (i === lastIdx ? 'end' : (i === 0 ? 'start' : 'middle'));
      const clampedX = (!useRotation && i === lastIdx) ? Math.min(x, W - 4) : x;
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
      txt.textContent = fmtHistDate(d.mfr_dDataDate);
    }
  });

  const pts = history.map((d, i) => `${xPos(i)},${yPos(d.mfr_fNav)}`).join(' ');

  history.forEach((d, i) => {
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

  history.forEach((d, i) => {
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
}

function renderHistTable(tbody, history) {
  tbody.innerHTML = '';
  history.forEach((d) => {
    const tr = tbody.ownerDocument.createElement('tr');
    tr.innerHTML = `<td>${fmtHistDate(d.mfr_dDataDate)}</td>`
      + `<td>${fmtNav(d.mfr_fNav)}</td>`
      + `<td>${fmtNav(d.mfr_fBuy)}</td>`
      + `<td>${fmtNav(d.mfr_fSel)}</td>`;
    tbody.appendChild(tr);
  });
}

export default async function decorate(block) {
  const authoredRows = [...block.children];
  function txt(i, fallback) {
    return authoredRows[i]?.querySelector('p')?.textContent?.trim() || fallback;
  }
  const labels = {
    title: txt(0, 'Fund Price Details'),
    printLabel: txt(1, 'Print'),
    backLabel: txt(2, 'Fund Prices'),
    statHighHeader: txt(3, 'Highest Fund Price'),
    statLowHeader: txt(4, 'Lowest Fund Price'),
    navColHeader: txt(5, 'NAV'),
    graphTab: txt(6, 'GRAPH'),
    tableTab: txt(7, 'VIEW TABLE DATA'),
    beginNavLabel: txt(8, 'Beginning NAV'),
    endNavLabel: txt(9, 'Ending NAV'),
    histDateHeader: txt(10, 'Date'),
    histSellHeader: txt(11, 'Selling Price'),
    histRedeemHeader: txt(12, 'Redemption Price'),
    statRowSelected: txt(13, 'In the selected period'),
    statRowYear: txt(14, 'During the last 12 months'),
    statRowInception: txt(15, 'Since Inception'),
    fromLabel: txt(16, 'From'),
    toLabel: txt(17, 'To'),
    rangeError: txt(18, 'Date range should be between 3 years'),
    period1w: txt(19, '1 Week'),
    period1m: txt(20, '1 Month'),
    period3m: txt(21, '3 Months'),
    period6m: txt(22, '6 Months'),
    period1y: txt(23, '1 Year'),
    period3y: txt(24, '3 Years'),
    periodDr: txt(25, 'Date Range'),
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
    const period = PERIOD_OPTIONS.find((p) => p.code === currentPeriod)?.label ?? currentPeriod;
    return `"${currentFund?.name}" Open-end Fund : ${period} : ${formatDMY(fromDate)} - ${formatDMY(toDate)}`;
  }

  async function renderDetail(fromDate, toDate) {
    const subtitle = buildSubtitle(fromDate, toDate);
    fundLabel.textContent = subtitle;

    const [statsResult, historyResult] = await Promise.allSettled([
      fetchFundDetailStats(currentFund.id, fromDate, toDate),
      fetchFundDetailHistory(currentFund.id, fromDate, toDate),
    ]);

    const stats = statsResult.status === 'fulfilled' ? statsResult.value : {};
    const history = historyResult.status === 'fulfilled' ? historyResult.value : [];
    const sorted = [...history].sort((a, b) => a.mfr_dDataDate.localeCompare(b.mfr_dDataDate));
    const statLabels = [labels.statRowSelected, labels.statRowYear, labels.statRowInception];
    renderStatTables(stats, highTbody, lowTbody, statLabels);
    chartSubtitle.textContent = subtitle;
    chartBeginNav.textContent = fmtNav(stats.Begin_mfr_fNav);
    chartEndNav.textContent = fmtNav(stats.End_mfr_fNav);
    renderChart(chartSvg, sorted, currentPeriod);
    renderHistTable(histTbody, [...sorted].reverse());

    if (chartSvg.chartResizeObserver) chartSvg.chartResizeObserver.disconnect();
    if (window.innerWidth < 768) {
      chartSvg.chartResizeObserver = new ResizeObserver(() => {
        if (sorted?.length) renderChart(chartSvg, sorted, currentPeriod);
      });
      chartSvg.chartResizeObserver.observe(chartSvg.parentElement);
    }
  }

  function validateAndRenderDetail() {
    if (currentPeriod === 'DR') {
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
    allDaysEnabled: true,
    onChange: (d) => { drFrom = d; validateAndRenderDetail(); },
  });
  attachCalendarPicker({
    input: drToInput,
    value: drTo,
    allDaysEnabled: true,
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
      const start = new Date(end.getFullYear(), end.getMonth() - 1, end.getDate());
      drFrom = start;
      drTo = end;
      const lang = getCalendarLang();
      drFromInput.value = formatCalendarDate(start, lang);
      drToInput.value = formatCalendarDate(end, lang);
      periodDateRangeEl.classList.remove('hidden');
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
    const clone = block.cloneNode(true);
    clone.querySelectorAll('.fund-prices-print-label, .fdd-back-btn').forEach((el) => el.remove());
    const orig = block.ownerDocument.body.innerHTML;
    block.ownerDocument.body.innerHTML = clone.outerHTML;
    window.print();
    block.ownerDocument.body.innerHTML = orig;
    window.location.reload();
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
    validateAndRenderDetail();
  });

  block.addEventListener('fund-prices-dropdown:hide', () => {
    block.classList.add('hidden');
    block.hidden = true;
  });
}

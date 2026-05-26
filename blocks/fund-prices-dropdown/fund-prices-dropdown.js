import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';
import { parseLocalDateFromYmd } from '../fund-prices-table/fund-prices-table.js';

const BBL_API_BASE = 'https://www.bangkokbank.com/api/fundpriceservice';
const FUND_DETAIL_HISTORY_BASE = `${BBL_API_BASE}/FundPrice`;
const FUND_DETAIL_STATS_BASE = `${BBL_API_BASE}/FundMinMax`;

export const MAX_FUND_PRICE_HISTORY_YEARS = 3;

const PERIOD_OPTIONS = [
  { code: '1W', label: '1 Week' },
  { code: '1M', label: '1 Month' },
  { code: '3M', label: '3 Months' },
  { code: '6M', label: '6 Months' },
  { code: '1Y', label: '1 Year' },
  { code: '3Y', label: '3 Years' },
  { code: 'DR', label: 'Date Range' },
];

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
  const res = await fetch(`${FUND_DETAIL_STATS_BASE}/${fundId}/${formatDatePath(fromDate)}/${formatDatePath(toDate)}/N`);
  if (!res.ok) throw new Error(`FundDetailStats ${res.status}`);
  return res.json();
}

async function fetchFundDetailHistory(fundId, fromDate, toDate) {
  const res = await fetch(`${FUND_DETAIL_HISTORY_BASE}/${fundId}/${formatDatePath(fromDate)}/${formatDatePath(toDate)}/N`);
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

function renderStatTables(stats, highTbody, lowTbody) {
  const rows = [
    { label: 'In the selected period', hi: stats.MaxSelected_mfr_fNav, lo: stats.MinSelected_mfr_fNav },
    { label: 'During the last 12 months', hi: stats.MaxYear_mfr_fNav, lo: stats.MinYear_mfr_fNav },
    { label: 'Since Inception', hi: stats.MaxSince_mfr_fNav, lo: stats.MinSince_mfr_fNav },
  ];

  [highTbody, lowTbody].forEach((tbody) => { tbody.innerHTML = ''; });

  rows.forEach(({ label, hi, lo }) => {
    [[highTbody, hi], [lowTbody, lo]].forEach(([tbody, val]) => {
      const tr = tbody.ownerDocument.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td class="stat-nav-val">${fmtNav(val)}</td>`;
      tbody.appendChild(tr);
    });
  });
}

function renderChart(svgEl, history) {
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

  const W = 940; const H = 300; const padL = 58; const padR = 20; const padT = 20; const padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const navs = history.map((d) => d.mfr_fNav);
  const rawMin = Math.min(...navs);
  const rawMax = Math.max(...navs);
  const tickStep = 0.5;
  const yMin = Math.floor(rawMin / tickStep) * tickStep - tickStep * 0.5;
  const yMax = Math.ceil(rawMax / tickStep) * tickStep + tickStep * 0.5;

  const xPos = (i) => padL + (i / (history.length - 1)) * innerW;
  const yPos = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const numYTicks = Math.round((yMax - yMin) / tickStep);
  for (let i = 0; i <= numYTicks; i += 1) {
    const v = yMin + i * tickStep;
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
  }

  history.forEach((d, i) => {
    const x = xPos(i);
    el('line', {
      x1: x,
      y1: padT,
      x2: x,
      y2: H - padB,
      stroke: '#E8E8E8',
      'stroke-width': 1,
    }, svgEl);
    el('text', {
      x,
      y: H - padB + 16,
      'text-anchor': 'middle',
      'font-size': 11,
      fill: '#78787D',
      'font-family': 'BangkokBank-Regular,Arial,sans-serif',
    }, svgEl).textContent = fmtHistDate(d.mfr_dDataDate);
  });

  const pts = history.map((d, i) => `${xPos(i)},${yPos(d.mfr_fNav)}`).join(' ');
  el('polyline', {
    points: pts,
    fill: 'none',
    stroke: '#002850',
    'stroke-width': 2.5,
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
    el('circle', {
      cx,
      cy,
      r: 4,
      fill: '#002850',
      stroke: '#fff',
      'stroke-width': 2,
    }, svgEl);
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
  block.innerHTML = `
    <div class="fdd-header">
      <div class="fdd-header-top">
        <button class="fdd-back-btn" aria-label="Back to Fund Prices">&#8249; Fund Prices</button>
        <div class="fund-prices-print-label icon-print"><p>Print</p></div>
      </div>
      <div class="fdd-title">Fund Price Details</div>
      <hr class="fdd-title-rule" />
      <div class="fdd-fund-label"></div>
    </div>

    <div class="fdd-period-bar">
      <div class="period-select-wrapper">
        <button class="period-select-btn">
          <span class="period-select-label">1 Week</span>
          <span class="icon-dropdown"></span>
        </button>
        <ul class="period-dropdown-list">
          ${PERIOD_OPTIONS.map((p) => `<li data-period="${p.code}">${p.label}</li>`).join('')}
        </ul>
      </div>
      <div class="period-date-range hidden">
        <label>FROM</label>
        <div class="calendar-input icon-calendar"><input type="text" id="fdd-dr-from" /></div>
        <label>TO</label>
        <div class="calendar-input icon-calendar"><input type="text" id="fdd-dr-to" /></div>
      </div>
      <div class="fdd-range-error hidden" role="alert"></div>
    </div>

    <div class="stat-tables-row">
      <div class="stat-table-card">
        <table class="stat-table" id="fdd-stat-high">
          <thead><tr><th>Highest Fund Price</th><th class="stat-th-nav">NAV</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="stat-table-card">
        <table class="stat-table" id="fdd-stat-low">
          <thead><tr><th>Lowest Fund Price</th><th class="stat-th-nav">NAV</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="tab-switcher">
      <button class="tab-btn active" data-tab="graph">GRAPH</button>
      <button class="tab-btn" data-tab="table">VIEW TABLE DATA</button>
    </div>

    <div class="fdd-chart-panel">
      <div class="chart-wrap">
        <div class="chart-header">
          <span class="chart-subtitle"></span>
          <div class="chart-nav-labels">
            <span class="chart-nav-item">Beginning NAV <span class="chart-begin-nav"></span></span>
            <span class="chart-nav-item">Ending NAV <span class="chart-end-nav"></span></span>
          </div>
        </div>
        <svg class="detail-chart-svg" viewBox="0 0 940 300" preserveAspectRatio="xMidYMid meet"></svg>
      </div>
    </div>

    <div class="fdd-table-panel hidden">
      <table class="detail-hist-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>NAV</th>
            <th>Selling Price</th>
            <th>Redemption Price</th>
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

    try {
      const [stats, history] = await Promise.all([
        fetchFundDetailStats(currentFund.id, fromDate, toDate),
        fetchFundDetailHistory(currentFund.id, fromDate, toDate),
      ]);
      const sorted = [...history].sort((a, b) => a.mfr_dDataDate.localeCompare(b.mfr_dDataDate));
      renderStatTables(stats, highTbody, lowTbody);
      chartSubtitle.textContent = subtitle;
      chartBeginNav.textContent = fmtNav(stats.Begin_mfr_fNav);
      chartEndNav.textContent = fmtNav(stats.End_mfr_fNav);
      renderChart(chartSvg, sorted);
      renderHistTable(histTbody, [...sorted].reverse());
    } catch {
      renderStatTables({}, highTbody, lowTbody);
      renderChart(chartSvg, []);
      renderHistTable(histTbody, []);
    }
  }

  function validateAndRenderDetail() {
    if (currentPeriod === 'DR') {
      if (drFrom && drTo && isRangeExceedsLimit(drFrom, drTo)) {
        rangeError.textContent = 'Date range should be between 3 years';
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
    if (period === 'DR') {
      periodDateRangeEl.classList.remove('hidden');
    } else {
      periodDateRangeEl.classList.add('hidden');
      validateAndRenderDetail();
    }
  });

  /* Tab switcher */
  block.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
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
    periodSelectLabel.textContent = '1 Week';
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

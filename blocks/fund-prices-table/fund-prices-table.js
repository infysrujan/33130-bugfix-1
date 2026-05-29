const IS_LOCAL = typeof window !== 'undefined' && window.location.hostname === 'localhost';
const BBL_API_BASE = IS_LOCAL
  ? 'https://publish-p185039-e1937892.adobeaemcloud.com/api/FundPriceService'
  : '/api/fundpriceservice';
const BBL_API_NAMES_BASE = IS_LOCAL
  ? 'https://publish-p185039-e1938068.adobeaemcloud.com/api/FundPriceService'
  : '/api/fundpriceservice';
export const ALL_FUND_NAMES_URL = `${BBL_API_NAMES_BASE}/AllFundsName`;
export const LATEST_DATE_URL = `${BBL_API_BASE}/LatestDate`;
export const GET_UPDATE_IN_MONTH_BASE = `${BBL_API_BASE}/GetUpdateInMonth`;
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

let latestMdate = null;

export function parseLocalDateFromYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const valid = d.getFullYear() === Number(m[1])
    && d.getMonth() === Number(m[2]) - 1
    && d.getDate() === Number(m[3]);
  return valid ? d : null;
}

function pad2(n) { return String(n).padStart(2, '0'); }

async function fetchAllFundPrices(date) {
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const res = await fetch(`${BBL_API_BASE}/AllFundPrices/${dd}/${mm}/${yyyy}`);
  if (!res.ok) throw new Error(`AllFundPrices ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchNavEnabledDaysForMonth({ year, month }) {
  const res = await fetch(`${GET_UPDATE_IN_MONTH_BASE}/${year}/${month + 1}/0`);
  if (!res.ok) throw new Error(`GetUpdateInMonth ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((i) => (i?.Day != null ? Number(i.Day) : NaN)).filter((d) => !Number.isNaN(d));
}

function getLang() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/th') || path.startsWith('/BangkokBankThai')) return 'th';
  return 'en';
}

const localizedHeaderMap = {
  fundtype: { en: 'mf_cateEng', th: 'mf_cateTha' },
  openendfund: { en: 'mf_sEng', th: 'mf_sTha' },
  nav: 'mfr_fNav',
  sellingprice: 'mfr_fBuy',
  redemptionprice: 'mfr_fSel',
  totalnetassets: 'mfr_sAUM',
};

function normalizeHeaderKey(header) {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveColumnKey(normalizedKey, lang) {
  const mapped = localizedHeaderMap[normalizedKey];
  if (!mapped) return normalizedKey;
  return typeof mapped === 'object' ? mapped[lang] : mapped;
}

function buildCategoryOrder(rows, categoryKey) {
  const order = [];
  const seen = new Set();
  rows.forEach((row) => {
    if (row[categoryKey] !== undefined && !seen.has(row[categoryKey])) {
      order.push(row[categoryKey]);
      seen.add(row[categoryKey]);
    }
  });
  return order;
}

function groupRowsByCategory(rows, categoryKey) {
  return rows.reduce((acc, row) => {
    const cat = row[categoryKey];
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(row);
    return acc;
  }, {});
}

function clearNonHeaderRows(tbody) {
  tbody.querySelectorAll('tr:not(.header-row)').forEach((tr) => tr.remove());
}

function formatBackdate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]} ${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]}`;
}

function formatBodyCellText(normalizedKey, row, columnKey) {
  if (normalizedKey === 'openendfund') {
    const rawDate = row.mf_backdate || row.mfr_dDataDate || row.mf_dnav;
    if (rawDate && row[columnKey] !== undefined) {
      const datePart = rawDate.split('T')[0];
      if (datePart !== latestMdate) {
        const label = row.mf_backdate ? formatBackdate(rawDate) : rawDate;
        return `${row[columnKey]} <span class="dnav">${label}</span>`;
      }
    }
    return row[columnKey] !== undefined ? `${row[columnKey]}` : '';
  }
  if (columnKey && row[columnKey] !== undefined) {
    const value = String(row[columnKey]);
    const num = parseFloat(value);
    if (!Number.isNaN(num) && Math.abs(num) >= 1000) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    return value === 'null' ? 'N/A' : value;
  }
  return '';
}

export function appendRowFromData(tableEl, dataArray) {
  const lang = getLang();
  const tbody = tableEl.querySelector('tbody');
  if (!tbody || !Array.isArray(dataArray)) return;

  let headerRow = tbody.querySelector('.header-row');
  if (!headerRow) {
    const first = tbody.querySelector('tr');
    if (first) { headerRow = first; headerRow.classList.add('header-row'); }
  }
  if (!headerRow) return;

  const headers = [...headerRow.querySelectorAll('td')];
  const categoryKey = lang === 'th' ? 'mf_cateTha' : 'mf_cateEng';
  const order = buildCategoryOrder(dataArray, categoryKey);
  const groups = groupRowsByCategory(dataArray, categoryKey);

  clearNonHeaderRows(tbody);

  order.forEach((category) => {
    const group = groups[category];
    group.forEach((row, idx) => {
      const tr = tableEl.ownerDocument.createElement('tr');
      headers.forEach((headerCell) => {
        const nk = normalizeHeaderKey(headerCell.textContent.trim());
        const ck = resolveColumnKey(nk, lang);
        if (nk === 'fundtype') {
          if (idx === 0) {
            const td = tableEl.ownerDocument.createElement('td');
            td.textContent = row[ck] !== undefined ? row[ck] : '';
            td.rowSpan = group.length;
            td.classList.add('merged-fund-type');
            tr.appendChild(td);
          }
          return;
        }
        const td = tableEl.ownerDocument.createElement('td');
        td.classList.add(`col-${nk}`);
        td.innerHTML = formatBodyCellText(nk, row, ck);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}

async function refreshTableFromPrices(tableEl, fallbackFunds, date) {
  let prices;
  try {
    prices = await fetchAllFundPrices(date);
  } catch {
    prices = fallbackFunds;
  }
  const data = prices && prices.length ? prices : fallbackFunds;
  appendRowFromData(tableEl, data);
  return data;
}

function markHeaderRows(tableEl) {
  const rows = [...tableEl.querySelectorAll('tr')];
  if (!rows.length) return;
  const firstRow = rows[0];
  const maxRowspan = [...firstRow.querySelectorAll('td')].reduce(
    (max, td) => Math.max(max, td.rowSpan || 1),
    1,
  );
  for (let i = 0; i < maxRowspan && i < rows.length; i += 1) {
    rows[i].classList.add('header-row');
  }
}

const DEFAULT_HEADERS_EN = [
  'Fund Type', 'Open-End Fund', 'NAV', 'Selling Price', 'Redemption Price', 'Total Net Assests',
];
const DEFAULT_HEADERS_TH = [
  'ประเภทกองทุน', 'กองทุนเปิด', 'NAV', 'ราคาขาย', 'ราคารับซื้อคืน', 'มูลค่าทรัพย์สินสุทธิรวม',
];

function buildDefaultTable(doc) {
  const table = doc.createElement('table');
  const tbody = doc.createElement('tbody');
  const headerRow = doc.createElement('tr');
  headerRow.classList.add('header-row');
  const headers = getLang() === 'th' ? DEFAULT_HEADERS_TH : DEFAULT_HEADERS_EN;
  headers.forEach((text) => {
    const td = doc.createElement('td');
    td.textContent = text;
    headerRow.appendChild(td);
  });
  tbody.appendChild(headerRow);
  table.appendChild(tbody);
  return table;
}

export default async function decorate(block) {
  let tableEl = block.querySelector('table');
  if (!tableEl) {
    tableEl = buildDefaultTable(block.ownerDocument);
  } else {
    markHeaderRows(tableEl);
  }

  block.textContent = '';
  block.appendChild(tableEl);

  let cachedFunds = [];

  block.addEventListener('fund-prices-table:refresh', async (e) => {
    const { date } = e.detail;
    if (e.detail.latestDate) latestMdate = e.detail.latestDate;
    await refreshTableFromPrices(tableEl, cachedFunds, date);
  });

  const section = block.closest('.section');
  const isControlled = !!section?.querySelector('.fund-prices');
  if (isControlled) return;

  try {
    const [namesRes, latestRes] = await Promise.all([
      fetch(ALL_FUND_NAMES_URL),
      fetch(LATEST_DATE_URL),
    ]);
    let date = new Date();
    if (latestRes.ok) {
      const lj = await latestRes.json();
      const rawDate = Array.isArray(lj) ? lj[0]?.mDate : lj?.mDate;
      latestMdate = rawDate ? rawDate.split('T')[0] : null;
      const parsed = latestMdate ? parseLocalDateFromYmd(latestMdate) : null;
      if (parsed) date = parsed;
    }
    if (namesRes.ok) {
      const data = await namesRes.json();
      cachedFunds = Array.isArray(data) ? data : [];
    }
    await refreshTableFromPrices(tableEl, cachedFunds, date);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('fund-prices-table: standalone init failed', err);
  }
}

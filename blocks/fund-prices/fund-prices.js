import { buildBlock, decorateBlock, loadBlock } from '../../scripts/aem.js';
import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';
import { formatLongDate } from '../../scripts/utils/datelang.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';

const MAX_FUND_PRICE_HISTORY_YEARS = 3;

// getLang() reads document.documentElement.lang which may not be set yet when
// async API calls resolve. Fall back to the URL path segment for reliability.
function getPageLang() {
  const first = window.location.pathname.split('/').filter(Boolean)[0];
  if (first === 'th' || first === 'en') return first;
  return getLang();
}

export function parseLocalDateFromYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd).trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const valid = d.getFullYear() === Number(m[1])
    && d.getMonth() === Number(m[2]) - 1
    && d.getDate() === Number(m[3]);
  return valid ? d : null;
}

export async function fetchNavEnabledDaysForMonth({ year, month }) {
  const configs = await fetchConfigs();
  const base = configs.fundPricesGetUpdateInMonthUrl || '';
  const data = await fetchGet(`${base}/${year}/${month + 1}/0`);
  if (!Array.isArray(data)) return [];
  return data.map((i) => (i?.Day != null ? Number(i.Day) : NaN)).filter((d) => !Number.isNaN(d));
}

function pad2(n) { return String(n).padStart(2, '0'); }

async function fetchAllFundPrices(date) {
  const configs = await fetchConfigs();
  const ALL_FUND_PRICES_BASE = configs.fundPricesAllFundPricesUrl || '';
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const data = await fetchGet(`${ALL_FUND_PRICES_BASE}/${dd}/${mm}/${yyyy}`);
  return Array.isArray(data) ? data : [];
}

// ─── Table rendering helpers ──────────────────────────────────────────────────

const localizedHeaderMap = {
  fundtype: { en: 'mf_cateEng', th: 'mf_cateTha' },
  openendfund: { en: 'mf_sEng', th: 'mf_sTha' },
  nav: 'mfr_fNav',
  sellingprice: 'mfr_fSel',
  redemptionprice: 'mfr_fBuy',
  totalnetassets: 'mfr_sAUM',
};

const rawThaiHeaderKeyMap = {
  ประเภทกองทุน: 'fundtype',
  กองทุนเปิด: 'openendfund',
  กองทุน: 'openendfund',
  มูลค่าหน่วยลงทุน: 'nav',
  nav: 'nav',
  ราคาขาย: 'sellingprice',
  ราคารับซื้อคืน: 'redemptionprice',
  มูลค่าทรัพย์สินสุทธิรวม: 'totalnetassets',
  มูลค่าทรัพย์สินสุทธิ: 'totalnetassets',
};

// Normalize keys (NFC) so Thai combining-character encoding differences
// between this source file and authored content don't silently break lookup.
const thaiHeaderKeyMap = Object.fromEntries(
  Object.entries(rawThaiHeaderKeyMap).map(([k, v]) => [k.normalize('NFC'), v]),
);

const tagAliases = {
  fund: 'openendfund',
  unitvalue: 'nav',
  buybackprice: 'redemptionprice',
  netassetvalue: 'totalnetassets',
};

function normalizeHeaderKey(header) {
  const trimmed = header.trim().normalize('NFC');
  if (thaiHeaderKeyMap[trimmed]) return thaiHeaderKeyMap[trimmed];
  const hashIndex = trimmed.lastIndexOf('#');
  let key;
  if (hashIndex !== -1 && hashIndex < trimmed.length - 1) {
    key = trimmed.slice(hashIndex + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  } else {
    key = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return tagAliases[key] || key;
}

function resolveColumnKey(normalizedKey, lang) {
  const mapped = localizedHeaderMap[normalizedKey];
  if (!mapped) return normalizedKey;
  if (
    typeof mapped === 'object'
    && (normalizedKey === 'fundtype' || normalizedKey === 'openendfund')
  ) {
    return mapped[lang];
  }
  return mapped;
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

function formatBackdate(iso, lang) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatLongDate(date, lang);
}

function formatBodyCellText(normalizedKey, row, columnKey, selectedDate, lang) {
  if (normalizedKey === 'openendfund') {
    const rawDate = row.mf_backdate || row.mfr_dDataDate || row.mf_dnav;
    if (rawDate && columnKey && row[columnKey] !== undefined) {
      const datePart = rawDate.split('T')[0];
      if (datePart !== selectedDate) {
        const label = row.mf_backdate ? formatBackdate(rawDate, lang) : rawDate;
        return `${row[columnKey]} <span class="dnav">${label}</span>`;
      }
    }
    return row[columnKey] !== undefined ? `${row[columnKey]}` : '';
  }
  if (columnKey && row[columnKey] !== undefined) {
    const value = String(row[columnKey]);
    const num = parseFloat(value);
    if (!Number.isNaN(num) && num === 0) return 'N/A';
    if (!Number.isNaN(num) && Math.abs(num) >= 1000) {
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (!Number.isNaN(num)) {
      return num.toFixed(4);
    }
    return value === 'null' ? 'N/A' : value;
  }
  return '';
}

/** Cloned header cells (with `#key` suffixes) used for column mapping
 * after display text is stripped. */
const headerMappingCellsByTable = new WeakMap();

function appendRowFromData(tableBlock, dataArray, latestMdate) {
  const lang = getPageLang();
  const tbody = tableBlock.querySelector('tbody');
  if (!tbody) return;

  let headerRow = tbody.querySelector('.header-row');
  if (!headerRow) {
    const firstRow = tbody.querySelector('tr');
    if (firstRow) {
      const tds = firstRow.querySelectorAll('td');
      headerMappingCellsByTable.set(
        tableBlock,
        Array.from(tds).map((td) => td.cloneNode(true)),
      );
      tds.forEach((td) => {
        // eslint-disable-next-line no-param-reassign
        td.textContent = td.textContent.replace(/\s*#\w+\b/g, '');
      });
      headerRow = firstRow;
      headerRow.classList.add('header-row');
    }
  }
  if (!headerRow) return;
  if (!Array.isArray(dataArray)) return;

  const headerMappingCells = headerMappingCellsByTable.get(tableBlock)
    || Array.from(headerRow.querySelectorAll('td'));

  const categoryKey = lang === 'th' ? 'mf_cateTha' : 'mf_cateEng';
  const order = buildCategoryOrder(dataArray, categoryKey);
  const groups = groupRowsByCategory(dataArray, categoryKey);

  clearNonHeaderRows(tbody);

  order.forEach((category) => {
    const group = groups[category];
    group.forEach((row, idx) => {
      const tr = tableBlock.ownerDocument.createElement('tr');
      headerMappingCells.forEach((headerCell) => {
        const nk = normalizeHeaderKey(headerCell.textContent.trim());
        const ck = resolveColumnKey(nk, lang);
        if (nk === 'fundtype') {
          if (idx === 0) {
            const td = tableBlock.ownerDocument.createElement('td');
            td.textContent = row[ck] !== undefined ? row[ck] : '';
            td.rowSpan = group.length;
            td.classList.add('merged-fund-type');
            tr.appendChild(td);
          }
          return;
        }
        const td = tableBlock.ownerDocument.createElement('td');
        td.classList.add(`col-${nk}`);
        td.innerHTML = formatBodyCellText(nk, row, ck, latestMdate, lang);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}

async function refreshTableFromPrices(tableBlock, fallbackFunds, date, latestMdate) {
  let prices;
  try {
    prices = await fetchAllFundPrices(date);
  } catch {
    prices = fallbackFunds;
  }
  const data = prices && prices.length ? prices : fallbackFunds;
  appendRowFromData(tableBlock, data, latestMdate);
}

// ─── fund-prices UI helpers ───────────────────────────────────────────────────

function moveSearchBarToHeader(el, doc) {
  const check = () => {
    const headerNav = doc.querySelector('.header-nav');
    if (!headerNav) return false;
    const headerBlock = headerNav.closest('.header') || headerNav.parentElement;
    if (!headerBlock) return false;
    el.classList.add('is-in-header');
    doc.body.classList.add('fund-prices-search-in-header');
    headerBlock.appendChild(el);
    const pageTitleEl = doc.querySelector('main .default-content-wrapper h1, main .default-content-wrapper h2');
    if (pageTitleEl) pageTitleEl.classList.add('fund-prices-page-title');
    return true;
  };
  if (check()) return;
  const observer = new MutationObserver(() => {
    if (check()) observer.disconnect();
  });
  observer.observe(doc.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 8000);
}

function richTextFromRow(row) {
  if (!row) return '';
  const cell = row.querySelector(':scope > div');
  return (cell ?? row).innerHTML.trim();
}

function formatPrintDate(date = new Date()) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function formatPrintTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function printContent(containerEl, pageTitle, searchLabelText) {
  if (!containerEl) return;
  const doc = containerEl.ownerDocument;
  const clone = containerEl.cloneNode(true);
  const printHideSelectors = '.fund-prices-print-label, .fund-prices-error-message, .fund-prices-search-bar';
  clone.querySelectorAll(printHideSelectors).forEach((el) => el.remove());
  const inp = clone.querySelector('.calendar-input input');
  const selectedDate = inp?.value || '';
  if (inp) inp.parentNode?.replaceChild(doc.createTextNode(selectedDate), inp);

  const logoEl = doc.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || doc.querySelector('.brand-logo-container picture, .brand-logo-container img');
  const brandLogo = logoEl ? logoEl.cloneNode(true).outerHTML : '';

  const now = new Date();
  const dateLabelText = containerEl.querySelector('.calendar-wrapper p')?.textContent?.trim();
  const printRoot = doc.createElement('div');
  printRoot.id = 'fund-prices-print-root';
  printRoot.innerHTML = `
    <div class="fund-prices-print-masthead">
      <div class="fund-prices-print-datetime">${formatPrintDate(now)}, ${formatPrintTime(now)}</div>
      <div class="fund-prices-print-page-title">${pageTitle}</div>
      <div></div>
      <div class="fund-prices-print-logo brand-logo-container">${brandLogo}</div>
      <div></div>
      <div class="fund-prices-print-search">${searchLabelText}</div>
    </div>
    <h1 class="fund-prices-print-title">${pageTitle}</h1>
    <div class="fund-prices-print-rule"></div>
    <div class="fund-prices-print-date">
      <strong>${dateLabelText}</strong>
      <span>${selectedDate}</span>
    </div>
    <div class="fund-prices-print-table-wrap"></div>
    <div class="fund-prices-print-footer">
      <span>https://www.bangkokbank.com/en/Personal/Save-And-Invest/Mutual-Funds/Fund-Prices</span>
      <span>1/5</span>
    </div>
  `;

  const tableBlock = clone.querySelector('.fund-prices-table');
  if (tableBlock) {
    const table = tableBlock.querySelector('table');
    const headerRow = table?.querySelector('tr.header-row');
    const fifRow = [...(table?.querySelectorAll('tr') || [])].find(
      (row) => row.querySelector('td.merged-fund-type')?.textContent.trim() === 'FIF',
    );

    /*
     * Keep the first printed page exactly as authored.  The rows beginning with
     * FIF are moved to a second table whose THEAD is repeated by the browser on
     * every continuation page.
     */
    if (table && headerRow && fifRow) {
      const continuationTable = table.cloneNode(false);
      const continuationColumns = doc.createElement('colgroup');
      [15, 39, 10, 10, 10, 16].forEach((width) => {
        const column = doc.createElement('col');
        column.style.width = `${width}%`;
        continuationColumns.appendChild(column);
      });
      const continuationHead = doc.createElement('thead');
      const continuationMeta = doc.createElement('tr');
      continuationMeta.className = 'fund-prices-print-continuation-meta';
      continuationMeta.innerHTML = `
        <td>${formatPrintDate(now)}, ${formatPrintTime(now)}</td>
        <td colspan="4">${pageTitle}</td>
        <td></td>
      `;
      continuationHead.append(continuationMeta, headerRow.cloneNode(true));

      const continuationBody = doc.createElement('tbody');
      let row = fifRow;
      while (row) {
        const nextRow = row.nextElementSibling;
        continuationBody.appendChild(row);
        row = nextRow;
      }
      continuationTable.append(continuationColumns, continuationHead, continuationBody);

      const continuation = doc.createElement('div');
      continuation.className = 'fund-prices-print-continuation';
      continuation.appendChild(continuationTable);
      tableBlock.appendChild(continuation);
    }
    printRoot.querySelector('.fund-prices-print-table-wrap').appendChild(tableBlock);
  }

  doc.body.classList.add('fund-prices-is-printing');
  doc.body.appendChild(printRoot);
  window.print();
  printRoot.remove();
  doc.body.classList.remove('fund-prices-is-printing');
}

function isDateOlderThanFundHistoryLimit(date) {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear() - MAX_FUND_PRICE_HISTORY_YEARS,
    today.getMonth(),
    today.getDate(),
  );
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()) < cutoff;
}

async function parseBlockData(block) {
  const rows = Array.from(block.children);
  const ph = await fetchPlaceholders();
  return {
    dateLabelHtml: richTextFromRow(rows[0]),
    printLabelHtml: richTextFromRow(rows[1]),
    errorMessageHtml: richTextFromRow(rows[2]),
    disclaimerHtml: richTextFromRow(rows[3]),
    searchLabel: ph.fundPricesSearchLabel,
    goLabel: ph.fundPricesGoLabel,
    allFundsLabel: ph.fundPricesAllFundsLabel,
    pageTitle: ph.fundPricesPageTitle,
  };
}

function buildFundSelectorBar(doc, funds, searchLabel, allFundsLabel, goLabel) {
  const bar = doc.createElement('div');
  bar.className = 'fund-prices-search-bar';

  const lbl = doc.createElement('label');
  lbl.textContent = searchLabel;
  lbl.htmlFor = 'fund-select-btn';

  const wrapper = doc.createElement('div');
  wrapper.className = 'fund-select-wrapper';

  const btn = doc.createElement('button');
  btn.className = 'fund-select-btn';
  btn.id = 'fund-select-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="fund-select-text">${allFundsLabel}</span><span class="icon-dropdown"></span>`;

  const list = doc.createElement('ul');
  list.className = 'fund-dropdown';
  list.setAttribute('role', 'listbox');

  const allOption = doc.createElement('li');
  allOption.textContent = allFundsLabel;
  allOption.setAttribute('role', 'option');
  allOption.classList.add('active');
  list.appendChild(allOption);

  const lang = getPageLang();
  funds.forEach((f) => {
    const name = lang === 'th' ? (f.mf_sTha || f.mf_sEng) : (f.mf_sEng || f.mf_sTha);
    if (!name) return;
    const li = doc.createElement('li');
    li.textContent = name;
    li.setAttribute('role', 'option');
    li.dataset.fundId = f.mf_iNumber;
    li.dataset.fundName = name;
    list.appendChild(li);
  });

  wrapper.appendChild(btn);
  wrapper.appendChild(list);

  const goBtn = doc.createElement('button');
  goBtn.className = 'fund-search-go-btn';
  goBtn.textContent = goLabel;

  bar.appendChild(lbl);
  bar.appendChild(wrapper);
  bar.appendChild(goBtn);

  let selectedFund = null;

  function selectItem(li) {
    list.querySelectorAll('li').forEach((l) => l.classList.remove('active'));
    li.classList.add('active');
    const textSpan = btn.querySelector('.fund-select-text');
    if (li === allOption) {
      if (textSpan) textSpan.textContent = allFundsLabel;
      selectedFund = null;
    } else {
      if (textSpan) textSpan.textContent = li.dataset.fundName;
      selectedFund = { id: li.dataset.fundId, name: li.dataset.fundName };
    }
    list.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = list.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });

  [allOption, ...list.querySelectorAll('li:not(:first-child)')].forEach((li) => {
    li.addEventListener('click', () => selectItem(li));
  });

  doc.addEventListener('click', () => {
    list.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  });

  return {
    el: bar,
    getSelected: () => selectedFund,
    goBtn,
    resetToAll: () => selectItem(allOption),
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const doc = block.ownerDocument;
  const section = block.closest('.section');
  const {
    dateLabelHtml, printLabelHtml, errorMessageHtml, disclaimerHtml,
    searchLabel, goLabel, allFundsLabel, pageTitle,
  } = await parseBlockData(block);

  block.innerHTML = '';

  const pageHeading = section?.querySelector('.default-content-wrapper h1, .default-content-wrapper h2, .default-content-wrapper h3');
  if (pageHeading) {
    const h2 = pageHeading.tagName === 'H2' ? pageHeading : doc.createElement('h2');
    if (pageHeading.tagName !== 'H2') {
      h2.id = pageHeading.id;
      h2.className = pageHeading.className;
    }
    h2.textContent = pageTitle;
    if (pageHeading.tagName !== 'H2') pageHeading.replaceWith(h2);
  }

  if (isAuthoringInstance(block)) {
    const authorRoot = doc.createElement('div');
    authorRoot.className = 'fund-prices-root';
    const toolbar = doc.createElement('div');
    toolbar.className = 'fund-prices-toolbar';
    toolbar.innerHTML = dateLabelHtml;
    const printLbl = doc.createElement('div');
    printLbl.className = 'fund-prices-print-label icon-print';
    printLbl.innerHTML = printLabelHtml;
    toolbar.appendChild(printLbl);
    const dis = doc.createElement('div');
    dis.className = 'fund-prices-disclaimer-text';
    dis.innerHTML = disclaimerHtml;
    authorRoot.append(toolbar, dis);
    block.appendChild(authorRoot);
    return;
  }

  // Find the generic table block in the same section
  // (accept legacy 'fund-prices-table' block name too)
  const tableBlock = section?.querySelector('.table, .fund-prices-table');
  if (tableBlock) {
    tableBlock.classList.add('fund-prices-table');
    // When authored via Universal Editor, variation classes land on the block div rather than
    // as a text row, so table.js never copies them to the inner <table>. Do it here.
    const innerTable = tableBlock.querySelector('table');
    if (innerTable) {
      const tableVariations = ['outline-border', 'border-bottom', 'border-light-gray', 'solid-white', 'border-bottom-tight-cols', 'merge-tables', 'nested-table'];
      tableVariations.forEach((cls) => {
        if (tableBlock.classList.contains(cls)) innerTable.classList.add(cls);
      });
    }
  }

  let funds = [];
  let latestMdate = null;
  let calendarDate = new Date();
  let currentDate = calendarDate;
  let cachedFunds = [];

  try {
    const configs = await fetchConfigs();
    const [latestJson, namesData] = await Promise.all([
      fetchGet(configs.fundPricesLatestDateUrl || '', { throwOnError: false }),
      fetchGet(configs.fundPricesAllFundsNameUrl || '', { throwOnError: false }),
    ]);
    if (latestJson) {
      const rawDate = Array.isArray(latestJson) ? latestJson[0]?.mDate : latestJson?.mDate;
      latestMdate = rawDate ? rawDate.split('T')[0] : null;
      const parsed = latestMdate ? parseLocalDateFromYmd(latestMdate) : null;
      if (parsed) { calendarDate = parsed; currentDate = parsed; }
    }
    if (namesData) {
      funds = Array.isArray(namesData) ? namesData : [];
      cachedFunds = funds;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('fund-prices: init failed', e);
  }

  // Initial table population
  if (tableBlock) await refreshTableFromPrices(tableBlock, cachedFunds, calendarDate, latestMdate);

  /* ── Root ── */
  const root = doc.createElement('div');
  root.className = 'fund-prices-root';

  /* ── Fund selector bar ── */
  const fundSelector = buildFundSelectorBar(doc, funds, searchLabel, allFundsLabel, goLabel);
  root.appendChild(fundSelector.el);
  moveSearchBarToHeader(fundSelector.el, doc);

  /* ── Main view ── */
  const mainView = doc.createElement('div');
  mainView.className = 'fund-prices-main-view';

  const calendarWrapper = doc.createElement('div');
  calendarWrapper.className = 'calendar-wrapper';
  calendarWrapper.dataset.field = 'date-label';
  calendarWrapper.innerHTML = dateLabelHtml;

  const printLabel = doc.createElement('div');
  printLabel.className = 'fund-prices-print-label icon-print';
  printLabel.dataset.field = 'print-label';
  printLabel.innerHTML = printLabelHtml;

  const errorMessage = doc.createElement('div');
  errorMessage.classList.add('fund-prices-error-message', 'hidden');
  errorMessage.hidden = true;
  errorMessage.dataset.field = 'error-message';
  errorMessage.setAttribute('role', 'alert');
  errorMessage.setAttribute('aria-live', 'polite');
  errorMessage.innerHTML = errorMessageHtml;

  const disclaimer = doc.createElement('div');
  disclaimer.className = 'fund-prices-disclaimer-text';
  disclaimer.dataset.field = 'disclaimer-text';
  disclaimer.innerHTML = disclaimerHtml;

  const calendarInput = doc.createElement('div');
  const dateInput = doc.createElement('input');
  dateInput.id = 'date-to';
  dateInput.type = 'text';
  dateInput.name = 'date-to';
  calendarInput.classList.add('calendar-input', 'icon-calendar');
  calendarInput.appendChild(dateInput);
  calendarWrapper.appendChild(calendarInput);

  attachCalendarPicker({
    input: dateInput,
    value: calendarDate,
    fetchEnabledDays: fetchNavEnabledDaysForMonth,
    onChange: (selectedDate) => {
      if (isDateOlderThanFundHistoryLimit(selectedDate)) {
        errorMessage.classList.remove('hidden');
        errorMessage.hidden = false;
        return;
      }
      errorMessage.classList.add('hidden');
      errorMessage.hidden = true;
      currentDate = selectedDate;
      if (tableBlock) refreshTableFromPrices(tableBlock, cachedFunds, selectedDate, latestMdate);
    },
  });

  const toolbar = doc.createElement('div');
  toolbar.className = 'fund-prices-toolbar';
  toolbar.appendChild(calendarWrapper);
  toolbar.appendChild(printLabel);

  mainView.append(toolbar, errorMessage);

  if (tableBlock) {
    root.append(mainView, tableBlock);
  } else {
    root.append(mainView);
  }

  block.appendChild(root);

  /* ── Print handler ── */
  printLabel.addEventListener('click', (e) => {
    e.preventDefault();
    printContent(section ?? root, pageTitle, searchLabel);
  });

  /* ── Dynamically build and load fund-prices-dropdown block ── */
  const fddRawBlock = buildBlock('fund-prices-dropdown', []);
  root.appendChild(fddRawBlock);
  decorateBlock(fddRawBlock);
  await loadBlock(fddRawBlock);

  root.appendChild(disclaimer);

  const fddBlock = root.querySelector('.fund-prices-dropdown');

  /* ── Show/hide helpers ── */
  function showMainView() {
    mainView.classList.remove('hidden');
    if (tableBlock) tableBlock.classList.remove('hidden');
    fundSelector.el.classList.remove('hidden');
    doc.body.classList.remove('fund-prices-detail-active');
    fddBlock?.dispatchEvent(new CustomEvent('fund-prices-dropdown:hide'));
  }

  function showDetailView(fund) {
    mainView.classList.add('hidden');
    if (tableBlock) tableBlock.classList.add('hidden');
    fundSelector.el.classList.remove('hidden');
    doc.body.classList.add('fund-prices-detail-active');
    fddBlock?.dispatchEvent(new CustomEvent('fund-prices-dropdown:show', {
      detail: { fund, mdate: latestMdate },
    }));
  }

  /* ── GO button ── */
  fundSelector.goBtn.addEventListener('click', () => {
    const selected = fundSelector.getSelected();
    if (selected) {
      showDetailView(selected);
    } else {
      showMainView();
      if (tableBlock) refreshTableFromPrices(tableBlock, cachedFunds, currentDate, latestMdate);
    }
  });

  /* ── Back button from dropdown ── */
  fddBlock?.addEventListener('fund-prices-dropdown:back', () => {
    showMainView();
    fundSelector.resetToAll();
    if (tableBlock) refreshTableFromPrices(tableBlock, cachedFunds, currentDate, latestMdate);
  });
}

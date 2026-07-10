import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

let getUpdateInMonthBase = '';
let allFundPricesUrl = '';

/** NAV history is limited;
 * calendar selections older than this (local calendar) skip the prices API. */
const MAX_FUND_PRICE_HISTORY_YEARS = 3;

let latestMdate = null;

/** Cloned header cells (with `#key` suffixes)
 * used for column mapping after display text is stripped. */
const headerMappingCellsByTable = new WeakMap();

/** @param {Date} selectedDate - local calendar day */
function isDateOlderThanFundHistoryLimit(selectedDate) {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear() - MAX_FUND_PRICE_HISTORY_YEARS,
    today.getMonth(),
    today.getDate(),
  );
  const day = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
  );
  return day < cutoff;
}
function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {Date} date - local calendar day */
function formatDateForFundPricesPath(date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** @param {Date} date */
async function fetchAllFundPrices(date) {
  const path = formatDateForFundPricesPath(date);
  const url = `${allFundPricesUrl}${path}`;
  const data = await fetchGet(url);
  return Array.isArray(data) ? data : [];
}

/** @param {{ year: number, month: number }} ctx - month is 0-based (JS Date) */
async function fetchNavEnabledDaysForMonth({ year, month }) {
  const apiMonth = month + 1;
  const url = `${getUpdateInMonthBase}/${year}/${apiMonth}/0`;
  const data = await fetchGet(url);
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => (item && item.day != null ? Number(item.day) : NaN))
    .filter((d) => !Number.isNaN(d));
}

/** Parse `YYYY-MM-DD` as a local calendar date (avoids UTC midnight shifts). */
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

// Helper to normalize header text as keys
function normalizeHeaderKey(header) {
  // Check for a #suffix and return only the part after #
  const hashIndex = header.lastIndexOf('#');
  if (hashIndex !== -1 && hashIndex < header.length - 1) {
    return header.slice(hashIndex + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Helper to get current language - default to en (English) if unknown
function getLang() {
  if (typeof document !== 'undefined' && document.documentElement) {
    const langAttr = document.documentElement.getAttribute('lang');
    return langAttr && langAttr.toLowerCase().startsWith('th') ? 'th' : 'en';
  }
  return 'en';
}

// Map for language-aware object keys
const localizedHeaderMap = {
  fundtype: { en: 'mf_cateEng', th: 'mf_cateTha' },
  openendfund: { en: 'mf_sEng', th: 'mf_sTha' },
  nav: 'mfr_fNav',
  sellingprice: 'mfr_fBuy',
  redemptionprice: 'mfr_fSel',
  totalnetassets: 'mf_sAUM',
};

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

/** First-seen order of fund categories for stable grouping. */
function buildCategoryOrder(rows, categoryKey) {
  const order = [];
  const seen = new Set();
  rows.forEach((row) => {
    const cate = row[categoryKey];
    if (cate !== undefined && !seen.has(cate)) {
      order.push(cate);
      seen.add(cate);
    }
  });
  return order;
}

function groupRowsByCategory(rows, categoryKey) {
  return rows.reduce((acc, row) => {
    const cate = row[categoryKey];
    if (!acc[cate]) acc[cate] = [];
    acc[cate].push(row);
    return acc;
  }, {});
}

function clearNonHeaderRows(tbody) {
  tbody.querySelectorAll('tr:not(.header-row)').forEach((tr) => tr.remove());
}

/** Display text for a body cell
 * (open-end fund column adds date suffix when row date ≠ selected). */
function formatBodyCellText(normalizedKey, row, columnKey, selectedDate) {
  if (normalizedKey === 'openendfund') {
    const fundDate = row.mfr_dDataDate
      ? row.mfr_dDataDate
      : row.mf_dnav;
    const dnav = row.mfr_dDataDate ? row.mfr_dDataDate : row.mf_dnav;
    if (fundDate !== selectedDate && columnKey && row[columnKey] !== undefined) {
      return `${row[columnKey]} <span class="dnav">${dnav}</span>`;
    }
    return `${row[columnKey]}`;
  }
  if (columnKey && row[columnKey] !== undefined) {
    const value = String(row[columnKey]);
    return value === 'null' ? 'N/A' : value;
  }
  return '';
}

function appendRowFromData(tableElement, dataArray) {
  const lang = getLang();
  const tbody = tableElement.querySelector('tbody');
  if (!tbody) {
    return;
  }

  let headerRow = tbody.querySelector('.header-row');

  if (!headerRow) {
    const firstRow = tbody.querySelector('tr');
    if (firstRow) {
      const tds = firstRow.querySelectorAll('td');
      headerMappingCellsByTable.set(
        tableElement,
        Array.from(tds).map((td) => td.cloneNode(true)),
      );
      tds.forEach((td) => {
        if (typeof td.textContent === 'string') {
          // Remove any occurrence of '#' followed by a word (e.g., "#fundtype")
          td.textContent = td.textContent.replace(/\s*#\w+\b/g, '');
        }
      });
      headerRow = firstRow;
      headerRow.classList.add('header-row');
    }
  }
  if (!headerRow) {
    return;
  }

  if (!Array.isArray(dataArray)) {
    return;
  }

  const headerMappingCells = headerMappingCellsByTable.get(tableElement)
    || Array.from(headerRow.querySelectorAll('td'));
  const categoryKey = lang === 'th' ? 'mf_cateTha' : 'mf_cateEng';
  const categoryOrder = buildCategoryOrder(dataArray, categoryKey);
  const groupedByCategory = groupRowsByCategory(dataArray, categoryKey);

  clearNonHeaderRows(tbody);

  categoryOrder.forEach((category) => {
    const group = groupedByCategory[category];
    group.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      headerMappingCells.forEach((headerCell) => {
        const normalizedKey = normalizeHeaderKey(headerCell.textContent.trim());
        const columnKey = resolveColumnKey(normalizedKey, lang);

        if (normalizedKey === 'fundtype') {
          if (rowIndex === 0) {
            const td = document.createElement('td');
            td.textContent = row[columnKey] !== undefined ? row[columnKey] : '';
            td.rowSpan = group.length;
            td.classList.add('merged-fund-type');
            tr.appendChild(td);
          }
          return;
        }

        const td = document.createElement('td');
        td.innerHTML = formatBodyCellText(normalizedKey, row, columnKey, latestMdate);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}

function setTableLoading(loader, isLoading) {
  if (!loader) return;
  loader.classList.toggle('is-active', isLoading);
  loader.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
  loader.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

/**
 * @param {HTMLElement} tableEl
 * @param {unknown[]} fallbackFunds
 * @param {Date} date
 * @param {HTMLElement} [loader]
 */
async function refreshTableFromPrices(tableEl, fallbackFunds, date, loader) {
  setTableLoading(loader, true);
  try {
    const prices = await fetchAllFundPrices(date);
    appendRowFromData(tableEl, prices);
  } catch (error) {
    appendRowFromData(tableEl, fallbackFunds);
  } finally {
    setTableLoading(loader, false);
  }
}
/**
 * Bcap block content model — see _bcap.json (field order).
 * Rows map to: date-label, print-label, error-message, disclaimer-text (richtext).
 */

/**
 * @param {Element | undefined} row
 * @returns {string} Trimmed HTML from the first column cell, or the row itself.
 */
function richTextFromRow(row) {
  if (!row) return '';
  const cell = row.querySelector(':scope > div');
  const source = cell ?? row;
  return source.innerHTML.trim();
}

/** Move `.header-row` from tbody into thead so headers repeat on each printed page. */
function moveHeaderRowsToThead(container) {
  container.querySelectorAll('table').forEach((table) => {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const headerRows = [...tbody.querySelectorAll('tr.header-row')];
    if (!headerRows.length) return;

    let thead = table.querySelector('thead');
    if (!thead) {
      thead = document.createElement('thead');
      table.insertBefore(thead, tbody);
    }
    headerRows.forEach((row) => thead.appendChild(row));
  });
}

function printElement() {
  // Clone the container to avoid changing the DOM
  const originalContent = document.querySelector('.bcap-container');
  const content = originalContent ? originalContent.cloneNode(true) : null;
  if (!content) return;

  // 1. Remove all print label(s)
  content.querySelectorAll('.bcap-print-label').forEach((el) => el.remove());

  // 2. Remove all error messages
  content.querySelectorAll('.bcap-error-message').forEach((el) => el.remove());

  // 3. Replace calendar input with its value as plain text
  const input = content.querySelector('.calendar-wrapper .icon-calendar input');
  if (input) {
    const inputValue = input.value;
    // Create a text node with the value and replace the input
    const textNode = document.createTextNode(inputValue);

    // Replace input with text node (append to parent, remove input)
    const parent = input.parentNode;
    if (parent) {
      parent.replaceChild(textNode, input);
    }
  }

  moveHeaderRowsToThead(content);

  const logoEl = document.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || document.querySelector('.brand-logo-container picture, .brand-logo-container img');
  if (!logoEl) return;
  const brandLogo = logoEl.cloneNode(true).outerHTML;

  const printWindow = window.open('', '', 'height=500,width=800');

  const printCss = `
    @page {
      size: A4 portrait;
      margin: 10mm; /* Standard margins for printers */
    }

    .header {
      position: unset;
    }
    
    .brand-logo-container {
      width: 12.5rem;
      height: 3.125rem;
      margin-block: 3rem 1rem;
    }

    h2 {
      font-size: 2rem;
    }

    .calendar-input::before {
      right: -1.6875rem;
      top: 14%;
    }
    .section.underline-title .default-content-wrapper > :is(h1, h2, h3, h4, h5, h6):first-child::after {
      width: 2.25rem;
      height: 0.125rem;
      background-color: black;
    }
    .section.underline-title .default-content-wrapper > :is(h1, h2, h3, h4, h5, h6):first-child {
      margin: 0;
      padding: 0;
    }
    .calendar-wrapper p {
      margin: 0;
    }

    .bcap-wrapper {
      margin-top: 2rem;
    }

    .table table.outline-border {
        border: 0;
    }

    tr.header-row {
        border: 0.125rem solid black;
        border-inline: 0;
    }

    .table table tr.header-row td {
        padding: 0;
        height: auto;
    }
    .table table.header-light-gray tr.header-row td {
        background-color: transparent;
    }
    .table table tr:not(.header-row) td {
      padding-block: 0.1875rem;
      vertical-align: middle;
      font-size: 0.625rem;
    }
    .bcap-table.table table tr.header-row td {
      font-size: 0.75rem;
      height: auto;
      padding: 0.1875rem 0rem;
    }
    .bcap-disclaimer-text {
      font-size: 0.5rem;
    }

    @media print {
      .bcap-container table thead {
        display: table-header-group;
      }

      .bcap-container table tbody {
        display: table-row-group;
      }

      .bcap-container .table table {
        break-inside: auto;
      }

      .bcap-container .table table tbody tr {
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
      <link rel="stylesheet" href="/blocks/bcap/bcap.css">
      <link rel="stylesheet" href="/blocks/table/table.css">
      <style>${printCss}</style>
    </head>
    <body class="appear">
      <header class="header-wrapper">
        <div class="header block" data-block-status="loaded">
          <div class="header-content">
            <div class="main-nav-desktop">
              <div class="brand-logo block">
                <div class="brand-logo-container">
                  ${brandLogo}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main>
        <div class="section underline-title bcap-container table-container">
          ${content.innerHTML.trim()}
        </div>
      </main>
    </body>
  </html>
  `;
  const runPrint = () => {
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 100);
  };
  if (printWindow.document.readyState === 'complete') {
    requestAnimationFrame(runPrint);
  } else {
    printWindow.addEventListener('load', runPrint);
  }

  printWindow.document.write(printHtml);
  printWindow.document.close();
}

function attachBcapPrintHandler(printLabel) {
  printLabel.addEventListener('click', (e) => {
    e.preventDefault();
    printElement();
  });
}

/**
 * @param {HTMLElement} block
 */
export default async function decorate(block) {
  const doc = block.ownerDocument;
  const rows = [...block.children];

  const table = block.parentElement.parentElement.querySelector('.table');
  table.classList.add('bcap-table');
  if (!table) return;

  let funds = [];
  let calendarDate = new Date();

  const dateLabelHtml = richTextFromRow(rows[0]);
  const printLabelHtml = richTextFromRow(rows[1]);
  const errorMessageHtml = richTextFromRow(rows[2]);
  const disclaimerHtml = richTextFromRow(rows[3]);

  block.innerHTML = '';

  const root = doc.createElement('div');
  root.className = 'bcap-root content';

  const dateLabel = doc.createElement('div');
  dateLabel.className = 'calendar-wrapper';
  dateLabel.dataset.field = 'date-label';
  dateLabel.innerHTML = dateLabelHtml;

  const printLabel = doc.createElement('div');
  printLabel.className = 'bcap-print-label icon-print';
  printLabel.dataset.field = 'print-label';
  printLabel.innerHTML = printLabelHtml;

  const errorMessage = doc.createElement('div');
  // Always begins hidden, both by .hidden and .hidden attribute
  errorMessage.classList.add('bcap-error-message', 'hidden');
  errorMessage.hidden = true;
  errorMessage.dataset.field = 'error-message';
  errorMessage.setAttribute('role', 'alert');
  errorMessage.setAttribute('aria-live', 'polite');
  errorMessage.innerHTML = errorMessageHtml;

  const disclaimer = doc.createElement('div');
  disclaimer.className = 'bcap-disclaimer-text';
  disclaimer.dataset.field = 'disclaimer-text';
  disclaimer.innerHTML = disclaimerHtml;

  try {
    const configs = await fetchConfigs();
    const allFundNamesUrl = configs?.bcapAllFundNamesUrl || '';
    const latestDateUrl = configs?.bcapLatestDateUrl || '';
    getUpdateInMonthBase = configs?.bcapGetUpdateInMonthBase || '';
    allFundPricesUrl = configs?.bcapAllFundPricesUrl || '';
    const [latestJson, data] = await Promise.all([
      fetchGet(latestDateUrl, { throwOnError: false }),
      fetchGet(allFundNamesUrl),
    ]);

    if (latestJson) {
      latestMdate = latestJson?.mdate;
      const parsed = latestJson?.mdate ? parseLocalDateFromYmd(latestJson.mdate) : null;
      if (parsed) calendarDate = parsed;
    } else {
      console.error('bcap: LatestDate API failed');
    }

    funds = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('bcap: failed to load fund list', error);
  }

  const loader = doc.createElement('div');
  loader.className = 'loading';
  loader.setAttribute('aria-hidden', 'true');
  document.body.appendChild(loader);

  /** Shows table loader while getUpdateInMonthBase is fetched for the calendar. */
  async function fetchNavEnabledDaysWithLoader(ctx) {
    setTableLoading(loader, true);
    try {
      return await fetchNavEnabledDaysForMonth(ctx);
    } finally {
      setTableLoading(loader, false);
    }
  }

  if (dateLabel) {
    const calendarInput = doc.createElement('div');
    const input = doc.createElement('input');
    input.id = 'date-to';
    input.type = 'text';
    input.name = 'date-to';
    calendarInput.classList.add('calendar-input', 'icon-calendar');
    calendarInput.appendChild(input);
    dateLabel.appendChild(calendarInput);
    attachCalendarPicker({
      input,
      value: calendarDate,
      fetchEnabledDays: fetchNavEnabledDaysWithLoader,
      onChange: (selectedDate) => {
        if (!table) return;
        if (errorMessage) {
          if (isDateOlderThanFundHistoryLimit(selectedDate)) {
            errorMessage.classList.remove('hidden');
            errorMessage.hidden = false;
            return;
          }
          errorMessage.classList.add('hidden');
          errorMessage.hidden = true;
        }
        refreshTableFromPrices(table, funds, selectedDate, loader);
      },
    });
  }

  await refreshTableFromPrices(table, funds, calendarDate, loader);

  const toolbar = doc.createElement('div');
  toolbar.className = 'bcap-toolbar';
  toolbar.appendChild(dateLabel);
  toolbar.appendChild(printLabel);

  if (isAuthoringInstance(block)) {
    root.append(toolbar, errorMessage, disclaimer);
  } else {
    root.append(toolbar, errorMessage, table, disclaimer);
  }

  block.appendChild(root);

  attachBcapPrintHandler(printLabel);
}

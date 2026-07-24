import { fetchConfigs } from '../../scripts/config.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

const ALL_MAPPED_CODES = new Set([
  'RR',
  'DR',
  'LR',
  'USIR',
  'MMR',
  'USTS',
  'TSB',
  'CMST',
  'THBUSD',
  'WI',
  'FXR',
  'THBR',
  'WGS',
  'OTHBIS',
  'GTHB',
  'FXMO',
  'TBMO',
]);

/**
 * @param {unknown} payload - Raw JSON from GetMarketsum
 * @returns {{
 *   mktdate: string | null,
 *   rows: Array<{ mktcode?: string, mktno?: string, mktvalue?: string }>,
 * }}
 */
export function parseMarketSumResponse(payload) {
  if (!Array.isArray(payload) || payload.length < 2) {
    return { mktdate: null, rows: [] };
  }
  const dateRow = payload[0]?.[0];
  const mktdate = typeof dateRow?.mktdate === 'string' ? dateRow.mktdate : null;
  const rows = Array.isArray(payload[1]) ? payload[1] : [];
  return { mktdate, rows };
}

/**
 * Split flat market rows into arrays keyed by mktcode (only mapped codes).
 * Each array is sorted by numeric mktno.
 * @param {Array<{ mktcode?: string, mktno?: string, mktvalue?: string }>} rows
 * @returns {Record<string, Array<{ mktcode: string, mktno: string, mktvalue: string }>>}
 */
export function groupMarketRowsByCode(rows) {
  /** @type {Record<string, Array<{ mktcode: string, mktno: string, mktvalue: string }>>} */
  const byCode = {};
  ALL_MAPPED_CODES.forEach((code) => {
    byCode[code] = [];
  });

  rows.forEach((row) => {
    const code = row?.mktcode;
    if (!code || !ALL_MAPPED_CODES.has(code)) return;
    byCode[code].push({
      mktcode: code,
      mktno: String(row.mktno ?? ''),
      mktvalue: String(row.mktvalue ?? ''),
    });
  });

  Object.keys(byCode).forEach((code) => {
    byCode[code].sort((a, b) => Number(a.mktno) - Number(b.mktno));
  });

  return byCode;
}

/**
 * Full model: date + column1/column2 groups + flat lookup by code.
 * @param {unknown} payload - Raw JSON from GetMarketsum
 */
export function buildMarketReportModel(payload) {
  const { mktdate, rows } = parseMarketSumResponse(payload);
  const byMktCode = groupMarketRowsByCode(rows);

  return {
    mktdate,
    byMktCode,
  };
}

async function fetchMarketSummary(url) {
  return fetchGet(url);
}

/**
 * @param {string} url
 * @returns {Promise<unknown[] | null>}
 */
async function fetchInterestRateArray(url) {
  try {
    const data = await fetchGet(url, { throwOnError: false });
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * @param {HTMLTableElement} table
 * @returns {HTMLTableSectionElement}
 */
function getTableBodyForDataRows(table) {
  let tbody = table.tBodies[0];
  if (!tbody) {
    tbody = document.createElement('tbody');
    const thead = table.querySelector('thead');
    if (thead) {
      table.insertBefore(tbody, thead.nextSibling);
    } else {
      table.appendChild(tbody);
    }
  }
  return tbody;
}

/**
 * @param {HTMLTableElement} table
 * @param {HTMLTableSectionElement} tbody
 */
function columnCountForInterestTable(table, tbody) {
  const firstBodyRow = tbody.querySelector('tr');
  let n = firstBodyRow?.querySelectorAll('td').length ?? 0;
  if (n === 0) {
    const headerRow = table.querySelector('thead tr');
    n = headerRow?.querySelectorAll('th, td').length ?? 0;
  }
  return n > 0 ? n : 2;
}

/**
 * @param {string[]} values
 * @param {number} colCount
 */
function padToColumnCount(values, colCount) {
  const out = values.slice(0, colCount);
  while (out.length < colCount) out.push('');
  return out;
}

/**
 * @param {HTMLTableRowElement} tr
 * @param {string[]} texts
 */
function fillInterestRateRowCells(tr, texts) {
  const cells = tr.querySelectorAll('td');
  texts.forEach((text, j) => {
    if (cells[j]) {
      if (j === 1) {
        cells[j].textContent = `${text}%`;
      } else {
        cells[j].textContent = text;
      }
    }
  });
}

/**
 * @param {string[]} texts
 * @returns {HTMLTableRowElement}
 */
function createInterestRateRow(texts) {
  const tr = document.createElement('tr');
  texts.forEach((text, i) => {
    const td = document.createElement('td');
    if (i === 1) {
      td.textContent = `${text}%`;
    } else {
      td.textContent = text;
    }
    // td.textContent = text;
    tr.appendChild(td);
  });
  return tr;
}

/**
 * @param {HTMLTableElement} table
 * @param {Array<{ LoanNameEn?: string, LoanName?: string, LoanRates?: string }>} rows
 */
function populateLoanRateTableFromApi(table, rows) {
  if (!table || !Array.isArray(rows)) return;
  const tbody = getTableBodyForDataRows(table);
  const existingRows = [...tbody.querySelectorAll('tr')];
  const colCount = columnCountForInterestTable(table, tbody);

  rows.forEach((item, i) => {
    const texts = padToColumnCount(
      [item.LoanNameEn ?? item.LoanName ?? '', item.LoanRates ?? ''],
      colCount,
    );
    if (i < existingRows.length) {
      fillInterestRateRowCells(existingRows[i], texts);
    } else {
      tbody.appendChild(createInterestRateRow(texts));
    }
  });
}

/**
 * @param {HTMLTableElement} table
 * @param {Array<{ DepositNameEn?: string, DepositName?: string, DepositRates?: string }>} rows
 */
function populateDepositRateTableFromApi(table, rows) {
  if (!table || !Array.isArray(rows)) return;
  const tbody = getTableBodyForDataRows(table);
  const existingRows = [...tbody.querySelectorAll('tr')];
  const colCount = columnCountForInterestTable(table, tbody);

  rows.forEach((item, i) => {
    const texts = padToColumnCount(
      [item.DepositNameEn ?? item.DepositName ?? '', item.DepositRates ?? ''],
      colCount,
    );
    if (i < existingRows.length) {
      fillInterestRateRowCells(existingRows[i], texts);
    } else {
      tbody.appendChild(createInterestRateRow(texts));
    }
  });
}

/**
 * @param {ParentNode} root
 * @param {unknown[] | null} loanRows
 * @param {unknown[] | null} depositRows
 */
function populateLoanAndDepositTables(root, loanRows, depositRows) {
  const lr = root.querySelector('table#lr');
  const dr = root.querySelector('table#dr');
  if (lr && loanRows) {
    populateLoanRateTableFromApi(lr, loanRows);
  }
  if (dr && depositRows) {
    populateDepositRateTableFromApi(dr, depositRows);
  }
}

/** @param {HTMLTableElement} table */
function tableUsesHeaderRowClass(table) {
  return [...table.classList].some((cls) => cls.startsWith('header-'));
}

/**
 * Prefix a positive numeric value with "+" (negative values already carry
 * their own "-" from the API; non-numeric/zero values pass through unchanged).
 * @param {string} value
 * @returns {string}
 */
function withSign(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return value;
  return `+${value}`;
}

/**
 * @param {HTMLTableElement} table
 * @param {string} tableId
 * @param {Array<{ mktvalue: string }> | undefined} tableData
 */
function populateHeaderClassTable(table, tableId, tableData) {
  if (!Array.isArray(tableData)) return;

  const bodyRows = [...table.querySelectorAll('tr')].slice(1);

  if (tableId === 'THBUSD') {
    bodyRows.forEach((row, i) => {
      const tds = row.querySelectorAll('td');
      for (let j = 1; j < tds.length - 1; j += 1) {
        const dataIndex = i * (tds.length - 2) + (j - 1);
        if (tableData[dataIndex]) {
          tds[j].textContent = tableData[dataIndex].mktvalue;
        }
      }
    });
    return;
  }

  bodyRows.forEach((row, i) => {
    const tds = row.querySelectorAll('td');
    for (let j = 1; j < tds.length; j += 1) {
      const dataIndex = i * (tds.length - 1) + (j - 1);
      if (tableData[dataIndex]) {
        if (tableId === 'GTHB' || tableId === 'USTS' || tableId === 'TSB') {
          tds[j].textContent = `${tableData[dataIndex].mktvalue}%`;
        } else if (tableId === 'WI' && j === 2) {
          tds[j].textContent = withSign(tableData[dataIndex].mktvalue);
        } else {
          tds[j].textContent = tableData[dataIndex].mktvalue;
        }
      }
    }
  });
}

/**
 * @param {HTMLTableElement} table
 * @param {string} tableId
 * @param {Array<{ mktvalue: string }> | undefined} tableData
 */
function populateStandardLayoutTable(table, tableId, tableData) {
  if (!Array.isArray(tableData)) return;

  const rows = table.querySelectorAll('tr');

  if (tableId === 'CMST') {
    rows.forEach((row, i) => {
      const tds = row.querySelectorAll('td');
      if (i === 0 && tds[0] && tableData[0]) {
        const extra = tableData[0].mktvalue ? ` ${tableData[0].mktvalue}` : '';
        tds[0].textContent = `${tds[0].textContent}${extra}`;
      }
      for (let j = 1; j < tds.length; j += 1) {
        const dataIndex = (i * (tds.length - 1)) + (j - 1) + 1;
        if (tableData[dataIndex]) {
          if (j === 1) {
            tds[j].textContent = `${tableData[dataIndex].mktvalue} $/Barrel`;
          } else if (j === 2) {
            tds[j].textContent = `${tableData[dataIndex].mktvalue} $/Ounce`;
          } else {
            tds[j].textContent = tableData[dataIndex].mktvalue;
          }
        }
      }
    });
    return;
  }

  rows.forEach((row, i) => {
    const tds = row.querySelectorAll('td');

    for (let j = 1; j < tds.length; j += 1) {
      const dataIndex = i * (tds.length - 1) + (j - 1);

      if (tableData[dataIndex]) {
        if (tableId === 'MMR' || tableId === 'USIR') {
          tds[j].textContent = `${tableData[dataIndex].mktvalue}%`;
        } else if (tableId === 'RR' && dataIndex === 0) {
          tds[j].textContent = tableData[dataIndex].mktvalue;
        } else if (tableId === 'RR' && dataIndex !== 0) {
          tds[j].textContent = `${withSign(tableData[dataIndex].mktvalue)} Baht`;
        } else {
          tds[j].textContent = tableData[dataIndex].mktvalue;
        }
      }
    }
  });
}

/**
 * @param {HTMLElement} panel
 * @param {Record<string, Array<{ mktcode: string, mktno: string, mktvalue: string }>>} byMktCode
 */
function populateTablesInPanel(panel, byMktCode) {
  [...panel.querySelectorAll('table')].forEach((table) => {
    const tableId = table.getAttribute('id')?.toUpperCase();
    if (!tableId) return;
    const tableData = byMktCode[tableId];
    if (tableUsesHeaderRowClass(table)) {
      populateHeaderClassTable(table, tableId, tableData);
    } else {
      populateStandardLayoutTable(table, tableId, tableData);
    }
  });
}

/**
 * Appends each row's mktvalue as parsed HTML (entities and tags like &nbsp;, <br>).
 * Inserts a leading space before the first non-empty row and a line break before the second.
 * @param {HTMLElement} container
 * @param {Array<{ mktvalue: string }> | undefined} rows
 */
function appendMktValuesAsHtml(container, rows) {
  if (!container || !Array.isArray(rows)) {
    return { heading: null, para: null };
  }
  const html = container.innerHTML;
  const updatedHtml = `
    ${html} <span>${rows[0].mktvalue.trim()}</span>
  `;
  container.innerHTML = updatedHtml;
  container.classList.add('market-report-author');
  const p = document.createElement('p');
  p.innerHTML = rows[1].mktvalue;

  return { heading: container, para: p };
}

/**
 * Appends FXMO values from the API to the first direct child of `.table-wrapper`.
 * @param {HTMLElement} tableWrapper
 * @param {Record<string, Array<{ mktcode: string, mktno: string, mktvalue: string }>>} tableData
 */
export function populateFxmo(tableWrapper, tableData, wrapperDiv) {
  const row = tableWrapper.children[0];
  if (!row) return;
  const { heading, para } = appendMktValuesAsHtml(row, tableData.FXMO);
  if (heading) wrapperDiv.appendChild(heading);
  if (para) wrapperDiv.appendChild(para);
}

/**
 * Appends TBMO values from the API to the second direct child of `.table-wrapper`.
 * @param {HTMLElement} tableWrapper
 * @param {Record<string, Array<{ mktcode: string, mktno: string, mktvalue: string }>>} tableData
 */
export function populateTbmo(tableWrapper, tableData, wrapperDiv) {
  const row = tableWrapper.children[0];
  if (!row) return;
  const { heading, para } = appendMktValuesAsHtml(row, tableData.TBMO);
  if (heading) wrapperDiv.appendChild(heading);
  if (para) wrapperDiv.appendChild(para);
}

/**
 * @param {HTMLElement[]} children
 */
function indexOfChildContainingRR(children) {
  return children.findIndex(
    (el) => el.querySelector?.('table#rr') || el.querySelector?.('table[id="RR"]'),
  );
}

/**
 * @param {HTMLElement[]} children
 * @param {number} blockIndex
 */
function indexOfPrecedingHeading(children, blockIndex) {
  for (let j = blockIndex - 1; j >= 0; j -= 1) {
    const { tagName } = children[j];
    if (tagName && /^H[1-6]$/i.test(tagName)) return j;
  }
  return blockIndex;
}

/**
 * Index of last <p> after the last div.table.block (exclusive end for right column).
 * @param {HTMLElement[]} children
 */
function indexAfterWhichRightColumnEnds(children) {
  const lastTableBlockIdx = children.reduce(
    (last, el, i) => (el.matches?.('div.table.block') ? i : last),
    -1,
  );
  if (lastTableBlockIdx < 0) return children.length;

  let lastPAfterLastTable = -1;
  for (let i = lastTableBlockIdx + 1; i < children.length; i += 1) {
    if (children[i].tagName === 'P') {
      lastPAfterLastTable = i;
    }
  }
  return lastPAfterLastTable >= 0 ? lastPAfterLastTable : children.length;
}

/**
 * @param {HTMLElement[]} leftNodes
 * @param {HTMLElement[]} rightNodes
 * @returns {HTMLDivElement}
 */
function buildTwoColumnPageLayout(leftNodes, rightNodes) {
  const pageLayout = document.createElement('div');
  pageLayout.classList.add('market-report-page');

  const leftCol = document.createElement('div');
  leftCol.className = 'market-report-col-left';
  leftNodes.forEach((node) => leftCol.appendChild(node));

  const rightCol = document.createElement('div');
  rightCol.className = 'market-report-col-right';
  rightNodes.forEach((node) => rightCol.appendChild(node));

  const inner = document.createElement('div');
  inner.className = 'market-report-col';
  inner.appendChild(leftCol);
  inner.appendChild(rightCol);

  const content = document.createElement('div');
  content.className = 'market-report-page-content';
  content.appendChild(inner);
  pageLayout.appendChild(content);
  return pageLayout;
}

/**
 * Split at heading before table#rr; right column excludes trailing footnote <p>.
 * @param {HTMLElement} tableWrapper
 */
function applyTableWrapperPageLayout(tableWrapper) {
  if (tableWrapper.querySelector(':scope > .market-report-page')) return;

  const wrapperChildren = [...tableWrapper.children];
  const rrBlockIndex = indexOfChildContainingRR(wrapperChildren);
  if (rrBlockIndex === -1) return;

  const splitRightStart = indexOfPrecedingHeading(wrapperChildren, rrBlockIndex);
  const rightEndExclusive = indexAfterWhichRightColumnEnds(wrapperChildren);

  const pageLayout = buildTwoColumnPageLayout(
    wrapperChildren.slice(0, splitRightStart),
    wrapperChildren.slice(splitRightStart, rightEndExclusive),
  );
  tableWrapper.insertBefore(pageLayout, tableWrapper.firstChild);
}

/**
 * Month names for the market report date
 */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Convert API date `DD/MM/YYYY` to display form `D Month YYYY`.
 * @param {string | null | undefined} mktdate
 * @returns {string}
 */
function formatMarketReportDate(mktdate) {
  if (!mktdate) return '';
  const parts = mktdate.split('/');
  if (parts.length !== 3) return mktdate;
  const [day, month, year] = parts;
  const monthIndex = parseInt(month, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return mktdate;
  return `${parseInt(day, 10)} ${MONTH_NAMES[monthIndex]} ${year}`;
}

/**
 * @returns {Promise<{
 *   model: ReturnType<typeof buildMarketReportModel>,
 *   loanRows: unknown[] | null,
 *   depositRows: unknown[] | null,
 * }>}
 */
async function fetchMarketReportData() {
  const [configs] = await Promise.all([fetchConfigs()]);
  const [summaryPayload, loanRows, depositRows] = await Promise.all([
    fetchMarketSummary(configs.marketReportSummaryUrl),
    fetchInterestRateArray(configs.marketReportLoanRateUrl),
    fetchInterestRateArray(configs.marketReportDepositRateUrl),
  ]);
  return {
    model: buildMarketReportModel(summaryPayload),
    loanRows,
    depositRows,
  };
}

/* Get the first tab panel */
/** @returns {HTMLElement | null} */
function getFirstTabPanel() {
  return document.querySelector('[role="tabpanel"]');
}

/** @param {HTMLElement} panel */
function getMarketReportTabsContent(panel) {
  return panel.closest('.tabs-content');
}

/** @param {HTMLElement} panel */
function showMarketReportLoader(panel) {
  const tabsContent = getMarketReportTabsContent(panel);
  if (!tabsContent) return;

  tabsContent.classList.add('market-report-is-loading');
  tabsContent.setAttribute('aria-busy', 'true');

  const tabsRoot = tabsContent.parentElement;
  if (!tabsRoot?.querySelector('.market-report-loader')) {
    const loader = document.createElement('div');
    loader.className = 'market-report-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-label', 'Loading market report');
    tabsContent.before(loader);
  }
}

/** @param {HTMLElement} panel */
function hideMarketReportLoader(panel) {
  const tabsContent = getMarketReportTabsContent(panel);
  const tabsRoot = tabsContent?.parentElement;

  tabsContent?.classList.remove('market-report-is-loading');
  tabsContent?.classList.add('market-report-ready');
  tabsContent?.removeAttribute('aria-busy');
  tabsRoot?.querySelector('.market-report-loader')?.remove();
}

/* Style the headings before the button containers (Title & More) */
/** @param {ParentNode} panel */
function styleHeadingsBeforeButtonContainers(panel) {
  panel.querySelectorAll('.button-container').forEach((btnContainer) => {
    const prevElem = btnContainer.previousElementSibling;
    if (prevElem?.tagName?.match(/^H[1-6]$/)) {
      prevElem.style.display = 'inline-block';
    }
  });
}
/**
 * Style the text-small class to the paragraphs following the tables
 */
/** @param {ParentNode} panel */
function applyTextSmallToTableFollowParagraphs(panel) {
  const followingPTags = panel.querySelectorAll('.table + p');
  followingPTags.forEach((pTag, idx) => {
    if (idx < followingPTags.length) {
      pTag.classList.add('text-small');
    }
  });
}

function printElement() {
  // Clone the container to avoid changing the DOM
  const originalContent = document.querySelector('main');
  const content = originalContent ? originalContent.cloneNode(true) : null;
  if (!content) return;

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
      
    .tabs-dropdown {
      display: none;
    }
    
    .tabs-nav-wrapper .tabs-nav {
     display: block;
    }

    .market-report-page a.print-button.icon-print {
      display: none;
    }

    .table table tr td {
      padding: 0.3125rem 0.75rem;
    }

    .table-wrapper {
      font-size: 0.75rem;
    }

    .market-report-page .table table tr td,
    .market-report-page .table table[class*="header-"] tr.header-row td {
      height: 1rem;
    }

    .table table.outline-border {
      border: none;
    }

    tr {
      border-block: 0.0625rem solid var(--bbl-color-grey-30);
    }

    .market-report-page .button-container {
      display: none;
    }

    .table table.header-blue tr.header-row {
      border-block: 0.125rem solid black;
    }

    .table table tr.header-row td ,
    .table table tr:not(.header-row) td {
      padding: 0.1875rem 0.75rem;
      font-size: 0.75rem;
      
    }

    .market-report-col-left :is(h1, h2, h3, h4, h5, h6), .market-report-col-right :is(h1, h2, h3, h4, h5, h6) {
      font-size: 0.875rem;
    }

    .market-report-page .table.block {
      margin: 1rem 0 2rem;
    }

    .tabs.simple-tab .tabs-nav {
      padding-bottom: 0;
      margin-top: 0;
    }
    
    .market-report-col {
      gap: 0;
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
      <link rel="stylesheet" href="/blocks/tabs/tabs.css">
      <link rel="stylesheet" href="/blocks/table/table.css">
      <link rel="stylesheet" href="/blocks/market-report/market-report.css">
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
      ${content.innerHTML.trim()}
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
/* Create the top row of the market report */
/**
 * @param {string} formattedDate
 * @param {HTMLElement} tableWrapper
 * @returns {HTMLDivElement}
 */
function createMarketReportTopRow(formattedDate) {
  const topRow = document.createElement('div');
  topRow.className = 'market-report-top-row';

  const dateDiv = document.createElement('h3');
  dateDiv.className = 'market-report-date';
  dateDiv.textContent = formattedDate;

  const printButton = document.createElement('a');
  printButton.className = 'print-button icon-print';
  printButton.href = '#';
  printButton.textContent = 'Print';
  printButton.addEventListener('click', (e) => {
    e.preventDefault();
    printElement();
  });

  topRow.append(dateDiv, printButton);
  return topRow;
}

/* Decorate the table wrapper */
/**
 * @param {HTMLElement} tableWrapper
 * @param {Record<string, Array<{ mktcode: string, mktno: string, mktvalue: string }>>} byMktCode
 * @param {HTMLDivElement} topRow
 */
function decorateTableWrapper(tableWrapper, byMktCode, topRow) {
  const writtenBy = document.createElement('div');
  writtenBy.classList.add('market-report-written-by');
  populateFxmo(tableWrapper, byMktCode, writtenBy);
  populateTbmo(tableWrapper, byMktCode, writtenBy);
  applyTableWrapperPageLayout(tableWrapper);

  const leftCol = tableWrapper.querySelector('.market-report-col-left');
  if (!leftCol) return;

  leftCol.insertBefore(writtenBy, leftCol.firstChild);
  leftCol.insertBefore(topRow, writtenBy);
}

/* Populate the panel tables */
/**
 * @param {ParentNode} panel
 * @param {ReturnType<typeof buildMarketReportModel>} model
 * @param {unknown[] | null} loanRows
 * @param {unknown[] | null} depositRows
 */
function populatePanelTables(panel, model, loanRows, depositRows) {
  populateTablesInPanel(panel, model.byMktCode);
  populateLoanAndDepositTables(panel, loanRows, depositRows);
}

function createMarketReportColumns({
  leftHeading,
  leftTable,
  rightHeading,
  rightTable,
  rightPTag,
  afterElement,
}) {
  const columnsWrapper = document.createElement('div');
  columnsWrapper.classList.add('market-report-col');

  const leftCol = document.createElement('div');
  leftCol.classList.add('market-report-col-left');

  const rightCol = document.createElement('div');
  rightCol.classList.add('market-report-col-right');

  if (leftHeading) leftCol.appendChild(leftHeading);
  if (leftTable) leftCol.appendChild(leftTable);

  if (rightHeading) rightCol.appendChild(rightHeading);
  if (rightTable) rightCol.appendChild(rightTable);
  if (rightPTag) rightCol.appendChild(rightPTag);

  columnsWrapper.appendChild(leftCol);
  columnsWrapper.appendChild(rightCol);

  if (afterElement && afterElement.parentNode) {
    afterElement.after(columnsWrapper);
  }
}

/* Setup the Othbis and Gthb columns */
/** @param {ParentNode} panel */
function setupOthbisGthbColumns(panel) {
  const othbisTable = panel.querySelector('table#othbis');
  const gthbTable = panel.querySelector('table#gthb');
  const insertAfter = panel.querySelector('table#wgs')?.parentElement;
  if (!othbisTable || !gthbTable || !insertAfter) return;

  const othbisParent = othbisTable.parentElement;
  const gthbParent = gthbTable.parentElement;
  createMarketReportColumns({
    leftHeading: othbisParent?.previousElementSibling ?? null,
    leftTable: othbisParent,
    rightHeading: gthbParent?.previousElementSibling ?? null,
    rightTable: gthbParent,
    rightPTag: gthbParent?.nextElementSibling ?? null,
    afterElement: insertAfter,
  });
}

/**
 * Some content authoring produces separate default-content-wrapper/table-wrapper
 * sibling pairs (one pair per field) instead of one continuous table-wrapper
 * holding every heading/table in document order. The rest of this file's layout
 * logic (applyTableWrapperPageLayout, populateFxmo/populateTbmo, and the
 * left/right split it builds) was written for — and is proven correct against —
 * that single flat continuous shape. Rather than rewriting that proven logic,
 * normalize the DOM to match it: merge every such wrapper's children into one
 * new table-wrapper, in document order, before any of the existing decoration
 * runs.
 * @param {HTMLElement} panel
 */
function flattenMarketReportContent(panel) {
  const wrappers = [...panel.querySelectorAll(':scope > .default-content-wrapper, :scope > .table-wrapper')];
  if (wrappers.length <= 1) return;

  const target = document.createElement('div');
  target.className = 'table-wrapper';
  wrappers[0].before(target);

  wrappers.forEach((wrapper) => {
    while (wrapper.firstChild) {
      target.appendChild(wrapper.firstChild);
    }
    wrapper.remove();
  });
}

export default async function decorate(block) {
  const panel = getFirstTabPanel();
  if (!panel) return;

  // market-report always populates the page's first tab panel rather than its
  // own block element. If a second market-report block instance exists on the
  // same page (e.g. a leftover duplicate in authoring), it has nothing of its
  // own to render into and would otherwise leave an empty shell behind.
  if (panel.dataset.marketReportDecorated === 'true') {
    block?.remove();
    return;
  }
  panel.dataset.marketReportDecorated = 'true';

  flattenMarketReportContent(panel);

  showMarketReportLoader(panel);
  try {
    const { model, loanRows, depositRows } = await fetchMarketReportData();
    const formattedDate = formatMarketReportDate(model.mktdate);

    populatePanelTables(panel, model, loanRows, depositRows);

    styleHeadingsBeforeButtonContainers(panel);
    applyTextSmallToTableFollowParagraphs(panel);
    setupOthbisGthbColumns(panel);

    const tableWrapper = panel.querySelector('.table-wrapper');
    if (!tableWrapper) return;

    const topRow = createMarketReportTopRow(formattedDate);
    decorateTableWrapper(tableWrapper, model.byMktCode, topRow);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('market-report:', err);
  } finally {
    hideMarketReportLoader(panel);
  }
}

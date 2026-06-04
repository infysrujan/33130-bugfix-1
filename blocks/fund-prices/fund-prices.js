import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import { buildBlock, decorateBlock, loadBlock } from '../../scripts/aem.js';
import {
  getApiUrls,
  fetchNavEnabledDaysForMonth,
  parseLocalDateFromYmd,
} from '../fund-prices-table/fund-prices-table.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import { MAX_FUND_PRICE_HISTORY_YEARS } from '../fund-prices-dropdown/fund-prices-dropdown.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

function moveSearchBarToHeader(el, doc) {
  const check = () => {
    const headerNav = doc.querySelector('.header-nav');
    if (!headerNav) return false;
    const headerBlock = headerNav.closest('.header') || headerNav.parentElement;
    if (!headerBlock) return false;
    el.classList.add('is-in-header');
    doc.body.classList.add('fund-prices-search-in-header');
    headerBlock.appendChild(el);
    const h1 = doc.querySelector('h1');
    if (h1) {
      h1.classList.add('fund-prices-page-title');
    }
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

function printContent(containerEl) {
  if (!containerEl) return;
  const clone = containerEl.cloneNode(true);
  const printHideSelectors = '.fund-prices-print-label, .fund-prices-error-message, .fund-prices-search-bar';
  clone.querySelectorAll(printHideSelectors).forEach((el) => el.remove());
  const inp = clone.querySelector('.calendar-input input');
  if (inp) inp.parentNode?.replaceChild(document.createTextNode(inp.value), inp);
  const orig = document.body.innerHTML;
  document.body.innerHTML = clone.outerHTML;
  window.print();
  document.body.innerHTML = orig;
  window.location.reload();
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

// ─── Parse EDS block data ─────────────────────────────────────────────────────

async function parseBlockData(block) {
  const rows = Array.from(block.children);
  const ph = await fetchPlaceholders();
  return {
    dateLabelHtml: richTextFromRow(rows[0]),
    printLabelHtml: richTextFromRow(rows[1]),
    errorMessageHtml: richTextFromRow(rows[2]),
    disclaimerHtml: richTextFromRow(rows[3]),
    searchLabel: rows[4]?.querySelector('p')?.textContent?.trim() || ph.fundPricesSearchLabel || 'Search Fund',
    goLabel: rows[5]?.querySelector('p')?.textContent?.trim() || ph.fundPricesGoLabel || 'GO',
    allFundsLabel: rows[6]?.querySelector('p')?.textContent?.trim() || ph.fundPricesAllFundsLabel || 'ALL FUNDS',
  };
}

// ─── DOM builders ─────────────────────────────────────────────────────────────

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

  const lang = getLang();
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
    searchLabel, goLabel, allFundsLabel,
  } = await parseBlockData(block);

  block.innerHTML = '';

  const pageHeading = section?.querySelector('.default-content-wrapper h1, .default-content-wrapper h2, .default-content-wrapper h3');
  if (pageHeading && pageHeading.tagName !== 'H2') {
    const h2 = doc.createElement('h2');
    h2.id = pageHeading.id;
    h2.className = pageHeading.className;
    h2.innerHTML = pageHeading.innerHTML;
    pageHeading.replaceWith(h2);
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

  const ftBlock = section?.querySelector('.fund-prices-table');

  let funds = [];
  let latestMdate = null;
  let calendarDate = new Date();
  let currentDate = calendarDate;

  try {
    const { ALL_FUND_NAMES_URL, LATEST_DATE_URL } = await getApiUrls();
    const [latestJson, namesData] = await Promise.all([
      fetchGet(LATEST_DATE_URL, { throwOnError: false }),
      fetchGet(ALL_FUND_NAMES_URL, { throwOnError: false }),
    ]);
    if (latestJson) {
      const rawDate = Array.isArray(latestJson) ? latestJson[0]?.mDate : latestJson?.mDate;
      latestMdate = rawDate ? rawDate.split('T')[0] : null;
      const parsed = latestMdate ? parseLocalDateFromYmd(latestMdate) : null;
      if (parsed) { calendarDate = parsed; currentDate = parsed; }
    }
    if (namesData) {
      funds = Array.isArray(namesData) ? namesData : [];
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('fund-prices: init failed', e);
  }

  function dispatchTableRefresh(date) {
    ftBlock?.dispatchEvent(new CustomEvent('fund-prices-table:refresh', {
      detail: { date, latestDate: latestMdate },
    }));
  }

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
      dispatchTableRefresh(selectedDate);
    },
  });

  const toolbar = doc.createElement('div');
  toolbar.className = 'fund-prices-toolbar';
  toolbar.appendChild(calendarWrapper);
  toolbar.appendChild(printLabel);

  mainView.append(toolbar, errorMessage);
  root.appendChild(mainView);

  block.appendChild(root);

  if (ftBlock) {
    if (ftBlock.dataset.ready === 'true') {
      dispatchTableRefresh(calendarDate);
    } else {
      ftBlock.addEventListener('fund-prices-table:ready', () => dispatchTableRefresh(calendarDate), { once: true });
    }
  }

  if (ftBlock) {
    ftBlock.after(disclaimer);
  } else {
    mainView.appendChild(disclaimer);
  }

  /* ── Print handler ── */
  printLabel.addEventListener('click', (e) => {
    e.preventDefault();
    printContent(section ?? root);
  });

  /* ── Dynamically build and load fund-prices-dropdown block ── */
  const fddRawBlock = buildBlock('fund-prices-dropdown', []);
  root.appendChild(fddRawBlock);
  decorateBlock(fddRawBlock);
  await loadBlock(fddRawBlock);

  const fddBlock = root.querySelector('.fund-prices-dropdown');

  /* ── Show/hide helpers ── */
  function showMainView() {
    mainView.classList.remove('hidden');
    if (ftBlock) ftBlock.classList.remove('hidden');
    fundSelector.el.classList.remove('hidden');
    doc.body.classList.remove('fund-prices-detail-active');
    fddBlock?.dispatchEvent(new CustomEvent('fund-prices-dropdown:hide'));
  }

  function showDetailView(fund) {
    mainView.classList.add('hidden');
    if (ftBlock) ftBlock.classList.add('hidden');
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
      dispatchTableRefresh(currentDate);
    }
  });

  /* ── Back button from dropdown ── */
  fddBlock?.addEventListener('fund-prices-dropdown:back', () => {
    showMainView();
    fundSelector.resetToAll();
    dispatchTableRefresh(currentDate);
  });
}

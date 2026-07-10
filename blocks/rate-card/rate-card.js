import { fetchConfigs } from '../../scripts/config.js';
import { createElementFromHTML, moveInstrumentation } from '../../scripts/scripts.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import { decorateButtonsV1 } from '../../scripts/bbl-decorators.js';

/**
 * Format date string from API format to display format
 * @param {string} dateString - Date string in format DD/MM/YYYY or YYYY-MM-DD
 * @param {string} timeString - Optional time string in format HH:MM
 * @returns {string} - Formatted date string
 */
function formatDate(dateString, timeString = '') {
  if (!dateString) return '';

  try {
    let formattedDate = '';

    // Handle DD/MM/YYYY format
    if (dateString.includes('/')) {
      const [day, month, year] = dateString.split('/');
      const date = new Date(year, month - 1, day);
      formattedDate = `as of ${day} ${date.toLocaleString('en-US', { month: 'long' })} ${year}`;
    } else if (dateString.includes('-')) {
      // Handle YYYY-MM-DD format
      const date = new Date(dateString);
      formattedDate = `as of ${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`;
    } else {
      formattedDate = `as of ${dateString}`;
    }

    // Add time if provided
    if (timeString && timeString.trim()) {
      formattedDate += ` at ${timeString.trim()}`;
    }

    return formattedDate;
  } catch (error) {
    return dateString ? `as of ${dateString}` : '';
  }
}

/**
 * Fetch data from API
 * @param {string} url - API URL
 * @returns {Promise<any>} - API response data
 */
async function fetchAPIData(url) {
  try {
    if (!url) {
      throw new Error('API URL not provided');
    }

    return fetchGet(url);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('API fetch error:', error);
    return null;
  }
}

/**
 * Create a tab id from the card name
 * @param {string} cardName - Tab name
 * @returns {string} - Safe id value
 */
function createTabId(cardName) {
  return cardName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Create table element with data
 * @param {Array} columnNames - Column names from RTE
 * @param {Array} data - Data array from API
 * @param {string} dataType - Type of data: 'exchange', 'deposit', 'loan', 'fund'
 * @param {Element} sourceElement - Original authored element for instrumentation
 * @returns {Element} - Table or empty state element
 */
function createTableElement(columnNames, data, dataType, sourceElement) {
  if (!data || data.length === 0) return null;

  let element;

  {
    const thead = `
      <thead>
        <tr>
          ${columnNames.map((name) => `<th>${name.split('#')[0].trim()}</th>`).join('')}
        </tr>
      </thead>
    `;

    let tbody = '<tbody>';

    if (dataType === 'exchange') {
      const defaultFields = ['BuyingRates', 'SellingRates'];
      // columnNames[0] is the currency column; rest are rate columns with optional #ApiKey hint
      const rateColumns = columnNames.slice(1).map((name, i) => {
        const [, hint] = name.split('#');
        return hint ? hint.trim() : defaultFields[i];
      });

      tbody += data.map((item) => {
        const familyText = (item.Family || '').replace(/\d/g, '');
        const rateCells = rateColumns.map((field) => `<td>${item[field]?.trim() || '-'}</td>`).join('');
        return `
        <tr>
          <td>
            <div class="country-select">
              <img src="/icons/${item.Family}.svg" alt="${item.Family}" loading="lazy">
              <span>${familyText}</span>
            </div>
          </td>
          ${rateCells}
        </tr>
      `;
      }).join('');
    } else if (dataType === 'deposit') {
      tbody += data.map((item) => `
        <tr>
          <td>${item.DepositNameEn || '-'}</td>
          <td class="text-right"><span class="percent">${item.DepositRates || '0.00'}</span></td>
        </tr>
      `).join('');
    } else if (dataType === 'loan') {
      tbody += data.map((item) => `
        <tr>
          <td>${item.LoanNameEn || '-'}</td>
          <td class="text-right"><span class="percent">${item.LoanRates || '0.00'}</span></td>
        </tr>
      `).join('');
    } else if (dataType === 'fund') {
      tbody += data.map((item) => `
        <tr>
          <td>${item.mf_sEng || item.FundName || '-'}</td>
          <td>${item.mfr_fNav || item.NAV || '-'}</td>
        </tr>
      `).join('');
    }

    tbody += '</tbody>';
    element = createElementFromHTML(`<table>${thead}${tbody}</table>`, document);
  }

  if (sourceElement) {
    moveInstrumentation(sourceElement, element);
  }

  return element;
}

/**
 * Returns the authored anchor from the button cell as-is,
 * preserving classes applied by decorateButtonsV1.
 * @param {Object} buttonData - Button data from block
 * @returns {Element|null} - Anchor element
 */
function createButtonElement(buttonData) {
  const { sourceElement } = buttonData;
  const a = sourceElement?.querySelector('a');
  if (!a) return null;
  moveInstrumentation(sourceElement, a);
  return a;
}

/**
 * Parse column names from RTE content
 * @param {Element} rteElement - RTE element containing column names
 * @returns {Array} - Array of column name strings
 */
function parseColumnNames(rteElement) {
  if (!rteElement) return [];

  const ul = rteElement.querySelector('ul');
  if (!ul) return [];

  const listItems = ul.querySelectorAll('li');
  return Array.from(listItems).map((li) => li.textContent.trim());
}

/**
 * Append footer metadata below a table
 * @param {Element} container - Table container element
 * @param {string} dateString - Date string
 * @param {string} timeString - Time string
 * @param {Object} buttonData - Button data
 */
function appendTableMeta(container, dateString, timeString, buttonData) {
  const buttonElement = createButtonElement(buttonData);

  if (!dateString && !buttonElement) {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'default-wrap';

  if (dateString) {
    const dateWrap = document.createElement('span');
    dateWrap.className = 'text-x-small';

    const dateUpdate = document.createElement('span');
    dateUpdate.className = 'date-update';
    dateUpdate.textContent = formatDate(dateString, timeString);
    dateWrap.appendChild(dateUpdate);
    wrapper.appendChild(dateWrap);
  }

  if (buttonElement) {
    wrapper.appendChild(buttonElement);
  }

  container.appendChild(wrapper);
}

/**
 * Create tab content with tables
 * @param {Object} tabData - Tab data object
 * @param {Object} apiData - API data for all endpoints
 * @returns {Element} - Tab content element
 */
function createTabContent(tabData, apiData) {
  const {
    cardName,
    tableCount,
    table1Data,
    table2Data,
  } = tabData;

  // Determine data type based on card name
  let dataType1 = 'exchange';
  let dataType2 = 'exchange';
  let apiData1 = apiData.exchange || [];
  let apiData2 = apiData.exchange || [];
  let dateString1 = '';
  let timeString1 = '';
  let dateString2 = '';
  const timeString2 = '';

  const cardNameLower = cardName.toLowerCase();

  if (cardNameLower.includes('exchange')) {
    dataType1 = 'exchange';
    apiData1 = apiData.exchange || [];
    dateString1 = apiData.exchangeDate || '';
    timeString1 = apiData.exchangeTime || '';
  } else if (cardNameLower.includes('rate')) {
    // Rates tab has both deposit and loan
    dataType1 = 'deposit';
    dataType2 = 'loan';
    apiData1 = apiData.deposit || [];
    apiData2 = apiData.loan || [];
    dateString1 = apiData.depositDate || '';
    dateString2 = apiData.loanDate || '';
  } else if (cardNameLower.includes('nav')) {
    // NAV tab has both BBL and BCAP funds
    dataType1 = 'fund';
    dataType2 = 'fund';
    apiData1 = apiData.bblFund || [];
    apiData2 = apiData.bcapFund || [];
    dateString1 = apiData.bblFundDate || '';
    dateString2 = apiData.bcapFundDate || '';
  }

  const content = document.createElement('div');
  content.className = 'inner';

  // Table 1 — only render when API returned data
  if (table1Data) {
    const tableElement = createTableElement(
      table1Data.columnNames,
      apiData1,
      dataType1,
      table1Data.sourceElement,
    );
    if (tableElement) {
      const list = document.createElement('div');
      list.className = 'currency-list';
      list.appendChild(tableElement);
      appendTableMeta(list, dateString1, timeString1, table1Data.button);
      content.appendChild(list);
    }
  }

  // Table 2 — only render when API returned data
  if (tableCount === '2' && table2Data) {
    const tableElement = createTableElement(
      table2Data.columnNames,
      apiData2,
      dataType2,
      table2Data.sourceElement,
    );
    if (tableElement) {
      const list = document.createElement('div');
      list.className = 'currency-list full';
      list.appendChild(tableElement);
      appendTableMeta(list, dateString2, timeString2, table2Data.button);
      content.appendChild(list);
    }
  }

  return content;
}

/**
 * Activate a specific tab
 * @param {Element} block - Rate card block element
 * @param {number} index - Index of tab to activate
 */
function activateTab(block, index) {
  const tabHeaders = block.querySelectorAll('.tab-header li');
  const tabContents = block.querySelectorAll('[data-tab-content] > div');

  tabHeaders.forEach((header, i) => {
    const link = header.querySelector('a');
    if (i === index) {
      link?.classList.add('active');
    } else {
      link?.classList.remove('active');
    }
  });

  tabContents.forEach((content, i) => {
    if (i === index) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

/**
 * Decorate the rate card block
 * @param {Element} block - The rate card block element
 */
export default async function decorate(block) {
  decorateButtonsV1(block);

  // Fetch configs for API URLs
  const configs = await fetchConfigs();

  const exchangeRateAPI = configs?.rateCardGetFxBanner || '';
  const depositRateAPI = configs?.rateCardGetDepositRate || '';
  const loanRateAPI = configs?.rateCardGetLoanRate || '';
  const bblFundAPI = configs?.rateCardGetFundPriceService || '';
  const bcapFundAPI = configs?.rateCardGetFundBanner || '';

  // Parse block content
  const items = Array.from(block.children);
  const tabsData = [];

  items.forEach((item) => {
    const divs = Array.from(item.children);

    const cardName = divs[0]?.textContent.trim() || '';
    const tableCount = divs[1]?.textContent.trim() || '1';

    // Table 1 data
    const table1ColumnNamesDiv = divs[2];
    const table1ButtonDiv = divs[3];
    const table1ColumnNames = parseColumnNames(table1ColumnNamesDiv);

    const table1Button = { sourceElement: table1ButtonDiv };

    const tabData = {
      cardName,
      sourceElement: item,
      titleSourceElement: divs[0],
      tableCount,
      table1Data: {
        columnNames: table1ColumnNames,
        sourceElement: table1ColumnNamesDiv,
        button: table1Button,
      },
    };

    // Table 2 data (if tableCount is 2)
    if (tableCount === '2' && divs.length > 5) {
      const table2ColumnNamesDiv = divs[5];
      const table2ButtonDiv = divs[6];
      const table2ColumnNames = parseColumnNames(table2ColumnNamesDiv);

      const table2Button = { sourceElement: table2ButtonDiv };

      tabData.table2Data = {
        columnNames: table2ColumnNames,
        sourceElement: table2ColumnNamesDiv,
        button: table2Button,
      };
    }

    tabsData.push(tabData);
  });

  // Fetch all API data
  const apiData = {
    exchange: [],
    exchangeDate: '',
    exchangeTime: '',
    deposit: [],
    depositDate: '',
    loan: [],
    loanDate: '',
    bblFund: [],
    bblFundDate: '',
    bcapFund: [],
    bcapFundDate: '',
  };

  try {
    const [exchangeData, depositData, loanData, bblFundData, bcapFundData] = await Promise.all([
      fetchAPIData(exchangeRateAPI),
      fetchAPIData(depositRateAPI),
      fetchAPIData(loanRateAPI),
      fetchAPIData(bblFundAPI),
      fetchAPIData(bcapFundAPI),
    ]);

    if (exchangeData && Array.isArray(exchangeData) && exchangeData.length > 0) {
      apiData.exchange = exchangeData.slice(0, 5); // Limit to 5 items
      apiData.exchangeDate = exchangeData[0]?.Ddate || '';
      apiData.exchangeTime = exchangeData[0]?.DTime || '';
    }

    if (depositData && Array.isArray(depositData) && depositData.length > 0) {
      apiData.deposit = depositData;
      apiData.depositDate = depositData[0]?.EffectiveDate || '';
    }

    if (loanData && Array.isArray(loanData) && loanData.length > 0) {
      apiData.loan = loanData;
      apiData.loanDate = loanData[0]?.EffectiveDate || '';
    }

    if (bblFundData && Array.isArray(bblFundData) && bblFundData.length > 0) {
      apiData.bblFund = bblFundData.slice(0, 4); // Limit to 4 items
      apiData.bblFundDate = bblFundData[0]?.mfr_dDataDate || '';
    }

    if (bcapFundData && Array.isArray(bcapFundData) && bcapFundData.length > 0) {
      apiData.bcapFund = bcapFundData.slice(0, 4); // Limit to 4 items
      apiData.bcapFundDate = bcapFundData[0]?.mfr_dDataDate || '';
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching API data:', error);
  }

  const article = document.createElement('article');
  article.className = 'currency-info';
  article.setAttribute('data-tab', '');

  const tabHeader = document.createElement('ul');
  tabHeader.className = 'tab-header';
  tabHeader.setAttribute('data-tab-header', '');

  const tabContent = document.createElement('section');
  tabContent.setAttribute('data-tab-content', '');

  const tabLinks = tabsData.map((tab, index) => {
    const tabId = createTabId(tab.cardName);
    const listItem = document.createElement('li');
    const link = document.createElement('a');

    link.href = `#${tabId}`;
    link.title = tab.cardName;
    link.textContent = tab.cardName;

    if (index === 0) {
      link.classList.add('active');
    }

    if (tab.titleSourceElement) {
      moveInstrumentation(tab.titleSourceElement, link);
    }

    listItem.appendChild(link);
    tabHeader.appendChild(listItem);

    const tabInner = createTabContent(tab, apiData);
    const hasContent = tabInner.querySelector('.currency-list');

    if (!hasContent) {
      listItem.hidden = true;
    }

    const panel = document.createElement('div');
    panel.id = tabId;
    panel.className = `inner${index === 0 ? ' active' : ''}`;
    moveInstrumentation(tab.sourceElement, panel);
    panel.appendChild(tabInner);
    tabContent.appendChild(panel);

    return link;
  });

  article.append(tabHeader, tabContent);
  block.replaceChildren(article);

  tabLinks.forEach((link, index) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activateTab(block, index);
    });
  });

  // Handle hash navigation
  const { hash } = window.location;
  if (hash) {
    const tabIndex = tabsData.findIndex(
      (tab) => `#${createTabId(tab.cardName)}` === hash,
    );
    if (tabIndex >= 0) {
      activateTab(block, tabIndex);
    }
  }
}

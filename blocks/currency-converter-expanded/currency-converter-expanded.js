import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { createElementFromHTML } from '../../scripts/scripts.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

/**
 * Format number with international comma system
 * @param {string} value - The value to format
 * @returns {string} - Formatted value
 */
function formatNumberWithCommas(value) {
  const cleanValue = value.replace(/,/g, '');
  if (!cleanValue) return '';
  const parts = cleanValue.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * Parse currency list from block
 * @param {Element} currencyListDiv - The div containing currency list
 * @returns {Array} - Array of currency objects
 */
function parseCurrencyList(currencyListDiv) {
  const currencies = [];
  const listItems = currencyListDiv?.querySelectorAll('li');

  listItems?.forEach((item) => {
    const iconImg = item?.querySelector('.icon img');
    const textContent = item?.textContent?.trim();

    if (iconImg && textContent) {
      const iconName = iconImg?.getAttribute('data-icon-name') ?? '';
      const iconSrc = iconImg?.getAttribute('src') ?? '';

      currencies.push({
        code: iconName,
        name: textContent,
        icon: iconSrc,
      });
    }
  });

  return currencies;
}

/**
 * Create currency dropdown
 * @param {Array} currencies - Array of currency objects
 * @param {string} searchPlaceholder - Placeholder text for search input
 * @param {number} activeIndex - Index of currency to set as active (default 0)
 * @returns {Element} - Dropdown element
 */
function createCurrencyDropdown(currencies, searchPlaceholder, activeIndex = 0) {
  const currencyItems = currencies.map((currency, index) => `
    <li data-currency-code="${currency?.code ?? ''}" 
        data-description="${currency?.name ?? ''}" 
        class="${index === activeIndex ? 'active' : ''}">
      <span class="currency-flag">
        <img src="${currency?.icon ?? ''}" 
             alt="${currency?.code ?? ''}" 
             loading="lazy">
      </span>
      <span>${currency?.name ?? ''}</span>
    </li>
  `).join('');

  const dropdownHTML = `
    <div class="currency-dropdown">
      <input type="text" 
             class="search-currency" 
             placeholder="${searchPlaceholder}">
      <ul class="currency-dropdown-list">
        ${currencyItems}
      </ul>
    </div>
  `;

  const dropdown = createElementFromHTML(dropdownHTML, document);
  const searchInput = dropdown.querySelector('.search-currency');
  const list = dropdown.querySelector('.currency-dropdown-list');

  // Search functionality
  searchInput?.addEventListener('input', (e) => {
    const searchTerm = e.target?.value?.toLowerCase() ?? '';
    const items = list.querySelectorAll('li');

    items.forEach((item) => {
      const description = item.dataset?.description?.toLowerCase() ?? '';
      const code = item.dataset?.currencyCode?.toLowerCase() ?? '';

      if (description.includes(searchTerm) || code.includes(searchTerm)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  });

  return dropdown;
}

/**
 * Create convert group (From or To section)
 * @param {string} label - Label text
 * @param {Array} currencies - Array of currency objects
 * @param {string} type - 'input' or 'output'
 * @param {string} searchPlaceholder - Placeholder text for search input
 * @param {number} activeIndex - Index of currency to set as active (default 0)
 * @param {Function} [onSelect] - Callback invoked with the newly selected currency code
 * @returns {Element} - Convert group element
 */
function createConvertGroup(
  label,
  currencies,
  type,
  searchPlaceholder,
  activeIndex = 0,
  onSelect = null,
) {
  // Use the specified currency index
  const defaultCurrency = currencies[activeIndex] || currencies[0] || { code: 'THB', icon: '', name: 'THB' };

  const groupHTML = `
    <div class="convert-group" id="currency${type === 'input' ? '1' : '2'}">
      <span class="guide-txt">${label}</span>
      <div class="country-select">
        <img src="${defaultCurrency?.icon ?? ''}" alt="${defaultCurrency?.code ?? ''}">
        <span class="code">${defaultCurrency?.code ?? ''}</span>
      </div>
      <span class="icon-dropdown"></span>
    </div>
  `;

  const group = createElementFromHTML(groupHTML, document);
  const countrySelect = group.querySelector('.country-select');
  const dropdownIcon = group.querySelector('.icon-dropdown');
  const flag = group.querySelector('img');
  const code = group.querySelector('.code');

  // Insert dropdown after country-select
  const dropdown = createCurrencyDropdown(currencies, searchPlaceholder, activeIndex);
  group.insertBefore(dropdown, dropdownIcon);

  // Toggle dropdown
  const toggleDropdown = () => {
    dropdown.classList.toggle('active');
    // Close other dropdowns
    document.querySelectorAll('.currency-dropdown').forEach((d) => {
      if (d !== dropdown) {
        d.classList.remove('active');
      }
    });
  };

  countrySelect?.addEventListener('click', toggleDropdown);
  dropdownIcon?.addEventListener('click', toggleDropdown);

  // Select currency from dropdown
  dropdown.querySelectorAll('li').forEach((item) => {
    item.addEventListener('click', () => {
      const selectedCode = item.dataset?.currencyCode;
      const selectedIcon = item.querySelector('img')?.src;

      if (flag) flag.src = selectedIcon;
      if (flag) flag.alt = selectedCode;
      if (code) code.textContent = selectedCode;
      onSelect?.(selectedCode);

      // Remove active class from all items and add to selected
      dropdown.querySelectorAll('li').forEach((li) => {
        li.classList.remove('active');
      });
      item.classList.add('active');

      dropdown.classList.remove('active');
      const searchInput = dropdown.querySelector('.search-currency');
      if (searchInput) searchInput.value = '';

      // Show all items again
      dropdown.querySelectorAll('li').forEach((li) => {
        li.style.display = '';
      });
    });
  });

  return group;
}

/**
 * Convert currency via API
 * @param {string} amount - Amount to convert
 * @param {string} fromCurrency - From currency code
 * @param {string} toCurrency - To currency code
 * @param {string} apiBaseUrl - Base URL for the exchange rate API
 * @returns {Promise<number>} - Converted amount
 */
async function convertCurrency(amount, fromCurrency, toCurrency, apiBaseUrl) {
  try {
    if (!apiBaseUrl) {
      throw new Error('Exchange rate service URL not configured in config.json');
    }

    // API endpoint for currency conversion
    const apiUrl = `${apiBaseUrl}${amount}/${fromCurrency}/${toCurrency}`;

    const data = await fetchGet(apiUrl);

    // The API should return the converted amount
    return data?.convertedAmount ?? data?.result ?? data;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Currency conversion error:', error);
    return null;
  }
}

/**
 * Format date from DD/MM/YYYY to "DD Month YYYY"
 * @param {string} dateString - Date in DD/MM/YYYY format
 * @returns {string} - Formatted date like "20 March 2026"
 */
function formatDate(dateString) {
  if (!dateString) return '';

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const parts = dateString.split('/');
  if (parts.length !== 3) return dateString;

  const day = parts[0];
  const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
  const year = parts[2];

  if (month >= 0 && month < 12) {
    return `${day} ${months[month]} ${year}`;
  }

  return dateString;
}

/**
 * Get date and time from API
 * @param {string} apiUrl - API URL for date/time
 * @returns {Promise<object>} - Date and time object
 */
async function getDateTime(apiUrl) {
  try {
    if (!apiUrl) {
      throw new Error('DateTime service URL not configured in config.json');
    }

    const data = await fetchGet(apiUrl);

    // Expected format: [{"Update":"6","Time":"15:25     ","Day":"18/03/2026"}]
    if (Array.isArray(data) && data.length > 0) {
      return {
        day: data[0]?.Day ?? '',
        time: data[0]?.Time ? data[0].Time.trim() : '',
      };
    }

    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('DateTime API error:', error);
    return null;
  }
}

/**
 * Decorate the currency converter expanded block
 * @param {Element} block - The currency converter block element
 */
export default async function decorate(block) {
  // Fetch placeholder and config values
  const placeholders = await fetchPlaceholders();
  const configs = await fetchConfigs();

  const searchPlaceholder = placeholders?.searchInputPlaceholder || 'Type to Search...';
  const convertFromLabel = placeholders?.convertFrom || 'CONVERT FROM';
  const convertToLabel = placeholders?.convertTo || 'CONVERT TO';
  const amountLabel = placeholders?.amount || 'AMOUNT';
  const equalsToLabel = placeholders?.equalsTo || 'equals to';
  const asOfLabel = placeholders?.asOf || 'As of';
  const atLabel = placeholders?.at || 'at';

  const apiBaseUrl = configs?.currencyConverterExchangeRateService || '';
  const dateTimeApiUrl = configs?.currencyConverterExpandedGetDateTime || '';

  if (!apiBaseUrl) {
    // eslint-disable-next-line no-console
    console.error('Exchange rate service URL not configured in config.json');
  }

  if (!dateTimeApiUrl) {
    // eslint-disable-next-line no-console
    console.error('DateTime service URL not configured in config.json');
  }

  const rows = Array.from(block.children);

  // Parse block content
  const currencyListDiv = rows[0]?.querySelector('ul');
  const buttonTitle = rows[1]?.textContent.trim() || 'CALCULATE';
  const disclaimerText = rows[2]?.innerHTML || '';

  // Parse currencies
  const currencies = parseCurrencyList(currencyListDiv);

  // Clear block
  block.innerHTML = '';

  // Create main container structure
  const mainHTML = `
    <div class="converter-expanded-container">
      <div class="converter-expanded-content">
        <div class="converter-expanded-form-wrapper">
          <div class="converter-expanded-wrapper">
            <div class="converter"></div>
            <div class="converter-expanded-button-wrapper">
              <button type="submit" 
                      name="convert-btn" 
                      id="convert-btn" 
                      class="converter-expanded-btn"
                      title="${buttonTitle}">
                ${buttonTitle}
              </button>
            </div>
          </div>
        </div>
        <div class="converter-expanded-disclaimer">
          ${disclaimerText}
        </div>
      </div>
    </div>
  `;

  const mainContainer = createElementFromHTML(mainHTML, document);
  const converter = mainContainer.querySelector('.converter');
  const calculateBtn = mainContainer.querySelector('#convert-btn');

  // Reference to the amount group's selected-currency label, set once the amount group is created
  let selectedCurrencyEl = null;

  // Create From and To groups (From uses first currency, To uses second currency)
  const fromGroup = createConvertGroup(convertFromLabel, currencies, 'input', searchPlaceholder, 0, (selectedCode) => {
    if (selectedCurrencyEl) selectedCurrencyEl.textContent = `(${selectedCode})`;
  });
  const toGroup = createConvertGroup(convertToLabel, currencies, 'output', searchPlaceholder, 1);

  // Create Amount group with template
  const amountHTML = `
    <div class="convert-group">
      <span class="guide-txt">
        ${amountLabel} <span class="selected-currency"></span>
      </span>
      <input type="text" 
             name="amount-from" 
             id="amount-from" 
             class="amount-input" 
             maxlength="11" 
             placeholder="">
    </div>
  `;

  const amountGroup = createElementFromHTML(amountHTML, document);
  selectedCurrencyEl = amountGroup.querySelector('.selected-currency');
  if (selectedCurrencyEl) {
    selectedCurrencyEl.textContent = `(${fromGroup.querySelector('.code')?.textContent ?? ''})`;
  }
  const amountInput = amountGroup.querySelector('#amount-from');

  // Format input
  amountInput?.addEventListener('input', (e) => {
    const value = e.target?.value?.replace(/[^0-9]/g, '') ?? '';

    if (e.target) e.target.value = formatNumberWithCommas(value);
  });

  // Prevent non-numeric characters
  amountInput?.addEventListener('keypress', (e) => {
    const char = String.fromCharCode(e.which ?? 0);
    if (!/[0-9]/.test(char)) {
      e.preventDefault();
    }
  });

  // Prevent copy, paste, and cut
  amountInput?.addEventListener('copy', (e) => e.preventDefault());
  amountInput?.addEventListener('paste', (e) => e.preventDefault());
  amountInput?.addEventListener('cut', (e) => e.preventDefault());

  // Append all groups to converter
  converter?.appendChild(fromGroup);
  converter?.appendChild(toGroup);
  converter?.appendChild(amountGroup);

  // Create result container
  const resultHTML = `
    <div class="converter-expanded-result" style="display: none;">
      <div class="converter-expanded-result-inner">
        <div class="converter-expanded-result-content">
          <p class="converter-expanded-result-amount"></p>
          <p class="converter-expanded-result-rate"></p>
          <p class="converter-expanded-result-timestamp"></p>
        </div>
      </div>
    </div>
  `;

  const resultContainer = createElementFromHTML(resultHTML, document);
  const resultLine1 = resultContainer.querySelector('.converter-expanded-result-amount');
  const resultLine2 = resultContainer.querySelector('.converter-expanded-result-rate');
  const resultLine3 = resultContainer.querySelector('.converter-expanded-result-timestamp');

  // Add to block
  block.appendChild(mainContainer);
  block.appendChild(resultContainer);

  // Calculate button click handler
  calculateBtn?.addEventListener('click', async () => {
    const fromCode = fromGroup.querySelector('.code')?.textContent;
    const toCode = toGroup.querySelector('.code')?.textContent;
    const amount = amountInput?.value?.replace(/,/g, '');

    if (!amount || parseFloat(amount) <= 0) {
      if (resultContainer) {
        resultContainer.classList.remove('visible');
        resultContainer.style.display = 'none';
      }
      return;
    }

    if (calculateBtn) calculateBtn.disabled = true;
    calculateBtn?.classList.add('loading');

    try {
      // Make both API calls in parallel
      const [convertedAmount, dateTimeData] = await Promise.all([
        convertCurrency(amount, fromCode, toCode, apiBaseUrl),
        getDateTime(dateTimeApiUrl),
      ]);

      if (convertedAmount !== null && convertedAmount !== undefined) {
        // Line 1: Converted amount with to currency
        const formattedAmount = formatNumberWithCommas(convertedAmount.toString());
        if (resultLine1) resultLine1.textContent = `${formattedAmount} ${toCode}`;

        // Line 2: 1 from currency equals to X to currency
        // Remove commas if the API returns formatted numbers
        const cleanConvertedAmount = convertedAmount.toString().replace(/,/g, '');
        const cleanAmount = amount.replace(/,/g, '');
        const rate = parseFloat(cleanConvertedAmount) / parseFloat(cleanAmount);
        const rateTruncated = (Math.floor(rate * 100) / 100).toFixed(2);
        const formattedRate = formatNumberWithCommas(rateTruncated);
        if (resultLine2) {
          resultLine2.innerHTML = `1<span class="from-currency"> ${fromCode} </span>${equalsToLabel}<span class="to-currency"> ${formattedRate} ${toCode}</span>`;
        }

        // Line 3: As of date at time
        if (dateTimeData && resultLine3) {
          const formattedDate = formatDate(dateTimeData?.day ?? '');
          // Build with DOM nodes to prevent XSS from API response
          resultLine3.textContent = ''; // Clear existing content
          resultLine3.appendChild(document.createTextNode(`${asOfLabel} `));

          const dateSpan = document.createElement('span');
          dateSpan.className = 'date-convert';
          dateSpan.textContent = formattedDate;
          resultLine3.appendChild(dateSpan);

          resultLine3.appendChild(document.createTextNode(` ${atLabel} `));

          const timeSpan = document.createElement('span');
          timeSpan.className = 'time-convert';
          timeSpan.textContent = dateTimeData?.time ?? '';
          resultLine3.appendChild(timeSpan);
        } else if (resultLine3) {
          resultLine3.textContent = '';
        }

        // Show result container with animation
        if (resultContainer) {
          resultContainer.style.display = 'block';
          // Force reflow to enable CSS transition
          // eslint-disable-next-line no-unused-expressions
          resultContainer.offsetHeight;
          resultContainer.classList.add('visible');
        }
      } else {
        // eslint-disable-next-line no-console
        console.error('Currency conversion failed: Invalid response from API');
        if (resultContainer) {
          resultContainer.classList.remove('visible');
          resultContainer.style.display = 'none';
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Currency conversion failed:', error);
      if (resultContainer) {
        resultContainer.classList.remove('visible');
        resultContainer.style.display = 'none';
      }
    } finally {
      if (calculateBtn) calculateBtn.disabled = false;
      calculateBtn?.classList.remove('loading');
    }
  });

  // Also convert on Enter key in amount input
  amountInput?.addEventListener('keypress', (e) => {
    if (e?.key === 'Enter') {
      calculateBtn?.click();
    }
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target?.closest('.convert-group')) {
      document.querySelectorAll('.currency-dropdown').forEach((dropdown) => {
        dropdown.classList.remove('active');
      });
    }
  });
}

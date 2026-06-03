import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';

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
  const listItems = currencyListDiv.querySelectorAll('li');

  listItems.forEach((item) => {
    const iconImg = item.querySelector('.icon img');
    const textContent = item.textContent.trim();

    if (iconImg && textContent) {
      const iconName = iconImg.getAttribute('data-icon-name') || '';
      const iconSrc = iconImg.getAttribute('src') || '';

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
 * @param {string} type - Unique identifier for dropdown (e.g., 'from' or 'to')
 * @param {number} activeIndex - Index of the currency to set as active
 * @returns {Element} - Dropdown element
 */
function createCurrencyDropdown(currencies, searchPlaceholder, type, activeIndex = 0) {
  const dropdown = document.createElement('div');
  dropdown.className = 'currency-dropdown';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-currency';
  searchInput.id = `search-currency-${type}`;
  searchInput.name = `search-currency-${type}`;
  searchInput.placeholder = searchPlaceholder;

  const list = document.createElement('ul');
  list.className = 'currency-dropdown-list';

  currencies.forEach((currency) => {
    const item = document.createElement('li');
    item.dataset.currencyCode = currency.code;
    item.dataset.description = currency.name;

    const icon = document.createElement('span');
    icon.className = 'currency-flag';
    const img = document.createElement('img');
    img.src = currency.icon;
    img.alt = currency.code;
    img.loading = 'lazy';
    icon.appendChild(img);

    const text = document.createElement('span');
    text.textContent = currency.name;

    item.appendChild(icon);
    item.appendChild(text);
    list.appendChild(item);
  });

  dropdown.appendChild(searchInput);
  dropdown.appendChild(list);

  // Set active item based on activeIndex parameter
  const allItems = list.querySelectorAll('li');
  if (allItems[activeIndex]) {
    allItems[activeIndex].classList.add('active');
  }

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const items = list.querySelectorAll('li');

    items.forEach((item) => {
      const description = item.dataset.description.toLowerCase();
      const code = item.dataset.currencyCode.toLowerCase();

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
 * @param {string} type - 'from' or 'to'
 * @param {string} searchPlaceholder - Placeholder text for search input
 * @param {number} defaultCurrencyIndex - Index of the default currency to display
 * @returns {Element} - Convert group element
 */
function createConvertGroup(label, currencies, type, searchPlaceholder, defaultCurrencyIndex = 0) {
  const group = document.createElement('div');
  group.className = 'convert-group';
  group.id = `currency-${type}`;

  const title = document.createElement('div');
  title.className = `currency-title-${type}`;
  title.textContent = label;

  const countrySelect = document.createElement('div');
  countrySelect.className = 'country-select';

  // Use specified currency index
  const defaultCurrency = currencies[defaultCurrencyIndex] || currencies[0] || { code: 'THB', icon: '', name: 'THB' };

  const flag = document.createElement('img');
  flag.src = defaultCurrency.icon;
  flag.alt = defaultCurrency.code;

  const code = document.createElement('span');
  code.className = 'code';
  code.textContent = defaultCurrency.code;

  countrySelect.appendChild(flag);
  countrySelect.appendChild(code);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'amount-input';
  input.name = `amount-${type}`;
  input.id = `amount-${type}`;
  input.placeholder = '';

  if (type === 'to') {
    input.readOnly = true;
  } else {
    // Add maxlength for "From" field
    input.maxLength = 11;

    // Format input for "From" field
    input.addEventListener('input', (e) => {
      let value = e.target.value.replace(/[^0-9.]/g, '');

      // Allow only one decimal point
      const decimalCount = (value.match(/\./g) || []).length;
      if (decimalCount > 1) {
        value = value.substring(0, value.lastIndexOf('.'));
      }

      e.target.value = formatNumberWithCommas(value);
    });

    // Prevent non-numeric characters
    input.addEventListener('keypress', (e) => {
      const char = String.fromCharCode(e.which);
      if (!/[0-9.]/.test(char)) {
        e.preventDefault();
      }
    });

    // Prevent copy, paste, and cut
    input.addEventListener('copy', (e) => e.preventDefault());
    input.addEventListener('paste', (e) => e.preventDefault());
    input.addEventListener('cut', (e) => e.preventDefault());
  }

  const dropdown = createCurrencyDropdown(
    currencies,
    searchPlaceholder,
    type,
    defaultCurrencyIndex,
  );

  const dropdownIcon = document.createElement('span');
  dropdownIcon.className = 'icon-dropdown';

  group.appendChild(title);
  group.appendChild(countrySelect);
  group.appendChild(input);
  group.appendChild(dropdown);
  group.appendChild(dropdownIcon);

  // Toggle dropdown
  countrySelect.addEventListener('click', () => {
    dropdown.classList.toggle('active');
    // Close other dropdowns
    document.querySelectorAll('.currency-dropdown').forEach((d) => {
      if (d !== dropdown) {
        d.classList.remove('active');
      }
    });
  });

  dropdownIcon.addEventListener('click', () => {
    dropdown.classList.toggle('active');
  });

  // Select currency from dropdown
  dropdown.querySelectorAll('li').forEach((item) => {
    item.addEventListener('click', () => {
      const selectedCode = item.dataset.currencyCode;
      const selectedIcon = item.querySelector('img').src;

      flag.src = selectedIcon;
      flag.alt = selectedCode;
      code.textContent = selectedCode;

      // Remove active class from all items and add to selected
      dropdown.querySelectorAll('li').forEach((li) => {
        li.classList.remove('active');
      });
      item.classList.add('active');

      dropdown.classList.remove('active');
      dropdown.querySelector('.search-currency').value = '';

      // Show all items again
      dropdown.querySelectorAll('li').forEach((li) => {
        li.style.display = '';
      });
    });
  });

  return group;
}

/**
 * Convert currency (placeholder for API)
 * @param {string} amount - Amount to convert
 * @param {string} fromCurrency - From currency code
 * @param {string} toCurrency - To currency code
 * @param {string} apiBaseUrl - Base URL for the exchange rate API
 * @returns {Promise<string>} - Converted amount
 */
async function convertCurrency(amount, fromCurrency, toCurrency, apiBaseUrl) {
  try {
    if (!apiBaseUrl) {
      throw new Error('Exchange rate service URL not configured in config.json');
    }

    // API endpoint for currency conversion
    const apiUrl = `${apiBaseUrl}${amount}/${fromCurrency}/${toCurrency}`;

    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();

    // The API should return the converted amount
    // Adjust this based on the actual API response structure
    return data.convertedAmount || data.result || data;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Currency conversion error:', error);
    // Return null to indicate conversion failed
    return null;
  }
}

/**
 * Decorate the currency converter block
 * @param {Element} block - The currency converter block element
 */
export default async function decorate(block) {
  // Fetch placeholder and config values
  const placeholders = await fetchPlaceholders();
  const configs = await fetchConfigs();

  const searchPlaceholder = placeholders?.searchInputPlaceholder || 'Type to Search...';
  const apiBaseUrl = configs?.exchangeRateService || '';

  if (!apiBaseUrl) {
    // eslint-disable-next-line no-console
    console.error('Exchange rate service URL not configured in config.json');
  }

  const rows = Array.from(block.children);

  // Parse block content
  const fromLabel = rows[0]?.textContent.trim() || placeholders?.fromLabel || 'From';
  const toLabel = rows[1]?.textContent.trim() || placeholders?.toLabel || 'To';
  const converterIconDiv = rows[2]?.querySelector('picture') || rows[2]?.querySelector('img');
  const currencyListDiv = rows[3]?.querySelector('ul');

  // Parse currencies
  const currencies = parseCurrencyList(currencyListDiv);

  // Clear block
  block.innerHTML = '';

  // Create converter container
  const converter = document.createElement('div');
  converter.className = 'converter';

  // Create From group (first currency - index 0)
  const fromGroup = createConvertGroup(fromLabel, currencies, 'from', searchPlaceholder, 0);

  // Create Convert button with icon
  const convertBtn = document.createElement('button');
  convertBtn.type = 'button';
  convertBtn.className = 'btn-convert';
  convertBtn.id = 'convert-btn';
  convertBtn.title = 'Convert';

  if (converterIconDiv) {
    const iconClone = converterIconDiv.cloneNode(true);
    convertBtn.appendChild(iconClone);
  }

  const btnText = document.createElement('span');
  btnText.textContent = 'Convert';
  convertBtn.appendChild(btnText);

  // Create To group (second currency - index 1)
  const toGroup = createConvertGroup(toLabel, currencies, 'to', searchPlaceholder, 1);

  // Add convert functionality
  convertBtn.addEventListener('click', async () => {
    const fromInput = fromGroup.querySelector('.amount-input');
    const toInput = toGroup.querySelector('.amount-input');
    const fromCode = fromGroup.querySelector('.code').textContent;
    const toCode = toGroup.querySelector('.code').textContent;

    const amount = fromInput.value.replace(/,/g, '');

    if (!amount || parseFloat(amount) <= 0) {
      toInput.value = '';
      return;
    }

    convertBtn.disabled = true;
    convertBtn.classList.add('loading');

    try {
      const result = await convertCurrency(amount, fromCode, toCode, apiBaseUrl);

      if (result !== null && result !== undefined) {
        toInput.value = formatNumberWithCommas(result);
      } else {
        // API returned an error or invalid response
        toInput.value = '';
        // eslint-disable-next-line no-console
        console.error('Currency conversion failed: Invalid response from API');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Currency conversion failed:', error);
      toInput.value = '';
    } finally {
      convertBtn.disabled = false;
      convertBtn.classList.remove('loading');
    }
  });

  // Also convert on Enter key in From input
  fromGroup.querySelector('.amount-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      convertBtn.click();
    }
  });

  // Assemble converter
  converter.appendChild(fromGroup);
  converter.appendChild(convertBtn);
  converter.appendChild(toGroup);

  block.appendChild(converter);

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.convert-group')) {
      document.querySelectorAll('.currency-dropdown').forEach((dropdown) => {
        dropdown.classList.remove('active');
      });
    }
  });
}

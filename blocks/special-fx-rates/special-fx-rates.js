import { fetchConfigs } from '../../scripts/config.js';

/**
 * Fetch FX rates from AEM config API
 */
async function fetchRates() {
  const configs = await fetchConfigs();
  const url = configs.exchangeRateServiceGetLatestRates;
  if (!url) return {};

  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const json = await res.json();

    if (Array.isArray(json)) {
      return Object.fromEntries(
        json.map((item) => [item.Family, item.SellingRates]),
      );
    }
    return json;
  } catch {
    return {};
  }
}

/**
 * Format rate with decimals
 */
function formatRate(rate, decimals = 2) {
  if (!rate) return '-';
  return Number(rate).toFixed(decimals);
}

/**
 * Format currency API keys to display labels
 */
function formatLabel(apiKey) {
  const map = {
    USD1: 'USD: 1-2',
    USD5: 'USD: 5-20',
    USD50: 'USD: 50-100',
    JPY: 'JPY (:100)',
  };
  return map[apiKey] || apiKey;
}

/**
 * Flag icon using flagcdn.com
 */
function getFlagImg(apiKey) {
  const countryCode = {
    USD1: 'us',
    USD5: 'us',
    USD50: 'us',
    EUR: 'eu',
    GBP: 'gb',
    JPY: 'jp',
    SGD: 'sg',
    HKD: 'hk',
    AUD: 'au',
    CNY: 'cn',
  };
  const code = countryCode[apiKey];
  if (!code) return null;

  const img = document.createElement('img');
  img.src = `https://flagcdn.com/32x24/${code}.png`;
  img.alt = apiKey;
  img.className = 'fx-flag';
  return img;
}

/**
 * Format date as DD/MM/YYYY HH:MM
 */
function formatDateTime() {
  const now = new Date();
  const date = now.toLocaleDateString('en-GB');
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} ${time}`;
}

/**
 * Parse a list of API keys from a richtext element.
 * Expects <ul>/<ol> with <li> items; falls back to newline-separated text.
 */
function parseApiKeys(el) {
  if (!el) return [];
  const items = [...el.querySelectorAll('li')];
  if (items.length) {
    return items.map((li) => li.textContent.trim()).filter(Boolean);
  }
  return el.textContent.split('\n').map((s) => s.trim()).filter(Boolean);
}

/**
 * Main block decoration
 */
export default async function decorate(block) {
  const rows = [...block.children];

  // Fields are ordered by their position in the model definition:
  // 0: title, 1: description, 2: currencyList, 3: disclaimerText, 4: termsContent
  const titleText = rows[0]?.textContent?.trim() || '';
  const descriptionHtml = rows[1]?.firstElementChild?.innerHTML || '';
  const apiKeys = parseApiKeys(rows[2]?.firstElementChild || rows[2]);
  const disclaimerHtml = rows[3]?.firstElementChild?.innerHTML || '';
  const termsHtml = rows[4]?.firstElementChild?.innerHTML || '';

  block.innerHTML = '';

  const data = await fetchRates();

  // Title
  if (titleText) {
    const h1 = document.createElement('h1');
    h1.className = 'fx-title';
    h1.textContent = titleText;
    block.appendChild(h1);
  }

  // Description
  if (descriptionHtml) {
    const desc = document.createElement('div');
    desc.className = 'fx-description';
    desc.innerHTML = descriptionHtml;
    block.appendChild(desc);
  }

  // Table
  const table = document.createElement('table');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thCurrency = document.createElement('th');
  thCurrency.textContent = 'สกุลเงิน';
  const thRate = document.createElement('th');
  thRate.textContent = 'อัตราแลกเปลี่ยน';
  headerRow.append(thCurrency, thRate);
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  apiKeys.forEach((apiKey) => {
    const tr = document.createElement('tr');

    const tdCurrency = document.createElement('td');
    const flagImg = getFlagImg(apiKey);
    const label = formatLabel(apiKey);
    if (flagImg) {
      tdCurrency.appendChild(flagImg);
      tdCurrency.appendChild(document.createTextNode(` ${label}`));
    } else {
      tdCurrency.textContent = label;
    }

    const tdRate = document.createElement('td');
    const cleanKey = apiKey.replace(/[0-9]/g, '');
    const rate = data?.[apiKey] || data?.[cleanKey];
    tdRate.textContent = rate ? formatRate(rate, 2) : '-';

    tr.append(tdCurrency, tdRate);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  block.appendChild(table);

  // Update timestamp
  const update = document.createElement('p');
  update.className = 'fx-update';
  update.textContent = `Updated as of ${formatDateTime()}`;
  block.appendChild(update);

  // Disclaimer
  if (disclaimerHtml) {
    const disclaimer = document.createElement('div');
    disclaimer.className = 'fx-disclaimer';
    disclaimer.innerHTML = disclaimerHtml;
    block.appendChild(disclaimer);
  }

  // T&C Accordion
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Terms & Conditions';

  const termsDiv = document.createElement('div');
  termsDiv.className = 'fx-terms';
  termsDiv.innerHTML = termsHtml || '';

  details.append(summary, termsDiv);
  block.appendChild(details);
}

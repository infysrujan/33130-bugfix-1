import { moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';

const ORDER = ['JPY', 'USD1', 'USD5', 'USD50', 'EUR', 'GBP', 'SGD', 'HKD', 'AUD', 'CNY'];

/**
 * Fetch FX rates from AEM config API
 */
async function fetchRates() {
  const configs = await fetchConfigs();

  const url = configs['fx-rates-banner-api-endpoint'];

  if (!url) {
    console.error('FX Rates API not configured in AEM config');
    return {};
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`API failed: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Error fetching FX rates:', e);
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
 * Format currency labels to match UI
 */
function formatLabel(apiKey) {
  const map = {
    USD1: 'USD: 1-2',
    USD5: 'USD: 5-20',
    USD50: 'USD: 50-100',
    JPY: 'JPY (100)',
  };
  return map[apiKey] || apiKey;
}

/**
 * Optional flag icons (can replace with images later)
 */
function getFlag(apiKey) {
  const flags = {
    USD1: '🇺🇸',
    USD5: '🇺🇸',
    USD50: '🇺🇸',
    EUR: '🇪🇺',
    GBP: '🇬🇧',
    JPY: '🇯🇵',
    SGD: '🇸🇬',
    HKD: '🇭🇰',
    AUD: '🇦🇺',
    CNY: '🇨🇳',
  };
  return flags[apiKey] || '';
}

/**
 * Format date as DD/MM/YYYY HH:MM
 */
function formatDateTime() {
  const now = new Date();

  const date = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `${date} ${time}`;
}

/**
 * Main block decoration
 */
export default async function decorate(block) {
  // Enable UE container behavior
  if (document.documentElement.classList.contains('adobe-ue-edit')) {
    block.setAttribute('data-aue-type', 'container');
    block.setAttribute('data-aue-filter', 'special-fx-rates');
  }

  const rows = [...block.children];

  // Extract authored items
  const items = rows.map((row) => {
    const cells = [...row.children];

    return {
      row,
      apiKey: cells[1]?.textContent?.trim(),
    };
  });

  // Sort based on fixed business order
  items.sort((a, b) => ORDER.indexOf(a.apiKey) - ORDER.indexOf(b.apiKey));

  // Clear existing authored markup
  block.innerHTML = '';

  // Fetch API data
  const data = await fetchRates();

  // Create table
  const table = document.createElement('table');

  items.forEach(({ row, apiKey }) => {
    const tr = document.createElement('tr');

    // Currency cell
    const tdCurrency = document.createElement('td');
    const flag = getFlag(apiKey);
    const label = formatLabel(apiKey);

    tdCurrency.textContent = `${flag} ${label}`;

    // Rate cell
    const tdRate = document.createElement('td');
    tdRate.textContent = formatRate(data[apiKey], 2);

    tr.append(tdCurrency, tdRate);
    table.appendChild(tr);

    // Preserve UE editing capability
    moveInstrumentation(row, tr);
  });

  block.appendChild(table);

  // Update timestamp
  const update = document.createElement('p');
  update.textContent = `Updated as of ${formatDateTime()}`;
  block.appendChild(update);

  // Disclaimer
  const disclaimer = document.createElement('p');
  disclaimer.textContent = '[Unit : Baht per 1 unit of foreign currency] Remark: The above rates are subject to change. Please contact our foreign currency service counter for applicable rates when making a transaction.';
  block.appendChild(disclaimer);

  // Terms & Conditions accordion
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Terms & Conditions';

  const content = document.createElement('div');
  content.textContent = 'Author content here';

  details.append(summary, content);
  block.appendChild(details);
}

import { fetchConfigs } from '../../scripts/config.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseAuthoring(block) {
  const rows = [...block.children];

  const title = rows[0]?.textContent?.trim() || '';
  const descriptionHtml = rows[1]?.firstElementChild?.innerHTML || '';

  // Row 2: currencies multifield — each child div is one currency item
  const currencies = [];
  if (rows[2]) {
    [...rows[2].children].forEach((item) => {
      const cols = [...item.children];
      const apiCode = cols[0]?.textContent?.trim();
      if (!apiCode) return;
      currencies.push({
        apiCode,
        displayLabel: cols[1]?.textContent?.trim() || apiCode,
      });
    });
  }

  const decimalPlaces = parseInt(rows[3]?.textContent?.trim() || '2', 10);
  const updateDatePrefix = rows[4]?.textContent?.trim() || 'Update as of';
  const disclaimerHtml = rows[5]?.firstElementChild?.innerHTML || '';
  const accordionContentHtml = rows[6]?.firstElementChild?.innerHTML || '';

  return {
    title,
    descriptionHtml,
    currencies,
    decimalPlaces,
    updateDatePrefix,
    disclaimerHtml,
    accordionContentHtml,
  };
}

function normalizeBannerRates(data) {
  return (Array.isArray(data) ? data : []).map((item) => ({
    code: trimValue(item.CurrencyCode || item.Currency || item.Family || item.Code || ''),
    sellingRate: trimValue(item.SellingRate || item.SellingRates || item.SellRate || item.Rate || ''),
    updateDate: trimValue(item.UpdateDate || item.Ddate || item.Date || ''),
    updateTime: trimValue(item.UpdateTime || item.Time || ''),
  }));
}

function formatRate(value, decimalPlaces) {
  const num = parseFloat(value);
  if (Number.isNaN(num)) return value || '-';
  return num.toFixed(decimalPlaces);
}

function formatBuddhistDate(dateStr, yearOffset) {
  if (!dateStr) return '';
  const parts = dateStr.split('/').map((s) => s.trim());
  if (parts.length !== 3) return dateStr;
  const [d, m, y] = parts;
  const gregorianYear = parseInt(y, 10);
  if (Number.isNaN(gregorianYear)) return dateStr;
  return `${parseInt(d, 10)}/${parseInt(m, 10)}/${gregorianYear + yearOffset}`;
}

function renderBlock(block, authoring, ratesMap, updateDate, updateTime, buddhistYearOffset) {
  const tableRows = authoring.currencies.map(({ apiCode, displayLabel }) => {
    const rateData = ratesMap[apiCode];
    const rateValue = rateData
      ? formatRate(rateData.sellingRate, authoring.decimalPlaces)
      : '-';
    return `<tr>
      <td>
        <div class="fx-rates-currency-cell">
          <img src="/icons/${escapeHtml(apiCode)}.svg" alt="${escapeHtml(apiCode)}" loading="lazy" class="fx-rates-flag">
          <span>${escapeHtml(displayLabel)}</span>
        </div>
      </td>
      <td class="fx-rates-rate-cell">${escapeHtml(rateValue)}</td>
    </tr>`;
  }).join('');

  const formattedDate = formatBuddhistDate(updateDate, buddhistYearOffset);
  let updateLabel = '';
  if (formattedDate) {
    const timePart = updateTime ? `, ${escapeHtml(updateTime)}` : '';
    updateLabel = `${escapeHtml(authoring.updateDatePrefix)} ${escapeHtml(formattedDate)}${timePart}`;
  }

  const accordionHtml = authoring.accordionContentHtml ? `
    <div class="fx-rates-accordion">
      <button class="fx-rates-accordion-toggle" aria-expanded="false" type="button">
        <span>Terms &amp; Conditions</span>
        <span class="fx-rates-accordion-icon" aria-hidden="true"></span>
      </button>
      <div class="fx-rates-accordion-body">
        <div class="fx-rates-accordion-inner">${authoring.accordionContentHtml}</div>
      </div>
    </div>` : '';

  block.innerHTML = `
    <div class="fx-rates-wrapper">
      <h2 class="fx-rates-title">${escapeHtml(authoring.title)}</h2>
      <hr class="fx-rates-divider">
      ${authoring.descriptionHtml ? `<div class="fx-rates-description">${authoring.descriptionHtml}</div>` : ''}
      <div class="fx-rates-table-wrap">
        <table class="fx-rates-table">
          <thead>
            <tr>
              <th class="fx-rates-th-currency">Currency</th>
              <th class="fx-rates-th-rate">Selling Rate</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${updateLabel ? `<p class="fx-rates-update">${updateLabel}</p>` : ''}
      ${authoring.disclaimerHtml ? `<div class="fx-rates-disclaimer">${authoring.disclaimerHtml}</div>` : ''}
      ${accordionHtml}
    </div>
  `;

  block.querySelectorAll('.fx-rates-flag').forEach((img) => {
    img.addEventListener('error', (e) => {
      e.target.style.display = 'none';
    });
  });

  const toggle = block.querySelector('.fx-rates-accordion-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
    });
  }
}

export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const configs = await fetchConfigs();

  const buddhistYearOffset = Number(configs?.buddhistYearOffset) || 0;
  const apiUrl = configs?.fxRatesBannerApiEndpoint || '';

  const ratesMap = {};
  let updateDate = '';
  let updateTime = '';

  if (apiUrl) {
    try {
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        const rates = normalizeBannerRates(data);
        rates.forEach((r) => { ratesMap[r.code] = r; });
        if (rates.length) {
          updateDate = rates[0].updateDate;
          updateTime = rates[0].updateTime;
        }
      }
    } catch (e) {
      // API unavailable — render with empty rates
    }
  }

  renderBlock(block, authoring, ratesMap, updateDate, updateTime, buddhistYearOffset);
}

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

  const descriptionEl = rows[1]?.firstElementChild;
  const descriptionHtml = descriptionEl?.innerHTML || '';

  const headerCols = rows[2] ? [...rows[2].children] : [];
  const currencyColumnLabel = headerCols[0]?.textContent?.trim() || 'Currency';
  const rateColumnLabel = headerCols[1]?.textContent?.trim() || 'Rate';

  const decimalPlaces = parseInt(rows[3]?.textContent?.trim() || '2', 10);

  const updateLabelCols = rows[4] ? [...rows[4].children] : [];
  const updateDatePrefix = updateLabelCols[0]?.textContent?.trim() || 'Update as of';
  const updateTimeSeparator = updateLabelCols[1]?.textContent?.trim() || '';

  const disclaimerEl = rows[5]?.firstElementChild;
  const disclaimerHtml = disclaimerEl?.innerHTML || '';

  const accordionTitle = rows[6]?.textContent?.trim() || '';
  const accordionEl = rows[7]?.firstElementChild;
  const accordionContentHtml = accordionEl?.innerHTML || '';

  const currencies = [];
  for (let i = 8; i < rows.length; i += 1) {
    const cols = [...rows[i].children];
    const apiCode = cols[0]?.textContent?.trim();
    if (!apiCode) continue; // eslint-disable-line no-continue
    currencies.push({
      apiCode,
      displayLabel: cols[1]?.textContent?.trim() || apiCode,
    });
  }

  return {
    title,
    descriptionHtml,
    currencyColumnLabel,
    rateColumnLabel,
    decimalPlaces,
    updateDatePrefix,
    updateTimeSeparator,
    disclaimerHtml,
    accordionTitle,
    accordionContentHtml,
    currencies,
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
      <td class="fx-rates-currency-cell">
        <img src="/icons/${escapeHtml(apiCode)}.svg" alt="${escapeHtml(apiCode)}" loading="lazy" class="fx-rates-flag">
        <span>${escapeHtml(displayLabel)}</span>
      </td>
      <td class="fx-rates-rate-cell">${escapeHtml(rateValue)}</td>
    </tr>`;
  }).join('');

  const formattedDate = formatBuddhistDate(updateDate, buddhistYearOffset);
  let updateLabel = '';
  if (formattedDate) {
    const timePart = authoring.updateTimeSeparator && updateTime
      ? ` ${escapeHtml(authoring.updateTimeSeparator)} ${escapeHtml(updateTime)}`
      : '';
    updateLabel = `${escapeHtml(authoring.updateDatePrefix)} ${escapeHtml(formattedDate)}${timePart}`;
  }

  block.innerHTML = `
    <div class="fx-rates-wrapper">
      <h2 class="fx-rates-title">${escapeHtml(authoring.title)}</h2>
      <hr class="fx-rates-divider">
      ${authoring.descriptionHtml ? `<div class="fx-rates-description">${authoring.descriptionHtml}</div>` : ''}
      <div class="fx-rates-table-wrap">
        <table class="fx-rates-table">
          <thead>
            <tr>
              <th class="fx-rates-th-currency">${escapeHtml(authoring.currencyColumnLabel)}</th>
              <th class="fx-rates-th-rate">${escapeHtml(authoring.rateColumnLabel)}</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${updateLabel ? `<p class="fx-rates-update">${updateLabel}</p>` : ''}
      ${authoring.disclaimerHtml ? `<div class="fx-rates-disclaimer">${authoring.disclaimerHtml}</div>` : ''}
      ${authoring.accordionTitle ? `
      <div class="fx-rates-accordion">
        <div class="fx-rates-accordion-item">
          <button type="button" class="fx-rates-accordion-header" aria-expanded="false" aria-controls="fx-rates-tnc-panel">
            <span class="fx-rates-accordion-title">${escapeHtml(authoring.accordionTitle)}</span>
            <span class="fx-rates-accordion-icon" aria-hidden="true">+</span>
          </button>
          <div class="fx-rates-accordion-panel" id="fx-rates-tnc-panel" hidden>
            <div class="fx-rates-accordion-body">${authoring.accordionContentHtml}</div>
          </div>
        </div>
      </div>` : ''}
    </div>
  `;

  block.querySelectorAll('.fx-rates-flag').forEach((img) => {
    img.addEventListener('error', (e) => {
      e.target.style.display = 'none';
    });
  });
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

  const accordionHeader = block.querySelector('.fx-rates-accordion-header');
  if (accordionHeader) {
    accordionHeader.addEventListener('click', () => {
      const expanded = accordionHeader.getAttribute('aria-expanded') === 'true';
      const panel = block.querySelector(`#${accordionHeader.getAttribute('aria-controls')}`);
      const icon = accordionHeader.querySelector('.fx-rates-accordion-icon');
      accordionHeader.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      if (panel) panel.hidden = expanded;
      if (icon) icon.textContent = expanded ? '+' : '−';
    });
  }
}

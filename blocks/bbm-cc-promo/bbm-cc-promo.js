import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang, createElementFromHTML } from '../../scripts/scripts.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };

function formatDate(dateStr, locale = 'en-GB') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildDateHtml(start, end, label, locale) {
  if (!start && !end) return '';
  const parts = [start && formatDate(start, locale), end && formatDate(end, locale)]
    .filter(Boolean);
  return `<p class="bbm-promo-date">${label} ${parts.join(' – ')}</p>`;
}

function buildDisclaimerHtml(enabled, text) {
  if (!enabled || !text) return '';
  return `<div class="bbm-promo-disclaimer">${text}</div>`;
}

function getBlockData(block) {
  const rows = [...block.children];
  const data = {};
  const getValue = (row) => row?.children[1]?.innerHTML?.trim() || row?.children[1]?.textContent?.trim() || '';

  // Order based on _bbm-cc-promo.json models fields
  data.promoId = getValue(rows[0]);
  data.title = getValue(rows[1]);
  data.description = getValue(rows[2]);
  data.imageUrl = rows[3]?.querySelector('img')?.src || '';
  data.cards = {
    platinum: getValue(rows[4])?.toLowerCase() === 'true',
    signature: getValue(rows[5])?.toLowerCase() === 'true',
    infinite: getValue(rows[6])?.toLowerCase() === 'true',
  };
  data.isRegister = getValue(rows[7]) || 'No';
  data.promoTitleEn = getValue(rows[8]);
  data.promoTitleTh = getValue(rows[9]);
  data.startDate = getValue(rows[10]);
  data.expiryDate = getValue(rows[11]);
  data.promotionFlag = getValue(rows[12]);
  data.ctaLink = rows[13]?.querySelector('a')?.href || '';
  data.ctaLabel = getValue(rows[14]);
  data.disclaimerEnabled = getValue(rows[15])?.toLowerCase() === 'true';
  data.disclaimerText = getValue(rows[16]);

  return data;
}

export default async function decorate(block) {
  // Hide global elements for campaign page
  ['header', 'footer', '.breadcrumb-container', '.cookie-alert-container', '.filter-container', '.filters'].forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.style.display = 'none';
  });

  const data = getBlockData(block);
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';
  const placeholders = await fetchPlaceholders();

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

  const titleHtml = data.title ? `<h2 class="bbm-promo-title">${data.title}</h2>` : '';
  const imageHtml = data.imageUrl ? `<img src="${data.imageUrl}" alt="${data.title || ''}" loading="lazy">` : '';

  const clickToViewFull = placeholders.promoClickToViewFull || '';
  const imageColHtml = imageHtml ? `
    <div class="bbm-promo-image">
      <a href="${data.imageUrl}" title="${clickToViewFull}">
        ${imageHtml}
      </a>
    </div>` : '';

  const ctaHtml = (data.isRegister !== 'No' && data.ctaLink) ? `
    <div class="bbm-promo-cta">
      <a href="${data.ctaLink}" class="button primary">${data.ctaLabel || 'Register'}</a>
    </div>
  ` : '';

  block.innerHTML = '';
  const inner = createElementFromHTML(`
    <div class="bbm-promo-inner">
      <div class="bbm-promo-center">
        <div class="bbm-promo-title-wrap">
          ${titleHtml}
        </div>
        <div class="bbm-promo-row ${!imageHtml ? 'no-image' : ''}">
          ${imageColHtml}
          <div class="bbm-promo-content">
            <div class="bbm-promo-description">${data.description}</div>
            ${buildDateHtml(data.startDate, data.expiryDate, periodLabel, locale)}
            ${ctaHtml}
            ${buildDisclaimerHtml(data.disclaimerEnabled, data.disclaimerText)}
          </div>
        </div>
      </div>
    </div>`, block.ownerDocument);

  block.appendChild(inner);
}

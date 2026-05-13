import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };

function getBlockData(block) {
  const rows = [...block.children];
  const data = {};
  const getValue = (row) => row?.children[1]?.innerHTML?.trim() || row?.children[1]?.textContent?.trim() || '';

  data.title = getValue(rows[0]);
  data.detailImageUrl = rows[1]?.querySelector('img')?.src || '';
  data.detailDescription = getValue(rows[2]);
  data.dateValidityLabel = getValue(rows[3]);
  data.startDate = getValue(rows[4]);
  data.endDate = getValue(rows[5]);
  data.disclaimerEnabled = getValue(rows[6])?.toLowerCase() === 'true';
  data.disclaimerText = getValue(rows[7]);

  return data;
}

export default function decorate(block) {
  // Hide global elements for campaign page
  ['header', 'footer', '.breadcrumb-container', '.cookie-alert-container', '.filter-container', '.filters']
    .forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });

  const data = getBlockData(block);
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  fetchPlaceholders().then((placeholders) => {
    const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

    const titleHtml = data.title ? `<h2 class="bbm-promo-title">${data.title}</h2>` : '';
    const imageHtml = data.detailImageUrl ? `<img src="${data.detailImageUrl}" alt="${data.title || ''}" loading="lazy">` : '';

    const clickToViewFull = placeholders.promoClickToViewFull || '';
    const imageColHtml = imageHtml ? `
      <div class="bbm-promo-image">
        <a href="${data.detailImageUrl}" title="${clickToViewFull}">
          ${imageHtml}
        </a>
      </div>` : '';

    block.innerHTML = buildPromoHtml({
      titleHtml,
      imageColHtml,
      rowClass: `bbm-promo-row ${!imageHtml ? 'no-image' : ''}`,
      descriptionHtml: data.detailDescription,
      dateHtml: buildDateHtml(
        data.startDate,
        data.endDate,
        data.dateValidityLabel || periodLabel,
        locale,
      ),
      disclaimerHtml: buildDisclaimerHtml(data.disclaimerEnabled, data.disclaimerText),
      prefix: 'bbm-promo',
    });
  });
}

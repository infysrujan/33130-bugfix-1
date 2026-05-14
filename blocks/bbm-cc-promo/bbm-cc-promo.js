import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };

// Fallback URL for local dev — replace config key value with real API once available
const DEV_FALLBACK = '/en/bbm-promo.json';

async function fetchPromoData(apiUrl, promoId) {
  try {
    const resp = await fetch(apiUrl);
    if (!resp.ok) return null;
    const { cards } = await resp.json();
    const currentPath = window.location.pathname;
    return (
      cards?.find((c) => c.ctaLink === currentPath)
      || cards?.find((c) => c.id === promoId)
      || null
    );
  } catch {
    return null;
  }
}

export default function decorate(block) {
  // Hide global elements for campaign page
  ['header', 'footer', '.breadcrumb-container', '.cookie-alert-container',
    '.filter-container', '.filters']
    .forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });

  // Row 0: promoId authored in the block (used as fallback match)
  const promoId = block.children[0]?.textContent?.trim() || '';
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]).then(([placeholders, configs]) => {
    // Config key: bbm-cc-promo-selector → bbmCcPromoSelector
    // When real API is ready: add "bbm-cc-promo-selector" key to /en/config.json
    const baseUrl = configs?.bbmCcPromoSelector || DEV_FALLBACK;
    const apiUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');

    fetchPromoData(apiUrl, promoId).then((card) => {
      if (!card) return;

      const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

      // Ensure remaining fields from JSON are mapped in JS
      const data = {
        title: card?.title || '',
        detailImageUrl: card?.detailImageUrl || '',
        detailDescription: card?.detailDescription || '',
        startDate: card?.promotionStartDate || '',
        endDate: card?.promotionEndDate || '',
        dateValidityLabel: card?.dateValidityLabel || periodLabel,
        disclaimerEnabled: card?.responsibleLendingDisclaimerEnabled,
        disclaimerText: card?.responsibleLendingDisclaimerText || '',
        targetLink: card?.targetLink === 'true' || card?.targetLink === true,
        ctaLink: card?.ctaLink || '',
        category: card?.category || '',
        cardImageUrl: card?.cardImageUrl || '',
        cardShortDescription: card?.cardShortDescription || '',
        platinum: card?.Platinum || false,
        signature: card?.Signeture || false,
        infinite: card?.infinite || false,
        promotionFlag: card?.promotionFlag || [],
      };

      const titleHtml = data.title
        ? `<h2 class="bbm-promo-title">${data.title}</h2>`
        : '';
      const imageHtml = data.detailImageUrl
        ? `<img src="${data.detailImageUrl}" alt="${data.title || ''}" loading="lazy">`
        : '';

      const rowClass = imageHtml ? 'bbm-promo-row' : 'bbm-promo-row bbm-promo-row-no-image';
      const clickToViewFull = placeholders.promoClickToViewFull || '';
      const imageColHtml = imageHtml ? `
              <div class="bbm-promo-image">
                <a href="${data.detailImageUrl}" title="${clickToViewFull}">
                  ${imageHtml}
                </a>
              </div>` : '';

      const targetAttr = data.targetLink ? ' target="_blank" rel="noopener noreferrer"' : '';
      const ctaHtml = data.ctaLink ? `
        <div class="bbm-promo-cta">
          <a href="${data.ctaLink}" class="button primary"${targetAttr}>${placeholders.promoCtaLabel || 'Register'}</a>
        </div>
      ` : '';

      const rawDateHtml = buildDateHtml(
        data.startDate,
        data.endDate,
        data.dateValidityLabel,
        locale,
      );
      const rawDisclaimerHtml = buildDisclaimerHtml(data.disclaimerEnabled, data.disclaimerText);

      const htmlString = buildPromoHtml({
        titleHtml,
        imageColHtml,
        rowClass,
        descriptionHtml: data.detailDescription,
        dateHtml: rawDateHtml.replace('promo-detail-date', 'bbm-promo-date'),
        disclaimerHtml: rawDisclaimerHtml
          .replace('promo-detail-disclaimer', 'bbm-promo-disclaimer'),
        ctaHtml,
        prefix: 'bbm-promo',
      });

      // UE Robust Fix: Hide original children to preserve data-aue attributes, then append new DOM
      [...block.children].forEach((row) => {
        row.style.display = 'none';
      });

      const wrapper = document.createElement('div');
      wrapper.innerHTML = htmlString;
      block.append(wrapper.firstElementChild);
    });
  });
}

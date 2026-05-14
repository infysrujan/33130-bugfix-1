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

export default async function decorate(block) {
  // Hide global elements for campaign page
  ['header', 'footer', '.breadcrumb-container', '.cookie-alert-container',
    '.filter-container', '.filters']
    .forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });

  // Project Standard (Audited from promotional-details.js):
  // We extract data first, then replace the entire innerHTML of the block.
  // This is the most robust way to prevent "multiple block insertion" (duplicates)
  // inside the block because each re-decoration cycle completely overwrites the previous one.
  const promoId = block.children[0]?.textContent?.trim() || '';
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const baseUrl = configs?.bbmCcPromoSelector || DEV_FALLBACK;
  let apiUrl = baseUrl;

  // Only apply language localization logic if we are NOT using the local dummy fallback
  if (configs?.bbmCcPromoSelector) {
    apiUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');
  }

  const card = await fetchPromoData(apiUrl, promoId);
  if (!card) return;

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

  // Map all JSON fields for use in the JS logic
  const data = {
    title: card.title || '',
    detailImageUrl: card.detailImageUrl || '',
    detailDescription: card.detailDescription || '',
    startDate: card.promotionStartDate || '',
    endDate: card.promotionEndDate || '',
    dateValidityLabel: card.dateValidityLabel || periodLabel,
    disclaimerEnabled: card.responsibleLendingDisclaimerEnabled,
    disclaimerText: card.responsibleLendingDisclaimerText || '',
    targetLink: card.targetLink === 'true' || card.targetLink === true,
    ctaLink: card.ctaLink || '',
  };

  const titleHtml = data.title ? `<h2 class="bbm-promo-title">${data.title}</h2>` : '';
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

  const rawDateHtml = buildDateHtml(data.startDate, data.endDate, data.dateValidityLabel, locale);
  const rawDisclaimerHtml = buildDisclaimerHtml(data.disclaimerEnabled, data.disclaimerText);

  // Use the standard shared HTML builder
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

  // Final Step: Atomic replacement of block content.
  // This prevents duplication because even if decorate() is called 10 times,
  // each call overwrites the block content instead of appending to it.
  block.innerHTML = htmlString;
}

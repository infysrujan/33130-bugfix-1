import { createOptimizedPicture } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang, moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
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
  // UE Robust Fix: Remove existing rendered content to prevent duplicates during re-decoration
  block.querySelector('.bbm-promo-renderer')?.remove();

  // Reset original rows visibility (if they were hidden in a previous pass)
  [...block.children].forEach((row) => {
    row.style.display = '';
    // Transfer AEM instrumentation from rows to the block wrapper
    moveInstrumentation(row, block);
  });

  // Hide global elements for campaign page
  ['header', 'footer', '.breadcrumb-container', '.cookie-alert-container',
    '.filter-container', '.filters']
    .forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });

  const promoId = block.children[0]?.textContent?.trim() || '';
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const baseUrl = configs?.bbmCcPromoSelector || DEV_FALLBACK;
  let apiUrl = baseUrl;
  if (configs?.bbmCcPromoSelector) {
    apiUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');
  }

  const card = await fetchPromoData(apiUrl, promoId);
  if (!card) return;

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

  // Map JSON fields and ensure URLs are handled (Relative paths will resolve to host)
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
  // Use createOptimizedPicture for better performance and UE compatibility
  let imageHtml = '';
  if (data.detailImageUrl) {
    const pic = createOptimizedPicture(data.detailImageUrl, data.title || '', false);
    imageHtml = pic.outerHTML;
  }

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

  // Final UE Fix: Hide the original table rows instead of deleting them.
  // This keeps the UE instrumentation alive while showing the dynamic content.
  [...block.children].forEach((row) => {
    row.style.display = 'none';
  });

  // Create a wrapper for the new content and append it
  const renderer = document.createElement('div');
  renderer.className = 'bbm-promo-renderer'; // Identifiable wrapper for cleanup
  renderer.innerHTML = htmlString;
  block.append(renderer);
}

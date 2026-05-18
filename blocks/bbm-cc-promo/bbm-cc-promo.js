import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const DEV_FALLBACK = '/en/bbm-promo.json';

/**
 * Safely validates date strings to prevent RangeError in formatDate.
 */
function isValidDate(str) {
  if (!str || typeof str !== 'string') return false;
  return !Number.isNaN(Date.parse(str));
}

/**
 * Resolves paths for AEM authors and preview links.
 */
function resolveAemPath(path) {
  if (!path || path.startsWith('http') || path.startsWith('//')) return path;
  if (window.location.hostname.includes('author-') && path.startsWith('/') && !path.startsWith('/content/')) {
    return `/content/bangkokbank${path}`;
  }
  return path;
}

/**
 * Fetches campaign card data from the API endpoint.
 */
async function fetchPromoData(apiUrl, promoId) {
  try {
    const resp = await fetch(apiUrl);
    if (!resp.ok) return null;
    const { cards } = await resp.json();
    const currentPath = window.location.pathname;
    return (
      cards?.find((c) => resolveAemPath(c.ctaLink) === currentPath)
      || cards?.find((c) => c.id === promoId)
      || null
    );
  } catch {
    return null;
  }
}

/**
 * Main decorator for the BBM CC Promo block.
 */
export default async function decorate(block) {
  // 1. Parse authored config rows dynamically
  const cfg = {};
  [...block.children].forEach((row) => {
    const rawLabel = row.children[0]?.textContent?.trim().toLowerCase() || '';
    const label = rawLabel.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (label) {
      const col = row.children[1];
      const img = col?.querySelector('img');
      const anchor = col?.querySelector('a');
      cfg[label] = img?.src || anchor?.href || col?.textContent?.trim() || '';
    }
  });

  // 2. Fetch configurations and placeholders
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  // 3. Resolve API URL and fetch card details
  const promoId = cfg['promo id'] || block.children[0]?.textContent?.trim() || '';
  const baseUrl = resolveAemPath(configs?.bbmCcPromoSelector || DEV_FALLBACK);
  const apiUrl = configs?.bbmCcPromoSelector
    ? baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json')
    : baseUrl;

  const card = await fetchPromoData(apiUrl, promoId);
  const finalCard = { ...(card || {}) };

  // 4. Override API details with authored properties if present
  const title = cfg.title || finalCard.title || '';
  const detailImageUrl = cfg['detail image'] || finalCard.detailImageUrl || '';
  const detailDescription = cfg['detail description'] || finalCard.detailDescription || '';
  const rawStartDate = cfg['promotion validity start date'] || finalCard.promotionStartDate || '';
  const rawEndDate = cfg['promotion expiry date'] || finalCard.promotionEndDate || '';
  const dateValidityLabel = cfg['date validity label'] || finalCard.dateValidityLabel || placeholders.promotionPeriodText || 'Promotion Period:';
  const ctaLink = cfg['cta link'] || finalCard.ctaLink || '';
  const ctaLabel = cfg['cta label'] || finalCard.ctaLabel || placeholders.promoCtaLabel || 'Register';

  const disclaimerEnabled = (cfg['responsible lending disclaimer'] || finalCard.responsibleLendingDisclaimerEnabled)?.toString().toLowerCase() === 'true';
  const disclaimerText = cfg['disclaimer text'] || finalCard.responsibleLendingDisclaimerText || '';
  const targetLink = (cfg['open link in new tab'] || cfg['target settings'] || cfg.targetlink || finalCard.targetLink)?.toString().toLowerCase() === 'true';

  // 5. Exit if there is no data to show
  if (!promoId && !title && !detailImageUrl) {
    block.innerHTML = '';
    return;
  }

  // 6. Build the promo presentation
  const safeStartDate = isValidDate(rawStartDate) ? rawStartDate : '';
  const safeEndDate = isValidDate(rawEndDate) ? rawEndDate : '';

  const titleHtml = title ? `<h2 class="bbm-promo-title">${title}</h2>` : '';
  const imageHtml = detailImageUrl ? `<img src="${resolveAemPath(detailImageUrl)}" alt="${title}" loading="lazy">` : '';
  const rowClass = imageHtml ? 'bbm-promo-row' : 'bbm-promo-row bbm-promo-row-no-image';

  const clickToViewFull = placeholders.promoClickToViewFull || '';
  const imageColHtml = imageHtml ? `
    <div class="bbm-promo-image">
      <a href="${resolveAemPath(detailImageUrl)}" title="${clickToViewFull}">
        ${imageHtml}
      </a>
    </div>` : '';

  const targetAttr = targetLink ? ' target="_blank" rel="noopener noreferrer"' : '';
  const ctaHtml = ctaLink ? `
    <div class="bbm-promo-cta">
      <a href="${resolveAemPath(ctaLink)}" class="button primary"${targetAttr}>${ctaLabel}</a>
    </div>` : '';

  const rawDateHtml = buildDateHtml(safeStartDate, safeEndDate, dateValidityLabel, locale);
  const rawDisclaimerHtml = buildDisclaimerHtml(disclaimerEnabled, disclaimerText);

  // Set block inner HTML cleanly
  block.innerHTML = buildPromoHtml({
    titleHtml,
    imageColHtml,
    rowClass,
    descriptionHtml: detailDescription,
    dateHtml: rawDateHtml.replace('promo-detail-date', 'bbm-promo-date'),
    disclaimerHtml: rawDisclaimerHtml.replace('promo-detail-disclaimer', 'bbm-promo-disclaimer'),
    ctaHtml,
    prefix: 'bbm-promo',
  });
}

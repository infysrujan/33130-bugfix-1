import { createOptimizedPicture } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang, moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const DEV_FALLBACK = '/en/bbm-promo.json';

/**
 * Senior Audit Fix: AEM Author Path Resolver
 * In AEM Universal Editor (Authoring), relative paths like /en/... must be prefixed
 * with the content root (/content/bangkokbank) to resolve correctly.
 */
function resolveAemPath(path) {
  if (!path || path.startsWith('http') || path.startsWith('//')) return path;
  const isAuthor = window.location.hostname.includes('author-') || window.location.hostname.includes('localhost');
  if (isAuthor && path.startsWith('/') && !path.startsWith('/content/')) {
    return `/content/bangkokbank${path}`;
  }
  return path;
}

async function fetchPromoData(apiUrl, promoId) {
  try {
    const resp = await fetch(apiUrl);
    if (!resp.ok) return null;
    const { cards } = await resp.json();
    const currentPath = window.location.pathname;

    // Robust Matching: Match by ID or by path (resolving relative paths for match)
    return (
      cards?.find((c) => resolveAemPath(c.ctaLink) === currentPath)
      || cards?.find((c) => c.id === promoId)
      || null
    );
  } catch {
    return null;
  }
}

export default async function decorate(block) {
  // UE Robust Fix: Stable Renderer Container
  // Instead of clearing the whole block, we manage a dedicated container.
  let renderer = block.querySelector('.bbm-promo-renderer');
  if (!renderer) {
    renderer = document.createElement('div');
    renderer.className = 'bbm-promo-renderer';
  }

  // Immediate row hiding to prevent content flash in UE
  [...block.children].forEach((row) => {
    if (row !== renderer) {
      row.style.display = 'none';
      moveInstrumentation(row, block);
    }
  });

  if (!renderer.parentElement) block.append(renderer);

  const promoId = block.children[0]?.textContent?.trim() || '';
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const baseUrl = resolveAemPath(configs?.bbmCcPromoSelector || DEV_FALLBACK);
  let apiUrl = baseUrl;

  if (configs?.bbmCcPromoSelector) {
    apiUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');
  }

  const card = await fetchPromoData(apiUrl, promoId);
  if (!card) {
    renderer.innerHTML = '';
    return;
  }

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

  // Senior Audit Fix: Resolve all URLs (images/links) for Authoring visibility
  const data = {
    title: card.title || '',
    detailImageUrl: resolveAemPath(card.detailImageUrl || ''),
    detailDescription: card.detailDescription || '',
    startDate: card.promotionStartDate || '',
    endDate: card.promotionEndDate || '',
    dateValidityLabel: card.dateValidityLabel || periodLabel,
    disclaimerEnabled: card.responsibleLendingDisclaimerEnabled,
    disclaimerText: card.responsibleLendingDisclaimerText || '',
    targetLink: card.targetLink === 'true' || card.targetLink === true,
    ctaLink: resolveAemPath(card.ctaLink || ''),
  };

  const titleHtml = data.title ? `<h2 class="bbm-promo-title">${data.title}</h2>` : '';
  const pic = data.detailImageUrl ? createOptimizedPicture(data.detailImageUrl, data.title || '', false) : null;
  const imageHtml = pic ? pic.outerHTML : '';

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

  // Final rendering into the stable container
  renderer.innerHTML = htmlString;
}

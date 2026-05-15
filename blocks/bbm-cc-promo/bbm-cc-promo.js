import { createOptimizedPicture } from '../../scripts/aem.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang, moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const DEV_FALLBACK = '/en/bbm-promo.json';

function parseBlockConfig(block) {
  const config = { promoId: '', targetLink: false };
  [...block.children].forEach((row) => {
    const label = row.children[0]?.textContent?.trim().toLowerCase();
    const value = row.children[1]?.textContent?.trim().toLowerCase();

    if (label === 'promo id' || !label) { // Support both labeled and unlabeled ID row
      config.promoId = row.children[1]?.textContent?.trim() || row.children[0]?.textContent?.trim() || '';
    }
    if (label === 'target settings' || label === 'targetlink') {
      config.targetLink = value === 'true';
    }
  });
  return config;
}

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
  // UE inserts a fresh block element when a newly-added block is edited for the first time.
  // The original decorated block stays in the DOM alongside the new one, causing duplication.
  // Only remove the stale block if it shares the same data-aue-resource (same AEM content path).
  const blockResource = block.dataset.aueResource;
  document.querySelectorAll('.bbm-cc-promo.block').forEach((other) => {
    if (other === block) return;
    if (!other.querySelector('.bbm-promo-renderer')) return; // not yet decorated
    const otherResource = other.dataset.aueResource;
    if (blockResource && otherResource && otherResource !== blockResource) return;
    other.remove();
  });

  // Remove existing renderer so we start fresh on re-decoration
  const existingRenderer = block.querySelector('.bbm-promo-renderer');
  if (existingRenderer) existingRenderer.remove();

  const renderer = document.createElement('div');
  renderer.className = 'bbm-promo-renderer';

  const authConfig = parseBlockConfig(block);

  // Hide authored rows and transfer instrumentation to block
  [...block.children].forEach((row) => {
    row.style.display = 'none';
    moveInstrumentation(row, block);
  });

  block.append(renderer);

  // Hide global elements for campaign page
  ['header', 'footer', '.breadcrumb-container', '.cookie-alert-container',
    '.filter-container', '.filters']
    .forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.style.display = 'none';
    });

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

  const card = await fetchPromoData(apiUrl, authConfig.promoId);
  if (!card) {
    renderer.innerHTML = '';
    return;
  }

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

  // Authored Target Link takes precedence over API Target Link for the block
  const isTargetBlank = authConfig.targetLink || card.targetLink === 'true' || card.targetLink === true;

  const data = {
    title: card.title || '',
    detailImageUrl: resolveAemPath(card.detailImageUrl || ''),
    detailDescription: card.detailDescription || '',
    startDate: card.promotionStartDate || '',
    endDate: card.promotionEndDate || '',
    dateValidityLabel: card.dateValidityLabel || periodLabel,
    disclaimerEnabled: card.responsibleLendingDisclaimerEnabled,
    disclaimerText: card.responsibleLendingDisclaimerText || '',
    targetLink: isTargetBlank,
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

  renderer.innerHTML = htmlString;
}

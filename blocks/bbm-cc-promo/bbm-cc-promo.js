import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang, moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const DEV_FALLBACK = '/en/bbm-promo.json';

function parseBlockConfig(block) {
  const config = { promoId: '', targetLink: false };
  const rows = [...block.children];

  if (!rows.length) return config;

  // Fallback 1: Blind index reading (Standard for simple EDS blocks)
  config.promoId = rows[0].children.length >= 2
    ? rows[0].children[1]?.textContent?.trim()
    : rows[0].textContent?.trim();

  if (rows[1]) {
    const val = rows[1].children.length >= 2
      ? rows[1].children[1]?.textContent?.trim()
      : rows[1].textContent?.trim();
    config.targetLink = val?.toLowerCase() === 'true';
  }

  // Fallback 2: Key-Value override if explicit labels are authored
  rows.forEach((row) => {
    if (row.children.length >= 2) {
      // Normalize label: lowercase and remove anything in parentheses
      const rawLabel = row.children[0]?.textContent?.trim().toLowerCase() || '';
      const label = rawLabel.replace(/\s*\(.*?\)\s*/g, '').trim();

      const col = row.children[1];
      let value = col?.textContent?.trim();

      // Extract specific media/links
      if (col.querySelector('img')) value = col.querySelector('img').src;
      else if (col.querySelector('a') && label.includes('link')) value = col.querySelector('a').href;
      else if (col.querySelector('p')) value = col.innerHTML.trim(); // For rich text

      if (!value) return;

      if (label === 'promo id') config.promoId = value;
      if (label === 'target settings' || label === 'targetlink') config.targetLink = value?.toLowerCase() === 'true';
      if (label === 'title') config.title = value;
      if (label === 'card image') config.cardImageUrl = value;
      if (label === 'detail image') config.detailImageUrl = value;
      if (label === 'card short description') config.cardShortDescription = value;
      if (label === 'detail description') config.detailDescription = value;
      if (label === 'date validity label') config.dateValidityLabel = value;
      if (label === 'promotion validity start date') config.promotionStartDate = value;
      if (label === 'promotion expiry date') config.promotionEndDate = value;
      if (label === 'cta link') config.ctaLink = value;
    }
  });

  return config;
}

function resolveAemPath(path) {
  if (!path || path.startsWith('http') || path.startsWith('//')) return path;
  // Senior Audit Fix: Removed localhost. Local dev server correctly serves from root (/en/...).
  const isAuthor = window.location.hostname.includes('author-');
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
  const finalCard = { ...(card || {}) };

  // Authored values always override API values
  Object.keys(authConfig).forEach((key) => {
    if (authConfig[key]) {
      finalCard[key] = authConfig[key];
    }
  });

  // If we have no API data AND no authored title/image, abort
  if (!finalCard.promoId && !finalCard.title && !finalCard.detailImageUrl) {
    renderer.innerHTML = '';
    return;
  }

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';
  const isTargetBlank = finalCard.targetLink === 'true' || finalCard.targetLink === true;

  const data = {
    title: finalCard.title || '',
    detailImageUrl: resolveAemPath(finalCard.detailImageUrl || ''),
    detailDescription: finalCard.detailDescription || '',
    startDate: finalCard.promotionStartDate || '',
    endDate: finalCard.promotionEndDate || '',
    dateValidityLabel: finalCard.dateValidityLabel || periodLabel,
    disclaimerEnabled: finalCard.responsibleLendingDisclaimerEnabled,
    disclaimerText: finalCard.responsibleLendingDisclaimerText || '',
    targetLink: isTargetBlank,
    ctaLink: resolveAemPath(finalCard.ctaLink || ''),
  };

  const titleHtml = data.title ? `<h2 class="bbm-promo-title">${data.title}</h2>` : '';

  // Align with promotional-details.js standard rendering
  // (no createOptimizedPicture to support authored images safely)
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

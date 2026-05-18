import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang, moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const DEV_FALLBACK = '/en/bbm-promo.json';

/**
 * Validates if a date string can be safely parsed by Date constructor
 * without throwing RangeError inside toLocaleDateString.
 */
function isValidDate(str) {
  if (!str || typeof str !== 'string') return false;
  const time = Date.parse(str);
  return !Number.isNaN(time);
}

/**
 * Robustly parses the authored block rows into a structured configuration object.
 * Supports normalized label-based matching for all _bbm-cc-promo.json fields,
 * and falls back to index-based mapping for basic EDS blocks.
 */
function parseBlockConfig(block) {
  const config = {};
  const rows = [...block.children];

  rows.forEach((row) => {
    if (row.children.length >= 2) {
      // Normalize label: lowercase and remove any parentheses + content
      const rawLabel = row.children[0]?.textContent?.trim().toLowerCase() || '';
      const label = rawLabel.replace(/\s*\(.*?\)\s*/g, '').trim();

      const col = row.children[1];
      if (!col) return;

      let value = '';
      const img = col.querySelector('img');
      const anchor = col.querySelector('a');

      if (img) {
        value = img.src;
      } else if (anchor) {
        value = anchor.href;
      } else {
        value = col.innerHTML.trim();
        // If it's simple text wrapped in a single <p> tag, unwrap it
        const plainText = col.textContent.trim();
        if (value.startsWith('<p>') && value.endsWith('</p>') && !value.includes('<p>', 3) && !value.includes('<br')) {
          value = plainText;
        }
      }

      // Map normalized labels to config fields matching component-models/json
      if (label === 'promo id') config.promoId = value;
      else if (label === 'title') config.title = value;
      else if (label === 'card image') config.cardImageUrl = value;
      else if (label === 'detail image') config.detailImageUrl = value;
      else if (label === 'card short description') config.cardShortDescription = value;
      else if (label === 'detail description') config.detailDescription = value;
      else if (label === 'category') config.category = value;
      else if (label === 'promotion flag') config.promotionFlag = value;
      else if (label === 'date validity label') config.dateValidityLabel = value;
      else if (label.includes('platinum')) config.platinum = value?.toLowerCase() === 'true';
      else if (label.includes('signature')) config.signature = value?.toLowerCase() === 'true';
      else if (label.includes('infinite')) config.infinite = value?.toLowerCase() === 'true';
      else if (label === 'promotion validity start date') config.promotionStartDate = value;
      else if (label === 'promotion expiry date') config.promotionEndDate = value;
      else if (label === 'cta link') config.ctaLink = value;
      else if (label === 'cta label') config.ctaLabel = value;
      else if (label === 'target settings' || label === 'targetlink' || label.includes('new tab')) {
        config.targetLink = value?.toLowerCase() === 'true';
      } else if (label === 'responsible lending disclaimer') {
        config.responsibleLendingDisclaimerEnabled = value?.toLowerCase() === 'true';
      } else if (label === 'disclaimer text') config.responsibleLendingDisclaimerText = value;
    }
  });

  // Fallback: blind index parsing if explicit labels aren't found or mapped
  if (rows.length > 0) {
    if (!config.promoId) {
      config.promoId = rows[0].children.length >= 2
        ? rows[0].children[1]?.textContent?.trim()
        : rows[0].textContent?.trim();
    }
    if (rows[1] && config.targetLink === undefined) {
      const val = rows[1].children.length >= 2
        ? rows[1].children[1]?.textContent?.trim()
        : rows[1].textContent?.trim();
      config.targetLink = val?.toLowerCase() === 'true';
    }
  }

  return config;
}

/**
 * Safely moves authoring instrumentation data-aue-* attributes from
 * the original hidden authoring cells to their visible counterparts.
 */
function moveRowInstrumentation(row, targetElement) {
  if (!row || !targetElement) return;
  let source = row;
  // If the row doesn't have data-aue- attributes directly, look in the children/cell
  if (![...row.attributes].some((attr) => attr.name.startsWith('data-aue-'))) {
    const childWithAue = row.querySelector('[data-aue-prop]');
    if (childWithAue) {
      source = childWithAue;
    } else {
      const [, secondCell] = row.children;
      if (secondCell) {
        source = secondCell;
      }
    }
  }
  moveInstrumentation(source, targetElement);
}

function resolveAemPath(path) {
  if (!path || path.startsWith('http') || path.startsWith('//')) return path;
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
  // Only remove the stale block if they share the same data-aue-resource and are in authoring mode.
  const blockResource = block.dataset.aueResource;
  if (blockResource) {
    document.querySelectorAll('.bbm-cc-promo.block').forEach((other) => {
      if (other === block) return;
      if (!other.querySelector('.bbm-promo-renderer')) return;
      const otherResource = other.dataset.aueResource;
      if (otherResource && otherResource === blockResource) {
        other.remove();
      }
    });
  }

  // Remove previously built UI so re-decoration starts clean
  const existingRenderer = block.querySelector('.bbm-promo-renderer');
  if (existingRenderer) existingRenderer.remove();

  // Restore source rows to original state before parsing to ensure we can re-parse on edits
  [...block.children].forEach((row) => {
    row.classList.remove('bbm-promo-source-row');
  });

  const renderer = document.createElement('div');
  renderer.className = 'bbm-promo-renderer';

  const authConfig = parseBlockConfig(block);

  // Map each original row by normalized label for precise instrumentation transfer
  const fieldRows = {};
  [...block.children].forEach((row) => {
    if (row.children.length >= 2) {
      const rawLabel = row.children[0]?.textContent?.trim().toLowerCase() || '';
      const label = rawLabel.replace(/\s*\(.*?\)\s*/g, '').trim();
      fieldRows[label] = row;
    }
  });

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
    if (authConfig[key] !== undefined && authConfig[key] !== '') {
      finalCard[key] = authConfig[key];
    }
  });

  // Hide authored source rows so they don't show up in preview/live
  [...block.children].forEach((row) => {
    row.classList.add('bbm-promo-source-row');
  });

  // Append new renderer to the block
  block.append(renderer);

  // If we have no API data AND no authored title/image, abort
  if (!finalCard.promoId && !finalCard.title && !finalCard.detailImageUrl) {
    renderer.innerHTML = '';
    return;
  }

  const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';
  const isTargetBlank = finalCard.targetLink === 'true' || finalCard.targetLink === true;
  const isDisclaimerEnabled = finalCard.responsibleLendingDisclaimerEnabled === 'true' || finalCard.responsibleLendingDisclaimerEnabled === true;

  // Protect buildDateHtml/formatDate against invalid dates to prevent RangeError white screens
  const safeStartDate = isValidDate(finalCard.promotionStartDate) ? finalCard.promotionStartDate : '';
  const safeEndDate = isValidDate(finalCard.promotionEndDate) ? finalCard.promotionEndDate : '';

  const data = {
    title: finalCard.title || '',
    detailImageUrl: resolveAemPath(finalCard.detailImageUrl || ''),
    detailDescription: finalCard.detailDescription || '',
    startDate: safeStartDate,
    endDate: safeEndDate,
    dateValidityLabel: finalCard.dateValidityLabel || periodLabel,
    disclaimerEnabled: isDisclaimerEnabled,
    disclaimerText: finalCard.responsibleLendingDisclaimerText || '',
    targetLink: isTargetBlank,
    ctaLink: resolveAemPath(finalCard.ctaLink || ''),
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
  const ctaLabel = finalCard.ctaLabel || placeholders.promoCtaLabel || 'Register';
  const ctaHtml = data.ctaLink ? `
    <div class="bbm-promo-cta">
      <a href="${data.ctaLink}" class="button primary"${targetAttr}>${ctaLabel}</a>
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

  // Precision transfer of authoring instrumentation to visible elements for in-context editing
  if (fieldRows.title) {
    moveRowInstrumentation(fieldRows.title, renderer.querySelector('.bbm-promo-title'));
  }
  if (fieldRows['detail image']) {
    moveRowInstrumentation(fieldRows['detail image'], renderer.querySelector('.bbm-promo-image img'));
  }
  if (fieldRows['detail description']) {
    moveRowInstrumentation(fieldRows['detail description'], renderer.querySelector('.bbm-promo-description'));
  }
  if (fieldRows['promotion validity start date']) {
    moveRowInstrumentation(fieldRows['promotion validity start date'], renderer.querySelector('.bbm-promo-date'));
  }
  if (fieldRows['cta link']) {
    moveRowInstrumentation(fieldRows['cta link'], renderer.querySelector('.bbm-promo-cta a'));
  }
  if (fieldRows['disclaimer text']) {
    moveRowInstrumentation(fieldRows['disclaimer text'], renderer.querySelector('.bbm-promo-disclaimer'));
  }
}

import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { buildDateHtml, buildDisclaimerHtml, buildPromoHtml } from '../promotional-details/promotional-details.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const SOURCE_ROW_CLASS = 'bbm-promo-source-row';
const PREVIEW_CLASS = 'bbm-promo-preview';

function stripEditorAttrs(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('*').forEach((el) => {
    [...el.attributes]
      .filter(({ name }) => name.startsWith('data-aue-') || name.startsWith('data-richtext-'))
      .forEach(({ name }) => el.removeAttribute(name));
  });
  return template.innerHTML.trim();
}

function readCell(row, fieldName) {
  const cell = row.children.length > 1 ? row.children[1] : row.children[0];
  if (!cell) return '';

  const isRichText = cell.querySelector('[data-richtext-prop]')
    || cell.hasAttribute('data-richtext-prop')
    || fieldName.toLowerCase().includes('description')
    || fieldName.toLowerCase().includes('disclaimer');

  if (isRichText) return stripEditorAttrs(cell.innerHTML.trim());

  return cell.querySelector('img')?.src
    || cell.querySelector('a')?.href
    || cell.textContent.trim();
}

function readAuthoredPromo(block) {
  return [...block.children].reduce((promo, row) => {
    if (row.classList.contains(PREVIEW_CLASS)) return promo;

    const fieldName = row.querySelector('[data-aue-prop]')?.dataset.aueProp;
    if (!fieldName) return promo;

    const value = readCell(row, fieldName);
    if (value) promo[fieldName] = value;
    return promo;
  }, {});
}

function isTrue(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function isValidDate(value) {
  return value && !Number.isNaN(Date.parse(value));
}

function resolveAemPath(path) {
  if (!path || path.startsWith('http') || path.startsWith('//')) return path;
  if (window.location.hostname.includes('author-') && path.startsWith('/') && !path.startsWith('/content/')) {
    return `/content/bangkokbank${path}`;
  }
  return path;
}

function removeDuplicatePreview(block) {
  const blockResource = block.dataset.aueResource;
  document.querySelectorAll('.bbm-cc-promo.block').forEach((other) => {
    if (other === block || !other.querySelector(`.${PREVIEW_CLASS}`)) return;
    const otherResource = other.dataset.aueResource;
    if (blockResource && otherResource && blockResource !== otherResource) return;
    other.remove();
  });
}

function resetBlock(block) {
  block.querySelector(`:scope > .${PREVIEW_CLASS}`)?.remove();
  [...block.children].forEach((row) => row.classList.remove(SOURCE_ROW_CLASS));
}

function isAuthoring(block) {
  return window.self !== window.top && block.hasAttribute('data-aue-resource');
}

export default async function decorate(block) {
  removeDuplicatePreview(block);
  resetBlock(block);

  const promo = readAuthoredPromo(block);
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  const placeholders = await fetchPlaceholders();

  if (!promo.title && !promo.detailImageUrl && !promo.detailDescription) {
    if (!isAuthoring(block)) {
      [...block.children].forEach((row) => row.classList.add(SOURCE_ROW_CLASS));
    }
    return;
  }

  [...block.children].forEach((row) => row.classList.add(SOURCE_ROW_CLASS));

  const title = promo.title || '';
  const imageUrl = resolveAemPath(promo.detailImageUrl || '');
  const imageHtml = imageUrl ? `<img src="${imageUrl}" alt="${title}" loading="lazy">` : '';
  const rowClass = imageHtml ? 'bbm-promo-row' : 'bbm-promo-row bbm-promo-row-no-image';
  const imageColHtml = imageHtml ? `
    <div class="bbm-promo-image">
      <a href="${imageUrl}" title="${placeholders.promoClickToViewFull || ''}">
        ${imageHtml}
      </a>
    </div>` : '';
  const startDate = isValidDate(promo.promotionStartDate) ? promo.promotionStartDate : '';
  const endDate = isValidDate(promo.promotionEndDate) ? promo.promotionEndDate : '';
  const targetAttr = isTrue(promo.targetLink) ? ' target="_blank" rel="noopener noreferrer"' : '';
  const ctaLabel = promo.ctaLabel || placeholders.promoCtaLabel || '';
  const ctaHtml = promo.ctaLink ? `
    <div class="bbm-promo-cta">
      <a href="${resolveAemPath(promo.ctaLink)}" class="button primary"${targetAttr}>${ctaLabel}</a>
    </div>` : '';

  const preview = document.createElement('div');
  preview.className = PREVIEW_CLASS;
  preview.innerHTML = buildPromoHtml({
    titleHtml: title ? `<h2 class="bbm-promo-title">${title}</h2>` : '',
    imageColHtml,
    rowClass,
    descriptionHtml: promo.detailDescription || '',
    dateHtml: buildDateHtml(
      startDate,
      endDate,
      promo.dateValidityLabel || placeholders.promotionPeriodText || '',
      locale,
    ).replace('promo-detail-date', 'bbm-promo-date'),
    disclaimerHtml: buildDisclaimerHtml(
      isTrue(promo.responsibleLendingDisclaimerEnabled),
      promo.responsibleLendingDisclaimerText || '',
    ).replace('promo-detail-disclaimer', 'bbm-promo-disclaimer'),
    ctaHtml,
    prefix: 'bbm-promo',
  });

  block.append(preview);
}

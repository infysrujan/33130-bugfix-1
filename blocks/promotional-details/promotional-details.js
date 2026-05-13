import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };

export function formatDate(dateStr, locale = 'en-GB') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildDateHtml(start, end, label, locale) {
  if (!start && !end) return '';
  const parts = [start && formatDate(start, locale), end && formatDate(end, locale)]
    .filter(Boolean);
  return `<p class="promo-detail-date">${label} ${parts.join(' – ')}</p>`;
}

export function buildDisclaimerHtml(enabled, text) {
  if (!enabled || !text) return '';
  return `<div class="promo-detail-disclaimer pad-top-30">${text}</div>`;
}

export function buildPromoHtml({
  titleHtml,
  imageColHtml,
  rowClass,
  descriptionHtml,
  dateHtml,
  ctaHtml = '',
  disclaimerHtml = '',
  prefix = 'promo-detail',
}) {
  return `
    <div class="${prefix}-inner">
      <div class="${prefix}-center">
        <div class="${prefix}-title-wrap">
          ${titleHtml}
        </div>
        <div class="${rowClass}">
          ${imageColHtml}
          <div class="${prefix}-content">
            <div class="${prefix}-description">${descriptionHtml}</div>
            ${dateHtml}
            ${ctaHtml}
            ${disclaimerHtml}
          </div>
        </div>
      </div>
    </div>`;
}

async function fetchPromoData(url, promoId) {
  try {
    const resp = await fetch(url);
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
  const promoId = block.children[0]?.textContent?.trim() || '';
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  fetchConfigs().then((configs) => {
    const baseUrl = configs?.promotionalCardSelector || '';
    const promotionsUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');

    Promise.all([
      fetchPlaceholders(),
      fetchPromoData(promotionsUrl, promoId),
    ]).then(([placeholders, card]) => {
      const periodLabel = placeholders.promotionPeriodText || 'Promotion Period:';

      const title = card?.title
        ? `<h2 class="promo-detail-title">${card.title}</h2>`
        : '';
      const imageUrl = card?.detailImageUrl || '';
      const imageHtml = imageUrl
        ? `<img src="${imageUrl}" alt="${card?.title || ''}" loading="lazy">`
        : '';
      const description = card?.detailDescription || '';
      const startDate = card?.promotionStartDate || '';
      const endDate = card?.promotionEndDate || '';
      const disclaimerEnabled = card?.responsibleLendingDisclaimerEnabled;
      const disclaimerText = card?.responsibleLendingDisclaimerText || '';

      const rowClass = imageHtml ? 'promo-detail-row' : 'promo-detail-row promo-detail-row-no-image';
      const clickToViewFull = placeholders.promoClickToViewFull || '';
      const imageColHtml = imageHtml ? `
              <div class="promo-detail-image">
                <a href="${imageUrl}" title="${clickToViewFull}">
                  ${imageHtml}
                </a>
              </div>` : '';

      block.innerHTML = buildPromoHtml({
        titleHtml: title,
        imageColHtml,
        rowClass,
        descriptionHtml: description,
        dateHtml: buildDateHtml(startDate, endDate, periodLabel, locale),
        disclaimerHtml: buildDisclaimerHtml(disclaimerEnabled, disclaimerText),
      });
    });
  });
}

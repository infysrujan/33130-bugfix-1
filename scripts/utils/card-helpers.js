import { getLang } from '../scripts.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const MOBILE_APP_VIEW_CLASS = 'mobile-app-view';

const CARD_TYPE_PATTERNS = {
  visa: /\bvisa\b|วีซ่า/i,
  mastercard: /\bmaster\s*card\b|มาสเตอร์\s*การ์ด/i,
  amex: /\bamex\b|\bamerican\s*express\b|แอมเอ็กซ์|อเมริกัน\s*เอ็กซ์เพรส/i,
  unionpay: /\bunion\s*pay\b|\bunionpay\b|\bupi\b|ยูเนี่ยน\s*เพย์/i,
};

const CARD_TYPE_ICONS = {
  visa: '/icons/visa-new.svg',
  mastercard: '/icons/mastercard-new.svg',
  amex: '/icons/amex-new.svg',
  unionpay: '/icons/upi-new.svg',
};

export function normalizeQueryLang(value) {
  const raw = (value || '').toLowerCase();
  if (raw.startsWith('th')) return 'th';
  if (raw.startsWith('en')) return 'en';
  return '';
}

export function normalizePath(p) {
  if (!p) return '';
  const pathStr = p.split('?')[0].split('#')[0].toLowerCase();
  try {
    const url = new URL(pathStr, window.location.origin);
    return url.pathname
      .replace(/^\/content\/[^/]+/, '')
      .replace(/^\/(en|th)\b/, '')
      .replace(/\.json$/, '')
      .replace(/\.html$/, '')
      .replace(/\/+$/, '')
      || '/';
  } catch {
    return '/';
  }
}

export async function mergeLocalConfig(pathname, lang, targetConfigs, keyNormalizer) {
  try {
    const segments = pathname.split('/');
    const configPrefix = pathname.startsWith('/content/') && segments[2]
      ? `/content/${segments[2]}`
      : '';
    const resp = await fetch(`${configPrefix}/${lang}/config.json`);
    if (!resp.ok) return;
    const json = await resp.json();
    json.data
      ?.filter((config) => config.Key)
      .forEach((config) => {
        // eslint-disable-next-line no-param-reassign
        targetConfigs[keyNormalizer(config.Key)] = config.Value;
      });
  } catch {
    // Non-fatal: page continues with the config values already loaded.
  }
}

export function normalizePromotionType(value) {
  return String(value || '').trim().toLowerCase();
}

export function getPromotionPathFlags(pathname) {
  const path = String(pathname || '').toLowerCase();
  return {
    isBbmPath: /(promotions-?mb|mb-?promo)/i.test(path),
    isCreditCardPath: /(credit-cards?-promotions|creditcards?)/i.test(path),
  };
}

export function getPromotionApiConfig({
  pathname,
  configuredPromoType = '',
  bbmBaseUrl = '',
  creditBaseUrl = '',
}) {
  const { isBbmPath, isCreditCardPath } = getPromotionPathFlags(pathname);
  if (isBbmPath) return { isBbm: true, promotionType: 'bangkok-bank-m', baseUrl: bbmBaseUrl };
  if (isCreditCardPath) return { isBbm: false, promotionType: 'credit-card', baseUrl: creditBaseUrl };

  const promoType = normalizePromotionType(configuredPromoType);
  if (promoType) {
    const isBbm = promoType === 'bangkok-bank-m';
    return {
      isBbm,
      promotionType: isBbm ? 'bangkok-bank-m' : 'credit-card',
      baseUrl: isBbm ? bbmBaseUrl : creditBaseUrl,
    };
  }

  const pageNorm = normalizePath(pathname);
  const bbmDir = bbmBaseUrl ? normalizePath(bbmBaseUrl).replace(/\/[^/]+$/, '') : '';
  if (bbmDir && (pageNorm === bbmDir || pageNorm.startsWith(`${bbmDir}/`))) {
    return { isBbm: true, promotionType: 'bangkok-bank-m', baseUrl: bbmBaseUrl };
  }

  const creditDir = creditBaseUrl ? normalizePath(creditBaseUrl).replace(/\/[^/]+$/, '') : '';
  if (creditDir && (pageNorm === creditDir || pageNorm.startsWith(`${creditDir}/`))) {
    return { isBbm: false, promotionType: 'credit-card', baseUrl: creditBaseUrl };
  }

  return { isBbm: true, promotionType: 'bangkok-bank-m', baseUrl: bbmBaseUrl };
}

export function getPromotionLanguage(docLang, queryLang, isBbm) {
  return isBbm && queryLang ? queryLang : docLang;
}

export function getPromotionDataUrl(baseUrl, lang) {
  if (!baseUrl) return '';

  const [urlWithoutHash, ...hashParts] = baseUrl.split('#');
  const hash = hashParts.length ? `#${hashParts.join('#')}` : '';
  const [pathStr, ...queryParts] = urlWithoutHash.split('?');
  const search = queryParts.length ? `?${queryParts.join('?')}` : '';

  const normalizedLang = normalizeQueryLang(lang) || 'en';
  let localized = normalizedLang !== 'en'
    ? pathStr.replace(/\/en(\/|$)/i, `/${normalizedLang}$1`)
    : pathStr;

  if (normalizedLang !== 'en') {
    const langSuffix = `.${normalizedLang}.json`;
    if (!localized.toLowerCase().endsWith(langSuffix)) {
      localized = localized.toLowerCase().endsWith('.json')
        ? localized.replace(/\.json$/i, langSuffix)
        : `${localized}${langSuffix}`;
    }
  } else if (!localized.toLowerCase().endsWith('.json')) {
    localized = `${localized}.json`;
  }

  return localized + search + hash;
}

export function handleMobileAppView(searchParams) {
  const hasCardRef = searchParams.has('card_ref');
  const hasSclang = searchParams.has('sc_lang');
  const isMobileView = hasCardRef || hasSclang;

  ['header', 'footer'].forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) {
      el.style.display = isMobileView ? 'none' : '';
      el.classList.toggle('is-hidden', isMobileView);
    }
  });

  document.body.classList.toggle(MOBILE_APP_VIEW_CLASS, isMobileView);
}

function formatDate(dateStr, locale = 'en-GB') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildDateLine(card, locale) {
  const start = formatDate(card.promotionStartDate, locale);
  const end = formatDate(card.promotionEndDate, locale);
  const label = card.dateValidityLabel || 'until';
  if (start && end) return `${start} ${label} ${end}`;
  if (end) return `${label} ${end}`;
  return '';
}

export function normalizeCardTypeValue(cardType) {
  const normalized = String(cardType || '').trim();
  const match = Object.entries(CARD_TYPE_PATTERNS).find(([, pattern]) => pattern.test(normalized));
  return match ? match[0] : normalized.toLowerCase();
}

function getCardTypeLogo(cardType) {
  const value = normalizeCardTypeValue(cardType);
  const icon = CARD_TYPE_ICONS[value];
  return icon ? { value, icon } : null;
}

function buildLogosHtml(cardTypes) {
  if (!cardTypes?.length) return '';
  const imgs = cardTypes
    .map((cardType) => {
      const logo = getCardTypeLogo(cardType);
      return logo
        ? `<img src="${logo.icon}" alt="${logo.value}" class="promo-selector-logo" loading="lazy">`
        : '';
    })
    .join('');
  return `<div class="promo-selector-logos">${imgs}</div>`;
}

export function buildCardOptions(card) {
  const locale = LOCALE_MAP[getLang()] || 'en-GB';
  return {
    dateLine: buildDateLine(card, locale),
    logoHtml: buildLogosHtml(card.cardTypes || []),
  };
}

const fetchCache = {};
export async function fetchJson(url) {
  if (!url) return null;
  if (!fetchCache[url]) {
    fetchCache[url] = fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok && r.status !== 204 ? r.json() : null))
      .catch(() => null);
  }
  return fetchCache[url];
}

export function buildCardHtml(card, tag, placeholders = {}, options = {}) {
  const { dateLine = '', logoHtml = '', footerExtra = '' } = options;
  const target = card.targetLink === 'true' ? '_blank' : '_self';

  const cleanAltText = card.title
    ? card.title.replace(/<[^>]*>/g, '').trim()
    : '';

  return `<div class="listing-card-container">
  <div class="listing-card">
    <div class="listing-card-img-wrap">
      <span class="listing-card-tag">${tag}</span>
      <img src="${card.cardImageUrl}" alt="${cleanAltText}"
        class="listing-card-img" loading="lazy">
    </div>
    <div class="listing-card-body">
      <div class="listing-card-desc">${card.cardShortDescription || ''}</div>
      ${logoHtml}
      ${dateLine ? `<p class="listing-card-date">${dateLine}</p>` : ''}
    </div>
    <div class="listing-card-footer">
      <a href="${card.ctaLink || ''}" target="${target}" class="listing-card-cta button-m primary">${card.ctaLabel || placeholders.promoLearnMore || 'Learn More'}</a>
      ${footerExtra}
    </div>
  </div>
</div>`;
}

export function buildPaginationHtml(current, total) {
  if (total <= 1) return '';

  const show = new Set();
  for (let p = 1; p <= Math.min(2, total); p += 1) show.add(p);
  for (let p = Math.max(1, total - 1); p <= total; p += 1) show.add(p);
  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p += 1) show.add(p);

  const sorted = [...show].sort((a, b) => a - b);
  let inner = '';
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) {
      inner += '<span class="listing-card-ellipsis">...</span>';
    }
    const cls = p === current ? 'listing-card-page is-active' : 'listing-card-page';
    inner += `<button class="${cls}" data-page="${p}">${p}</button>`;
  });

  const prevAttr = current === 1 ? ' disabled' : '';
  const nextAttr = current === total ? ' disabled' : '';
  return `
    <button class="listing-card-arrow" data-dir="prev"${prevAttr} aria-label="Previous"><i class="icon-arrow-left" aria-hidden="true"></i></button>
    <div class="listing-card-pages">${inner}</div>
    <button class="listing-card-arrow listing-card-arrow-next" data-dir="next"${nextAttr} aria-label="Next"><i class="icon-arrow-left" aria-hidden="true"></i></button>`;
}

export function bindPaginationClick(paginationEl, pageRef, onPageChange, scrollTarget) {
  paginationEl?.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('.listing-card-page');
    const arrowBtn = e.target.closest('.listing-card-arrow');
    let changed = false;
    if (pageBtn) {
      pageRef.page = parseInt(pageBtn.dataset.page, 10);
      changed = true;
    } else if (arrowBtn?.dataset.dir === 'prev' && pageRef.page > 1) {
      pageRef.page -= 1;
      changed = true;
    } else if (arrowBtn?.dataset.dir === 'next') {
      pageRef.page += 1;
      changed = true;
    }
    if (changed) {
      onPageChange();
      scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const aStart = a.promotionStartDate ? new Date(a.promotionStartDate).getTime() : 0;
    const bStart = b.promotionStartDate ? new Date(b.promotionStartDate).getTime() : 0;
    if (bStart !== aStart) return bStart - aStart;
    const aEnd = a.promotionEndDate ? new Date(a.promotionEndDate).getTime() : Infinity;
    const bEnd = b.promotionEndDate ? new Date(b.promotionEndDate).getTime() : Infinity;
    return aEnd - bEnd;
  });
}

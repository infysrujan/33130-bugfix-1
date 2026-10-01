import { getLang } from '../scripts.js';
import { fetchConfigs } from '../config.js';
import { fetchGet } from './fetchApi.js';
import { normStr, loadSheetOrder } from './sheet-utils.js';

// Returns the correct card-name column key for the current locale.
function cardNameKey() {
  return getLang() === 'th' ? 'Card Name (TH)' : 'Card Name (EN)';
}

// Order for debit card listing pages (config key: debit-card-listing-sort).
export function loadDebitCardListingOrder() {
  return loadSheetOrder('debitCardListingSort');
}

// Order for prepaid card listing pages (config key: prepaid-card-listing-sort).
export function loadPrepaidCardListingOrder() {
  return loadSheetOrder('prepaidCardListingSort');
}

// Sorts cards by the authored row order in the config sheet.
// Debit: only rows matching cardType are used. Prepaid: all rows.
// Cards not in the sheet are appended at the end.
export function sortCardsBySheetOrder(cards, matrix, cardType) {
  if (!matrix || !matrix.length) return cards;

  const nameKey = cardNameKey(); // 'Card Name (EN)' or 'Card Name (TH)'
  const typeSlug = normStr(cardType || '');

  // Build name → row-index map, filtered by cardType for debit.
  const orderMap = {};
  matrix.forEach((row, index) => {
    if (typeSlug && normStr(row['Card Type'] || '') !== typeSlug) return;
    const name = normStr(row[nameKey] || '');
    if (name && !(name in orderMap)) orderMap[name] = index;
  });

  return [...cards].sort((a, b) => {
    const orderA = orderMap[normStr(a.name || '')] ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap[normStr(b.name || '')] ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

const CARDS_API_CONFIG_KEY = 'debitPrepaidCardSelectorSuggesterData';
const DEFAULT_CARDS_API_URL = 'https://publish-p185039-e1939903.adobeaemcloud.com/graphql/execute.json/bangkokbank/get-cards-by-language-category-and-type;language=en;';

// Three independent sessionStorage keys — one per card flow
export const CREDIT_COMPARE_STORAGE_KEY = 'ccs-compare-cards';
export const DEBIT_COMPARE_STORAGE_KEY = 'debit-compare-cards';
export const PREPAID_COMPARE_STORAGE_KEY = 'prepaid-compare-cards';

/**
 * Returns 'prepaid' | 'debit' | 'credit' based on the debit-prepaid block's
 * data-card-category attribute (set by the block itself during decoration).
 */
export function getCompareMode(doc) {
  const block = doc.querySelector('.debit-prepaid.block');
  if (!block) return 'credit';
  const category = block.dataset.cardCategory || '';
  if (category === 'prepaid-cards') return 'prepaid';
  return 'debit';
}

export function getCompareStorageKey(mode) {
  if (mode === 'prepaid') return PREPAID_COMPARE_STORAGE_KEY;
  if (mode === 'debit') return DEBIT_COMPARE_STORAGE_KEY;
  return CREDIT_COMPARE_STORAGE_KEY;
}

export function plaintext(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.plaintext || field.html || '';
}

// A URL field may come back as a plain string or a publish/author/path URL object.
export function resolveApplyUrl(urlField) {
  if (!urlField) return '';
  if (typeof urlField === 'string') return urlField;
  // eslint-disable-next-line no-underscore-dangle
  return urlField._publishUrl || urlField._authorUrl || urlField._path || '';
}

// Resolve the learn-more URL from cardPageUrl (object with _publishUrl/_authorUrl)
export function resolveCardPageUrl(card) {
  const raw = card.cardPageUrl;
  if (raw && typeof raw === 'object') {
    // eslint-disable-next-line no-underscore-dangle
    return raw._publishUrl || raw._authorUrl || raw._path || '';
  }
  return '';
}

export function resolveImageUrl(card, ...keys) {
  const raw = keys.map((key) => card[key]).find(Boolean) || '';
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // eslint-disable-next-line no-underscore-dangle
  return raw._publishUrl || raw._authorUrl || '';
}

function getCardsFromResponse(json) {
  return json?.data?.cardsList?.items || json?.data || json?.items || [];
}

// Pick the first present, non-empty field among a set of possible source-sheet key names.
export function getCardField(card, ...keys) {
  const key = keys.find((k) => card[k] !== null && card[k] !== undefined && card[k] !== '');
  return key !== undefined ? card[key] : '';
}

function getCardPageHref(card) {
  const href = resolveCardPageUrl(card);
  return href.startsWith('/content/bangkokbank')
    ? href.replace(/^\/content\/bangkokbank/, '')
    : href;
}

export function getCardViewData(card, lang) {
  const nameEN = getCardField(card, 'nameEN', 'Product Name (EN)', 'name', 'cardName');
  const nameTH = getCardField(card, 'nameTH', 'Product Name (TH)', 'cardNameTH');
  const isTH = lang === 'th';

  return {
    primaryName: isTH && nameTH ? nameTH : nameEN,
    secondaryName: isTH && nameTH ? nameEN : nameTH,
    description: getCardField(card, 'cardDescription', 'description'),
    imageUrl: resolveImageUrl(card, 'imageUrl', 'image'),
    cardId: card.cardId || card.id || '',
    learnMoreHref: getCardPageHref(card),
    slogan: plaintext(getCardField(card, 'slogan', 'Slogan', 'cardSlogan')),
    cardBenefits: plaintext(
      getCardField(card, 'cardBenefits', 'Card Benefits', 'benefits', 'cardBenefit'),
    ),
    fees: plaintext(getCardField(card, 'fees', 'Fees', 'feeDetails', 'feesDescription')),
    webApplyEnabled: card.webApplyEnabled === true || card.webApplyEnabled === 'true',
    mobileApplyEnabled: card.mobileApplyEnabled === true || card.mobileApplyEnabled === 'true',
    webApplyUrl: resolveApplyUrl(card.webApplyUrl),
    mobileApplyUrl: resolveApplyUrl(card.mobileApplyUrl),
  };
}

export async function loadCardData(cardCategory, cardType) {
  try {
    const configs = await fetchConfigs();
    const baseUrl = configs[CARDS_API_CONFIG_KEY] || DEFAULT_CARDS_API_URL;
    const lang = getLang();
    const isPrepaid = cardCategory === 'prepaid-cards';
    const typeParam = isPrepaid ? '' : `cardType=${cardType};`;
    const url = `${baseUrl.replace(/;language=[^;?&]*/i, `;language=${lang}`)}cardCategory=${cardCategory};${typeParam}`;
    const cacheKey = `bbl-dp-cards-${cardCategory}-${isPrepaid ? '' : cardType}-${lang}`;
    if (!window[cacheKey]) {
      window[cacheKey] = fetchGet(url, { throwOnError: false })
        .then(getCardsFromResponse)
        .catch(() => []);
    }
    return window[cacheKey];
  } catch {
    return [];
  }
}

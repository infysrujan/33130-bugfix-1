import { getLang } from '../scripts.js';
import { fetchConfigs } from '../config.js';
import { fetchGet } from './fetchApi.js';

const CARDS_API_CONFIG_KEY = 'debitPrepaidCardSelectorSuggesterData';
const DEFAULT_CARDS_API_URL = 'https://publish-p185039-e1939903.adobeaemcloud.com/graphql/execute.json/bangkokbank/get-cards-by-language-category-and-type;language=en;';

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

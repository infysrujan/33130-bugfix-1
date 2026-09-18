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

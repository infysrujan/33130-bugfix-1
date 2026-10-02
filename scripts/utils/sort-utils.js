import { fetchConfigs } from '../config.js';
import { fetchGet } from './fetchApi.js';

/**
 * Strips invisible Unicode chars, collapses whitespace, lowercases — used for
 * consistent key comparison across sort-sheet helpers.
 * @param {string} str
 * @returns {string}
 */
export function normStr(str) {
  return (str || '')
    .toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Strips invisible chars and normalises whitespace from every key and string
 * value in a sheet row object.
 * @param {object} row
 * @returns {object}
 */
export function normalizeSheetRow(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    const key = k.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    out[key] = typeof v === 'string'
      ? v.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim()
      : v;
  });
  return out;
}

/**
 * Fetches a sort-order sheet from the URL stored under the given config key.
 * Returns an empty array when the key is absent or the request fails.
 * @param {string} configKey - camelCase config key (e.g. 'mfCardListingSort')
 * @returns {Promise<Array>} normalised sheet rows
 */
export async function loadSheetOrder(configKey) {
  try {
    const configs = await fetchConfigs();
    const url = configs[configKey];
    if (!url) return [];
    const json = await fetchGet(url, { throwOnError: false });
    return (json?.data || []).map(normalizeSheetRow);
  } catch {
    return [];
  }
}

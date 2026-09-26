import { fetchConfigs } from '../config.js';
import { fetchGet } from './fetchApi.js';
import { getLang } from '../scripts.js';

// Strips invisible chars and normalizes whitespace/case for comparison.
function norm(str) {
  return (str || '')
    .toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function normalizeRow(row) {
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
 * Column holding the fund name in the combined EN/TH mf-suggestor filtering
 * matrix sheet, picked by current locale.
 */
export function fundNameKey() {
  return getLang() === 'th' ? 'Fund Name (TH)' : 'Fund Name (EN)';
}

async function loadSheetOrder(configKey) {
  try {
    const configs = await fetchConfigs();
    const url = configs[configKey];
    if (!url) return [];
    const json = await fetchGet(url, { throwOnError: false });
    return (json?.data || []).map(normalizeRow);
  } catch {
    return [];
  }
}

// Canonical order for the mf-suggestor Y/N questionnaire results page only.
export function loadMfSheetOrder() {
  return loadSheetOrder('mfSuggestor');
}

// Order/allow-list for carousel listing pages and the fund comparator.
export function loadCarouselListingOrder() {
  return loadSheetOrder('mfCardListingSort');
}

// A fund name can appear on more than one row when it's featured again under a
// different Fund Type (e.g. an RMF fund re-listed under "Cio Top Picks").
function buildSheetOrderMap(matrix, category) {
  const nameKey = fundNameKey();
  const catSlug = category ? norm(category).replace(/\s+/g, '-') : '';
  const catBase = catSlug.replace(/-\d+$/, '');
  const orderMap = {};

  if (catSlug) {
    matrix.forEach((row, index) => {
      const rowType = norm(row['Fund Type'] || '').replace(/\s+/g, '-');
      if (rowType !== catSlug && rowType !== catBase) return;
      const name = norm(row[nameKey] || '');
      if (name && !(name in orderMap)) orderMap[name] = index;
    });
  }

  matrix.forEach((row, index) => {
    const name = norm(row[nameKey] || '');
    if (name && !(name in orderMap)) orderMap[name] = index;
  });

  return orderMap;
}

// Keep only funds that have a row in the given sheet.
export function filterFundsInSheet(funds, matrix) {
  const orderMap = buildSheetOrderMap(matrix);
  return funds.filter((fund) => norm(fund.FundName || '') in orderMap);
}

// Sort funds to match the given sheet's authored row order for the given category.
export function sortFundsBySheetOrder(funds, matrix, category) {
  const orderMap = buildSheetOrderMap(matrix, category);

  return [...funds].sort((a, b) => {
    const orderA = orderMap[norm(a.FundName || '')] ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap[norm(b.FundName || '')] ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

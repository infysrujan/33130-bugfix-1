import { fetchConfigs } from '../config.js';
import { fetchGet } from './fetchApi.js';
import { getLang } from '../scripts.js';

// Strips zero-width/invisible characters and collapses all whitespace
// (regular, non-breaking, tabs/newlines) to a single space before comparing,
// so authored sheet names and API fund names match even when one side has
// extra/odd whitespace that the other doesn't.
function norm(str) {
  return (str || '')
    .toString()
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function normalizeRow(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    const key = k.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
    out[key] = typeof v === 'string'
      ? v.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim()
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

/**
 * Fetch the mf-suggestor filtering-matrix sheet (config key: mf-suggestor).
 * Its authored row order — top-to-bottom, drag-reorderable in the sheet —
 * is the canonical sort order for mutual fund cards across every mutual
 * fund page/block.
 */
export async function loadMfSheetOrder() {
  try {
    const configs = await fetchConfigs();
    const url = configs.mfSuggestor;
    if (!url) return [];
    const json = await fetchGet(url, { throwOnError: false });
    return (json?.data || []).map(normalizeRow);
  } catch {
    return [];
  }
}

function buildSheetOrderMap(matrix) {
  const nameKey = fundNameKey();
  const orderMap = {};
  matrix.forEach((row, index) => {
    const name = norm(row[nameKey] || '');
    if (name && !(name in orderMap)) orderMap[name] = index;
  });
  return orderMap;
}

/**
 * Keep only funds that have a row in the mf-suggestor sheet. The sheet is
 * the canonical list of funds allowed to appear anywhere on the site — a
 * fund can carry a matching category/risk tag in the funds API and still
 * not be authored into the sheet yet, and it must not show up until it is.
 */
export function filterFundsInSheet(funds, matrix) {
  const orderMap = buildSheetOrderMap(matrix);
  return funds.filter((fund) => norm(fund.FundName || '') in orderMap);
}

/**
 * Sort funds to match the row order they're authored in the mf-suggestor
 * filtering-matrix sheet. Shared by every block that renders mutual fund
 * cards so ordering stays consistent across all mutual-fund pages.
 */
export function sortFundsBySheetOrder(funds, matrix) {
  const orderMap = buildSheetOrderMap(matrix);

  return [...funds].sort((a, b) => {
    const orderA = orderMap[norm(a.FundName || '')] ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap[norm(b.FundName || '')] ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

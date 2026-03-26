import { getLang } from '../scripts.js';

const PAGE_SIZE = 8;
const QUERY_INDEX_FILE = 'query-index.json';

export function normalizeSearchTerm(term = '') {
  return term.trim().replace(/\s+/g, ' ');
}

function getQueryIndexUrl() {
  const lang = getLang();
  return `/${lang}/${QUERY_INDEX_FILE}`;
}

async function fetchQueryIndex(keywords, pageNumber, indexErrorMessage = 'Index fetch failed') {
  const lang = getLang();
  const baseUrl = getQueryIndexUrl();

  const initialRes = await fetch(
    `${baseUrl}?keywords=${encodeURIComponent(keywords)}&pageNumber=${pageNumber}&pageLanguage=${lang}`,
    { cache: 'no-store' },
  );

  if (!initialRes.ok) throw new Error(`${indexErrorMessage}: ${initialRes.status}`);
  const initialData = await initialRes.json();

  const sheet = initialData['query-index'] || initialData;
  return Array.isArray(sheet.data) ? [...sheet.data] : [];
}

function buildSearchBlob(record) {
  return [
    record.ogTitle,
    record.ogDescription,
    record.title,
    record.description,
    record.keywords,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function filterQueryIndex(records, keywords) {
  const tokens = normalizeSearchTerm(keywords).toLowerCase().split(' ').filter(Boolean);
  return records.filter((r) => {
    const searchBlob = buildSearchBlob(r);
    return tokens.every((t) => searchBlob.includes(t));
  });
}

function mapQueryIndexToResult(record) {
  const relPath = (record.path || '').replace(/["\\]/g, '').trim();

  return {
    Title: (record.title || record.ogTitle || '').trim(),
    Description: (record.description || record.ogDescription || '').trim(),
    URL: relPath,
    ItemID: relPath,
    OGTitle: (record.ogTitle || '').trim(),
    OGDescription: (record.ogDescription || '').trim(),
    OGImage: record.ogImage || record.image || '',
    OGURL: record.ogUrl || relPath,
  };
}

export async function getSiteSearchResults({ keywords, pageNumber = 1, placeholders = {} }) {
  const normalized = normalizeSearchTerm(keywords);

  if (!normalized) {
    return { searchResults: [], showLoadMore: false };
  }

  const allRecords = await fetchQueryIndex(
    normalized,
    pageNumber,
    placeholders.indexFetchFailed,
  );

  const matches = filterQueryIndex(allRecords, normalized);

  const total = matches.length;
  const offset = (pageNumber - 1) * PAGE_SIZE;
  const pageRecords = matches.slice(offset, offset + PAGE_SIZE);

  return {
    searchResults: pageRecords.map(mapQueryIndexToResult),
    showLoadMore: offset + PAGE_SIZE < total,
    noResultsMessage: total === 0 ? placeholders.noResultsFound : undefined,
  };
}

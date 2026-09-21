import { getLang } from '../scripts.js';

const PAGE_SIZE = 8; // = Constants.MaxSearchResultsPerSet
const QUERY_INDEX_FILE = 'query-index.json';
const FETCH_LIMIT = 1000; // rows per request when paging through the index sheet
const DESCRIPTION_MAX_LENGTH = 150;

// Same boosts as the Sitecore query (page body has no boost => 1)
const FIELD_BOOST = {
  keywords: 60,
  title: 40,
  description: 20,
  content: 1, // needs a "content" column in query-index (see helix-query.yaml)
};

// Pages that must never show in results (~ ShowPageInSearchResults / BasePage check)
const EXCLUDED_PATH_PATTERNS = [/\/fragments\//, /\/nav$/, /\/footer$/];

// true  = pages with the most occurrences of the search words come first,
//         the Sitecore boosted score breaks ties
// false = pure Sitecore order: boosted score first, occurrences ignored
const MOST_MATCHES_FIRST = true;

export function normalizeSearchTerm(term = '') {
  return term.trim().replace(/\s+/g, ' ');
}

/* -------------------------------------------------------------------------- */
/* Loading the index                                                          */
/* -------------------------------------------------------------------------- */

function getQueryIndexUrl() {
  const lang = getLang();
  return `/${lang}/${QUERY_INDEX_FILE}`;
}

const toSearchText = (value) => (value || '').toString().normalize('NFC').toLowerCase();

const cleanPath = (path) => (path || '').replace(/["\\]/g, '').trim();

/**
 * Pre-compute lowercase text per Sitecore-style field, once per page load.
 * OG title/description are folded into title/description so anything that
 * matched before (ogTitle / ogDescription) still matches.
 */
function prepareEntry(record) {
  return {
    record,
    path: cleanPath(record.path),
    fields: {
      keywords: toSearchText(record.keywords),
      title: toSearchText([record.title, record.ogTitle].filter(Boolean).join('\n')),
      description: toSearchText(
        [record.description, record.ogDescription].filter(Boolean).join('\n'),
      ),
      content: toSearchText(record.content),
    },
  };
}

/** Fetch EVERY row of the sheet (limit/offset), not just the first chunk. */
async function fetchAllRecords(indexErrorMessage = 'Index fetch failed') {
  const baseUrl = getQueryIndexUrl();
  const records = [];
  let offset = 0;
  let total;
  let hasMore = true;

  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop
    const res = await fetch(`${baseUrl}?limit=${FETCH_LIMIT}&offset=${offset}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${indexErrorMessage}: ${res.status}`);
    // eslint-disable-next-line no-await-in-loop
    const json = await res.json();

    const sheet = json['query-index'] || json;
    const data = Array.isArray(sheet.data) ? sheet.data : [];
    records.push(...data);
    offset += data.length;

    const sheetTotal = Number(sheet.total);
    if (Number.isFinite(sheetTotal)) total = sheetTotal;

    if (!data.length) hasMore = false;
    else if (total !== undefined) hasMore = offset < total;
    else hasMore = data.length >= FETCH_LIMIT;
  }
  return records;
}

// One fetch per language per page load ("Load more" must not re-download the index)
const indexCache = new Map();

function loadIndex(indexErrorMessage) {
  const lang = getLang();
  if (!indexCache.has(lang)) {
    const promise = fetchAllRecords(indexErrorMessage)
      .then((records) => records.map(prepareEntry))
      .catch((e) => {
        indexCache.delete(lang); // allow a retry on the next search
        throw e;
      });
    indexCache.set(lang, promise);
  }
  return indexCache.get(lang);
}

/* -------------------------------------------------------------------------- */
/* Tokens (unchanged from the previous version, Thai handling kept)           */
/* -------------------------------------------------------------------------- */

function getThaiSegments(term) {
  try {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    return [...segmenter.segment(term)]
      .filter((s) => s.isWordLike)
      .map((s) => s.segment.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [term];
  }
}

function isThaiText(term) {
  return /[\u0E00-\u0E7F]/.test(term);
}

function getSearchTokens(keywords) {
  const normalized = normalizeSearchTerm(keywords).toLowerCase();

  if (isThaiText(normalized)) {
    const thaiSegments = getThaiSegments(normalized);
    return [...new Set([...thaiSegments, normalized])].map((t) => t.normalize('NFC'));
  }

  return normalized.split(' ').filter(Boolean).map((t) => t.normalize('NFC'));
}

/* -------------------------------------------------------------------------- */
/* Sitecore logic: filter -> match per field -> boost -> sort -> dedupe       */
/* -------------------------------------------------------------------------- */

/** ~ BasePage template + ShowPageInSearchResults == "1" */
function isSearchable({ record, path }) {
  if (!path) return false;
  if (toSearchText(record.robots).includes('noindex')) return false;
  return !EXCLUDED_PATH_PATTERNS.some((re) => re.test(path));
}

/**
 * Sitecore rule: within ONE field, ALL tokens must be present (AND).
 * Fields are OR-ed together, and Solr adds up the score of every clause
 * that matched, so we sum the boost of each field that matches.
 * Returns 0 when nothing matches.
 */
function scoreEntry({ fields }, tokens) {
  return Object.entries(FIELD_BOOST).reduce((score, [field, boost]) => (
    tokens.every((t) => fields[field].includes(t)) ? score + boost : score
  ), 0);
}

/** How many times the search words appear in total, across all fields. */
function countMatches({ fields }, tokens) {
  return Object.values(fields).reduce((sum, text) => (
    sum + tokens.reduce((s, t) => s + (text ? text.split(t).length - 1 : 0), 0)
  ), 0);
}

function rankEntries(entries, tokens) {
  const seen = new Set();

  return entries
    .map((entry, order) => ({ entry, order, score: scoreEntry(entry, tokens) }))
    .filter(({ entry, score }) => score > 0 && isSearchable(entry))
    // count only pages that already matched (keeps it cheap)
    .map((item) => ({
      ...item,
      matches: MOST_MATCHES_FIRST ? countMatches(item.entry, tokens) : 0,
    }))
    // most matches -> boosted score (Sitecore) -> index order
    .sort((a, b) => b.matches - a.matches || b.score - a.score || a.order - b.order)
    // The de-duplication the Sitecore code intended (by ItemID = path)
    .filter(({ entry }) => {
      if (seen.has(entry.path)) return false;
      seen.add(entry.path);
      return true;
    })
    .map(({ entry }) => entry);
}

/* -------------------------------------------------------------------------- */
/* Description + highlight                                                    */
/* -------------------------------------------------------------------------- */

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Highlight on raw text first, then escape every part => safe HTML. */
function highlight(text, tokens) {
  if (!text) return '';
  if (!tokens.length) return escapeHtml(text);

  const pattern = [...tokens]
    .sort((a, b) => b.length - a.length) // longest match wins
    .map(escapeRegExp)
    .join('|');

  return text
    .split(new RegExp(`(${pattern})`, 'gi'))
    .map((part, i) => (i % 2 ? `<strong>${escapeHtml(part)}</strong>` : escapeHtml(part)))
    .join('');
}

/** MetaDescription -> OGDescription fallback, cut to 150 chars, then highlight. */
function truncate(text) {
  return text.length > DESCRIPTION_MAX_LENGTH
    ? `${text.slice(0, DESCRIPTION_MAX_LENGTH)}…`
    : text;
}

function mapEntryToResult({ record, path }, tokens) {
  const description = truncate((record.description || record.ogDescription || '').trim());

  return {
    Title: (record.title || record.ogTitle || '').trim(),
    Description: description, // plain text (safe with textContent)
    DescriptionHtml: highlight(description, tokens), // escaped + <strong>; use with innerHTML
    URL: path,
    ItemID: path,
    OGTitle: (record.ogTitle || '').trim(),
    OGDescription: (record.ogDescription || '').trim(),
    OGImage: record.ogImage || record.image || '',
    OGURL: record.ogUrl || path,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API (same signature/return shape as before, plus totals)            */
/* -------------------------------------------------------------------------- */

export async function getSiteSearchResults({ keywords, pageNumber = 1, placeholders = {} }) {
  const normalized = normalizeSearchTerm(keywords);
  const tokens = normalized ? getSearchTokens(normalized) : [];

  if (!tokens.length) {
    return { searchResults: [], showLoadMore: false };
  }

  const entries = await loadIndex(placeholders.indexFetchFailed);
  const matches = rankEntries(entries, tokens);

  // ~ GetIndexRangeOfItemsInPage + GetRange
  const page = Math.max(1, parseInt(pageNumber, 10) || 1);
  const total = matches.length;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const offset = (page - 1) * PAGE_SIZE;
  const pageEntries = matches.slice(offset, offset + PAGE_SIZE);

  return {
    searchResults: pageEntries.map((entry) => mapEntryToResult(entry, tokens)),
    showLoadMore: offset + PAGE_SIZE < total,
    noResultsMessage: total === 0 ? placeholders.noResultsFound : undefined,
    totalResults: total,
    totalPages,
  };
}
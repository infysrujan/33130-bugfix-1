import { getLang } from '../scripts.js';

const PAGE_SIZE = 8; // = Constants.MaxSearchResultsPerSet
const QUERY_INDEX_FILE = 'query-index.json';
const FETCH_LIMIT = 1000; // rows per request when paging through the index sheet
const DESCRIPTION_MAX_LENGTH = 150;
const MOST_MATCHES_FIRST = true;

// Sitecore boost weights – mirrors Solr .Boost() values on the live site
// Keywords: 60, Title: 40, Description: 20, Body: no boost (1)
const FIELD_BOOST = {
  keywords: 60,
  title: 40,
  description: 20,
};

// Gap 2: Exclude non-content paths that should never appear in search results
const EXCLUDED_PATH_PATTERNS = [/\/fragments\//, /\/nav$/, /\/footer$/];

export function normalizeSearchTerm(term = '') {
  return term.trim().replace(/\s+/g, ' ');
}

function getQueryIndexUrl() {
  const lang = getLang();
  return `/${lang}/${QUERY_INDEX_FILE}`;
}

/* -------------------------------------------------------------------------- */
/* HTML entity decoding – needed because index data contains encoded entities  */
/* -------------------------------------------------------------------------- */

export function decodeHtmlEntities(str = '') {
  if (!str || typeof str !== 'string' || !str.includes('&')) return str || '';
  if (typeof document !== 'undefined') {
    const txt = document.createElement('textarea');
    let current = str;
    for (let i = 0; i < 2; i += 1) {
      txt.innerHTML = current;
      const next = txt.value.replace(/\u00A0/g, ' ');
      if (next === current) break;
      current = next;
    }
    return current;
  }
  // Fallback (non-browser environments): regex-based decode
  let decoded = str;
  for (let i = 0; i < 2; i += 1) {
    if (!decoded.includes('&')) break;
    const next = decoded
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;|&#x27;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;|\u00A0/g, ' ')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export const escapeHtml = (s = '') => (s || '')
  .toString()
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* -------------------------------------------------------------------------- */
/* Field prep – decode entities then normalise for matching                   */
/* -------------------------------------------------------------------------- */

/**
 * toSearchText: decode HTML entities (e.g. &amp; → &), Unicode-normalise,
 * then lowercase – so tokens match the decoded natural text.
 */
const toSearchText = (value) => decodeHtmlEntities((value || '').toString())
  .normalize('NFC')
  .toLowerCase();

const cleanPath = (path) => (path || '').replace(/["\\]/g, '').trim();

/**
 * Pre-compute per-field lowercase text once per record so each search
 * doesn't repeat the string work.
 * ogTitle/ogDescription are folded into title/description to stay searchable
 * even when a page only carries OG meta tags.
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

/* -------------------------------------------------------------------------- */
/* Gap 1: Fetch ALL records client-side with limit/offset pagination + cache  */
/* -------------------------------------------------------------------------- */

/** Fetch every row of the sheet (limit/offset), not just the first chunk. */
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

// One fetch per language per page session ("Load more" must not re-download the index)
const indexCache = new Map();

function loadIndex(indexErrorMessage) {
  const lang = getLang();
  if (!indexCache.has(lang)) {
    const promise = fetchAllRecords(indexErrorMessage)
      .then((records) => records.map(prepareEntry))
      .catch((e) => {
        indexCache.delete(lang); // allow a retry on next search
        throw e;
      });
    indexCache.set(lang, promise);
  }
  return indexCache.get(lang);
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
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
/* Gap 2: Searchability filter – exclude nav/footer/fragments + noindex pages */
/* -------------------------------------------------------------------------- */

/** Mirrors Sitecore's BasePage template + ShowPageInSearchResults == "1" check. */
function isSearchable({ record, path }) {
  if (!path) return false;
  if (toSearchText(record.robots).includes('noindex')) return false;
  return !EXCLUDED_PATH_PATTERNS.some((re) => re.test(path));
}

/* -------------------------------------------------------------------------- */
/* Sitecore logic: match per field → boost → sort                             */
/* -------------------------------------------------------------------------- */

/**
 * Sitecore rule: ALL tokens must be present in ONE field (AND within a field).
 * Fields are then OR-ed together.
 * Returns the sum of boosts of every field that fully matches; 0 = no match.
 */
function scoreEntry({ fields }, tokens) {
  return Object.entries(FIELD_BOOST).reduce((score, [field, boost]) => (
    tokens.every((t) => fields[field].includes(t)) ? score + boost : score
  ), 0);
}

/** How many times search tokens appear in total (tie-breaker = most-match-first). */
function countMatches({ fields }, tokens) {
  return Object.values(fields).reduce((sum, text) => (
    sum + tokens.reduce((s, t) => s + (text ? text.split(t).length - 1 : 0), 0)
  ), 0);
}

/**
 * Gap 3: De-duplicate by path (mirrors Sitecore's ItemID uniqueness check),
 * then rank by most matches → boost score → original index order.
 */
function rankEntries(entries, tokens) {
  const seen = new Set();

  return entries
    .map((entry, order) => ({ entry, order, score: scoreEntry(entry, tokens) }))
    .filter(({ entry, score }) => score > 0 && isSearchable(entry))
    .map((item) => ({
      ...item,
      matches: MOST_MATCHES_FIRST ? countMatches(item.entry, tokens) : 0,
    }))
    // most matches → highest boost score → original index order
    .sort((a, b) => b.matches - a.matches || b.score - a.score || a.order - b.order)
    // De-duplication: same path can appear twice in the index sheet
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

/** Truncate to 150 chars and append ellipsis when cut. */
function truncate(text) {
  return text.length > DESCRIPTION_MAX_LENGTH
    ? `${text.slice(0, DESCRIPTION_MAX_LENGTH)}\u2026`
    : text;
}

/** Highlight on decoded plain text first, then escape each part → safe HTML. */
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

function mapEntryToResult({ record, path }, tokens) {
  const description = truncate(
    decodeHtmlEntities((record.description || record.ogDescription || '').trim()),
  );
  const title = decodeHtmlEntities((record.title || record.ogTitle || '').trim());

  return {
    Title: title,
    Description: description, // plain text – safe for textContent
    DescriptionHtml: highlight(description, tokens), // escaped + <strong>; use with innerHTML
    URL: path,
    ItemID: path,
    OGTitle: decodeHtmlEntities((record.ogTitle || '').trim()),
    OGDescription: decodeHtmlEntities((record.ogDescription || '').trim()),
    OGImage: record.ogImage || record.image || '',
    OGURL: record.ogUrl || path,
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

export async function getSiteSearchResults({ keywords, pageNumber = 1, placeholders = {} }) {
  const normalized = normalizeSearchTerm(keywords);
  const tokens = normalized ? getSearchTokens(normalized) : [];

  if (!tokens.length) {
    return { searchResults: [], showLoadMore: false };
  }

  // Gap 1: load full index (cached per language per session)
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

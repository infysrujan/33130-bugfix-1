import { fetchGet } from './fetchApi.js';

// forex-graph and forex-rates both fetch the same "latest rates" endpoint on
// load. When authored on the same page, dedupe concurrent calls to a single
// in-flight request instead of firing one per block.
export default function fetchLatestRates(url) {
  if (!url) return Promise.resolve(null);

  window.forexLatestRatesCache = window.forexLatestRatesCache || {};
  const cache = window.forexLatestRatesCache;

  if (!cache[url]) {
    cache[url] = fetchGet(url).catch((e) => {
      delete cache[url];
      throw e;
    });
  }

  return cache[url];
}

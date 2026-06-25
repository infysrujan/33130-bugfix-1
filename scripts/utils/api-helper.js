import { fetchConfigs } from '../config.js';

/**
 * Dynamically constructs the AEM API URL using the configured base URL (aemBaseUrl).
 * Extracts the user's content path using a regex and appends it to the base URL
 * with a consistent .json extension.
 *
 * @param {string} [path] - Optional path to extract/build.
 * Defaults to window.location.pathname.
 * @returns {Promise<string>} The constructed API URL.
 */
export default async function getApiUrl(path) {
  const configs = await fetchConfigs();
  let baseUrl = configs.aemBaseUrl || '';
  if (baseUrl && !baseUrl.endsWith('/')) {
    baseUrl += '/';
  }

  const targetPath = path || window.location.pathname;

  // Regex to match /content/bangkok/ or /content/bangkokbank/
  // and extract the relative path after it
  const regex = /\/content\/bangkok(?:bank)?\/(.*)/i;
  const match = targetPath.match(regex);

  let relativePath = match ? match[1] : targetPath;

  // Normalize path by removing leading/trailing slashes and any existing .json extension
  relativePath = relativePath.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.json$/i, '');

  return `${baseUrl}content/bangkokbank/${relativePath}.json`;
}

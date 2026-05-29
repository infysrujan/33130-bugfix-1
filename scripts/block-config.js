import { getLang } from './scripts.js';

// Converts hyphenated keys to camelCase while preserving original casing within
// each segment (e.g. "buttons-nextButton" → "buttonsNextButton").
// Intentionally does NOT lowercase first — unlike aem.js toCamelCase which is
// designed for CSS class names and would mush mixed-case segments together.
function keyToCamelCase(key) {
  return key.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
}

function sheetToMap(sheet) {
  const map = {};
  (sheet?.data || []).forEach(({ Key, Value }) => {
    if (Key) map[keyToCamelCase(Key)] = Value;
  });
  return map;
}

/**
 * Fetches a block-specific config JSON and returns a flat camelCased map
 * for the current page language. Keys from the `common` sheet (if present)
 * are merged in first; language-specific keys take precedence on collision.
 *
 * @param {string} path - Absolute path to the config JSON (e.g. '/taxsavings.json')
 * @returns {Promise<Record<string, string>>}
 */
export default async function fetchBlockConfig(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`Failed to load block config: ${path}`);
  const json = await resp.json();

  const common = sheetToMap(json.common);
  const lang = getLang();
  const langMap = sheetToMap(json[lang] || json.en || {});

  return { ...common, ...langMap };
}

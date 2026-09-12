const STYLE_TAG_REGEX = /<style[^>]*>[\s\S]*?<\/style>/gi;
const STYLE_CONTENT_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/gi;

const UNSAFE_CSS_PATTERNS = [
  /@import\b[^;]*;?/gi,
  /expression\s*\(/gi,
  /javascript\s*:/gi,
  /behavior\s*:/gi,
  /-moz-binding\s*:/gi,
  /url\s*\(\s*['"]?\s*javascript:/gi,
  /url\s*\(\s*['"]?data:(?!image\/)/gi,
  /<\/style/gi,
];

/**
 * Decodes HTML entities in a string (e.g. &lt; → <).
 * @param {string} encoded
 * @returns {string}
 */
export function decodeHtmlEntities(encoded) {
  const decoder = document.createElement('textarea');
  decoder.innerHTML = encoded;
  return decoder.value;
}

/**
 * Pulls inline <style> blocks out of HTML and returns stitched CSS plus body markup.
 * @param {string} html
 * @returns {{ css: string, bodyHtml: string }}
 */
export function extractStyles(html) {
  const css = [...html.matchAll(STYLE_CONTENT_REGEX)]
    .map((match) => match[1])
    .join('\n');

  const bodyHtml = html.replace(STYLE_TAG_REGEX, '');

  return { css, bodyHtml };
}

/**
 * Strips dangerous CSS constructs while preserving layout/styling rules.
 * @param {string} css
 * @returns {string}
 */
export function sanitizeCss(css) {
  if (!css || typeof css !== 'string') return '';
  return UNSAFE_CSS_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, ''),
    css,
  ).trim();
}

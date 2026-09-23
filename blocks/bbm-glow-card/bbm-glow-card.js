import { loadScript } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

const STYLE_TAG_REGEX = /<style[^>]*>[\s\S]*?<\/style>/gi;
const STYLE_CONTENT_REGEX = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const STYLES_ID = 'bbm-glow-card-styles';
const DOMPURIFY_SRC = `${window.hlx.codeBasePath}/scripts/dompurify.min.js`;

/** @type {Promise<void> | null} */
let domPurifyReady = null;

const SANITIZE_HTML_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['style', 'target', 'rel'],
  FORBID_TAGS: [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'meta',
    'link',
    'base',
    'frame',
    'frameset',
    'applet',
  ],
};

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
 * Loads DOMPurify once for this block.
 * @returns {Promise<void>}
 */
async function ensureDomPurify() {
  if (window.DOMPurify) return;
  if (!domPurifyReady) {
    domPurifyReady = loadScript(DOMPURIFY_SRC);
  }
  await domPurifyReady;
  if (!window.DOMPurify) {
    throw new Error('DOMPurify failed to load');
  }
}

/**
 * Joins paragraph text from a block item row (encoded HTML from authoring).
 * @param {Element} row
 * @returns {string}
 */
function collectParagraphText(row) {
  return [...row.querySelectorAll('p')]
    .map((p) => p.textContent)
    .join('\n');
}

/**
 * Decodes HTML entities in a string (e.g. &lt; → <).
 * @param {string} encoded
 * @returns {string}
 */
function decodeHtmlEntities(encoded) {
  const decoder = document.createElement('textarea');
  decoder.innerHTML = encoded;
  return decoder.value;
}

/**
 * Pulls inline styles out of HTML and returns stitched CSS plus body markup.
 * @param {string} html
 * @returns {{ css: string, bodyHtml: string }}
 */
function extractStyles(html) {
  const css = [...html.matchAll(STYLE_CONTENT_REGEX)]
    .map((match) => match[1])
    .join('\n');

  const bodyHtml = html.replace(STYLE_TAG_REGEX, '');

  return { css, bodyHtml };
}

/**
 * Strips dangerous CSS constructs while preserving layout and glow styling.
 * @param {string} css
 * @returns {string}
 */
function sanitizeCss(css) {
  if (!css || typeof css !== 'string') return '';
  return UNSAFE_CSS_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, ''),
    css,
  ).trim();
}

/**
 * Sanitizes authored HTML before it is injected into the DOM.
 * @param {string} html
 * @returns {string}
 */
function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return window.DOMPurify.sanitize(html, SANITIZE_HTML_CONFIG);
}

/**
 * Inserts or updates a single style element immediately after the page footer.
 * @param {string} css
 */
function injectStylesAfterFooter(css) {
  if (!css.trim()) return;

  const footer = document.querySelector('footer');
  if (!footer) return;

  let styleEl = document.getElementById(STYLES_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLES_ID;
    footer.insertAdjacentElement('afterend', styleEl);
  }

  styleEl.textContent = styleEl.textContent
    ? `${styleEl.textContent}\n${css}`
    : css;
}

/**
 * Decorates the Bbm Glow Card block.
 * Collects encoded HTML from block paragraphs, stitches embedded styles into
 * a document-level style tag after the footer, and renders body markup in the block.
 * @param {Element} block - The bbm-glow-card block element
 */
export default async function decorate(block) {
  const itemRows = [...block.children];
  const itemContent = itemRows.map((row) => ({
    row,
    decodedHtml: decodeHtmlEntities(collectParagraphText(row)),
  }));

  block.replaceChildren();

  await ensureDomPurify();

  const cssParts = [];
  itemContent.forEach(({ row, decodedHtml }) => {
    const { css, bodyHtml } = extractStyles(decodedHtml);
    if (css) cssParts.push(sanitizeCss(css));

    const content = document.createElement('div');
    content.className = 'bbm-glow-card-content';
    content.innerHTML = sanitizeHtml(bodyHtml);
    moveInstrumentation(row, content);
    block.appendChild(content);
  });

  injectStylesAfterFooter(cssParts.join('\n'));
}

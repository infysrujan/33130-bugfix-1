import { loadScript } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';
import { decodeHtmlEntities, extractStyles, sanitizeCss } from '../../scripts/custom-css.js';

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

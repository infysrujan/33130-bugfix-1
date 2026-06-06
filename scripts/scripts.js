import {
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateButtons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  getMetadata,
} from './aem.js';

import {
  decorateSvgWithAltText,
  decorateTerritoryButtons,
  decorateButtonsV1,
  loadBreadcrumb,
  loadWelcomeBanner,
  buildCookieAlert,
} from './bbl-decorators.js';

import decorateTabs from '../blocks/tabs/tabs-helper.js';

/**
 * Gets the language from the HTML tag.
 * @returns {string} The language code (e.g., 'en', 'th')
 */
export function getLang() {
  return document.documentElement.lang || 'en';
}

/**
 * Moves all the attributes from a given elmenet to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveAttributes(from, to, attributes) {
  if (!attributes) {
    // eslint-disable-next-line no-param-reassign
    attributes = [...from.attributes].map(({ nodeName }) => nodeName);
  }
  attributes.forEach((attr) => {
    const value = from.getAttribute(attr);
    if (value) {
      to?.setAttribute(attr, value);
      from.removeAttribute(attr);
    }
  });
}

/**
 * Move instrumentation attributes from a given element to another given element.
 * @param {Element} from the element to copy attributes from
 * @param {Element} to the element to copy attributes to
 */
export function moveInstrumentation(from, to) {
  moveAttributes(
    from,
    to,
    [...from.attributes]
      .map(({ nodeName }) => nodeName)
      .filter((attr) => attr.startsWith('data-aue-') || attr.startsWith('data-richtext-')),
  );
}

/**
 * Create HTML element from template string
 * @param {string} html - HTML template string
 * @param {Document} doc - Document reference
 * @returns {Element} The created element
 */
export function createElementFromHTML(html, doc) {
  const template = doc.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    decorateTabs(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateTerritoryButtons(main);
  decorateSvgWithAltText(main);

  const pageVariant = getMetadata('pagevariant');
  if (pageVariant) {
    document.body.classList.add(`${pageVariant}`);
  }
}

/**
 * Handles 'bbl:load-fragment' events so any module can load a fragment via
 * dispatchEvent without importing fragment.js (which imports scripts.js,
 * creating a cycle). Registering here ensures the listener is active on every
 * page, even pages that contain no fragment blocks.
 */
document.addEventListener('bbl:load-fragment', async (e) => {
  const { path, callback } = e.detail;
  if (!path) return;

  try {
    const cleanPath = path.replace(/(\.plain)?\.html/, '');
    const resp = await fetch(`${cleanPath}.plain.html`);
    let fragment = null;
    if (resp.ok) {
      fragment = document.createElement('main');
      fragment.innerHTML = await resp.text();
      const resetBase = (tag, attr) => {
        fragment.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((el) => {
          // eslint-disable-next-line no-param-reassign
          el[attr] = new URL(el.getAttribute(attr), new URL(cleanPath, window.location)).href;
        });
      };
      resetBase('img', 'src');
      resetBase('source', 'srcset');
      decorateMain(fragment);
      await loadSections(fragment);
    }
    if (typeof callback === 'function') callback(fragment);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[bbl:load-fragment] Failed to load: ${path}`, err);
  }
});

/**
 * Resolves html lang from URL path (locale segment after host, e.g. bangkokbank.com/en/...).
 * @param {string} pathname - `window.location.pathname`
 * @returns {'en'|'th'}
 */
function getDocumentLangFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];

  if (document.querySelector('[data-aue-resource]')) {
    const lang = segments[2];
    if (lang === 'en') return 'en';
    if (lang === 'th') return 'th';
  }

  if (first === 'en') return 'en';
  if (first === 'th') return 'th';

  // Check bblcorporate#lang cookie
  const cookie = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('bblcorporate#lang='));
  if (cookie) {
    return cookie.split('=')[1];
  }

  // Fallback to 'th'
  return 'th';
}

function decorateOgTitle() {
  const shortTitle = getMetadata('short-title');
  const title = shortTitle || document.title;
  if (!title) return;

  let meta = document.head.querySelector('meta[property="og:title"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', 'og:title');
    document.head.append(meta);
  }
  meta.setAttribute('content', title);
}

function decorateOgImage() {
  const ogImagePath = getMetadata('ogImage') || getMetadata('ogimage');
  if (!ogImagePath) return;

  const url = ogImagePath.startsWith('http') ? ogImagePath : `${window.location.origin}${ogImagePath}`;

  let meta = document.head.querySelector('meta[property="og:image"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('property', 'og:image');
    document.head.append(meta);
  }
  meta.setAttribute('content', url);
}

/**
 * Strip AEM image optimization query params from a URL.
 * @param {string|null|undefined} url
 * @returns {string|null|undefined}
 */
function stripImageOptimizationParams(url) {
  if (typeof url !== 'string') return url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

/**
 * Strip AEM image optimization query params from a srcset value.
 * @param {string|null|undefined} srcset
 * @returns {string|null|undefined}
 */
function stripSrcsetOptimizationParams(srcset) {
  if (typeof srcset !== 'string') return srcset;
  return srcset.split(',').map((entry) => {
    const parts = entry.trim().split(/\s+/);
    parts[0] = stripImageOptimizationParams(parts[0]);
    return parts.join(' ');
  }).join(', ');
}

/**
 * Remove optimization params from all picture source/img URLs in the document.
 * @param {Document|Element} root
 */
export function removePictureOptimizationParams(root) {
  root.querySelectorAll('picture').forEach((picture) => {
    picture.querySelectorAll('source[srcset]').forEach((source) => {
      source.setAttribute('srcset', stripSrcsetOptimizationParams(source.getAttribute('srcset')));
    });
    picture.querySelectorAll('img[src]').forEach((img) => {
      img.setAttribute('src', stripImageOptimizationParams(img.getAttribute('src')));
    });
  });
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = getDocumentLangFromPath(window.location.pathname);
  removePictureOptimizationParams(doc);
  decorateTemplateAndTheme();
  decorateOgTitle();
  decorateOgImage();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 1025 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadWelcomeBanner(doc);
  await loadSections(main);

  await buildCookieAlert(main);

  // Decorate buttons again after all sections are loaded (for dynamically loaded content like tabs)
  decorateButtonsV1(main);
  decorateSvgWithAltText(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  const disabledSections = new Set(
    getMetadata('disable-sections', doc)
      .split(',')
      .map((section) => section.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!disabledSections.has('header')) {
    loadHeader(doc.querySelector('header'));
  }
  if (!disabledSections.has('footer')) {
    loadFooter(doc.querySelector('footer'));
  }

  await loadBreadcrumb(doc);
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  // Add link click handler for URL validation
  setTimeout(() => {
    document.dispatchEvent(new Event('lazy-phase'));
    window.LAZY_PHASE = true;
  }, 150);
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();

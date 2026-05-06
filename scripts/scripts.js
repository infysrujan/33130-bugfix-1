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
 * Resolves html lang from URL path (locale segment after host, e.g. bangkokbank.com/en/...).
 * @param {string} pathname - `window.location.pathname`
 * @returns {'en'|'th'}
 */
function getDocumentLangFromPath(pathname) {
  const first = pathname.split('/').filter(Boolean)[0];
  if (first === 'en') return 'en';
  if (first === 'th') return 'th';
  return 'th';
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = getDocumentLangFromPath(window.location.pathname);
  decorateTemplateAndTheme();
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
  await loadSections(main);

  await buildCookieAlert(main);

  // Decorate buttons again after all sections are loaded (for dynamically loaded content like tabs)
  decorateButtonsV1(main);
  decorateSvgWithAltText(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  await loadBreadcrumb(doc);
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  // Add link click handler for URL validation
  setTimeout(() => {
    document.dispatchEvent(new Event('lazy-phase'));
    Window.LAZY_PHASE = true;
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

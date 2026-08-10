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
  toClassName,
} from './aem.js';

import {
  decorateSvgWithAltText,
  decorateTertiaryButtons,
  decorateButtonsV1,
  loadBreadcrumb,
  loadWelcomeBanner,
  buildCookieAlert,
} from './bbl-decorators.js';

import decorateTabs from '../blocks/tabs/tabs-helper.js';
import initRteAnchors, { decorateRteInlineImages, decorateNewTabLinks, decorateEncodedNbsp } from './custom-rte.js';

import env from './utils/env.js';
import { getCookie } from './utils/cookies.js';
/**
 * Import the martech plugin.
 * See: https://github.com/adobe-rnd/aem-martech#launch-container-configuration for more information.
 */
/* eslint-disable import/no-relative-packages -- martech lives under plugins/, not node_modules */
import {
  initMartech,
  martechEager,
  martechLazy,
  martechDelayed,
} from '../plugins/martech/src/index.js';
/* eslint-enable import/no-relative-packages */

/**
 * Import the gtm-martech plugin.
 * See: https://github.com/adobe-rnd/aem-gtm-martech#launch-container-configuration for more information.
 */
import gtmMartech from './gtm-martech.js';
import { initCdpEvents } from './analytics.js';
import { initMarketingConsentListener } from './consent.js';

initMarketingConsentListener();

// Consent when AnalysisCookie is 'Analysis' (cookie-modal / cookie-alert).
// Load martech unless the URL query includes martech=off (DA preview).
let isConsentGiven = getCookie('AnalysisCookie') === 'Analysis';
const isEnabled = !window.location.search.includes('martech=off');

/**
 * Configuration for each environment.
 * @type {Object}
 */
// TODO: Update BBL's Dev, Stage and Prod datastream IDs here
const dataStreamConfig = {
  dev: '3298fa2b-518b-4f4f-9bb3-ae153303a854',
  stage: '3298fa2b-518b-4f4f-9bb3-ae153303a854',
  prod: '3298fa2b-518b-4f4f-9bb3-ae153303a854',
};

// TODO: Update BBL's Launch script URLs here
const launchConfig = {
  dev: [
    'https://assets.adobedtm.com/0e4712067e10/931565ba35cd/launch-f69e7329c58a-development.min.js',
  ],
  stage: [
    'https://assets.adobedtm.com/0e4712067e10/931565ba35cd/launch-f69e7329c58a-development.min.js',
  ],
  prod: [],
};

const orgId = '599F1E47665EC45B0A495E73@AdobeOrg';

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
    if (!window.location.hostname.includes('localhost')) {
      sessionStorage.setItem('fonts-loaded', 'true');
    }
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
function decorateSectionIds(main) {
  main.querySelectorAll('.section[data-id]').forEach((section) => {
    section.id = toClassName(section.dataset.id);
    delete section.dataset.id;
  });
}

// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionIds(main);
  decorateBlocks(main);
  decorateTertiaryButtons(main);
  decorateSvgWithAltText(main);
  decorateNewTabLinks(main);
  decorateEncodedNbsp(main);

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
  const { path, callback, onHtmlParsed } = e.detail;
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
      if (typeof onHtmlParsed === 'function') onHtmlParsed(fragment, cleanPath);
      decorateMain(fragment);
      await loadSections(fragment);
    }
    if (typeof callback === 'function') await callback(fragment);
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

  const url = ogImagePath.startsWith('http')
    ? ogImagePath
    : `${window.location.origin}${ogImagePath}`;

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
  return srcset
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(/\s+/);
      parts[0] = stripImageOptimizationParams(parts[0]);
      return parts.join(' ');
    })
    .join(', ');
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
  const martechLoadedPromise = initMartech(
    // WebSDK Configuration
    // TODO: Remove the below comment once the WebSDK Configuration is updated.
    // Docs: https://experienceleague.adobe.com/en/docs/experience-platform/web-sdk/commands/configure/overview#configure-js
    {
      datastreamId: dataStreamConfig[env],
      orgId,
      edgeDomain: 'edge.bangkokbank.com',
      onBeforeEventSend: (payload) => {
        if (payload.xdm.eventType === 'pageLoaded') {
          // eslint-disable-next-line no-console
          console.debug('Prevented custom `pageLoaded` event trigger', payload);
          return false;
        }
        return true;
      },
    },
    // 2. Library Configuration
    {
      analytics: isEnabled,
      personalization: !!getMetadata('target') && isEnabled,
      launchUrls: launchConfig[env],
      trackPageView: false, // disables the first collect call
    },
  );

  document.documentElement.lang = getDocumentLangFromPath(window.location.pathname);
  removePictureOptimizationParams(doc);
  decorateTemplateAndTheme();
  decorateOgTitle();
  decorateOgImage();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await Promise.all([
      // Load the martech library in the eager phase.
      martechLoadedPromise.then(martechEager),
      // Load the gtm-martech library in the eager phase.
      gtmMartech.eager(),
      loadSection(main.querySelector('.section'), waitForFirstImage),
      loadWelcomeBanner(doc),
    ]);
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
  const disabledSections = new Set(
    getMetadata('disable-sections', doc)
      .split(',')
      .map((section) => section.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!disabledSections.has('header')) {
    loadHeader(doc.querySelector('header'));
  }
  const main = doc.querySelector('main');
  await loadSections(main);

  // Load the gtm-martech library in the lazy phase.
  await gtmMartech.lazy();
  await buildCookieAlert(main);

  // Decorate buttons again after all sections are loaded (for dynamically loaded content like tabs)
  decorateButtonsV1(main);
  decorateSvgWithAltText(main);

  initRteAnchors(main, doc);
  decorateRteInlineImages(main);
  decorateNewTabLinks(main);

  if (!disabledSections.has('footer')) {
    loadFooter(doc.querySelector('footer'));
  }

  // Load the martech library in the lazy phase.
  await martechLazy();

  await loadBreadcrumb(doc);
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

  // Add link click handler for URL validation
  setTimeout(() => {
    document.dispatchEvent(new Event('lazy-phase'));
    window.LAZY_PHASE = true;
  }, 150);
}

async function bblMartechDelayed() {
  isConsentGiven = getCookie('AnalysisCookie') === 'Analysis';

  // Initialize the CDP events only if consent is given and martech is enabled.
  if (isEnabled && isConsentGiven) {
    initCdpEvents();
  }
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // load the gtm-martech library in the delayed phase
  window.setTimeout(() => gtmMartech.delayed(), 1000);

  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => {
    // Load the martech library in the delayed phase.
    martechDelayed();
    // trigger the martech delayed phase
    bblMartechDelayed();

    import('./delayed.js');
  }, 3000);
  // load anything that can be postponed to the latest here

  // trigger the martech delayed phase when the consent is updated
  // eslint-disable-next-line no-return-await
  window.addEventListener('consent-update', async () => await bblMartechDelayed());
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();

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

function getCookie(name) {
  if (!name) return '';
  const encoded = encodeURIComponent(name);
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${encoded}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : '';
}

let decorateTabs;
let initRteAnchors;
let decorateIconInContainer;
let decorateNewTabLinks;
let decorateEncodedNbsp;

let martech;
let gtmMartech;
let initCdpEvents;
let env;

async function loadMarketingModules() {
  const [martechModule, gtmModule, analyticsModule, consentModule, envModule] = await Promise.all([
    // eslint-disable-next-line import/no-relative-packages
    import('../plugins/martech/src/index.js'),
    import('./gtm-martech.js'),
    import('./analytics.js'),
    import('./consent.js'),
    import('./utils/env.js'),
  ]);

  martech = martechModule;
  gtmMartech = gtmModule.default;
  ({ initCdpEvents } = analyticsModule);
  env = envModule.default;
  consentModule.initMarketingConsentListener();
}

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
  stage: '754d5abb-573b-4c8f-907d-a45e3418d700',
  prod: '68f164c2-a131-443a-a28d-8331a08e499c',
};

// TODO: Update BBL's Launch script URLs here
const launchConfig = {
  dev: [
    'https://assets.adobedtm.com/0e4712067e10/931565ba35cd/launch-f69e7329c58a-development.min.js',
  ],
  stage: [
    'https://assets.adobedtm.com/0e4712067e10/931565ba35cd/launch-bb28126e1019-staging.min.js',
  ],
  prod: [
    'https://assets.adobedtm.com/0e4712067e10/931565ba35cd/launch-f8fe1c3d0242.min.js',
  ],
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
    decorateTabs?.(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

function decorateSectionIds(main) {
  main.querySelectorAll('.section[data-id]').forEach((section) => {
    section.id = toClassName(section.dataset.id);
    delete section.dataset.id;
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The container element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateSectionIds(main);
  decorateBlocks(main);
  decorateTertiaryButtons(main);
  decorateSvgWithAltText(main);
  decorateNewTabLinks?.(main);
  decorateEncodedNbsp?.(main);

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

const SUPPORTED_LOCALES = ['en', 'th', 'zh', 'jp'];

/**
 * Resolves html lang from URL path (locale segment after host, e.g. bangkokbank.com/en/...).
 * @param {string} pathname - `window.location.pathname`
 * @returns {'en'|'th'|'zh'|'jp'}
 */
function getDocumentLangFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  const getLocale = (index) => {
    const locale = segments[index];
    return SUPPORTED_LOCALES.includes(locale) ? locale : '';
  };

  if (document.querySelector('[data-aue-resource]')) {
    const authoringLocale = getLocale(2);
    if (authoringLocale) return authoringLocale;
  }

  const pathLocale = getLocale(0);
  if (pathLocale) return pathLocale;

  const cookieLocale = getCookie('bblcorporate#lang');
  return SUPPORTED_LOCALES.includes(cookieLocale) ? cookieLocale : 'th';
}

function redirectToLocale() {
  // Don't redirect on the authoring instance — path/locale rewrites would fight
  // with the editor's own resource path.
  if (document.querySelector('[data-aue-resource]')) return;

  let { pathname } = window.location;

  // Remove trailing slash if present (except for root)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
    window.location.href = pathname + window.location.search + window.location.hash;
    return;
  }

  const locale = getDocumentLangFromPath(pathname);

  // If locale doesn't exist in path, redirect
  if (!new RegExp(`^/(${SUPPORTED_LOCALES.join('|')})(/|$)`).test(pathname)) {
    window.location.href = `/${locale}${pathname === '/' ? '/' : pathname}`;
  }
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
 * Viewport LCP image (hero mobile/desktop of the default slide).
 * @param {Document|Element} root
 * @returns {HTMLImageElement|null}
 */
function getLcpImage(root) {
  const main = root.querySelector?.('main')
    || (root.matches?.('main') ? root : null)
    || root;
  const isMobile = window.matchMedia('(width <= 47.5rem)').matches;
  const hero = main.querySelector?.('.hero');
  if (hero) {
    const rows = [...hero.children].slice(1, 8);
    const defaultRow = rows.find((row) => row.children[1]?.textContent?.trim() === 'true') || rows[0];
    const pictures = defaultRow?.querySelectorAll('picture') || [];
    const picture = (isMobile ? pictures[1] : pictures[0]) || pictures[0] || pictures[1];
    const img = picture?.querySelector('img');
    if (img) return img;
  }
  return main.querySelector?.('img') || null;
}

function hintLcpImage(img) {
  if (!img) return;
  img.fetchPriority = 'high';
  img.setAttribute('fetchpriority', 'high');
  img.setAttribute('loading', 'eager');
  img.loading = 'eager';
}

function promoteFirstImage(section) {
  const image = section?.querySelector('img[fetchpriority="high"]')
    || section?.querySelector('img');
  hintLcpImage(image);
}

/**
 * Remove optimization params from all picture source/img URLs in the document.
 * @param {Document|Element} root
 */
export function removePictureOptimizationParams(root) {
  const lcpImg = getLcpImage(root);
  root.querySelectorAll('picture').forEach((picture) => {
    if (picture.closest('.hero')) return;
    if (lcpImg && picture.contains(lcpImg)) return;
    picture.querySelectorAll('source[srcset]').forEach((source) => {
      source.setAttribute('srcset', stripSrcsetOptimizationParams(source.getAttribute('srcset')));
    });
    picture.querySelectorAll('img[src]').forEach((img) => {
      img.setAttribute('src', stripImageOptimizationParams(img.getAttribute('src')));
    });
  });
}

function mainHasTabs(main) {
  if (!main) return false;
  return [...main.querySelectorAll('div.section-metadata > div > div:first-child')]
    .some((cell) => toClassName(cell.textContent) === 'tab-name');
}

function promoteFirstSectionImages(main) {
  const wrapper = [...(main?.querySelectorAll(':scope > .section > .default-content-wrapper') || [])][0];
  if (!wrapper) return;

  wrapper.querySelectorAll('img').forEach((img) => {
    img.loading = 'eager';
    img.setAttribute('loading', 'eager');
    img.fetchPriority = 'high';
    img.setAttribute('fetchpriority', 'high');
  });
}

function isHeaderOverlapped(main) {
  if (document.body.classList.contains('bangkok-bankm-card')) return true;
  const first = main?.querySelector(':scope > .section') || main?.firstElementChild;
  return !!(first?.classList.contains('hero-container')
    || first?.classList.contains('carousel-dotted-container')
    || first?.querySelector('.hero, .carousel-dotted'));
}

function whenStylesReady() {
  const link = [...document.head.querySelectorAll('link[rel="stylesheet"]')]
    .find((el) => (el.getAttribute('href') || '').includes('/styles/styles.css'));
  if (!link || (link.sheet && link.media === 'all')) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
    if (link.sheet && link.media === 'all') resolve();
  });
}

function startHeader(doc) {
  const disabled = getMetadata('disable-sections', doc)
    .split(',')
    .map((section) => section.trim().toLowerCase());
  if (disabled.includes('header')) return Promise.resolve();
  const header = doc.querySelector('header');
  if (!header || header.querySelector('.header')) return Promise.resolve();
  if (!isHeaderOverlapped(doc.querySelector('main'))) {
    header.classList.add('is-not-overlapped');
  }
  return loadHeader(header);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
// function startHeroBlock() {
//   const base = window.hlx?.codeBasePath || '';
//   loadCSS(`${base}/blocks/hero/hero.css`);
//   import(`${base}/blocks/hero/hero.js`).catch(() => {});
// }

async function loadEager(doc) {
  // if (doc.querySelector('.hero')) startHeroBlock();
  document.documentElement.lang = getDocumentLangFromPath(window.location.pathname);
  hintLcpImage(getLcpImage(doc));
  decorateTemplateAndTheme();
  decorateOgTitle();
  decorateOgImage();
  whenStylesReady().then(() => startHeader(doc));
  const main = doc.querySelector('main');
  if (mainHasTabs(main)) {
    ({ default: decorateTabs } = await import('../blocks/tabs/tabs-helper.js'));
  }
  if (main) {
    decorateMain(main);
    promoteFirstSectionImages(main);
    promoteFirstImage(main);
    document.body.classList.add('appear');
    loadWelcomeBanner(doc);
    if (!isHeaderOverlapped(main)) {
      doc.querySelector('header')?.classList.add('is-not-overlapped');
    }
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
  ({
    default: initRteAnchors,
    decorateIconInContainer,
    decorateNewTabLinks,
    decorateEncodedNbsp,
  } = await import('./custom-rte.js'));

  const themeStyles = `${window.hlx.codeBasePath}/styles`;
  [
    'theme-wealth.css',
    'theme-private.css',
    'theme-bbm.css',
    'theme-global-section.css',
  ].forEach((file) => loadCSS(`${themeStyles}/${file}`));

  const disabledSections = new Set(
    getMetadata('disable-sections', doc)
      .split(',')
      .map((section) => section.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!disabledSections.has('header') && !doc.querySelector('header .header')) {
    loadHeader(doc.querySelector('header'));
  }
  const main = doc.querySelector('main');
  decorateNewTabLinks(main);
  decorateEncodedNbsp(main);
  await loadSections(main);

  if (!isEnabled) {
    await buildCookieAlert(main);
    // Keep the page rendering flow intact, but skip martech/third-party loading.
    // Remaining non-marketing work continues below.
  } else {
    await loadMarketingModules();
    const martechLoadedPromise = martech.initMartech(
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
      {
        analytics: isEnabled,
        personalization: !!getMetadata('target') && isEnabled,
        launchUrls: launchConfig[env],
        trackPageView: false,
      },
    );

    await Promise.all([
      martechLoadedPromise.then(martech.martechEager),
      gtmMartech.eager(),
    ]);

    // Load the gtm-martech library in the lazy phase.
    await gtmMartech.lazy();
    await buildCookieAlert(main);
  }

  // Decorate buttons again after all sections are loaded (for dynamically loaded content like tabs)
  decorateButtonsV1(main);
  decorateSvgWithAltText(main);

  initRteAnchors(main, doc);
  decorateIconInContainer(main);
  const firstBlock = main?.querySelector('div.block');
  if (firstBlock) promoteFirstImage(firstBlock);
  promoteFirstImage(main);
  decorateNewTabLinks(main);

  if (!disabledSections.has('footer')) {
    loadFooter(doc.querySelector('footer'));
  }
  if (isEnabled) {
    // Load the martech library in the lazy phase.
    await martech.martechLazy();
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
  if (!isEnabled) return;
  // load the gtm-martech library in the delayed phase
  window.setTimeout(() => gtmMartech?.delayed(), 1000);

  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => {
    // Load the martech library in the delayed phase.
    martech?.martechDelayed();
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
  if (await redirectToLocale()) return;
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();

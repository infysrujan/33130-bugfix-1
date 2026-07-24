import { getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation, getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

function isBreadcrumbAuthoringInstance() {
  const hasAdobeEdit = !!document.querySelector('.adobe-ue-edit');
  const main = document.querySelector('main');
  const hasAueAttrs = [main]
    .filter(Boolean)
    .some((el) => [...el.attributes].some(({ name }) => name.startsWith('data-aue-')));

  return hasAdobeEdit || hasAueAttrs;
}

/**
 * Converts an AEM content page path to a site URL path.
 * e.g. /content/text/en/personal/my-family-and-me -> /en/personal/my-family-and-me
 * @param {string} pagePath AEM page path
 * @returns {string} Site URL path
 */
export function pagePathToUrl(pagePath) {
  if (!pagePath) return '';
  const match = pagePath.match(/^\/content\/[^/]+(\/.*)?$/);
  return match?.[1] || pagePath;
}

/**
 * Collects breadcrumb pages from the API response and returns them
 * ordered root-to-leaf (ascending pageDepth).
 * @param {Object} data API response from pageinfo.parent endpoint
 * @returns {Array<Object>} Ordered breadcrumb page objects
 */
function buildBreadcrumbTrail(data) {
  const pages = [];
  const seen = new Set();

  const addPage = (page) => {
    if (!page) return;
    const id = page.jcrUuid || page.pagePath;
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    pages.push(page);
  };

  if (data.currentPage) {
    addPage(data.currentPage);
  }

  let parent = data.parent || data.currentPage?.parent;
  while (parent) {
    addPage(parent);
    parent = parent.parent;
  }

  return pages
    .filter((page) => page.pageDepth > 3 && !page.hidebreadcrumb)
    .sort((a, b) => a.pageDepth - b.pageDepth);
}

/**
 * Fetches breadcrumb (parent page) data from the AEM pageinfo endpoint.
 * Results are cached per pathname for the lifetime of the page.
 * @returns {Promise<Object>} Object containing breadcrumbPages and currentPageData
 */
let breadcrumbDataCache = null;

async function loadBreadcrumbData() {
  const configs = await fetchConfigs();
  const isAuthoring = isBreadcrumbAuthoringInstance();
  const AEM_BASE_URL_FOR_BREADCRUMB = isAuthoring
    ? configs.breadcrumbAemBaseAuthorUrl
    : configs.breadcrumbAemBaseUrl;
  if (!AEM_BASE_URL_FOR_BREADCRUMB) {
    return { breadcrumbPages: [], currentPageData: null };
  }
  try {
    const { pathname } = window.location;
    let apiUrl;

    if (isAuthoring) {
      const cleanPath = pathname.replace(/\.html$/, '');
      apiUrl = `${AEM_BASE_URL_FOR_BREADCRUMB}${cleanPath}.pageinfo.parent.json`;
    } else {
      apiUrl = `${AEM_BASE_URL_FOR_BREADCRUMB}/content/bangkokbank${pathname}.pageinfo.parent.json`;
    }
    const data = await fetchGet(apiUrl);

    const currentPageData = data.currentPage || null;
    const breadcrumbPages = buildBreadcrumbTrail(data);

    return { breadcrumbPages, currentPageData };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Breadcrumb data fetch error:', error);
    return { breadcrumbPages: [], currentPageData: null };
  }
}

export async function fetchBreadcrumbData() {
  const { pathname } = window.location;
  if (breadcrumbDataCache?.pathname === pathname) {
    return breadcrumbDataCache.promise;
  }

  const promise = loadBreadcrumbData();
  breadcrumbDataCache = { pathname, promise };
  return promise;
}

/**
 * Resolves the URL for the next available parent page using breadcrumb API data.
 * @returns {Promise<string|null>} Parent page URL or null if none found
 */
export async function getParentPageUrl() {
  const { breadcrumbPages, currentPageData } = await fetchBreadcrumbData();

  if (breadcrumbPages.length >= 2) {
    return pagePathToUrl(breadcrumbPages[breadcrumbPages.length - 2].pagePath);
  }

  let parent = currentPageData?.parent;
  while (parent) {
    if (parent.pagePath) {
      return pagePathToUrl(parent.pagePath);
    }
    parent = parent.parent;
  }

  return null;
}

/**
 * Loads and appends the social-icons fragment as a sibling of the breadcrumb block.
 * @param {Element} block The breadcrumb block element
 */
async function loadSocialIcons(block) {
  try {
    const { loadFragment } = await import('../fragment/fragment.js');
    const fragment = await loadFragment(`/${getLang()}/fragments/social-icons`);
    if (fragment) {
      const allSocialBlocks = [...fragment.querySelectorAll('.social-icons.block')];
      const socialIconsBlock = allSocialBlocks.reduce((best, current) => (
        current.children.length > (best?.children.length ?? -1) ? current : best
      ), null);
      if (socialIconsBlock) {
        const socialWrapper = socialIconsBlock.parentElement;
        if (socialWrapper) {
          block.parentElement.appendChild(socialWrapper);
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load social-icons fragment:', error);
  }
}

/**
 * Current page label: short-title → API pageTitle → API jcrTitle.
 * @param {Object} page
 * @param {string} shortTitle
 * @returns {string}
 */
function getCurrentPageLabel(page) {
  return page.shortTitle || page.pageTitle || page.jcrTitle || '';
}

/**
 * Parent page label: API pageTitle only.
 * @param {Object} page
 * @returns {string}
 */
function getParentPageLabel(page) {
  return page.shortTitle || page.pageTitle || page.jcrTitle || '';
}

/**
 * Builds breadcrumb navigation from fetched AEM page data
 * @param {Element} block The breadcrumb block element
 */
export default async function decorate(block) {
  const breadcrumb = getMetadata('breadcrumb');

  // Hide breadcrumb block if metadata value is 'false'
  if (breadcrumb === 'false') {
    block.style.display = 'none';

    // Also hide social-icons block if it exists
    const socialIconsBlock = document.querySelector('.social-icons.block');
    if (socialIconsBlock) {
      socialIconsBlock.style.display = 'none';
    }
    return;
  }

  const { breadcrumbPages, currentPageData } = await fetchBreadcrumbData();

  const innerContainer = document.createElement('div');
  innerContainer.className = 'inner-container content';

  const ol = document.createElement('ol');

  // Move instrumentation from block to ol for Universal Editor tracking
  moveInstrumentation(block, ol);

  innerContainer.appendChild(ol);
  block.appendChild(innerContainer);

  // Homepage check using API pageDepth
  if (currentPageData?.pageDepth === 3) {
    block.classList.add('is-homepage');

    const li = document.createElement('li');
    const homepageTitle = getCurrentPageLabel(currentPageData) || 'Homepage - Bangkok Bank';
    li.textContent = homepageTitle;
    li.setAttribute('aria-current', 'page');
    ol.appendChild(li);

    await loadSocialIcons(block);
    return;
  }

  breadcrumbPages.forEach((page, index) => {
    const li = document.createElement('li');
    const isLast = index === breadcrumbPages.length - 1;
    const textContent = isLast ? getCurrentPageLabel(page) : getParentPageLabel(page);

    if (!textContent) return;
    if (isLast) {
      li.setAttribute('aria-current', 'page');
      li.textContent = textContent;
    } else {
      const link = document.createElement('a');
      link.href = pagePathToUrl(page.pagePath);
      link.textContent = textContent;
      li.appendChild(link);
    }

    ol.appendChild(li);
  });

  await loadSocialIcons(block);
}

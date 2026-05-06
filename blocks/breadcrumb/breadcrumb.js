import { getMetadata } from '../../scripts/aem.js';
import { moveInstrumentation, getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';

/**
 * Fetches breadcrumb (parent page) data from the AEM pageinfo endpoint.
 * Returns an object with titleMap and currentPageData.
 * @returns {Promise<Object>} Object containing titleMap and currentPageData
 */
async function fetchBreadcrumbData() {
  const configs = await fetchConfigs();
  const AEM_BASE_URL_FOR_BREADCRUMB = configs.aemBaseUrlForBreadcrumb;
  if (!AEM_BASE_URL_FOR_BREADCRUMB) {
    return { titleMap: {}, currentPageData: null, homepageData: null };
  }
  try {
    const { pathname } = window.location;
    const apiUrl = `${AEM_BASE_URL_FOR_BREADCRUMB}/content/bangkokbank${pathname}.pageinfo.parent.json`;
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }
    const data = await response.json();

    // Build a path-to-title map from the returned parent pages
    const titleMap = {};
    let currentPageData = null;

    // Add current page to titleMap first and store currentPageData
    if (data.currentPage) {
      const { pagePath, pageTitle, jcrTitle } = data.currentPage;
      if (pagePath && (pageTitle || jcrTitle)) {
        titleMap[pagePath] = pageTitle || jcrTitle;
      }
      currentPageData = data.currentPage;
    }

    // Helper function to traverse nested parent structure and collect pages
    const collectPages = (page, pages = []) => {
      if (page) {
        pages.push(page);
        if (page.parent) {
          collectPages(page.parent, pages);
        }
      }
      return pages;
    };

    // Collect all pages from nested structure
    let allPages = [];
    if (data.currentPage) {
      // Handle nested structure with currentPage and parent
      allPages = collectPages(data.currentPage);
      if (data.parent) {
        allPages = allPages.concat(collectPages(data.parent));
      }
    } else if (Array.isArray(data)) {
      // Handle array response
      allPages = data;
    } else if (data && typeof data === 'object') {
      // Handle other object shapes
      const pages = data.pages || data.items || data.children || [];
      allPages = pages;
    }

    // Find homepage (lang root, pageDepth === 3) to use as first breadcrumb item
    const homepageData = allPages.find((p) => p.pageDepth === 3) || null;

    // Filter pages: only include pages with pageDepth > 3 (after "en" level)
    // and build the titleMap
    allPages.forEach((page) => {
      const pagePath = page.pagePath || page.path;
      const pageTitle = page.pageTitle || page.jcrTitle || page.title;
      const { pageDepth } = page;

      // Only include pages after the "en" level (pageDepth > 3)
      if (pagePath && pageTitle && pageDepth && pageDepth > 3) {
        titleMap[pagePath] = pageTitle;
      }
    });
    return { titleMap, currentPageData, homepageData };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Breadcrumb data fetch error:', error);
    return { titleMap: {}, currentPageData: null, homepageData: null };
  }
}

/**
 * Builds breadcrumb navigation from the current URL path
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

  const shortTitle = getMetadata('short-title');
  const { title: pageTitle } = document;

  // Fetch parent page titles from AEM to use as breadcrumb labels
  const { titleMap: breadcrumbTitleMap, currentPageData } = await fetchBreadcrumbData();
  const lang = currentPageData?.pagePath?.split('/')[3] || getLang();

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
    const homepageTitle = currentPageData.pageTitle || currentPageData.jcrTitle || 'Homepage - Bangkok Bank';
    li.textContent = homepageTitle;
    li.setAttribute('aria-current', 'page');
    ol.appendChild(li);

    return;
  }

  const pathSegments = window.location.pathname
    .split('/')
    .filter(Boolean);

  const hasLangPrefix = pathSegments.length && pathSegments[0] === lang;
  const startIndex = hasLangPrefix ? 1 : 0;
  const langPrefix = hasLangPrefix ? `/${lang}` : '';

  let currentPath = '';

  for (let i = startIndex; i < pathSegments.length; i += 1) {
    const segment = pathSegments[i];
    currentPath += `/${segment}`;

    const li = document.createElement('li');

    const isLast = i === pathSegments.length - 1;

    if (isLast) {
      // Use shortTitle if available, then document.title, otherwise use pageTitle
      li.textContent = (shortTitle || pageTitle)
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
      li.setAttribute('aria-current', 'page');
    } else {
      // Prefer the title fetched from AEM; fall back to humanising the URL segment
      const fetchedTitle = breadcrumbTitleMap[currentPath];
      const label = fetchedTitle
        || segment
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());
      const link = document.createElement('a');
      link.href = langPrefix + currentPath;
      link.textContent = label;
      li.appendChild(link);
    }

    ol.appendChild(li);
  }

  // Load social-icons block through fragments
  try {
    const { loadFragment } = await import('../fragment/fragment.js');
    const fragment = await loadFragment(`/${lang}/fragments/social-icons`);
    if (fragment) {
      // Pick the social-icons block with the most child rows (handles orphaned items
      // that AEM may group into a second block at section level)
      const allSocialBlocks = [...fragment.querySelectorAll('.social-icons.block')];
      const socialIconsBlock = allSocialBlocks.reduce((best, current) => (
        current.children.length > (best?.children.length ?? -1) ? current : best
      ), null);
      if (socialIconsBlock) {
        const socialWrapper = socialIconsBlock.parentElement;
        if (socialWrapper) {
          // Append as sibling of the breadcrumb block (not inside it) so that
          // the CSS rule `.breadcrumb + .social-icons-wrapper` can match
          block.parentElement.appendChild(socialWrapper);
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load social-icons fragment:', error);
  }
}

import { fetchConfigs } from './config.js';

import {
  getMetadata,
  buildBlock,
  decorateBlock,
  loadBlock,
} from './aem.js';
/**
 * Helper function to parse comma-separated URL strings from config
 * @param {string} urlString - Comma-separated URL string
 * @returns {Array<string>} Array of parsed URLs
 */
function parseUrlString(urlString) {
  if (!urlString || !urlString.trim()) return [];

  // Remove outer quotes if present and trim
  const cleaned = urlString.trim().replace(/^["']|["']$/g, '');

  // Split by comma and clean each URL
  return cleaned.split(',').map((url) => url.trim().replace(/^["']|["']$/g, '')).filter((url) => url.length > 0);
}

/**
 * Check if a URL matches any hostname in the list
 * @param {string} url - URL to check
 * @param {Array<string>} hostnameList - List of hostnames to match
 * @returns {boolean} True if URL matches any hostname
 */
function matchesHostname(url, hostnameList) {
  try {
    const urlObj = new URL(url, window.location.href);
    return hostnameList.some((hostname) => {
      const cleanHostname = hostname.replace(/^https?:\/\//, '').split('/')[0];
      return urlObj.hostname === cleanHostname || urlObj.hostname.endsWith(`.${cleanHostname}`);
    });
  } catch {
    return false;
  }
}

/**
 * Check if URL exactly matches any URL in the list
 * @param {string} url - URL to check
 * @param {Array<string>} urlList - List of full URLs to match
 * @returns {boolean} True if URL matches
 */
function matchesFullUrl(url, urlList) {
  try {
    const urlObj = new URL(url, window.location.href);
    const urlString = urlObj.href;

    return urlList.some((fullUrl) => {
      try {
        const fullUrlObj = new URL(fullUrl);
        return urlString === fullUrlObj.href || urlString.startsWith(fullUrlObj.href);
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

/**
 * Check if the HRPRIVACY cookie is already accepted.
 * @returns {boolean}
 */
function isPrivacyAccepted() {
  const key = encodeURIComponent('HRPRIVACY');
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${key}=`));
  return match ? decodeURIComponent(match.split('=')[1]) === 'true' : false;
}

/**
 * Load privacy modal fragment (once) then show it for the given URL.
 * If the user already accepted (cookie set), navigate directly without the modal.
 * @param {string} pendingUrl - The URL to navigate to after user agrees
 */
async function loadPrivacyModal(pendingUrl) {
  try {
    // Cookie already accepted — skip the modal and navigate directly
    if (isPrivacyAccepted()) {
      window.open(pendingUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (typeof window.showPrivacyModal === 'function') {
      window.showPrivacyModal(pendingUrl);
      return;
    }

    // Fragment not loaded yet — dispatch with callback so it opens once ready
    const langPrefix = `/${document.documentElement.lang || 'en'}`;
    document.dispatchEvent(new CustomEvent('bbl:load-fragment', {
      detail: {
        path: `${langPrefix}/fragments/modals/privacy-modal`,
        callbackName: 'showPrivacyModal',
        callback: () => {
          if (typeof window.showPrivacyModal === 'function') {
            window.showPrivacyModal(pendingUrl);
          }
        },
      },
    }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load privacy modal:', error);
  }
}

/**
 * Load external redirect popup fragment (once) then show it for the given URL.
 * The block's decorate() registers window.showExternalRedirectPopup after loading.
 * @param {string} url - The external URL the user clicked
 */
async function loadAndShowExternalRedirectPopup(url) {
  try {
    if (typeof window.showExternalRedirectPopup === 'function') {
      window.showExternalRedirectPopup(url);
      return;
    }

    // Fragment not loaded yet — dispatch with callback so it opens once ready
    const langPrefix = `/${document.documentElement.lang || 'en'}`;
    document.dispatchEvent(new CustomEvent('bbl:load-fragment', {
      detail: {
        path: `${langPrefix}/fragments/modals/external-popup`,
        callbackName: 'showExternalRedirectPopup',
        callback: () => {
          if (typeof window.showExternalRedirectPopup === 'function') {
            window.showExternalRedirectPopup(url);
          }
        },
      },
    }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load external redirect popup:', error);
  }
}

/**
 * Add global link click tracking and URL validation
 */
function handleGlobalLinkClicks() {
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('a[href]');

    if (!link) return;

    const href = link.getAttribute('href');

    // Skip internal links, hash links, and relative paths
    if (!href || href.startsWith('#') || href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
      return;
    }

    // Check if it's an external URL
    try {
      const urlObj = new URL(href, window.location.href);

      // Skip if same origin
      if (urlObj.hostname === window.location.hostname) {
        return;
      }

      // IMPORTANT: Prevent navigation immediately for all external links
      // This must happen BEFORE any async operations
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Remove target attribute to prevent new tab opening
      const originalTarget = link.getAttribute('target');
      if (originalTarget) {
        link.removeAttribute('target');
      }

      // Fetch config data
      const configData = await fetchConfigs();

      // Parse config arrays
      const hostnameUrlArray = parseUrlString(configData.hostnameurl || '');
      const excludedUrlArray = parseUrlString(configData.excludedurl || '');
      const fullUrlArray = parseUrlString(configData.fullurl || '');

      // Case 1: Check if URL is in hostnameurl or fullurl
      const matchesHostnameList = matchesHostname(href, hostnameUrlArray);
      const matchesFullUrlList = matchesFullUrl(href, fullUrlArray);

      if (matchesHostnameList || matchesFullUrlList) {
        await loadPrivacyModal(href);
        return;
      }

      // Case 2: Check if URL is NOT in excluded list
      const isExcluded = matchesFullUrl(href, excludedUrlArray);

      if (!isExcluded) {
        await loadAndShowExternalRedirectPopup(href);
        return;
      }

      // Case 3: If URL is in excluded list, restore target and allow navigation
      if (originalTarget) {
        link.setAttribute('target', originalTarget);
      }
      // Re-trigger the click to allow normal navigation
      link.click();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error processing link click:', error);
    }
  }, true); // Use capture phase
}

async function loadBreadcrumb(doc) {
  const breadcrumbsMeta = getMetadata('breadcrumbs') || 'true';
  if (breadcrumbsMeta.toLowerCase() === 'true') {
    const footer = doc.querySelector('footer');
    if (footer) {
      const breadcrumbSection = document.createElement('div');
      breadcrumbSection.className = 'section full-bleed-special';

      const breadcrumbWrapper = document.createElement('div');
      breadcrumbWrapper.className = 'breadcrumb-wrapper';
      breadcrumbWrapper.setAttribute('aria-label', 'Breadcrumb');
      breadcrumbSection.appendChild(breadcrumbWrapper);
      footer.parentNode.insertBefore(breadcrumbSection, footer);

      const breadcrumbBlock = buildBlock('breadcrumb', '');
      breadcrumbWrapper.append(breadcrumbBlock);
      decorateBlock(breadcrumbBlock);
      await loadBlock(breadcrumbBlock);
    }
  }
}

function decorateButtonsV1(element) {
  element.querySelectorAll('a').forEach((a) => {
    a.title = a.title || a.textContent;
    if (a.href !== a.textContent) {
      const up = a.parentElement;
      const twoup = a.parentElement.parentElement;
      if (!a.querySelector('img') && !a.closest('.download-files')) {
        if (
          up.childNodes.length === 1
          && up.tagName === 'STRONG'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.className = 'button-m primary';
          twoup.classList.add('button-container');
        }
        if (
          up.childNodes.length === 1
          && up.tagName === 'EM'
          && twoup.childNodes.length === 1
          && twoup.tagName === 'P'
        ) {
          a.className = 'button-m secondary';
          twoup.classList.add('button-container');
        }
        if (up.childNodes.length === 1 && (up.tagName === 'P' || up.tagName === 'DIV')) {
          const alreadyVariant = a.className.includes('primary') || a.className.includes('secondary');
          if (!alreadyVariant) {
            a.className = 'button-tertiary';
            up.classList.add('button-container');
          }
        }
      }

      // Check for target link setting in adjacent element
      const hasTargetTrue = (linkParent) => {
        const nextSibling = linkParent?.nextElementSibling;
        if (nextSibling && nextSibling.tagName === 'DIV') {
          const text = nextSibling.textContent.trim().toLowerCase();
          if (text === 'true') {
            nextSibling.remove();
            return true;
          }
          // Check for nested div with "true"
          const childDiv = nextSibling.querySelector(':scope > div');
          if (childDiv && childDiv.textContent.trim().toLowerCase() === 'true') {
            nextSibling.remove();
            return true;
          }
        }
        return false;
      };

      if (a.classList.contains('button')) {
        if (hasTargetTrue(twoup) || hasTargetTrue(up) || a.target === '_blank') {
          a.target = '_blank';
        } else {
          a.target = '_self';
        }
      }
    }
  });
}

function decorateTerritoryButtons(main) {
  // Find anchors that are "button" only (no variants like primary/secondary)
  // and convert them to "button territory".
  main.querySelectorAll('a.button:not([class*=" "])').forEach((a) => {
    a.className = 'button-tertiary';
  });
}

/**
 * Decorates SVG icons with alt text separated by '-alt_-' in the icon name
 * @param {Element} element container element
 */
function decorateSvgWithAltText(element) {
  element.querySelectorAll('span.icon img[src$=".svg"]').forEach((img) => {
    const { iconName } = img.dataset;
    if (iconName && iconName.includes('-alt_-')) {
      const [srcPart, altPart] = iconName.split('-alt_-');

      // Update the src to use only the first part
      const currentSrc = img.getAttribute('src');
      const basePath = currentSrc.substring(0, currentSrc.lastIndexOf('/') + 1);
      img.setAttribute('src', `${basePath}${srcPart}.svg`);

      // Update the alt text with the second part (replace underscores and hyphens with spaces)
      const altText = altPart.replace(/[_-]/g, ' ').trim();
      img.setAttribute('alt', altText);
    }
  });
}

if (Window.LAZY_PHASE) {
  handleGlobalLinkClicks();
} else {
  document.addEventListener('lazy-phase', () => {
    handleGlobalLinkClicks();
  });
}

/**
 * Returns the value of a cookie by name, or null if not set.
 * @param {string} name
 * @returns {string|null}
 */
function getCookieValue(name) {
  const encoded = encodeURIComponent(name);
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${encoded}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/**
 * Gets the language from the HTML tag.
 * @returns {string} The language code (e.g., 'en', 'th')
 */
function getLang() {
  return document.documentElement.lang || 'en';
}

/**
 * Builds the cookie-alert synthetic block and appends it to main
 * if the user has not yet given cookie consent.
 * @param {Element} main The container element
 */
async function buildCookieAlert(main) {
  /* Skip in Universal Editor — cookie consent UI must not appear while authoring. */
  if (window.self !== window.top) return;

  /* Skip when called for a detached fragment main (loadFragment context). */
  if (!main.isConnected) return;

  /* Skip if consent already recorded */
  if (getCookieValue('ConsentAlert') === 'ALERT') return;

  /* Skip if a cookie-alert block was manually placed by the author */
  if (main.querySelector('.cookie-alert')) return;

  const lang = getLang();
  const fragmentPath = `/${lang}/fragments/cookie-alert`;

  try {
    // Use event-based fragment loading to avoid circular dependency.
    // The listener is registered early in scripts.js so it is always available.
    document.dispatchEvent(new CustomEvent('bbl:load-fragment', {
      detail: {
        path: fragmentPath,
        callback: (fragment) => {
          if (!fragment) {
            // eslint-disable-next-line no-console
            console.warn('[cookie-alert] Fragment not found at', fragmentPath);
            return;
          }
          // Move the decorated sections directly (preserves event listeners).
          // Do NOT use innerHTML/outerHTML — that strips all JS event listeners.
          [...fragment.querySelectorAll(':scope > .section')].forEach((s) => main.append(s));
        },
      },
    }));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[cookie-alert] Could not load fragment:', error);
  }
}

export {
  decorateTerritoryButtons,
  decorateButtonsV1,
  decorateSvgWithAltText,
  loadBreadcrumb,
  buildCookieAlert,
};

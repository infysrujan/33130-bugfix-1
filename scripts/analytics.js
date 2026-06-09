/**
 * Client-side Customer Data Platform (CDP) helpers for Bangkok Bank.
 * Seeds `window.adobeDataLayer` and exposes `window.cdp` for legacy callers.
 * Import named functions from this module for use in other ESM files.
 */

import env from './utils/env.js';

let analyticsBootstrapped = false;

/**
 * Marketing query string (normalized to lowercase for consistent reporting).
 * @param {string} [search] - `window.location.search` or equivalent
 */
export function getUtmParams(search = window.location.search) {
  const urlParams = new URLSearchParams(search.toLowerCase());
  return {
    utm_source: urlParams.get('utm_source') || '',
    utm_campaign: urlParams.get('utm_campaign') || '',
    utm_medium: urlParams.get('utm_medium') || '',
    utm_id: urlParams.get('utm_id') || '',
    utm_term: urlParams.get('utm_term') || '',
    utm_content: urlParams.get('utm_content') || '',
  };
}

/**
 * URL path segments after locale: [0]=lang, [1]=banking segment, etc.
 * @param {string} [pathname] - `window.location.pathname` or equivalent
 */
export function getPathParams(pathname = window.location.pathname) {
  const path = pathname.toLowerCase().split('/').filter(Boolean);
  return {
    bankingSegment: path[1] || '',
    siteSection: path[2] || '',
    siteSubSection1: path[3] || '',
    productName: path.length >= 5 ? path[path.length - 1] : '',
  };
}

/**
 * Initial page object: AEP `web` schema plus `_bangkokbank` extension for reporting.
 */
export function pushInitialPageContext() {
  const { cdp } = window;
  const pageName = `bangkokbank:${cdp.data.siteLanguage}:${cdp.platform}:${cdp.data.pathParams.bankingSegment || 'na'}:na:${cdp.data.pathParams.productName || 'na'}`;
  window.adobeDataLayer.push({
    web: {
      webPageDetails: {
        name: pageName,
        siteSection: cdp.data.pathParams.siteSection,
      },
    },
    _bangkokbank: {
      pageDetails: {
        siteLanguage: cdp.data.siteLanguage,
        bankingSegment: cdp.data.pathParams.bankingSegment,
        siteSubSection1: cdp.data.pathParams.siteSubSection1,
      },
      productDetails: {
        productName: cdp.data.pathParams.productName,
      },
      channelDetails: {
        environment: cdp.environment,
        platform: cdp.platform,
      },
      campaign: {
        external: cdp.data.utmParams,
      },
    },
  });
}

/**
 * Fires after init; increments page view metric on the current page context.
 * TODO: Remove this tracking as it's handled by the Launch Rule.
 */
export function trackPageView() {
  window.adobeDataLayer.push({
    event: 'pageLoaded',
    web: {
      webPageDetails: {
        pageViews: {
          value: 1,
        },
      },
    },
  });
}

/**
 * Analytics-first navigation: push `linkClicked`, then open or assign location.
 * @param {Event} event
 * @param {HTMLAnchorElement|HTMLElement} element
 * @param {string} [fallback]
 * @param {string} [linkType]
 */
// TODO: Should all the links be tracked? Is this triggered on all link clicks?
export function trackLinkClick(event, element, fallback = '', linkType = 'other') {
  event.preventDefault();
  const href = element.getAttribute('href');
  const urlPath = href === '#' ? fallback : href;
  window.adobeDataLayer.push({
    event: 'linkClicked',
    web: {
      webInteraction: {
        name: element.textContent,
        type: linkType,
        url: urlPath,
        linkClicks: {
          value: 1,
        },
      },
    },
  });
  if (element.hasAttribute('target')) {
    window.open(urlPath, element.getAttribute('target') || '_blank');
  } else {
    window.location.assign(urlPath);
  }
}

function ensureCdpGlobal() {
  if (window.cdp) return;
  window.cdp = {
    platform: 'web',
    environment: env,
    data: {},
    track: {
      pageView: trackPageView,
      linkClick: trackLinkClick,
    },
  };
}

/**
 * Refreshes mutable fields on `window.cdp.data` from the current document and URL.
 * Call after `document.documentElement.lang` (or pathname) changes.
 */
export function refreshCdpData() {
  ensureCdpGlobal();
  const { cdp } = window;
  Object.assign(cdp.data, {
    siteLanguage: document.documentElement.lang.toLowerCase(),
    utmParams: getUtmParams(),
    pathParams: getPathParams(),
    init: pushInitialPageContext,
  });
}

const LEAD_FORM_REQUIRED_FIELDS = [
  'name',
  'surname',
  'mobile no',
  'email',
  'product name',
  'convenienttime',
  'bbladvancedcheckbox',
];

/**
 * Reads fields marked with `data-sc-field-name`, builds `formFields` for the data layer,
 * and pushes `formSubmit` only when all required lead fields are present and non-empty.
 * @param {SubmitEvent} event
 */
export function trackContactFormSubmit(event) {
  ensureCdpGlobal();
  refreshCdpData();
  window.cdp.track.contactFormSubmit = trackContactFormSubmit;

  // Aligned on internal PII policy and no sanitization necessary.
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const form = event.currentTarget;
  const inputs = form.querySelectorAll('input,select');

  const formFields = [];
  let customerEmailId = '';

  Array.from(inputs).forEach((node) => {
    if (!node.dataset.scFieldName) return;
    const fieldName = node.dataset.scFieldName.toLowerCase();
    let { value } = node;
    if (typeof value === 'string' && node.tagName === 'SELECT') {
      value = value.toLowerCase();
    }

    if (node.type === 'radio') {
      if (node.checked) {
        formFields.push({ formFieldName: fieldName, formFieldInfo: value });
      }
      return;
    }
    if (node.type === 'checkbox') {
      if (node.checked) {
        formFields.push({ formFieldName: fieldName, formFieldInfo: value });
      }
      return;
    }
    if (node.type === 'email') {
      const normalized = String(value).toLowerCase();
      if (validateEmail(normalized)) {
        formFields.push({ formFieldName: fieldName, formFieldInfo: normalized });
        customerEmailId = normalized;
      }
      return;
    }
    // TODO: The form fields may contain firstName, lastName and other PII data -
    //                  cannot be stored in CDP in naked format.
    // Check internal PII policy and apply sanitization if necessary.
    formFields.push({ formFieldName: fieldName, formFieldInfo: value });
  });

  const { cdp } = window;
  const fieldNames = formFields.map((field) => field.formFieldName);
  if (!LEAD_FORM_REQUIRED_FIELDS.every((req) => fieldNames.includes(req))) return;
  if (!formFields.every((field) => field.formFieldInfo)) return;

  window.adobeDataLayer.push({
    event: 'formSubmit',
    _bangkokbank: {
      userDetails: {
        customerEmailId,
      },
      formDetails: {
        formName: cdp.data.pathParams.productName,
      },
      formFields,
    },
  });
}

/**
 * One-time bootstrap: sync `window.cdp`, push page context, dispatch `cdp:ready`, track page view.
 * Call after `document.documentElement.lang` reflects the active locale.
 */
export function initCdpEvents() {
  window.adobeDataLayer = window.adobeDataLayer || [];
  if (analyticsBootstrapped) return;
  analyticsBootstrapped = true;
  ensureCdpGlobal();
  refreshCdpData();
  window.cdp.track.contactFormSubmit = trackContactFormSubmit;
  window.cdp.data.init();
  window.dispatchEvent(new CustomEvent('cdp:ready', { detail: window.cdp.data }));
  // Custom page view tracking.
  trackPageView();
}

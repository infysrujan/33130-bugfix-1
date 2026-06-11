// eslint-disable-next-line import/no-relative-packages
import GtmMartech from '../plugins/gtm-martech/src/index.js';
import consentCallbackBase from './check-consent.js';
import env from './utils/env.js';

const GTM_CONTAINER_CONFIG = {
  dev: {
    lazy: ['GTM-P7JZC4DH', 'GTM-TP9844XT'],
    delayed: [],
  },
  stage: {
    lazy: ['GTM-542BD9VF'],
    delayed: [],
  },
  prod: {
    lazy: ['GTM-W72WJWDH'],
    delayed: [],
  },
};

const GA_PROPERTY_CONFIG = {
  dev: 'G-S8RE3N44ZB',
  stage: 'G-32JXKVG92S',
  prod: 'G-7WPNJ9G6RJ',
};

// For DA Preview support. Martech is enabled if the martech=off query parameter is not present.
const isEnabled = !window.location.search.includes('martech=off');

let pageViewSent = false;

/**
 * Sends a GA4 page_view after consent update when analytics_storage is granted.
 * Deduped to a single fire per page load.
 *
 * @param {Object} consentConfig Google Consent Mode update payload.
 */
export function firePageViewIfAnalyticsGranted(consentConfig) {
  if (pageViewSent || consentConfig?.analytics_storage !== 'granted') return;
  pageViewSent = true;
  setTimeout(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view');
    }
  }, 0);
}

const consentCallback = async () => {
  const config = await consentCallbackBase();
  firePageViewIfAnalyticsGranted(config);
  return config;
};

const martech = new GtmMartech({
  analytics: isEnabled,
  tags: [GA_PROPERTY_CONFIG[env]],
  containers: {
    lazy: GTM_CONTAINER_CONFIG[env].lazy,
    delayed: GTM_CONTAINER_CONFIG[env].delayed,
  },
  // Passed to gtag('config', measurementId, …): page fields, transport_url, etc.
  gtagConfig: {
    send_page_view: false,
  },
  consent: isEnabled,
  consentCallback,
  decorateCallback: /* Function to call on each found or loaded Section/Block */ () => {},
});

export default martech;

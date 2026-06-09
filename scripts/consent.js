import gtmMartech, { firePageViewIfAnalyticsGranted } from './gtm-martech.js';
// eslint-disable-next-line import/no-relative-packages
import { updateUserConsent as updateAdobeConsent } from '../plugins/martech/src/index.js';

/**
 * Google Consent Mode update when the user accepts marketing-related storage
 * (aligns with defaults set in aem-gtm-martech when `consent: true`).
 */
const DEFAULT_GTAG_MARKETING = {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  personalization_storage: 'denied',
};

/** Adobe Web SDK / Alloy consent shape for `setConsent` (see martech `updateUserConsent`). */
const DEFAULT_ADOBE_MARKETING = {
  collect: false,
  marketing: false,
  personalize: false,
  share: false,
};

let consentListenerAttached = false;

/**
 * @typedef {Object} ConsentUpdateDetail
 * @property {boolean} [marketing] - When true, default granted payloads apply for gtag and Adobe
 *     unless overridden via `gtag` / `adobe`.
 * @property {Object} [gtag] - Passed to `gtag('consent', 'update', gtag)`. Overrides defaults when
 *     `marketing` is true.
 * @property {Object} [adobe] - Passed to Adobe `updateUserConsent`. Overrides defaults when
 *     `marketing` is true.
 */

/**
 * Updates Google Consent Mode (gtag) and Adobe Alloy consent from a single payload.
 *
 * @param {ConsentUpdateDetail} [detail] - From `CustomEvent.detail` or call directly.
 * @returns {Promise<void>}
 */
export async function applyMarketingConsentUpdates(detail = {}) {
  // eslint-disable-next-line prefer-const
  let gtagPayload = DEFAULT_GTAG_MARKETING;
  // eslint-disable-next-line prefer-const
  let adobePayload = DEFAULT_ADOBE_MARKETING;

  if (detail.preferences) {
    // TODO: Validate the logic for AdvertisingCookie and AnalysisCookie
    if (detail.preferences.AdvertisingCookie === true) {
      // set advertising payload for gtag
      gtagPayload.ad_storage = 'granted';
      gtagPayload.ad_user_data = 'granted';
      gtagPayload.ad_personalization = 'granted';
      gtagPayload.personalization_storage = 'granted';

      // set the advertising payload for adobe
      adobePayload.personalize = true;
      adobePayload.share = true;
      adobePayload.marketing = true;
    }

    if (detail.preferences.AnalysisCookie === true) {
      // set the analysis payload for gtag
      gtagPayload.analytics_storage = 'granted';

      // set the analysis payload for adobe
      adobePayload.collect = true;
    }

    // eslint-disable-next-line no-console
    console.debug('Consent update details', 'gtagPayload', gtagPayload, 'adobePayload', adobePayload);
  }

  if (gtagPayload && typeof window.gtag === 'function') {
    // eslint-disable-next-line no-console
    console.debug('Updating Google Consent Mode', gtagPayload);
    gtmMartech.updateUserConsent(gtagPayload);
    firePageViewIfAnalyticsGranted(gtagPayload);
  }

  if (adobePayload) {
    // eslint-disable-next-line no-console
    console.debug('Updating Adobe Alloy Consent', adobePayload);
    await updateAdobeConsent(adobePayload);
  }

  window.dispatchEvent(new CustomEvent('consent-update', { detail: { gtagPayload, adobePayload } }));
}

/**
 * Listens for `consent:update` on `window` and applies gtag + Adobe consent from `event.detail`.
 *
 * Dispatch example:
 * `window.dispatchEvent(new CustomEvent('consent:update', { detail: { marketing: true } }))`
 * or pass explicit `{ gtag: { … }, adobe: { … } }`.
 */
export function initMarketingConsentListener() {
  if (consentListenerAttached) return;
  consentListenerAttached = true;
  // Listen for the cookie:consent-saved event from the cookie-modal block.
  document.addEventListener('cookie:consent-saved', (event) => {
    // eslint-disable-next-line no-console
    console.debug('Consent update event received', event);
    const detail = event?.detail || {};
    applyMarketingConsentUpdates(detail).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error applying marketing consent updates', error);
      // Alloy may reject if not ready; CMP can retry or call `applyMarketingConsentUpdates` later.
    });
  });
}

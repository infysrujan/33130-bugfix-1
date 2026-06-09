import { getCookie } from './utils/cookies.js';

/**
 * Resolves Google Consent Mode state from site cookies (no external CMP).
 * Used as `consentCallback` by GtmMartech; kept separate from `consent.js` to avoid an import cycle
 * with `gtm-martech.js`.
 *
 * @returns {Promise<Object>} Consent types for gtag `consent` / default update payloads.
 */
export default async function consentCallback() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const advertisingGranted = getCookie('AdvertisingCookie') === 'Advertising';
      const analyticsGranted = getCookie('AnalysisCookie') === 'Analysis';
      // eslint-disable-next-line no-console
      console.debug('Updating Consent: Callback from gtm-martech.js');
      resolve({
        ad_storage: advertisingGranted ? 'granted' : 'denied',
        ad_user_data: advertisingGranted ? 'granted' : 'denied',
        ad_personalization: advertisingGranted ? 'granted' : 'denied',
        analytics_storage: analyticsGranted ? 'granted' : 'denied',
        functionality_storage: analyticsGranted ? 'granted' : 'denied',
        personalization_storage: analyticsGranted ? 'granted' : 'denied',
        security_storage: 'granted',
      });
    }, 1500);
  });
}

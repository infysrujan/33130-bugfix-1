// add delayed functionality here

import { loadScript } from './aem.js';

/**
 * Initializes the Facebook JS SDK for the share dialog (FB.ui) used by
 * blocks/social-icons. Requires a `fb:app_id` meta tag to be present
 * (populated from page metadata).
 */
async function loadFacebookSdk() {
  const appId = document.querySelector('meta[property="fb:app_id"]')?.content;
  if (!appId) return;

  window.fbAsyncInit = () => {
    window.FB.init({
      appId,
      autoLogAppEvents: true,
      xfbml: true,
      version: 'v2.10',
    });
    window.FB.AppEvents.logPageView();
  };

  await loadScript('https://connect.facebook.net/en_US/sdk.js');
}

loadFacebookSdk();

// Captures a full-page screenshot of a URL at a given viewport using a shared browser instance.

const NAV_TIMEOUT = 60000;
// Real production pages (analytics beacons, chat widgets, polling) often never go fully
// network-idle, so waiting on 'networkidle' for navigation itself can hang until NAV_TIMEOUT.
// Instead navigate on 'load' (fires reliably), then give the network a short best-effort
// window to settle without ever failing the capture if it doesn't.
const IDLE_TIMEOUT = 5000;
const SETTLE_TIMEOUT = 1500;

/**
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {{ width: number, height: number }} viewport
 * @returns {Promise<Buffer>} PNG screenshot buffer
 */
export async function captureFullPageScreenshot(browser, url, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT });
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(SETTLE_TIMEOUT);
    return await page.screenshot({ fullPage: true, animations: 'disabled', type: 'png' });
  } finally {
    await context.close();
  }
}

export default captureFullPageScreenshot;

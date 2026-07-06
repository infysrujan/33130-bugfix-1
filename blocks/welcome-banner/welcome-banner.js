import { moveInstrumentation } from '../../scripts/scripts.js';
import { isAuthoringInstance, decorateButtonsV1 } from '../../scripts/bbl-decorators.js';
import { createModalShell, showModal, hideModal } from '../../scripts/utils/modal.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const BANNER_STORAGE_KEY = 'bbl-welcome-banner';
const SUPPRESSION_DURATION_MS = 20 * 60 * 1000; // 20 minutes

// ─── Storage helpers (sessionStorage only — cleared when the tab closes) ──────

/**
 * Reads the suppression timestamp from sessionStorage.
 * Silently returns 0 on any SecurityError (strict privacy modes / Incognito).
 * @returns {number} Unix timestamp in ms, or 0 if not found.
 */
function readTimestamp() {
  try {
    return Number(sessionStorage.getItem(BANNER_STORAGE_KEY)) || 0;
  } catch (error) {
    console.error(error);
  }

  return 0;
}

/**
 * Persists the current timestamp to sessionStorage when the user clicks a CTA.
 * Silently ignores write failures in restrictive environments.
 */
function writeTimestamp() {
  try {
    sessionStorage.setItem(BANNER_STORAGE_KEY, String(Date.now()));
  } catch (error) {
    console.error(error);
  }
}

/**
 * Returns the remaining milliseconds within the suppression window, or 0 if expired / unset.
 * @returns {number}
 */
function getRemainingMs() {
  const ts = readTimestamp();
  if (!ts) return 0;
  return Math.max(0, SUPPRESSION_DURATION_MS - (Date.now() - ts));
}

// ─── Date-validity guard ──────────────────────────────────────────────────────

/**
 * Returns true if the current date falls within [startStr, endStr].
 * Boundaries are inclusive; a missing boundary is treated as open.
 * @param {string|undefined} startStr
 * @param {string|undefined} endStr
 * @returns {boolean}
 */
function isDateActive(startStr, endStr) {
  const now = Date.now();
  if (startStr) {
    const start = Date.parse(startStr);
    if (!Number.isNaN(start) && now < start) return false;
  }
  if (endStr) {
    const end = Date.parse(endStr);
    if (!Number.isNaN(end) && now > end) return false;
  }
  return true;
}

// ─── CTA extraction ───────────────────────────────────────────────────────────

/**
 * Extracts CTA data from a single button row.
 * The second cell contains the open-in-new-tab toggle ("true"/"false").
 * @param {Element} row
 * @returns {{ href: string, sourceAnchor: HTMLAnchorElement }|null}
 */
function rowToCtaData(row) {
  const cells = [...row.children];
  const a = cells[0]?.querySelector('a');
  if (!a) return null;
  return {
    href: a.getAttribute('href') || '#',
    sourceAnchor: a,
  };
}

/**
 * Extracts CTA data from the block's button rows.
 * Falls back to sibling `.default-content-wrapper` links when no rows contain anchors.
 * @param {Element[]} buttonRows
 * @param {Element}   placeholder
 * @returns {Array}
 */
function extractCtas(buttonRows, placeholder) {
  const fromRows = buttonRows.map(rowToCtaData).filter(Boolean);
  if (fromRows.length) return fromRows;

  return [
    ...placeholder.closest('.section')?.querySelectorAll('.default-content-wrapper a') ?? [],
  ].map((a) => ({
    href: a.getAttribute('href') || '#',
    sourceAnchor: a,
  }));
}

// ─── DOM builders ─────────────────────────────────────────────────────────────

/**
 * Attaches dismiss/navigation logic to the original anchor and returns it
 * along with its inline wrapper (e.g. <strong>) so the authored markup and
 * existing button classes (applied by decorateButtonsV1) are preserved as-is.
 * @param {Document} doc
 * @param {object}   ctaData
 * @param {Function} dismissAndSuppress
 * @returns {HTMLElement}
 */
function buildCtaAnchor(doc, ctaData, dismissAndSuppress) {
  const { sourceAnchor, href } = ctaData;
  const target = sourceAnchor.getAttribute('target') || '';

  sourceAnchor.addEventListener('click', (e) => {
    e.preventDefault();
    dismissAndSuppress();
    if (!href || href === '#') return;
    if (target === '_blank') {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = href;
    }
  });

  return sourceAnchor;
}

/**
 * Builds the CTA container with all action anchors.
 * @param {Document} doc
 * @param {Array}    ctaList
 * @param {Function} dismissAndSuppress
 * @returns {HTMLElement}
 */
function buildCtas(doc, ctaList, dismissAndSuppress) {
  const el = doc.createElement('div');
  el.className = 'welcome-banner-ctas';
  ctaList.forEach((ctaData) => el.appendChild(buildCtaAnchor(doc, ctaData, dismissAndSuppress)));
  return el;
}

// ─── Block entry point ────────────────────────────────────────────────────────

export default function decorate(block) {
  if (isAuthoringInstance(block)) return;
  decorateButtonsV1(block);

  const [
    desktopImgRow, mobileImgRow, isActiveRow, publishDateRow, unpublishDateRow, ...buttonRows
  ] = [...block.children];

  const doc = block.ownerDocument;

  // Replace the block with an invisible placeholder immediately so AEM
  // instrumentation is preserved and the section layout is unaffected.
  const placeholder = doc.createElement('div');
  placeholder.className = 'welcome-banner-placeholder';
  moveInstrumentation(block, placeholder);
  block.replaceWith(placeholder);

  // ── Activation guards ──────────────────────────────────────────────────────
  if (isActiveRow?.textContent?.trim().toLowerCase() === 'false') return;
  const publishDate = publishDateRow?.textContent?.trim();
  const unpublishDate = unpublishDateRow?.textContent?.trim();
  if (!isDateActive(publishDate, unpublishDate)) return;
  if (getRemainingMs() > 0) return;

  // ── Build image ────────────────────────────────────────────────────────────
  const pictureDesktop = desktopImgRow?.querySelector('picture');
  const pictureMobile = mobileImgRow?.querySelector('picture');

  const media = doc.createElement('div');
  media.className = 'welcome-banner-media';

  if (pictureDesktop || pictureMobile) {
    const picture = createSmartImage(desktopImgRow, mobileImgRow, null, true);
    if (picture) media.append(picture);
  }

  // ── Build modal shell ──────────────────────────────────────────────────────
  const { overlay, dialog, closeBtn } = createModalShell({
    overlayClass: 'welcome-banner-overlay',
    dialogClass: 'welcome-banner-dialog',
    closeBtnClass: 'welcome-banner-close',
    ariaLabel: 'Welcome banner',
    closeBtnAriaLabel: 'Close welcome banner',
  });

  const hideBanner = () => {
    hideModal(overlay, 'welcome-banner-overlay-visible', () => {
      doc.body.classList.remove('modal-open');
    });
  };

  const dismissAndSuppress = () => {
    writeTimestamp();
    hideBanner();
  };

  closeBtn.addEventListener('click', hideBanner);

  // ── Assemble dialog ────────────────────────────────────────────────────────
  dialog.append(
    closeBtn,
    media,
    buildCtas(doc, extractCtas(buttonRows, placeholder), dismissAndSuppress),
  );

  // ── Show banner ────────────────────────────────────────────────────────────
  doc.body.classList.add('modal-open');
  showModal(overlay, 'welcome-banner-overlay-visible');
}

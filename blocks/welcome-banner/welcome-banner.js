import { moveInstrumentation } from '../../scripts/scripts.js';
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
 * Maps a single anchor element to a plain CTA descriptor object.
 * @param {HTMLAnchorElement} a
 * @returns {{ href: string, label: string, target: string, sourceAnchor: HTMLAnchorElement }}
 */
function anchorToCtaData(a) {
  return {
    href: a.getAttribute('href') || '#',
    label: a.textContent.trim(),
    target: a.getAttribute('target') || '',
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
  const fromRows = buttonRows
    .map((row) => row?.querySelector('a'))
    .filter(Boolean)
    .map(anchorToCtaData);

  if (fromRows.length) return fromRows;

  const fallbackAnchors = [
    ...placeholder.closest('.section')?.querySelectorAll('.default-content-wrapper a') ?? [],
  ];
  return fallbackAnchors.map(anchorToCtaData);
}

// ─── DOM builders ─────────────────────────────────────────────────────────────

/**
 * Builds a single CTA anchor with navigation and dismiss logic.
 * @param {Document} doc
 * @param {object}   ctaData
 * @param {Function} dismissAndSuppress
 * @returns {HTMLAnchorElement}
 */
function buildCtaAnchor(doc, ctaData, dismissAndSuppress) {
  const a = doc.createElement('a');
  a.className = 'welcome-banner-cta';
  a.href = ctaData.href;
  a.textContent = ctaData.label;

  if (ctaData.target) a.setAttribute('target', ctaData.target);
  if (ctaData.sourceAnchor) moveInstrumentation(ctaData.sourceAnchor, a);

  a.addEventListener('click', (e) => {
    e.preventDefault();
    const { href, target } = ctaData;
    dismissAndSuppress();
    if (!href || href === '#') return;
    if (target === '_blank') {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = href;
    }
  });

  return a;
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

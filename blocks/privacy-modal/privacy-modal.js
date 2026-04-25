import { moveInstrumentation } from '../../scripts/scripts.js';

const COOKIE_DURATION_DAYS = 30;
const COOKIE_NAME = 'HRPRIVACY';

/* -------------------------------------------------------------------------
 * Cookie utilities
 * ---------------------------------------------------------------------- */

/**
 * Sets a cookie with a given name, value, and expiry (in days).
 * @param {string} name
 * @param {string} value
 * @param {number} days
 */
function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

/**
 * Reads the value of a cookie by name.
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(name) {
  const encoded = encodeURIComponent(name);
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${encoded}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

/* -------------------------------------------------------------------------
 * DOM helpers
 * ---------------------------------------------------------------------- */

/**
 * Creates an element with optional className and textContent.
 * @param {string} tag
 * @param {Object} [opts]
 * @param {string} [opts.className]
 * @param {string} [opts.textContent]
 * @param {Object} [opts.attrs]
 * @returns {HTMLElement}
 */
function createElement(tag, { className, textContent, attrs = {} } = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent !== undefined) el.textContent = textContent;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/* -------------------------------------------------------------------------
 * Scroll detection
 * ---------------------------------------------------------------------- */

/**
 * Returns true when the scrollable element has been scrolled to (or very
 * close to) its bottom edge.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isScrolledToBottom(el) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 8;
}

/* -------------------------------------------------------------------------
 * Modal builder
 * ---------------------------------------------------------------------- */

/**
 * Builds and returns the full modal DOM structure.
 * @param {Object} config
 * @param {string} config.title
 * @param {string} config.privacyHTML
 * @param {string} config.checkboxLabel
 * @param {string} config.ctaLabel
 * @param {Function} config.onAgree   Called when user agrees.
 * @param {Function} config.onClose   Called when user dismisses.
 * @returns {{ overlay: HTMLElement, modal: HTMLElement, scrollBody: HTMLElement,
 *             checkbox: HTMLInputElement, ctaBtn: HTMLButtonElement }}
 */
function buildModal({
  title, privacyHTML, checkboxLabel, ctaLabel, onAgree, onClose,
}) {
  /* Overlay */
  const overlay = createElement('div', {
    className: 'privacy-modal-overlay',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'privacy-modal-title' },
  });

  /* Modal dialog container */
  const modal = createElement('div', { className: 'privacy-modal-dialog' });

  /* Header */
  const header = createElement('div', { className: 'privacy-modal-header' });
  const titleEl = createElement('div', {
    className: 'privacy-modal-title',
    attrs: { id: 'privacy-modal-title' },
  });
  /* Use innerHTML so richtext markup (e.g. <br>, <p>) renders correctly */
  titleEl.innerHTML = title;
  header.append(titleEl);

  /* Close button — direct child of modal container so position:absolute is
     relative to the container, allowing it to sit outside the top-right corner
     exactly like the live site (top:-10px; right:-15px). */
  const closeBtn = createElement('button', {
    className: 'privacy-modal-close',
    attrs: {
      type: 'button',
      'aria-label': 'Close privacy notice',
      title: 'Close',
    },
  });
  closeBtn.innerHTML = '&times;';

  /* Scrollable body */
  const scrollBody = createElement('div', {
    className: 'privacy-modal-body',
    attrs: { tabindex: '0', 'aria-label': 'Privacy notice content. Scroll to read all.' },
  });
  scrollBody.innerHTML = privacyHTML;

  /* Scroll hint */
  const scrollHint = createElement('div', {
    className: 'privacy-modal-scroll-hint',
    textContent: '↓ Please he scroll down to read the full notice',
  });

  /* Modal footer section (bottom area with checkbox and button) */
  const modalFooter = createElement('div', { className: 'privacy-modal-footer' });

  /* Checkbox row */
  const checkboxRow = createElement('div', { className: 'privacy-modal-checkbox-row' });
  const checkbox = createElement('input', {
    attrs: {
      type: 'checkbox',
      id: 'privacy-modal-checkbox',
      disabled: 'true',
      'aria-label': checkboxLabel,
    },
  });
  const checkboxLabelEl = createElement('label', {
    className: 'privacy-modal-checkbox-label',
    textContent: checkboxLabel,
    attrs: { for: 'privacy-modal-checkbox' },
  });
  checkboxRow.append(checkbox, checkboxLabelEl);

  /* CTA */
  const ctaBtn = createElement('button', {
    className: 'privacy-modal-cta',
    textContent: ctaLabel,
    attrs: { type: 'button', disabled: 'true' },
  });

  modalFooter.append(checkboxRow, ctaBtn);
  /* Close button appended directly to modal (not header) for correct absolute positioning */
  modal.append(closeBtn, header, scrollBody, modalFooter);
  overlay.append(modal);

  /* -----------------------------------------------------------------------
   * Interaction wiring
   * -------------------------------------------------------------------- */

  /* Enable checkbox only after user has scrolled to the bottom */
  function onScroll() {
    if (isScrolledToBottom(scrollBody)) {
      checkbox.removeAttribute('disabled');
      scrollHint.classList.add('privacy-modal-scroll-hint-hidden');
      scrollBody.removeEventListener('scroll', onScroll);
    }
  }
  scrollBody.addEventListener('scroll', onScroll);

  /* If the content is short enough that no scrolling is needed, unlock immediately */
  requestAnimationFrame(() => {
    if (isScrolledToBottom(scrollBody)) {
      checkbox.removeAttribute('disabled');
      scrollHint.classList.add('privacy-modal-scroll-hint-hidden');
    }
  });

  /* Enable CTA only after checkbox is checked */
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      ctaBtn.removeAttribute('disabled');
    } else {
      ctaBtn.setAttribute('disabled', 'true');
    }
  });

  /* CTA click → agree */
  ctaBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    onAgree();
  });

  /* Close button → dismiss */
  closeBtn.addEventListener('click', () => onClose());

  /* Keyboard: Escape → dismiss */
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') onClose();
  });

  return {
    overlay, modal, scrollBody, checkbox, ctaBtn,
  };
}

/* -------------------------------------------------------------------------
 * Show / hide helpers
 * ---------------------------------------------------------------------- */

/**
 * Opens the modal (appends to document body if not already attached).
 * @param {HTMLElement} overlay
 */
function openModal(overlay) {
  if (!overlay.isConnected) document.body.appendChild(overlay);
  // Allow paint before adding visible class for CSS transition
  requestAnimationFrame(() => {
    overlay.classList.add('privacy-modal-overlay-visible');
  });
  overlay.focus();
}

/**
 * Closes the modal with a CSS transition, then removes it from the DOM.
 * @param {HTMLElement} overlay
 */
function closeModal(overlay) {
  overlay.classList.remove('privacy-modal-overlay-visible');
  overlay.addEventListener('transitionend', () => {
    overlay.remove();
  }, { once: true });
}

/* -------------------------------------------------------------------------
 * Main decorate function
 * ---------------------------------------------------------------------- */

export default function decorate(block) {
  const rows = [...block.children];

  /* Title is richtext — use innerHTML to preserve <br> / <p> markup */
  const title = rows[0]?.innerHTML.trim() || '';
  const privacyHTML = rows[1]?.innerHTML.trim() || '';
  const checkboxLabel = rows[2]?.textContent.trim() || 'I acknowledge the purposes and details on collection, use and disclosure of personal data of the Bank stated above.';

  /* enableModal checkbox — Row 3.  'on' / 'true' / 'checked' = enabled */
  const enableModalText = rows[3]?.textContent.trim().toLowerCase() || '';
  const enableModal = enableModalText === 'true' || enableModalText === 'on' || enableModalText === 'checked' || enableModalText === '';

  /* ctaLabel — Row 4 (linkText cell from _button-fields.json) */
  const ctaLabel = rows[4]?.textContent.trim() || 'Agree';

  if (document.querySelector('.privacy-modal-overlay')) {
    const placeholder = createElement('div', { className: 'privacy-modal-placeholder' });
    moveInstrumentation(block, placeholder);
    block.replaceWith(placeholder);
    return;
  }

  /* If modal is disabled by author, remove block and stop here */
  if (!enableModal) {
    const placeholder = createElement('div', { className: 'privacy-modal-placeholder' });
    moveInstrumentation(block, placeholder);
    block.replaceWith(placeholder);
    return;
  }

  /* If the user already accepted (cookie present), remove block and skip the modal entirely */
  if (getCookie(COOKIE_NAME) === 'true') {
    const placeholder = createElement('div', { className: 'privacy-modal-placeholder' });
    moveInstrumentation(block, placeholder);
    block.replaceWith(placeholder);
    return;
  }

  /* ------------------------------------------------------------------
   * Build the modal once and cache it
   * ------------------------------------------------------------------ */
  function handleAgree() {
    setCookie(COOKIE_NAME, 'true', COOKIE_DURATION_DAYS);
    closeModal(overlay); // eslint-disable-line no-use-before-define

    // Check for pending URL at the time of agreement
    const pendingHref = window.pendingNavigationUrl;
    if (pendingHref) {
      window.pendingNavigationUrl = null;
      window.location.href = pendingHref;
    }
  }

  function handleClose() {
    closeModal(overlay); // eslint-disable-line no-use-before-define
    window.pendingNavigationUrl = null;
  }

  const { overlay } = buildModal({
    title,
    privacyHTML,
    checkboxLabel,
    ctaLabel,
    onAgree: handleAgree,
    onClose: handleClose,
  });

  /* Create a hidden placeholder to maintain Universal Editor instrumentation */
  const placeholder = createElement('div', { className: 'privacy-modal-placeholder' });

  /* Move instrumentation attributes from block to placeholder for Universal Editor support */
  moveInstrumentation(block, placeholder);

  /* Replace the original block element with placeholder to keep instrumentation in DOM */
  block.replaceWith(placeholder);
  window.showPrivacyModal = (pendingUrl) => {
    window.pendingNavigationUrl = pendingUrl || null;
    openModal(overlay);
  };
}

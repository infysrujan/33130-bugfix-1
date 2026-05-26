/**
 * Cookie Modal Block
 *
 * Loaded as a fragment from /en/fragments/cookie-modal (or the TH equivalent).
 * Builds an accessible modal dialog with per-cookie-type toggles.
 */
import { createModalShell, hideModal } from '../../scripts/utils/modal.js';

const COOKIE_DURATION_DAYS = 30;
const COOKIE_CONSENT = 'ConsentAlert';
const CONSENT_SAVED_EVENT = 'cookie:consent-saved';
const LAST_TRIGGER_KEY = 'cookieModalTrigger';
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const COOKIE_NAME_MAP = {
  'analytic cookies': 'AnalysisCookie',
  'advertising cookies': 'AdvertisingCookie',
};

const COOKIE_VALUE_MAP = {
  AnalysisCookie: 'Analysis',
  AdvertisingCookie: 'Advertising',
};

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; `
    + `expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const encoded = encodeURIComponent(name);
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${encoded}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : null;
}

function el(tag, { className, text, attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function sanitizeId(value) {
  return value.toLowerCase().replace(/[^0-9a-z]+/g, '-').replace(/^-|-$/g, '') || 'cookie';
}

function getFocusableElements(element) {
  return [...element.querySelectorAll(FOCUSABLE_SELECTOR)].filter((node) => {
    if (node.closest('[hidden], [aria-hidden="true"]')) return false;
    return !node.hasAttribute('disabled');
  });
}

function buildToggle(cookieName, defaultChecked) {
  const label = el('label', { className: 'cookie-toggle' });
  const input = el('input', {
    attrs: {
      type: 'checkbox',
      name: cookieName,
      'aria-label': cookieName,
    },
  });

  input.checked = defaultChecked;

  const track = el('span', { className: 'el-switch-style' });
  label.append(input, track);

  return { label, input };
}

function buildAccordionItem(cookieName, labelText, descriptionHTML, isChecked, startOpen = false) {
  const contentId = `cookie-accordion-content-${sanitizeId(cookieName)}`;
  const item = el('div', { className: `cookie-accordion-item ${startOpen ? 'open-cookie' : 'close-cookie'}` });
  const heading = el('div', {
    className: 'cookie-accordion-heading',
    attrs: {
      role: 'button',
      'aria-controls': contentId,
      'aria-expanded': String(startOpen),
      tabindex: '0',
    },
  });
  const icon = el('span', { className: 'cookie-accordion-icon' });
  icon.setAttribute('aria-hidden', 'true');
  const iconImg = el('img', {
    attrs: {
      src: startOpen ? '/icons/24_Minus.svg' : '/icons/24_Add.svg',
      alt: '',
      width: '24',
      height: '24',
    },
  });
  icon.append(iconImg);

  const nameText = el('span', { className: 'cookie-accordion-name', text: labelText });
  const { label: toggleLabel, input: toggleInput } = buildToggle(cookieName, isChecked);
  const toggleWrapper = el('span', { className: 'cookie-accordion-toggle' });
  toggleWrapper.append(toggleLabel);

  heading.append(icon, nameText, toggleWrapper);

  const content = el('div', {
    className: 'cookie-accordion-content',
    attrs: { id: contentId },
  });
  content.innerHTML = descriptionHTML || '<p></p>';

  item.append(heading, content);

  function toggleAccordion(event) {
    if (toggleLabel.contains(event.target)) return;

    const isOpen = item.classList.contains('open-cookie');
    item.classList.toggle('open-cookie', !isOpen);
    item.classList.toggle('close-cookie', isOpen);
    iconImg.src = isOpen ? '/icons/24_Add.svg' : '/icons/24_Minus.svg';
    heading.setAttribute('aria-expanded', String(!isOpen));
  }

  heading.addEventListener('click', toggleAccordion);
  heading.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleAccordion(event);
    }
  });

  return { item, input: toggleInput };
}

function trapFocus(event, overlay) {
  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements(overlay);
  if (!focusable.length) {
    event.preventDefault();
    overlay.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openModal(overlay, trigger) {
  if (!overlay.isConnected) {
    document.body.appendChild(overlay);
  }

  overlay[LAST_TRIGGER_KEY] = trigger || document.activeElement;
  document.body.classList.add('cookie-modal-open');

  requestAnimationFrame(() => {
    overlay.classList.add('cookie-modal-visible');
    const focusable = getFocusableElements(overlay);
    (focusable[0] || overlay).focus();
  });
}

function closeModal(overlay) {
  const restoreTarget = overlay[LAST_TRIGGER_KEY];
  document.body.classList.remove('cookie-modal-open');
  hideModal(overlay, 'cookie-modal-visible', () => {
    if (restoreTarget && typeof restoreTarget.focus === 'function') {
      restoreTarget.focus();
    }
  });
}

function setupUEBlockRefresh(blockEl) {
  const ueEvents = ['aue:content-patch', 'aue:content-update', 'aue:content-add'];

  const handler = async (event) => {
    const resource = event.detail?.request?.target?.resource
      || event.detail?.request?.target?.container?.resource;
    if (!resource) return;

    const blockResource = blockEl.getAttribute('data-aue-resource');
    const sectionResource = blockEl.closest('[data-aue-resource]')?.getAttribute('data-aue-resource');
    if (resource !== blockResource && resource !== sectionResource) return;

    // Matched — stop editor-support.js from running its insert-then-remove
    // which causes UE to snapshot both old and new blocks as duplicates.
    ueEvents.forEach((e) => document.removeEventListener(e, handler, { capture: true }));
    event.stopImmediatePropagation();

    // Block-level refresh: fetch the current page, extract only the updated
    // cookie-modal block, and swap it in atomically. No full page reload.
    try {
      const res = await fetch(window.location.href);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newBlock = doc.querySelector('.cookie-modal');
      if (newBlock) {
        blockEl.replaceWith(newBlock);
        setupUEBlockRefresh(newBlock); // re-register for subsequent edits
        return;
      }
    } catch {
      // fall through to reload on fetch failure
    }
    window.location.reload();
  };

  ueEvents.forEach((e) => document.addEventListener(e, handler, { capture: true }));
}

export default function decorate(block) {
  // Detect authoring mode - check the block wrapper itself for data-aue-resource
  // (block.querySelectorAll only checks descendants, missing the wrapper itself)
  const rows = [...block.children];
  const hasAuthoringAttrs = block.hasAttribute('data-aue-resource')
    || rows.some((row) => [...row.attributes].some(({ name }) => name.startsWith('data-aue-')));
  const isAuthoringMode = hasAuthoringAttrs && window.self !== window.top;

  // In authoring mode: don't run the full decoration, but register the block
  // refresh handler so UE edits swap only this block instead of causing a
  // full page reload or the insert-then-remove duplicate in editor-support.js.
  if (isAuthoringMode) {
    setupUEBlockRefresh(block);
    return;
  }

  const titleSource = rows[0]?.firstElementChild || rows[0];
  const descSource = rows[1]?.firstElementChild || rows[1];
  const saveRow = rows.find((row, index) => index > 1
    && row.children.length === 1 && row.textContent.trim());
  const titleText = titleSource?.textContent?.trim() || 'Cookie Setting';
  const descHTML = descSource?.innerHTML?.trim() || '';
  const saveLabel = saveRow?.textContent?.trim() || 'Save and Close';

  const typeRows = rows.filter((row, index) => {
    if (index <= 1 || row.children.length < 2 || !row.textContent.trim()) return false;

    const labelText = row.children[0]?.textContent?.trim().toLowerCase() || '';
    return row.children.length >= 3 || Boolean(COOKIE_NAME_MAP[labelText]);
  });

  const cookieTypes = typeRows.map((row) => {
    const cols = [...row.children];
    const labelText = cols[0]?.textContent?.trim() || '';
    const descriptionHTML = cols[1]?.innerHTML?.trim() || '';
    const cookieName = COOKIE_NAME_MAP[labelText.toLowerCase()] || labelText;
    const stored = getCookie(cookieName);
    const defaultEnabled = cols[2]?.textContent?.trim() === 'true';
    const isChecked = stored !== null || defaultEnabled;

    return {
      labelText,
      descriptionHTML,
      cookieName,
      isChecked,
    };
  });

  const { overlay, dialog, closeBtn } = createModalShell({
    overlayClass: 'cookie-modal-overlay',
    dialogClass: 'cookie-modal-dialog',
    closeBtnClass: 'cookie-modal-close',
    ariaLabelledBy: 'cookie-modal-title',
    ariaDescribedBy: 'cookie-modal-description',
    closeBtnAriaLabel: 'Close cookie settings',
    closeBtnHTML: '',
    tabindex: '-1',
  });
  const closeBtnImg = el('img', {
    attrs: {
      src: '/icons/Cancel.svg',
      alt: '',
      width: '24',
      height: '24',
    },
  });
  closeBtn.append(closeBtnImg);

  const header = el('div', { className: 'cookie-modal-header' });
  const titleEl = el('h2', {
    className: 'cookie-modal-title',
    text: titleText,
    attrs: { id: 'cookie-modal-title' },
  });
  const descEl = el('div', {
    className: 'cookie-modal-description',
    attrs: { id: 'cookie-modal-description' },
  });
  descEl.innerHTML = descHTML;
  header.append(titleEl, descEl);

  const body = el('div', {
    className: 'cookie-modal-body',
  });
  const toggleInputs = [];

  cookieTypes.forEach(({
    labelText,
    descriptionHTML,
    cookieName,
    isChecked,
  }, index) => {
    // Only first item starts expanded (matches live site)
    // eslint-disable-next-line max-len
    const { item, input } = buildAccordionItem(cookieName, labelText, descriptionHTML, isChecked, index === 0);
    body.append(item);
    toggleInputs.push({ cookieName, input });
  });

  const footer = el('div', { className: 'cookie-modal-footer' });
  const saveBtn = el('button', {
    className: 'cookie-modal-save-btn',
    text: saveLabel,
    attrs: { type: 'button' },
  });
  footer.append(saveBtn);

  dialog.append(closeBtn, header, body, footer);

  closeBtn.addEventListener('click', () => closeModal(overlay));

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(overlay);
      return;
    }

    trapFocus(event, overlay);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal(overlay);
    }
  });

  saveBtn.addEventListener('click', () => {
    const preferences = {};

    toggleInputs.forEach(({ cookieName, input }) => {
      preferences[cookieName] = input.checked;
      if (input.checked) {
        setCookie(cookieName, COOKIE_VALUE_MAP[cookieName] || cookieName, COOKIE_DURATION_DAYS);
      }
    });

    setCookie(COOKIE_CONSENT, 'ALERT', COOKIE_DURATION_DAYS);
    closeModal(overlay);
    document.dispatchEvent(new CustomEvent(CONSENT_SAVED_EVENT, {
      detail: { preferences },
    }));
  });

  block.innerHTML = '';
  block.classList.add('cookie-modal-initialized');
  window.showCookieModal = (trigger) => openModal(overlay, trigger);
}

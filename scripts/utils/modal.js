import { loadFragment } from '../../blocks/fragment/fragment.js';
import { decorateIconInContainer } from '../custom-rte.js';

export function createModalHeader(lang, closeBtn, {
  headerClass = 'modal-header',
  logoLinkClass = 'modal-logo-link',
} = {}) {
  const header = document.createElement('div');
  header.className = headerClass;

  const logoLink = document.createElement('a');
  logoLink.className = logoLinkClass;
  logoLink.href = `/${lang}`;
  logoLink.setAttribute('aria-label', 'Bangkok Bank Home');

  const logoImg = document.createElement('img');
  logoImg.src = '/icons/logo.svg';
  logoImg.alt = 'Bangkok Bank';
  logoImg.width = 120;
  logoImg.height = 40;
  logoImg.onerror = "this.style.display='none'";

  logoLink.append(logoImg);
  header.append(logoLink, closeBtn);
  return header;
}

function fromHTML(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

/**
 * Creates a modal shell: overlay[role=dialog,aria-modal] > dialog, with a detached closeBtn.
 * The caller is responsible for positioning closeBtn inside dialog/overlay and
 * appending any block-specific content before calling showModal.
 *
 * @param {object} opts
 * @param {string}      opts.overlayClass
 * @param {string}      opts.dialogClass
 * @param {string}      opts.closeBtnClass
 * @param {string}      [opts.ariaLabel]         aria-label on overlay
 * @param {string}      [opts.ariaLabelledBy]    aria-labelledby on overlay
 * @param {string}      [opts.ariaDescribedBy]   aria-describedby on overlay
 * @param {string}      [opts.closeBtnAriaLabel] aria-label on the close button (default: 'Close')
 * @param {string}      [opts.closeBtnHTML]      innerHTML for the close button (default: '&times;')
 * @param {string|null} [opts.tabindex]          tabindex on overlay; null = omit (default: null)
 * @returns {{ overlay: HTMLElement, dialog: HTMLElement, closeBtn: HTMLButtonElement }}
 */
export function createModalShell({
  overlayClass,
  dialogClass,
  closeBtnClass,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeBtnAriaLabel = 'Close',
  closeBtnHTML = '&times;',
  tabindex = null,
} = {}) {
  const overlayAttrs = [
    `class="${overlayClass}"`,
    'role="dialog"',
    'aria-modal="true"',
    ariaLabel ? `aria-label="${ariaLabel}"` : '',
    ariaLabelledBy ? `aria-labelledby="${ariaLabelledBy}"` : '',
    ariaDescribedBy ? `aria-describedby="${ariaDescribedBy}"` : '',
    tabindex !== null ? `tabindex="${tabindex}"` : '',
  ].filter(Boolean).join(' ');

  const overlay = fromHTML(`<div ${overlayAttrs}></div>`);
  const dialog = fromHTML(`<div class="${dialogClass}"></div>`);
  const closeBtn = fromHTML(
    `<button class="${closeBtnClass}" type="button" aria-label="${closeBtnAriaLabel}">${closeBtnHTML}</button>`,
  );

  overlay.appendChild(dialog);
  return { overlay, dialog, closeBtn };
}

/**
 * Shows a modal: appends to document.body if not already connected,
 * then adds visibleClass on the next animation frame for the CSS transition.
 *
 * @param {HTMLElement} overlay
 * @param {string}      visibleClass
 */
export function showModal(overlay, visibleClass) {
  if (!overlay.isConnected) document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add(visibleClass));
}

/**
 * Hides a modal: removes visibleClass, waits for the CSS opacity/transform
 * transition to finish (or skips immediately for prefers-reduced-motion),
 * then removes the element from the DOM.
 *
 * @param {HTMLElement} overlay
 * @param {string}      visibleClass
 * @param {Function}    [onClosed]  Optional callback invoked after removal
 */
export function hideModal(overlay, visibleClass, onClosed) {
  overlay.classList.remove(visibleClass);

  const prefersReducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    overlay.remove();
    onClosed?.();
  };

  if (prefersReducedMotion) {
    finish();
    return;
  }

  overlay.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 300);
}

/**
 * Attaches Escape-key and click-outside-dialog close handlers to a modal overlay.
 *
 * @param {HTMLElement} overlay     The outermost overlay / backdrop element
 * @param {HTMLElement} dialog      The inner dialog element; clicks here don't close
 * @param {Function}    closeFn     Called when user triggers a close gesture
 * @param {object}      [opts]
 * @param {boolean}     [opts.escapeKey=true]    Close on Escape key
 * @param {boolean}     [opts.clickOutside=true] Close when clicking outside dialog
 */
export function setupModalHandlers(overlay, dialog, closeFn, {
  escapeKey = true,
  clickOutside = true,
} = {}) {
  if (clickOutside) {
    overlay.addEventListener('click', (e) => {
      if (overlay.isConnected && !dialog.contains(e.target)) closeFn();
    });
  }
  if (escapeKey) {
    overlay.ownerDocument.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.isConnected) closeFn();
    });
  }
}

function decorateModalContent(modalBody) {
  let hasTitle = false;
  const wrappers = [...modalBody.querySelectorAll('.default-content-wrapper')];
  const [firstWrapper] = wrappers;
  const headings = wrappers.flatMap((w) => [...w.querySelectorAll('h1, h2, h3, h4, h5, h6')]);
  const lastHeading = headings.at(-1);

  if (firstWrapper) firstWrapper.classList.add('card-list-modal-content');

  wrappers.forEach((wrapper) => {
    let textIndex = 0;
    [...wrapper.children].forEach((el, index) => {
      if (el.matches('h1, h2, h3, h4, h5, h6')) {
        if (!hasTitle) {
          el.classList.add('card-list-modal-title');
          hasTitle = true;
        } else if (el === lastHeading) {
          el.classList.add('card-list-modal-last-title');
        } else {
          el.classList.add('card-list-modal-subtitle');
        }
        return;
      }
      if (!el.matches('p')) return;
      const isMedia = !!el.querySelector('picture, img');
      const classes = [
        'card-list-modal-paragraph',
        `card-list-modal-paragraph-${index + 1}`,
        isMedia ? 'card-list-modal-media' : 'card-list-modal-text',
      ];
      if (!isMedia) {
        textIndex += 1;
        classes.push(
          `card-list-modal-text-${textIndex}`,
          textIndex === 1 ? 'card-list-modal-intro' : 'card-list-modal-description',
        );
      }
      el.classList.add(...classes);
    });
  });

  // Only merge a later wrapper into its section's text flow when it's the section's
  // sole child. If it shares the section with another block (e.g. accordion), unwrapping
  // would strip the div that block's siblings/CSS rely on — keep it wrapped instead.
  wrappers.slice(1).forEach((wrapper) => {
    if (wrapper.parentElement.children.length === 1) {
      wrapper.replaceWith(...wrapper.childNodes);
    }
  });
}

function buildOverlayModal(doc, extraDialogClass = '') {
  const wrapper = doc.createElement('div');
  wrapper.className = 'custom-modal';
  wrapper.setAttribute('aria-hidden', 'true');

  const backdrop = doc.createElement('div');
  backdrop.className = 'modal-overlay';

  const { overlay: content, dialog: body, closeBtn } = createModalShell({
    overlayClass: 'modal-content',
    dialogClass: `modal-body${extraDialogClass ? ` ${extraDialogClass}` : ''}`,
    closeBtnClass: 'modal-close',
    closeBtnAriaLabel: 'Close modal',
  });
  content.insertBefore(closeBtn, body);

  const closeModal = () => {
    wrapper.setAttribute('aria-hidden', 'true');
    hideModal(wrapper, 'active', () => doc.body.classList.remove('modal-open'));
  };

  closeBtn.addEventListener('click', closeModal);
  setupModalHandlers(wrapper, content, closeModal);
  wrapper.append(backdrop, content);
  return wrapper;
}

/**
 * Opens a standard overlay modal with one of two content strategies:
 *
 * @param {Document} doc
 * @param {object}   opts
 * @param {string}   [opts.fragmentPath] Load content from a fragment URL (async)
 * @param {Element}  [opts.content]      Use a pre-built element as the modal body (sync)
 */
export async function openModal(doc, { fragmentPath, content, dialogClass } = {}) {
  if (!fragmentPath && !content) return;
  if (doc.querySelector('.custom-modal')) return;

  const modal = buildOverlayModal(doc, dialogClass);
  const modalBody = modal.querySelector('.modal-body');
  if (!modalBody) return;

  if (fragmentPath) {
    try {
      const fragment = await loadFragment(fragmentPath);
      if (!fragment) return;
      modalBody.replaceChildren(...fragment.children);
      decorateModalContent(modalBody);
      decorateIconInContainer(modalBody);
    } catch {
      return;
    }
  } else {
    modalBody.replaceChildren(content);
  }

  modal.setAttribute('aria-hidden', 'false');
  doc.body.classList.add('modal-open');
  showModal(modal, 'active');
}

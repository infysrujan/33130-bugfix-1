import { moveInstrumentation } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { showModal, hideModal, setupModalHandlers } from '../../scripts/utils/modal.js';

export default async function decorate(block) {
  const doc = block.ownerDocument;
  const rows = [...block.children];

  // Row layout (from HTML authoring table):
  // 0: image
  // 1: title
  // 2: description prefix ("and entering")
  // 3: accept link placeholder  (unused — actual URL comes from the clicked link)
  // 4: accept label             ("Accept")
  // 5: accept id                (unused)
  // 6: accept variant           (unused)
  // 7: cancel link              (unused — cancel just closes the popup)
  // 8: cancel label             ("Cancel")
  // 9: cancel id                (unused)
  // 10: cancel variant          (unused)
  const [imageDiv, titleDiv, descriptionDiv, , acceptLabelDiv, , , , cancelLabelDiv] = rows;

  const placeholders = await fetchPlaceholders();

  const acceptLabelPlaceholder = placeholders?.acceptLabelTextforRedirectPopup;
  const cancelLabelPlaceholder = placeholders?.cancelLabelTextforRedirectPopup;
  const descPlaceholder = placeholders?.descPrefixforRedirectPopup;

  const acceptLabel = acceptLabelDiv?.querySelector('div')?.textContent?.trim() || acceptLabelPlaceholder || 'Accept';
  const cancelLabel = cancelLabelDiv?.querySelector('div')?.textContent?.trim() || cancelLabelPlaceholder || 'Cancel';
  const descPrefix = descriptionDiv?.querySelector('div')?.textContent?.trim() || descPlaceholder || 'and entering';
  const img = imageDiv?.querySelector('img') ?? null;
  const titleEl = titleDiv?.querySelector(':is(h1,h2,h3,h4,h5,h6)');
  const titleHTML = titleEl ? titleEl.outerHTML : (titleDiv?.querySelector('div')?.innerHTML || '');

  // ── Build a standalone overlay element appended directly to <body> ─────────
  // The block is loaded via loadFragment() which embeds it inside EDS section
  // wrappers. Those wrappers override position:fixed and max-width, so we
  // create a fresh overlay div, move it to document.body, and remove the
  // original block from the DOM — exactly as privacy-modal does.
  const overlay = doc.createElement('div');
  overlay.className = 'external-redirect-popup';

  // White card container
  const inner = doc.createElement('div');
  inner.className = 'external-redirect-popup-inner';
  overlay.appendChild(inner);

  // Close (×) button — top-right corner of card
  const closeBtn = doc.createElement('button');
  closeBtn.className = 'external-redirect-popup-close';
  closeBtn.setAttribute('aria-label', 'Close popup');
  closeBtn.innerHTML = '&times;';
  inner.appendChild(closeBtn);

  // Card body: image + text
  const body = doc.createElement('div');
  body.className = 'external-redirect-popup-body';

  if (img) {
    img.removeAttribute('loading'); // show immediately when popup opens
    body.appendChild(img);
  }

  const content = doc.createElement('div');
  content.className = 'external-redirect-popup-content';

  if (titleHTML) {
    const titleWrapper = doc.createElement('div');
    titleWrapper.className = 'external-redirect-popup-title';
    titleWrapper.innerHTML = titleHTML;
    content.appendChild(titleWrapper);
  }

  // Description: "and entering <span>"URL"</span>"
  const descEl = doc.createElement('div');
  descEl.className = 'external-redirect-popup-description';
  const descP = doc.createElement('p');
  descP.textContent = `${descPrefix} `;
  const urlSpan = doc.createElement('span');
  urlSpan.className = 'external-redirect-popup-url';
  descP.appendChild(urlSpan);
  descEl.appendChild(descP);
  content.appendChild(descEl);

  body.appendChild(content);
  inner.appendChild(body);

  // Button row
  const btnRow = doc.createElement('div');
  btnRow.className = 'external-redirect-popup-btn-row';

  const acceptBtn = doc.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'external-redirect-popup-btn external-redirect-popup-btn-accept';
  acceptBtn.textContent = acceptLabel;

  const cancelBtn = doc.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'external-redirect-popup-btn external-redirect-popup-btn-cancel';
  cancelBtn.textContent = cancelLabel;

  btnRow.appendChild(acceptBtn);
  btnRow.appendChild(cancelBtn);
  inner.appendChild(btnRow);

  // Append overlay directly to body so position:fixed works correctly,
  // then remove the original block (and its EDS section wrapper) from the DOM.
  doc.body.appendChild(overlay);

  // Move instrumentation attributes from block to overlay for Universal Editor support
  moveInstrumentation(block, overlay);

  block.remove();

  // ── State & helpers ────────────────────────────────────────────────────────
  let targetUrl = '';

  const closePopup = () => {
    hideModal(overlay, 'external-redirect-popup-visible');
    targetUrl = '';
  };

  const openPopup = (url) => {
    targetUrl = url;
    urlSpan.textContent = `"${url}"`;
    showModal(overlay, 'external-redirect-popup-visible');
  };

  setupModalHandlers(overlay, inner, closePopup, { clickOutside: false });

  // ── Event listeners ────────────────────────────────────────────────────────
  closeBtn.addEventListener('click', closePopup);

  cancelBtn.addEventListener('click', closePopup);

  acceptBtn.addEventListener('click', () => {
    const url = targetUrl;
    closePopup();
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  });

  // Expose openPopup globally so scripts.js can call it after loading this fragment
  window.showExternalRedirectPopup = openPopup;
}

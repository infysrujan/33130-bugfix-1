import { getLang } from '../scripts.js';
import {
  createModalShell,
  createModalHeader,
  showModal,
  hideModal,
  setupModalHandlers,
} from './modal.js';
import { decorateIcons } from '../aem.js';

function el(tag, { className, text, attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

export default function openPdfPreview(path, name, googleViewerUrl) {
  const lang = getLang();

  const { overlay, dialog, closeBtn } = createModalShell({
    overlayClass: 'srr-preview-overlay',
    dialogClass: 'srr-preview-dialog',
    closeBtnClass: 'srr-preview-close',
    ariaLabel: 'PDF Preview',
    closeBtnAriaLabel: 'Close preview',
    closeBtnHTML: '<span class="icon icon-close"></span>',
  });
  decorateIcons(closeBtn);

  const header = createModalHeader(lang, closeBtn, { headerClass: 'srr-preview-header', logoLinkClass: 'srr-preview-logo' });

  const body = el('div', { className: 'srr-preview-body' });
  const centerContent = el('div', { className: 'srr-preview-center-content' });
  const pdfEmbed = el('div', { className: 'srr-custom-pdf' });
  const embedEl = el('iframe', {
    attrs: {
      width: '100%', height: '100%', frameborder: '0', title: name || 'PDF Preview',
    },
  });
  pdfEmbed.append(embedEl);

  fetch(path)
    .then((r) => r.blob())
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      embedEl.src = blobUrl;
      embedEl.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true });
    })
    .catch(() => {
      if (googleViewerUrl) embedEl.src = `${googleViewerUrl}?embedded=true&url=${encodeURIComponent(path)}`;
    });

  const buttonGroup = el('div', { className: 'srr-button-group' });
  const downloadLink = el('a', {
    className: 'srr-btn-primary',
    text: 'Download',
    attrs: {
      href: path, title: 'Download', target: '_blank', download: name || '',
    },
  });
  buttonGroup.append(downloadLink);

  centerContent.append(pdfEmbed, buttonGroup);
  body.append(centerContent);
  dialog.append(header, body);

  function close() {
    document.body.classList.remove('srr-preview-open');
    hideModal(overlay, 'srr-preview-visible');
  }

  closeBtn.addEventListener('click', close);
  setupModalHandlers(overlay, dialog, close);

  document.body.classList.add('srr-preview-open');
  showModal(overlay, 'srr-preview-visible');
  closeBtn.focus();
}

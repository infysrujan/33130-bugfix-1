import { decorateIcons } from '../aem.js';
import {
  createModalHeader,
  createModalShell,
  hideModal,
  setupModalHandlers,
  showModal,
} from './modal.js';

export default function openPdfViewer({
  path,
  name = '',
  googleViewerUrl = '',
  downloadLabel = 'Download',
  classPrefix = 'srr-preview',
} = {}) {
  if (!path) return;

  const lang = document.documentElement.lang || 'en';

  const { overlay, dialog, closeBtn } = createModalShell({
    overlayClass: `${classPrefix}-overlay`,
    dialogClass: `${classPrefix}-dialog`,
    closeBtnClass: `${classPrefix}-close`,
    ariaLabel: 'PDF Preview',
    closeBtnAriaLabel: 'Close preview',
    closeBtnHTML: '<span class="icon icon-close"></span>',
  });
  decorateIcons(closeBtn);

  const header = createModalHeader(lang, closeBtn, {
    headerClass: `${classPrefix}-header`,
    logoLinkClass: `${classPrefix}-logo`,
  });

  const body = document.createElement('div');
  body.className = `${classPrefix}-body`;

  const centerContent = document.createElement('div');
  centerContent.className = `${classPrefix}-center-content`;

  const pdfEmbed = document.createElement('div');
  pdfEmbed.className = `${classPrefix}-embed`;

  const embedEl = document.createElement('iframe');
  embedEl.setAttribute('width', '100%');
  embedEl.setAttribute('height', '100%');
  embedEl.setAttribute('frameborder', '0');
  embedEl.setAttribute('title', name || 'PDF Preview');
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

  const buttonGroup = document.createElement('div');
  buttonGroup.className = `${classPrefix}-button-group`;

  const downloadLink = document.createElement('a');
  downloadLink.className = `${classPrefix}-download`;
  downloadLink.textContent = downloadLabel;
  downloadLink.href = path;
  downloadLink.target = '_blank';
  downloadLink.download = name || '';
  buttonGroup.append(downloadLink);

  centerContent.append(pdfEmbed, buttonGroup);
  body.append(centerContent);
  dialog.append(header, body);

  function close() {
    document.body.classList.remove(`${classPrefix}-open`);
    hideModal(overlay, `${classPrefix}-visible`);
  }

  closeBtn.addEventListener('click', close);
  setupModalHandlers(overlay, dialog, close);

  document.body.classList.add(`${classPrefix}-open`);
  showModal(overlay, `${classPrefix}-visible`);
  closeBtn.focus();
}

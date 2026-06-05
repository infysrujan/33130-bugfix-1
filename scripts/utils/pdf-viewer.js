import { decorateIcons } from '../aem.js';
import {
  createModalHeader,
  createModalShell,
  hideModal,
  setupModalHandlers,
  showModal,
} from './modal.js';
import { createTaggedElement } from '../scripts.js';

/**
 * Opens a PDF preview modal with a download action.
 *
 * @param {object} options
 * @param {string} options.path PDF URL.
 * @param {string} [options.name] PDF file name.
 * @param {string} [options.googleViewerUrl] Optional Google Viewer fallback base URL.
 * @param {string} [options.downloadLabel] Download button label.
 * @param {string} [options.classPrefix] CSS class prefix supplied by the consuming block.
 */
export default async function openPdfViewer({
  path,
  name = '',
  googleViewerUrl = '',
  downloadLabel = 'Download',
  classPrefix = 'pdf-viewer',
} = {}) {
  if (!path) return;

  const { overlay, dialog, closeBtn } = createModalShell({
    overlayClass: `${classPrefix}-overlay`,
    dialogClass: `${classPrefix}-dialog`,
    closeBtnClass: `${classPrefix}-close`,
    ariaLabel: 'PDF Preview',
    closeBtnAriaLabel: 'Close preview',
    closeBtnHTML: '<span class="icon icon-close"></span>',
  });
  decorateIcons(closeBtn);

  const lang = document.documentElement.lang || 'en';
  const header = createModalHeader(lang, closeBtn, {
    headerClass: `${classPrefix}-header`,
    logoLinkClass: `${classPrefix}-logo`,
  });
  const body = createTaggedElement('div', { className: `${classPrefix}-body` });
  const centerContent = createTaggedElement('div', { className: `${classPrefix}-center-content` });
  const pdfEmbed = createTaggedElement('div', { className: `${classPrefix}-embed` });
  const embedEl = createTaggedElement('iframe', {
    attrs: {
      width: '100%', height: '100%', frameborder: '0', title: name || 'PDF Preview',
    },
  });
  pdfEmbed.append(embedEl);

  let blobUrl;
  fetch(path)
    .then((response) => {
      if (!response.ok) throw new Error(`PDF fetch failed: ${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      blobUrl = URL.createObjectURL(blob);
      embedEl.src = blobUrl;
    })
    .catch(() => {
      if (googleViewerUrl) embedEl.src = `${googleViewerUrl}?embedded=true&url=${encodeURIComponent(path)}`;
    });

  const buttonGroup = createTaggedElement('div', { className: `${classPrefix}-button-group` });
  const downloadLink = createTaggedElement('button', {
    className: `${classPrefix}-download`,
    text: downloadLabel,
    attrs: { type: 'button', title: downloadLabel },
  });
  downloadLink.addEventListener('click', async () => {
    try {
      const blob = blobUrl ? null : await fetch(path).then((r) => r.blob());
      const downloadBlobUrl = blobUrl || URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadBlobUrl;
      a.download = name || 'download.pdf';
      dialog.appendChild(a);
      a.click();
      dialog.removeChild(a);
      if (blob) URL.revokeObjectURL(downloadBlobUrl);
    } catch {
      window.open(path, '_blank');
    }
  });
  buttonGroup.append(downloadLink);

  centerContent.append(pdfEmbed, buttonGroup);
  body.append(centerContent);
  dialog.append(header, body);

  function close() {
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = undefined; }
    document.body.classList.remove(`${classPrefix}-open`);
    hideModal(overlay, `${classPrefix}-visible`);
  }

  closeBtn.addEventListener('click', close);
  setupModalHandlers(overlay, dialog, close);

  document.body.classList.add(`${classPrefix}-open`);
  showModal(overlay, `${classPrefix}-visible`);
  closeBtn.focus();
}

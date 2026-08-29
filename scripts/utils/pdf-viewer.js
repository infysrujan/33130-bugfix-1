import { decorateIcons } from '../aem.js';
import {
  createModalHeader,
  createModalShell,
  hideModal,
  setupModalHandlers,
  showModal,
} from './modal.js';

let pdfLibReady;
function loadPdfLib() {
  if (!pdfLibReady) {
    pdfLibReady = import(`${window.hlx.codeBasePath}/scripts/vendor/pdf-lib.esm.min.js`)
      .then((mod) => mod.PDFDocument)
      .catch(() => null);
  }
  return pdfLibReady;
}

async function withTitleMetadata(blob, name) {
  if (!name) return blob;
  const PDFDocument = await loadPdfLib();
  if (!PDFDocument) return blob;
  try {
    const bytes = await blob.arrayBuffer();
    const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    pdfDoc.setTitle(name);
    const titledBytes = await pdfDoc.save();
    return new Blob([titledBytes], { type: 'application/pdf' });
  } catch {
    return blob;
  }
}

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

  const buttonGroup = document.createElement('div');
  buttonGroup.className = `${classPrefix}-button-group`;

  const downloadLink = document.createElement('a');
  downloadLink.className = `${classPrefix}-download`;
  downloadLink.textContent = downloadLabel;
  downloadLink.href = path;
  if (name) downloadLink.download = name;
  downloadLink.target = '_blank';
  downloadLink.rel = 'noopener';
  buttonGroup.append(downloadLink);

  let objectUrl = null;
  const pdfBlobPromise = fetch(path).then((r) => r.blob());

  pdfBlobPromise
    .then((blob) => withTitleMetadata(blob, name))
    .then((blob) => {
      // Keep the blob URL alive for the lifetime of the modal so the viewer's
      // built-in download button can still fetch it; revoke on close() below.
      objectUrl = URL.createObjectURL(blob);
      embedEl.src = objectUrl;
    })
    .catch(() => {
      if (googleViewerUrl) embedEl.src = `${googleViewerUrl}?embedded=true&url=${encodeURIComponent(path)}`;
    });

  centerContent.append(pdfEmbed, buttonGroup);
  body.append(centerContent);
  dialog.append(header, body);

  function close() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    document.body.classList.remove(`${classPrefix}-open`);
    hideModal(overlay, `${classPrefix}-visible`);
  }

  closeBtn.addEventListener('click', close);
  setupModalHandlers(overlay, dialog, close);

  document.body.classList.add(`${classPrefix}-open`);
  showModal(overlay, `${classPrefix}-visible`);
  closeBtn.focus();
}

import { decorateIcons } from '../aem.js';
import {
  createModalHeader,
  createModalShell,
  hideModal,
  setupModalHandlers,
  showModal,
} from './modal.js';

const SW_SCOPE_PATH = '/pdf-preview/';
let swActiveReady;

function waitForActivation(registration) {
  if (registration.active) return registration.active;
  const worker = registration.installing || registration.waiting;
  if (!worker) return null;
  return new Promise((resolve) => {
    worker.addEventListener('statechange', function onChange() {
      if (worker.state === 'activated') {
        worker.removeEventListener('statechange', onChange);
        resolve(registration.active);
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', onChange);
        resolve(null);
      }
    });
  });
}

function ensurePdfPreviewSw() {
  if (!swActiveReady) {
    if (!('serviceWorker' in navigator)) {
      swActiveReady = Promise.resolve(null);
    } else {
      const base = window.hlx?.codeBasePath || '';
      swActiveReady = navigator.serviceWorker
        .register(`${base}${SW_SCOPE_PATH}sw.js`, { scope: `${base}${SW_SCOPE_PATH}` })
        .then(waitForActivation)
        .catch(() => null);
    }
  }
  return swActiveReady;
}

function registerPdfBytes(active, url, buffer) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 3000);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const transferBuffer = buffer.slice(0);
    active.postMessage({ type: 'register-pdf', url, buffer: transferBuffer }, [transferBuffer, channel.port2]);
  });
}

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return Math.random().toString(36).slice(2);
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
  let swActive = null;
  let swPreviewUrl = null;

  fetch(path)
    .then((r) => r.arrayBuffer())
    .then(async (buffer) => {
      const active = name ? await ensurePdfPreviewSw() : null;
      if (active) {
        const base = window.hlx?.codeBasePath || '';
        const previewUrl = `${window.location.origin}${base}${SW_SCOPE_PATH}${randomId()}/${encodeURIComponent(name)}`;
        const registered = await registerPdfBytes(active, previewUrl, buffer);
        if (registered) {
          swActive = active;
          swPreviewUrl = previewUrl;
          embedEl.src = previewUrl;
          return;
        }
      }
      // Keep the blob URL alive for the lifetime of the modal so the viewer's
      // built-in download button can still fetch it; revoke on close() below.
      const blob = new Blob([buffer], { type: 'application/pdf' });
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
    if (swActive && swPreviewUrl) {
      swActive.postMessage({ type: 'unregister-pdf', url: swPreviewUrl });
      swActive = null;
      swPreviewUrl = null;
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

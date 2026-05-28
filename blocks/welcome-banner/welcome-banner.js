import { moveInstrumentation } from '../../scripts/scripts.js';
import { createModalShell, showModal, hideModal } from '../../scripts/utils/modal.js';

const BANNER_COOKIE = 'bbl-welcome-banner';
const COOKIE_DURATION_MS = 20 * 60 * 1000;

function setBannerDismissed() {
  const expires = new Date(Date.now() + COOKIE_DURATION_MS).toUTCString();
  document.cookie = `${encodeURIComponent(BANNER_COOKIE)}=${Date.now()}; expires=${expires}; path=/; SameSite=Lax`;
}

function getRemainingMs() {
  const encoded = encodeURIComponent(BANNER_COOKIE);
  const match = document.cookie.split('; ').find((r) => r.startsWith(`${encoded}=`));
  if (!match) return 0;
  const ts = Number(match.split('=')[1]);
  if (!ts) return 0;
  const remaining = COOKIE_DURATION_MS - (Date.now() - ts);
  return remaining > 0 ? remaining : 0;
}

function isDateActive(startStr, endStr) {
  const now = new Date();
  if (startStr) {
    const start = new Date(startStr);
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (endStr) {
    const end = new Date(endStr);
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return true;
}

export default function decorate(block) {
  const rows = [...block.children];
  const [
    desktopImgRow, mobileImgRow, isActiveRow, publishDateRow, unpublishDateRow, ...buttonRows
  ] = rows;

  const doc = block.ownerDocument;
  const placeholder = doc.createElement('div');
  placeholder.className = 'welcome-banner-placeholder';
  moveInstrumentation(block, placeholder);
  block.replaceWith(placeholder);

  const isActiveVal = isActiveRow?.textContent?.trim().toLowerCase();
  if (isActiveVal === 'false') return;

  const publishDate = publishDateRow?.textContent?.trim();
  const unpublishDate = unpublishDateRow?.textContent?.trim();
  if (!isDateActive(publishDate, unpublishDate)) return;

  const desktopPic = desktopImgRow?.querySelector('picture')?.cloneNode(true) ?? null;
  if (desktopImgRow && desktopPic) moveInstrumentation(desktopImgRow, desktopPic);

  const mobilePic = mobileImgRow?.querySelector('picture')?.cloneNode(true) ?? null;
  if (mobileImgRow && mobilePic) moveInstrumentation(mobileImgRow, mobilePic);

  const ctaLinks = buttonRows.map((row) => {
    const a = row?.querySelector('a');
    if (!a) return null;
    return {
      href: a.getAttribute('href') || '#',
      label: a.textContent.trim(),
      target: a.getAttribute('target') || '',
      sourceAnchor: a,
    };
  }).filter(Boolean);
  if (ctaLinks.length === 0) {
    placeholder.closest('.section')?.querySelectorAll('.default-content-wrapper a').forEach((a) => {
      ctaLinks.push({
        href: a.getAttribute('href') || '#',
        label: a.textContent.trim(),
        target: a.getAttribute('target') || '',
        sourceAnchor: a,
      });
    });
  }

  const { overlay, dialog, closeBtn } = createModalShell({
    overlayClass: 'welcome-banner-overlay',
    dialogClass: 'welcome-banner-dialog',
    closeBtnClass: 'welcome-banner-close',
    ariaLabel: 'Welcome banner',
    closeBtnAriaLabel: 'Close welcome banner',
  });

  const dismiss = () => {
    setBannerDismissed();
    hideModal(overlay, 'welcome-banner-overlay-visible');
  };

  closeBtn.addEventListener('click', dismiss);

  const media = doc.createElement('div');
  media.className = 'welcome-banner-media';
  if (desktopPic) {
    desktopPic.classList.add('welcome-banner-desktop-img');
    media.appendChild(desktopPic);
  }
  if (mobilePic) {
    mobilePic.classList.add('welcome-banner-mobile-img');
    media.appendChild(mobilePic);
  }

  const ctas = doc.createElement('div');
  ctas.className = 'welcome-banner-ctas';
  ctaLinks.forEach((ctaData) => {
    const a = doc.createElement('a');
    a.className = 'welcome-banner-cta';
    a.href = ctaData.href;
    a.textContent = ctaData.label;
    if (ctaData.target) a.setAttribute('target', ctaData.target);
    if (ctaData.sourceAnchor) moveInstrumentation(ctaData.sourceAnchor, a);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setBannerDismissed();
      if (ctaData.href && ctaData.href !== '#') {
        window.location.href = ctaData.href;
      } else {
        dismiss();
      }
    });
    ctas.appendChild(a);
  });

  dialog.appendChild(closeBtn);
  dialog.appendChild(media);
  dialog.appendChild(ctas);

  const show = () => showModal(overlay, 'welcome-banner-overlay-visible');
  const remainingMs = getRemainingMs();
  if (remainingMs > 0) {
    setTimeout(show, remainingMs);
  } else {
    show();
  }
}

/**
 * Social Icons Block – Bangkok Bank style
 */

import { moveInstrumentation } from '../../scripts/scripts.js';

export default function decorate(block) {
  // Check if we have at least one row with a platform and icon
  const validRows = [...block.children].filter((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return false;
    const platform = cells[0].textContent.trim();
    const icon = cells[1].querySelector('picture, img');
    return platform && icon;
  });

  // Hide original content (keep in DOM for Universal Editor)
  [...block.children].forEach((child) => {
    child.style.display = 'none';
  });

  // Return early if no valid rows — block is unconfigured
  if (validRows.length === 0) {
    return;
  }

  const closeIcon = document.createElement('a');
  closeIcon.className = 'icon-close';
  closeIcon.href = '#';
  closeIcon.setAttribute('aria-label', 'Close');

  const iconsContainer = document.createElement('div');
  iconsContainer.className = 'icons-container';

  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) return;

    const platform = cells[0].textContent.trim().toLowerCase();
    const icon = cells[1].querySelector('picture, img');

    // Skip if no icon
    if (!icon) return;

    // URL is optional — read from cell[2] if present
    let url = null;
    if (cells.length >= 3) {
      const link = cells[2].querySelector('a');
      const urlText = cells[2].textContent.trim();
      url = link?.href || urlText || null;
    }
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    const li = document.createElement('li');
    moveInstrumentation(row, li);
    const a = document.createElement('a');

    if (url) {
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    } else {
      a.href = '#';
    }
    a.className = `platform-${platform}`;
    a.setAttribute('aria-label', `Share on ${platform}`);

    const clonedIcon = icon.cloneNode(true);
    clonedIcon.querySelectorAll('img').forEach((img) => {
      // eslint-disable-next-line no-param-reassign
      img.loading = 'eager';
      // Remove UE instrumentation from clones — the originals in the hidden rows
      // already carry these attrs; duplicates confuse the UE content tree
      img.removeAttribute('data-aue-prop');
      img.removeAttribute('data-aue-type');
      img.removeAttribute('data-aue-label');
      img.removeAttribute('data-aue-resource');
    });
    a.appendChild(clonedIcon);
    li.appendChild(a);
    ul.appendChild(li);
  });

  iconsContainer.appendChild(ul);

  const shareBtn = document.createElement('div');
  shareBtn.className = 'btn-share';
  shareBtn.setAttribute('role', 'button');
  shareBtn.setAttribute('tabindex', '0');
  shareBtn.setAttribute('aria-label', 'Share');

  // NOTE: do NOT move block instrumentation away from the block element — UE needs
  // data-aue-resource + data-aue-filter on the block itself to correctly add child items

  // Append new elements without removing original content
  block.append(closeIcon, iconsContainer, shareBtn);

  /* -----------------------------
     Viewport direction handling
  ------------------------------ */
  function setViewportMode() {
    if (window.matchMedia('(width > 47.5rem)').matches) {
      block.classList.add('desktop');
      block.classList.remove('mobile');
    } else {
      block.classList.add('mobile');
      block.classList.remove('desktop');
    }
  }

  setViewportMode();
  window.addEventListener('resize', setViewportMode);

  /* -----------------------------
     Toggle logic
  ------------------------------ */
  block.addEventListener('click', (e) => {
    const active = block.classList.contains('active');
    const clickedShareLink = e.target.closest('.icons-container a');
    const clickedClose = e.target.classList.contains('icon-close');

    if (!active) {
      block.classList.add('active');
    } else if (clickedClose || !clickedShareLink) {
      block.classList.remove('active');
    }
  });

  /* -----------------------------
     Share popups
  ------------------------------ */
  ul.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      window.open(a.href, 'share', 'width=600,height=400');
    });
  });

  /* -----------------------------
     ESC closes
  ------------------------------ */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      block.classList.remove('active');
    }
  });
}

import createDownloadLink from '../../scripts/utils/download-helpers.js';
import { fetchConfigs } from '../../scripts/config.js';
import { getLang } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

async function handleDownloadWithPopup(e, link) {
  const targetUrl = link?.href;
  if (!targetUrl) return;

  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }

  const target = link.getAttribute('target') || link.target || '_self';

  try {
    if (typeof window.showPrivacyModal === 'function') {
      window.showPrivacyModal(targetUrl, {
        bypassCookie: true,
        className: 'download-file-modal',
        resetState: true,
        target,
      });
      return;
    }

    const configs = await fetchConfigs();
    const lang = getLang() || 'en';
    const rawPath = configs?.downloadFilePopup
      || configs?.download_file_popup
      || configs?.downloadfilepopup
      || `/${lang}/fragments/modals/download-file-popup`;
    // Support {{lang}} placeholder in config: e.g. /{{lang}}/fragments/modals/download-file-popup
    const popupPath = rawPath.replace(/\{\{lang\}\}/g, lang);

    await loadFragment(popupPath);

    if (typeof window.showPrivacyModal === 'function') {
      window.showPrivacyModal(targetUrl, {
        bypassCookie: true,
        className: 'download-file-modal',
        resetState: true,
        target,
      });
    } else if (target === '_self') {
      window.location.href = targetUrl;
    } else {
      window.open(targetUrl, target);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[Download File] Failed to load terms & conditions popup:', err);
    if (target === '_self') {
      window.location.href = targetUrl;
    } else {
      window.open(targetUrl, target);
    }
  }
}

export default function decorate(block) {
  const rows = [...block.children];
  const [buttonRow, ...otherRows] = rows;
  if (!buttonRow) return;

  const button = createDownloadLink(buttonRow);
  const link = button?.querySelector('a');

  let datePrefix = '';
  let isTermsPopupEnabled = false;
  let isBoxed = block.classList.contains('boxed-card');
  let titleEl = null;
  const dateElements = [];
  const lastIdx = otherRows.length - 1;

  otherRows.forEach((row, idx) => {
    const rawText = row.textContent.replace(/\s+/g, ' ').trim();
    const rawLower = rawText.toLowerCase();
    const isTrueVal = rawLower === 'true' || rawLower === 'on' || rawLower === 'yes' || rawLower === '1';
    const isFalseVal = rawLower === 'false' || rawLower === 'off' || rawLower === 'no' || rawLower === '0';

    // data-aue-prop is present in Universal Editor; absent in published/preview view.
    const prop = row.querySelector('[data-aue-prop]')?.getAttribute('data-aue-prop')
      || row.dataset.aueProp
      || row.querySelector('input[name]')?.getAttribute('name');

    // ── datePrefix ── model field #2, always otherRows[0] in published view
    if (prop === 'datePrefix' || (!prop && idx === 0)) {
      if (rawText && !isTrueVal && !isFalseVal) datePrefix = rawText;
      return;
    }

    // ── targetLink ── model field #3 (inside targetSettings container), otherRows[1]
    if (prop === 'targetLink' || (!prop && idx === 1 && (isTrueVal || isFalseVal))) {
      if (link) link.target = isTrueVal ? '_blank' : '_self';
      return;
    }

    // ── boxedCard ── model field #4, otherRows[2]
    if (prop === 'boxedCard' || (!prop && idx === 2 && (isTrueVal || isFalseVal))) {
      isBoxed = isTrueVal;
      return;
    }

    // ── enableTermsConditionPopup ── always the LAST field in the model / last row
    if (prop === 'enableTermsConditionPopup' || (!prop && idx === lastIdx && (isTrueVal || isFalseVal))) {
      isTermsPopupEnabled = isTrueVal;
      return;
    }

    // ── boxedCardSettings fields (title heading + authorableDate richtext) ──
    // These rows sit between boxedCard (idx=2) and the last popup row.
    const heading = row.querySelector(':is(h1, h2, h3, h4, h5, h6), [data-aue-prop="title"]');
    if (heading && !titleEl && heading.textContent.trim()) {
      titleEl = heading;
      return;
    }

    const dateMatches = [...row.querySelectorAll('[data-aue-prop="authorableDate"], [data-richtext-prop="authorableDate"]')];
    if (dateMatches.length > 0 && !isTrueVal && !isFalseVal) {
      dateMatches.forEach((el) => {
        if (el !== titleEl && el.textContent.trim()) dateElements.push(el);
      });
      return;
    }

    // Positional fallback for authorableDate plain text (no data-aue-prop in published view)
    if (!isTrueVal && !isFalseVal && rawText) {
      const p = document.createElement('p');
      p.textContent = rawText;
      dateElements.push(p);
    }
  });

  // Prepend datePrefix if present
  if (button && datePrefix) {
    const dateSpan = document.createElement('span');
    dateSpan.className = 'download-date-prefix';
    dateSpan.textContent = datePrefix;
    link?.prepend(dateSpan);
  }
  block.textContent = '';

  if (isBoxed) {
    block.classList.add('boxed-card');

    if (titleEl && titleEl.textContent.trim()) {
      titleEl.classList.add('download-file-title');
      block.appendChild(titleEl);
    }
  } else {
    block.classList.remove('boxed-card');
  }

  if (button) {
    if (link && isTermsPopupEnabled) {
      link.addEventListener('click', (e) => handleDownloadWithPopup(e, link));
    }
    block.appendChild(button);
  }

  if (isBoxed && dateElements.length > 0) {
    dateElements.forEach((el) => {
      el.classList.add('download-file-date');
      block.appendChild(el);
    });
  }
}

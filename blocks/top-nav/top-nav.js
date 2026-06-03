import { moveInstrumentation } from '../../scripts/scripts.js';

function pathnameSegmentMatches(pathOrUrl, normalizedLang) {
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const segments = path.split('/').filter(Boolean);
  return segments.some((seg) => seg.toLowerCase() === normalizedLang || seg.toLowerCase().startsWith(`${normalizedLang}-`));
}

/**
 * Returns whether the given URL is considered to match the document's lang.
 * Used to hide "current language" link-icons when multiple link-icons exist.
 * @param {string} url - Anchor href (absolute or relative)
 * @param {string} lang - Document lang (e.g. "en", "th", "en-US")
 * @returns {boolean}
 */
function urlMatchesLang(url, lang) {
  if (!url || !lang) return false;
  const normalizedLang = lang.toLowerCase().split('-')[0];
  if (!normalizedLang) return false;
  try {
    const path = new URL(url, document.baseURI || window.location.origin).pathname;
    const segments = path.split('/').filter(Boolean);
    return segments.some((seg) => seg.toLowerCase() === normalizedLang || seg.toLowerCase().startsWith(`${normalizedLang}-`));
  } catch {
    return pathnameSegmentMatches(url, normalizedLang);
  }
}

/**
 * Decorates the Top Nav block.
 * The Top Nav contains navigation links that can be:
 * - link-only: Simple text links
 * - link-logo: Links with an accompanying icon/logo image
 * When there is more than one link-icon, only those whose link URL does not
 * match the document's html lang attribute are shown (e.g. hide current language).
 * @param {Element} block The topnav block element
 */
export default function decorate(block) {
  const ul = document.createElement('ul');
  // ul.className = 'top-nav-links';

  // Process each row in the block (each row is a link item)
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    li.className = 'top-nav-item';
    moveInstrumentation(row, li);

    const isLinkLogo = row.innerHTML.includes('link-logo');

    li.classList.add(isLinkLogo ? 'link-icon' : 'link-only');

    // Find the anchor link in the row
    const anchor = row.querySelector('a');
    const picture = row.querySelector('picture');

    if (anchor) {
      const link = document.createElement('a');
      link.href = anchor.href;
      link.className = 'top-nav-link';

      // If there's an image/icon, add it before the text
      if (picture && isLinkLogo) {
        const iconWrapper = document.createElement('span');
        iconWrapper.className = 'top-nav-icon';
        iconWrapper.appendChild(picture.cloneNode(true));
        link.appendChild(iconWrapper);
      }

      // Add the link text
      const textSpan = document.createElement('span');
      textSpan.className = 'top-nav-text';
      textSpan.textContent = anchor.textContent;
      link.appendChild(textSpan);

      li.appendChild(link);
    } else {
      // Fallback: if no anchor, just use text content
      const textContent = row.textContent.trim();
      if (textContent) {
        const span = document.createElement('span');
        span.className = 'top-nav-text';
        span.textContent = textContent;
        li.appendChild(span);
      }
    }

    // Only add the list item if it has content
    if (li.children.length > 0) {
      ul.appendChild(li);
    }
  });

  // When more than one link-icon: show only those whose link URL does not match html lang
  const docLang = document.documentElement.getAttribute('lang') || '';
  const linkIconItems = ul.querySelectorAll('li.link-icon');
  if (linkIconItems.length > 1) {
    linkIconItems.forEach((li) => {
      const a = li.querySelector('a[href]');
      if (a && urlMatchesLang(a.href, docLang)) {
        li.style.display = 'none';
      }
    });
  }

  // Clear the block and append the new structure
  block.textContent = '';
  block.appendChild(ul);
}

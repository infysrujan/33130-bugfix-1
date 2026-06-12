import { createPictureWithoutOptimization } from '../bbl-decorators.js';

/** Min-width for desktop image source (px). */
const DESKTOP_MEDIA_MIN = 761;

/** Max-width for mobile image source (px). */
const MOBILE_MEDIA_MAX = 760;

/**
 * Strip query string from an image URL (everything from `?` onward).
 * @param {string|null|undefined} src
 * @returns {string|null|undefined}
 */
function cleanImgSrc(src) {
  if (typeof src !== 'string') return src;
  const q = src.indexOf('?');
  return q === -1 ? src : src.slice(0, q);
}

function createElement(tag, ...classNames) {
  const el = document.createElement(tag);
  if (classNames.length) el.classList.add(...classNames);
  return el;
}

export default function createSmartImage(
  pictureDesktop,
  pictureMobile,
  imageAlt,
  eager,
  blockName,
) {
  const imgDesktop = pictureDesktop?.querySelector('img');
  const imgMobile = pictureMobile?.querySelector('img');
  // Extract alt text from a cell that may contain HTML
  let altText = '';
  if (imageAlt) {
    // Try to get direct text (including from <p>, <span>, etc)
    altText = imageAlt.textContent?.trim() || '';
  }
  if (imgDesktop && imgMobile) {
    const picture = createElement('picture');

    const desktopSource = createElement('source');
    desktopSource.setAttribute('media', `(min-width: ${DESKTOP_MEDIA_MIN}px)`);
    let desktopSrc = imgDesktop.getAttribute('src');
    desktopSrc = cleanImgSrc(desktopSrc);
    desktopSource.setAttribute('srcset', desktopSrc);

    const mobileSource = createElement('source');
    mobileSource.setAttribute('media', `(max-width: ${MOBILE_MEDIA_MAX}px)`);
    let mobileSrc = imgMobile.getAttribute('src');
    mobileSrc = cleanImgSrc(mobileSrc);
    mobileSource.setAttribute('srcset', mobileSrc);

    const img = createElement('img');
    img.setAttribute('loading', eager ? 'eager' : 'lazy');
    if (eager) img.setAttribute('fetchpriority', 'high');

    img.setAttribute('alt', altText || img.alt || '');
    img.setAttribute('src', mobileSrc);

    picture.appendChild(desktopSource);
    picture.appendChild(mobileSource);
    picture.appendChild(img);

    return picture;
  }
  if (blockName === 'multi-column-tiles') {
    const img = createElement('img');
    img.setAttribute('loading', eager ? 'eager' : 'lazy');
    if (eager) img.setAttribute('fetchpriority', 'high');
    let allSrc = imgDesktop.getAttribute('src');
    allSrc = cleanImgSrc(allSrc);

    img.setAttribute('alt', altText || img.alt || '');
    img.setAttribute('src', allSrc);
    return img;
  }

  const img = imgMobile || imgDesktop;
  if (!img) return null;
  return createPictureWithoutOptimization(
    img.src,
    altText || '',
    eager,
    [{ media: `(max-width: ${MOBILE_MEDIA_MAX}px)`, width: '2000' }, { width: '750' }],
  );
}

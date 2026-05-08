import { loadFragment } from '../fragment/fragment.js';

export default function decorate(block) {
  const rows = [...block.children];

  // First row is fragmentId (author-defined ID for goal mapping). Normalize to slug.
  const fragmentIdRaw = rows[0]?.querySelector(':scope > div')?.textContent?.trim() || '';
  const fragmentId = fragmentIdRaw.toLowerCase().replace(/\s+/g, '-');
  if (fragmentId) block.dataset.fragmentId = fragmentId;

  // Title is always the second row.
  const title = rows[1]?.querySelector(':scope > div')?.textContent?.trim() || '';

  // Images: find all rows containing a <picture> element.
  const pictureRows = rows.filter((r) => r.querySelector('picture'));
  const buildPicture = (desktopRow, mobileRow, altText) => {
    const desktopImg = desktopRow?.querySelector('img');
    const mobileImg = mobileRow?.querySelector('img');
    if (!desktopImg && !mobileImg) return null;
    const pic = document.createElement('picture');
    if (mobileImg) {
      const src = document.createElement('source');
      src.media = '(max-width: 767px)';
      src.srcset = mobileImg.src;
      pic.append(src);
    }
    const img = document.createElement('img');
    img.src = (desktopImg || mobileImg).src;
    img.alt = altText || '';
    img.loading = 'lazy';
    pic.append(img);
    return pic;
  };
  const pic1 = buildPicture(pictureRows[0], pictureRows[1], '');
  const pic2 = buildPicture(pictureRows[2], pictureRows[3], '');

  // Last 4 rows: backgroundColor, buttonLink, buttonText, buttonTitle.
  const n = rows.length;
  const bgColor = rows[n - 4]?.querySelector(':scope > div')?.textContent?.trim() || '';
  const btnAnchor = rows[n - 3]?.querySelector('a');
  const btnText = rows[n - 2]?.querySelector(':scope > div')?.textContent?.trim() || '';
  const btnTitle = rows[n - 1]?.querySelector(':scope > div')?.textContent?.trim() || '';
  const buttons = btnText ? [{ href: btnAnchor?.href || '#', text: btnText, title: btnTitle }] : [];

  block.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'category-banner-card';
  if (bgColor) card.style.backgroundColor = bgColor;

  if (title) {
    const h3 = document.createElement('h3');
    h3.className = 'category-banner-title';
    h3.textContent = title;
    card.append(h3);
  }

  const images = document.createElement('div');
  images.className = 'category-banner-images';
  if (pic1) images.append(pic1);
  if (pic2) images.append(pic2);
  if (pic1 || pic2) card.append(images);

  if (buttons.length) {
    const btnWrap = document.createElement('div');
    btnWrap.className = 'category-banner-buttons';
    buttons.forEach(({ href, text, title: t }) => {
      const a = document.createElement('a');
      a.className = 'category-banner-btn';
      a.href = href;
      a.textContent = text;
      if (t) a.title = t;
      btnWrap.append(a);
    });
    card.append(btnWrap);
  }

  block.append(card);
}

export async function loadCategoryBannerFragment(basePath, goalId, container) {
  container.innerHTML = '';
  if (!basePath || !goalId) return;
  const fragment = await loadFragment(`${basePath}/${goalId}`);
  if (!fragment) return;
  const bannerBlock = fragment.querySelector('.category-banner');
  if (bannerBlock) container.append(bannerBlock);
}

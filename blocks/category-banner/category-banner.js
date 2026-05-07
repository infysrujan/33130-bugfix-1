import { loadFragment } from '../fragment/fragment.js';

// EDS authors this block as a fragment page under /saving-plan/{goalKey}.
// Row order from the model:
//   0  title
//   1  image1 desktop picture  (+ mime row auto-inserted by image-picker)
//   2  image1 desktop mimetype (skipped — part of picture element)
//   3  image1 mobile picture
//   4  image1 mobile mimetype
//   5  image1 alt              (plain text cell)
//   6  image2 desktop picture
//   7  image2 desktop mimetype
//   8  image2 mobile picture
//   9  image2 mobile mimetype
//  10  image2 alt
//  11  button1 link  (anchor)
//  12  button1 text
//  13  button1 title
//  14  button2 link
//  15  button2 text
//  16  button2 title
//  17  button3 link
//  18  button3 text
//  19  button3 title
//  20  button4 link
//  21  button4 text
//  22  button4 title

function buildPicture(desktopRow, mobileRow, altText) {
  const desktopImg = desktopRow?.querySelector('img');
  const mobileImg = mobileRow?.querySelector('img');
  if (!desktopImg && !mobileImg) return null;

  const picture = document.createElement('picture');

  if (mobileImg) {
    const mSrc = document.createElement('source');
    mSrc.media = '(max-width: 767px)';
    mSrc.srcset = mobileImg.src;
    picture.append(mSrc);
  }

  const img = document.createElement('img');
  img.src = (desktopImg || mobileImg).src;
  img.alt = altText || '';
  img.loading = 'lazy';
  picture.append(img);

  return picture;
}

function getCell(row) {
  return row?.querySelector(':scope > div');
}

function getText(row) {
  return getCell(row)?.textContent?.trim() || '';
}

function getAnchor(row) {
  return getCell(row)?.querySelector('a');
}

export default function decorate(block) {
  const rows = [...block.children];

  const title = getText(rows[0]);

  const pic1 = buildPicture(rows[1], rows[3], getText(rows[5]));
  const pic2 = buildPicture(rows[6], rows[8], getText(rows[10]));

  const btnAnchor = getAnchor(rows[11]);
  const btnText = getText(rows[12]);
  const btnTitle = getText(rows[13]);
  const buttons = btnText ? [{ href: btnAnchor?.href || '#', text: btnText, title: btnTitle }] : [];

  block.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'category-banner-card';

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

// Called from saving-plan to load this block as a fragment into a container element.
// path — e.g. '/saving-plan/education'
export async function loadCategoryBannerFragment(path, container) {
  container.innerHTML = '';
  if (!path) return;
  const fragment = await loadFragment(path);
  if (!fragment) return;
  const bannerBlock = fragment.querySelector('.category-banner');
  if (bannerBlock) container.append(bannerBlock);
}

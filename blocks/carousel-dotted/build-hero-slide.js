import { moveInstrumentation } from '../../scripts/scripts.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';

export default function buildSlideHeroVariant(row, index, cells, variant) {
  const slide = document.createElement('div');
  slide.className = `carousel-item ${variant}`;
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  const heroImageCell = cells[11];
  const imageAlt = cells[12]?.textContent.trim() || '';
  const titleCell = cells[13];
  const subtitleCell = cells[14];
  const linkCell = cells[15];

  // Optional per-breakpoint smart-crop images (imagePickerDesktop/imagePickerMobile),
  // appended after every other slide-type's fields in the model so a fixed cell index
  // isn't reliable here - detect them by picture presence instead (same reasoning as
  // the cardImage lookup in buildContentCardsSlide).
  const desktopIdx = cells.findIndex((cell, i) => i > 15 && cell?.querySelector('picture'));
  const mobileIdx = desktopIdx >= 0
    ? cells.findIndex((cell, i) => i > desktopIdx && cell?.querySelector('picture'))
    : -1;
  const smartCropPicture = mobileIdx >= 0
    ? createSmartImage(cells[desktopIdx], cells[mobileIdx], cells[mobileIdx + 1], index === 0)
    : null;

  const media = document.createElement('div');
  media.className = 'carousel-bg';

  if (smartCropPicture) {
    media.append(smartCropPicture);
    slide.append(media);
  } else {
    const picture = heroImageCell?.querySelector('picture');
    if (picture) {
      const img = picture.querySelector('img');
      if (imageAlt && img) img.setAttribute('alt', imageAlt);
      if (img && index === 0) {
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', 'high');
      }
      media.append(picture);
      slide.append(media);
    }
  }

  const content = document.createElement('div');
  content.className = 'carousel-content content';

  if (titleCell) {
    const title = document.createElement('div');
    title.classList.add('carousel-title', 'animated-text');
    title.innerHTML = titleCell.innerHTML;
    content.append(title);
  }

  if (subtitleCell) {
    const subtitle = document.createElement('div');
    subtitle.classList.add('carousel-subtitle', 'text-animation-variant', 'animated-text');
    subtitle.innerHTML = subtitleCell.innerHTML;
    content.append(subtitle);
  }

  if (linkCell) {
    const linkWrapper = document.createElement('div');
    linkWrapper.className = 'carousel-link-wrap animated-text';
    linkWrapper.innerHTML = linkCell.innerHTML;
    content.append(linkWrapper);
  }

  slide.append(content);
  return slide;
}

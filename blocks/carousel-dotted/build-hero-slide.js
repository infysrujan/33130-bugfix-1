import { moveInstrumentation } from '../../scripts/scripts.js';

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

  const picture = heroImageCell?.querySelector('picture');
  if (picture) {
    if (imageAlt) picture.querySelector('img')?.setAttribute('alt', imageAlt);
    const media = document.createElement('div');
    media.className = 'carousel-bg';
    media.append(picture);
    slide.append(media);
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

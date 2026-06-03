import { moveInstrumentation } from '../../scripts/scripts.js';
import { decorateButtonsV1 } from '../../scripts/bbl-decorators.js';

/**
 * Build a slide HERO BANNER IMAGE CAROUSEL or TEXT ANIMATION VARIANT
 * Structure: Image | Image Alt | Title | Subtitle | Button
 * Cell layout (carousel-dotted-slide, slideType = heroBannerImageCarousel / textAnimationVariant):
 *   0: variant, 1: slideType,
 *   2: badgeText (empty), 3: image (empty), 4: description (empty),
 *   5: link group (merged, empty) — link+linkText+linkTitle+linkType merged into 1 cell
 *   6: headerText (empty), 7: defaultText (empty),
 *   8: heroImage, 9: imageAlt, 10: title, 11: subtitle, 12: heroLink (merged)
 */
export default function buildSlideHeroVariant(row, index, cells, variant) {
  const slide = document.createElement('div');
  slide.className = `carousel-item ${variant}`;
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // heroImage (cell 8), title (cell 10), subtitle (cell 11), heroLink (cell 12)
  const heroImageCell = cells[8];
  const titleCell = cells[9];
  const subtitleCell = cells[10];
  const linkCell = cells[11];

  const picture = heroImageCell?.querySelector('picture');
  if (picture) {
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
    content.innerHTML += linkCell.innerHTML;
  }

  decorateButtonsV1(content);
  content.querySelector('a')?.classList.add('button-m', 'animated-text');

  slide.append(content);
  return slide;
}

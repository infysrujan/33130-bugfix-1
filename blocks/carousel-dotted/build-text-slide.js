import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Build a slide WITHOUT IMAGE variation
 * Structure: Header Text | Default Text
 * Cell layout (carousel-dotted-slide, slideType = withoutImage):
 *   0: variant, 1: slideType,
 *   2: badgeText (empty), 3: image (empty), 4: description (empty),
 *   5: link group (merged, empty) — AEM UE merges link+linkText+linkTitle+linkType into 1 cell
 *   6: headerText, 7: defaultText
 */
export default function buildSlideWithoutImage(row, index, cells) {
  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item without-image';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Content container
  const content = document.createElement('div');
  content.className = 'carousel-dotted-content';

  // Header text (cell 8)
  const headerText = cells[8]?.textContent.trim();
  if (headerText) {
    const header = document.createElement('div');
    header.className = 'carousel-dotted-header';
    header.textContent = headerText;
    content.append(header);
  }

  // Default text (cell 9)
  if (cells[9]) {
    const defaultText = document.createElement('div');
    defaultText.className = 'carousel-default-text';
    while (cells[9].firstChild) defaultText.append(cells[9].firstChild);
    content.append(defaultText);
  }

  slide.append(content);
  return slide;
}

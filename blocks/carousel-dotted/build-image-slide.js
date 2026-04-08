import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Build a slide WITH IMAGE variation
 * Structure: Badge Text | Image | Description | Link
 * Cell layout (carousel-dotted-slide, slideType = withImage):
 *   0: variant, 1: slideType, 2: badgeText, 3: image, 4: description,
 *   5: link, 6: linkText, 7: linkTitle, 8: linkType
 */
export default function buildSlideWithImage(row, index, cells) {
  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item with-image';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Background image (cell 3)
  const picture = cells[3]?.querySelector('picture');
  if (picture) {
    const media = document.createElement('div');
    media.className = 'carousel-bg';
    media.append(picture);
    slide.append(media);
  }

  // Content container
  const content = document.createElement('div');
  content.className = 'carousel-dotted-content';

  // Badge text (cell 2)
  const badgeText = cells[2]?.textContent.trim();
  if (badgeText) {
    const badge = document.createElement('div');
    badge.className = 'carousel-badge';
    badge.textContent = badgeText;
    content.append(badge);
  }

  // Description (cell 4)
  if (cells[4]) {
    const description = document.createElement('div');
    description.className = 'carousel-dotted-description';
    while (cells[4].firstChild) description.append(cells[4].firstChild);
    content.append(description);
  }

  // Link/Button (cell 5)
  const link = cells[5]?.querySelector('a');
  if (link) {
    content.append(link);
  }

  slide.append(content);
  return slide;
}

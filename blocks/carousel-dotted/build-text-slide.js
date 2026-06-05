import { moveInstrumentation } from '../../scripts/scripts.js';

export default function buildSlideWithoutImage(row, index, cells) {
  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item without-image';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Content container
  const content = document.createElement('div');
  content.className = 'carousel-dotted-content';

  // Header text (cell 9)
  const headerText = cells[9]?.textContent.trim();
  if (headerText) {
    const header = document.createElement('div');
    header.className = 'carousel-dotted-header';
    header.textContent = headerText;
    content.append(header);
  }

  // Default text (cell 10)
  if (cells[10]) {
    const defaultText = document.createElement('div');
    defaultText.className = 'carousel-default-text';
    while (cells[10].firstChild) defaultText.append(cells[10].firstChild);
    content.append(defaultText);
  }

  slide.append(content);
  return slide;
}

import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Helper to get text content from a row
 * @param {Element} row - The row element
 * @returns {string} The text content
 */
function getTextContent(row) {
  return row?.querySelector('p')?.textContent?.trim() || '';
}

/**
 * Helper to get HTML content from a row
 * @param {Element} row - The row element
 * @returns {string} The HTML content
 */
function getHTMLContent(row) {
  const div = row?.querySelector('div > div');
  return div?.innerHTML?.trim() || '';
}

/**
 * Build the content section
 * @param {string} eyebrowText - Eyebrow text
 * @param {string} titleText - Title text
 * @param {string} descriptionHTML - Description HTML
 * @param {Array} buttonRows - Array of button row elements
 * @param {Element} eyebrowRow - Original eyebrow row for instrumentation
 * @param {Element} titleRow - Original title row for instrumentation
 * @param {Element} descriptionRow - Original description row for instrumentation
 * @param {Document} doc - Document reference
 * @returns {Element} The content element
 */
function buildContent(
  eyebrowText,
  titleText,
  descriptionHTML,
  buttonRows,
  eyebrowRow,
  titleRow,
  descriptionRow,
  doc,
) {
  const content = doc.createElement('div');
  content.className = 'story-card-content';

  // Eyebrow
  if (eyebrowText) {
    const eyebrow = doc.createElement('h4');
    eyebrow.className = 'sub-title-medium line';
    eyebrow.textContent = eyebrowText;
    moveInstrumentation(eyebrowRow, eyebrow);
    content.appendChild(eyebrow);
  }

  // Title
  if (titleText) {
    const title = doc.createElement('h2');
    title.className = 'title-1';
    title.textContent = titleText;
    moveInstrumentation(titleRow, title);
    content.appendChild(title);
  }

  // Description
  if (descriptionHTML) {
    const description = doc.createElement('div');
    description.className = 'editor text-default';
    description.innerHTML = descriptionHTML;
    moveInstrumentation(descriptionRow, description);
    content.appendChild(description);
  }

  // Buttons - handle multiple buttons
  if (buttonRows && buttonRows.length > 0) {
    buttonRows.forEach((buttonRow) => {
      const buttonContainer = buttonRow?.querySelector('.button-container');
      if (buttonContainer) {
        const anchor = buttonContainer.querySelector('a');
        // Only append if button has valid href and text
        if (anchor && anchor.href && anchor.textContent.trim()) {
          const clonedContainer = buttonContainer.cloneNode(true);
          moveInstrumentation(buttonRow, clonedContainer);
          content.appendChild(clonedContainer);
        }
      }
    });
  }

  return content;
}

/**
 * Build the thumb element with picture
 * @param {Element} img - Original image element
 * @param {string} imageAlt - Image alt text
 * @param {Element} imageRow - Original image row for instrumentation
 * @param {Document} doc - Document reference
 * @returns {Element} The thumb element
 */
function buildThumb(img, imageAlt, imageRow, doc) {
  const thumb = doc.createElement('div');
  thumb.className = 'thumb';

  if (img) {
    // Create optimized picture element like carousel
    const optimizedPicture = createOptimizedPicture(
      img.src,
      imageAlt || img.alt || '',
      false,
    );

    // Move instrumentation from original image
    moveInstrumentation(img, optimizedPicture.querySelector('img'));

    thumb.appendChild(optimizedPicture);
  }

  // Move instrumentation from original image row to thumb
  if (imageRow) {
    moveInstrumentation(imageRow, thumb);
  }

  return thumb;
}

/**
 * Decorate the story-card block
 * @param {Element} block - The story-card block element
 */
export default function decorate(block) {
  const doc = block.ownerDocument;
  const rows = [...block.children];

  if (rows.length < 5) {
    // eslint-disable-next-line no-console
    console.warn('Story card block requires at least 5 rows (image, eyebrow, title, description, imagePosition)');
    return;
  }

  // JSON Model structure (when all fields populated):
  // Row 0: backgroundImage (reference)
  // Row 1: backgroundImageAlt (text) - OPTIONAL
  // Row 2: eyebrow (text)
  // Row 3: title (text)
  // Row 4: description (richtext)
  // Row 5: imagePosition (select)
  // Row 6+: button child elements (0 or more buttons)

  // Find position row by looking for "image-left" or "image-right"
  let positionRowIndex = rows.findIndex((row) => {
    const text = getTextContent(row).toLowerCase();
    return text === 'image-left' || text === 'image-right';
  });

  // If not found, assume standard 7-row structure
  if (positionRowIndex === -1) {
    positionRowIndex = 5;
  }

  // Determine if alt text field is present based on position row index
  // Position at index 5 = 7 rows (alt text present)
  // Position at index 4 = 6 rows (alt text missing)
  const hasAltText = positionRowIndex >= 5;

  // Extract data from rows
  const imageRow = rows[0];
  const altRow = hasAltText ? rows[1] : null;
  const eyebrowRow = hasAltText ? rows[2] : rows[1];
  const titleRow = hasAltText ? rows[3] : rows[2];
  const descriptionRow = hasAltText ? rows[4] : rows[3];
  const positionRow = rows[positionRowIndex];

  // Collect all button rows after position row (could be 0, 1, or multiple)
  const buttonRows = rows.slice(positionRowIndex + 1);

  // Get image
  const img = imageRow?.querySelector('img');
  const imageAlt = (altRow ? getTextContent(altRow) : '') || img?.alt || '';

  // Get text content
  const eyebrowText = getTextContent(eyebrowRow);
  const titleText = getTextContent(titleRow);
  const descriptionHTML = getHTMLContent(descriptionRow);

  // Get position
  const positionValue = getTextContent(positionRow).toLowerCase();
  const isImageRight = positionValue === 'image-right';

  // Build new structure
  const wrapper = doc.createElement('div');
  wrapper.className = 'wrapper';
  wrapper.setAttribute('data-section-title', eyebrowText || titleText || '');

  const thumbFull = doc.createElement('div');
  thumbFull.className = 'thumb-full';

  // Build thumb with picture element
  const thumb = buildThumb(img, imageAlt, imageRow, doc);

  // Build outer/inner/content
  const outer = doc.createElement('div');
  outer.className = 'outer';

  const inner = doc.createElement('div');
  inner.className = 'inner';

  const content = buildContent(
    eyebrowText,
    titleText,
    descriptionHTML,
    buttonRows,
    eyebrowRow,
    titleRow,
    descriptionRow,
    doc,
  );
  inner.appendChild(content);
  outer.appendChild(inner);

  // Always append in same order - CSS handles positioning
  thumbFull.appendChild(thumb);
  thumbFull.appendChild(outer);

  // Add class for CSS styling
  if (isImageRight) {
    block.classList.add('image-right');
  } else {
    block.classList.add('image-left');
  }

  wrapper.appendChild(thumbFull);

  // Move instrumentation from original block to new wrapper
  moveInstrumentation(block, wrapper);

  // Replace block content
  block.textContent = '';
  block.appendChild(wrapper);
}

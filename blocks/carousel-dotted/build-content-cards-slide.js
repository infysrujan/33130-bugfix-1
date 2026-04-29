import { moveInstrumentation } from '../../scripts/scripts.js';
import createCard from '../content-insert-cards/create-cards-helper.js';

/**
 * Build a slide for contentInsertCarouselCards variant.
 * Delegates card rendering to the shared createCard helper.
 *
 * Cell layout (carousel-dotted-slide, slideType = contentInsertCarouselCards):
 *   0: variant (hidden), 1: slideType (select),
 *   2: badgeText (empty), 3: image (empty), 4: description (empty),
 *   5: link group (empty, merged), 6: headerText (empty), 7: defaultText (empty),
 *   8: heroImage (empty), 9: imageAlt (empty), 10: title (empty), 11: subtitle (empty),
 *   12: heroLink (empty, merged),
 *   13: promoTag (category), 14: cardImage, 15: cardTitle,
 *   16: cardDescription, 17: button (merged — cardLink+cardLinkText+cardLinkTitle+cardLinkType)
 *
 * @param {HTMLElement} row - Original row element from the block
 * @param {number} index - Slide index
 * @param {HTMLElement[]} cells - Array of cell elements from the row
 * @returns {HTMLElement} Slide element
 */
export default function buildContentCardsSlide(row, index, cells) {
  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item content-cards';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Build a cardItem matching the structure createCard expects:
  // children[0]=categoryRow, [1]=imageRow, [2]=titleRow, [3]=descRow, [4]=buttonRow
  //
  // In AEM Universal Editor all model fields render as cells (including empty ones for
  // other slide types), so cardImage lands at cells[14]. In Google Docs authoring the
  // empty heroLink cell (index 12) is absent and indices shift by 1. Detect cardImage
  // by finding the first cell with a <picture> element so both environments work.
  const imgIdx = cells.findIndex((cell, i) => i >= 2 && cell?.querySelector('picture'));
  const cardItem = document.createElement('div');
  if (imgIdx >= 0) {
    [
      cells[imgIdx - 1], // promoTag (category)
      cells[imgIdx], // cardImage
      cells[imgIdx + 1], // cardTitle
      cells[imgIdx + 2], // cardDescription
      cells[imgIdx + 3], // button
    ].forEach((cell) => {
      if (cell) cardItem.append(cell);
    });
  }

  const card = createCard(cardItem);
  if (card) slide.append(card);

  return slide;
}

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
  const cardItem = document.createElement('div');
  [cells[12], cells[13], cells[14], cells[15], cells[16]].forEach((cell) => {
    if (cell) cardItem.append(cell);
  });

  const card = createCard(cardItem);
  if (card) slide.append(card);

  return slide;
}

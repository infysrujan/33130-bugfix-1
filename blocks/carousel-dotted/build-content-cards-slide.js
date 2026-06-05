import { moveInstrumentation } from '../../scripts/scripts.js';
import createCard from '../content-insert-cards/create-cards-helper.js';

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

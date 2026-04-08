import { moveInstrumentation } from '../../scripts/scripts.js';
import createCard from './create-cards-helper.js';

export default function decorate(block) {
  // Get all card items (direct children divs)
  const cardItems = [...block.children];

  // Create a container for all cards
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'content-insert-cards-wrapper';

  // Process each card item
  cardItems.forEach((cardItem) => {
    const card = createCard(cardItem);
    if (card) {
      // Add the decorated card
      cardsContainer.appendChild(card);
    } else {
      // Keep the original item for Universal Editor tracking
      // Move instrumentation to maintain editability
      const placeholder = document.createElement('div');
      placeholder.className = 'content-insert-card-placeholder';
      moveInstrumentation(cardItem, placeholder);
      // Keep original children for Universal Editor
      while (cardItem.firstElementChild) {
        placeholder.appendChild(cardItem.firstElementChild);
      }
      cardsContainer.appendChild(placeholder);
    }
  });

  // Replace block content
  block.replaceChildren(cardsContainer);
}

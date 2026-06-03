import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';

/**
 * Create a menu card element
 * @param {Element} cardElement - The raw card element from the block
 * @param {Document} doc - Document reference
 * @returns {Element} The formatted menu card
 */
function createMenuCard(cardElement, doc) {
  const children = [...cardElement.children];

  // Extract menu card fields based on the model structure
  // [0] = title, [1] = icon image, [2] = link
  const [titleDiv, iconDiv, linkDiv] = children;

  const titleText = titleDiv?.textContent.trim();
  const iconImg = iconDiv?.querySelector('img');
  const linkElement = linkDiv?.querySelector('a');

  // Create menu card item container
  const menuCardItem = createElementFromHTML(
    '<div class="tips-insight-quick-access-item"></div>',
    doc,
  );

  // If link exists, wrap title and image in the link
  if (linkElement) {
    const link = createElementFromHTML(
      `<a href="${linkElement.href}"${linkElement.title ? ` title="${linkElement.title}"` : ''}></a>`,
      doc,
    );

    // Add title to link
    if (titleText) {
      const titleElement = createElementFromHTML(
        `<div class="tips-insight-quick-access-title">${titleText}</div>`,
        doc,
      );
      link.appendChild(titleElement);
    }

    // Add image to link
    if (iconImg) {
      const optimizedPic = createOptimizedPicture(
        iconImg.src,
        iconImg.alt || titleText || '',
        false,
      );
      const img = optimizedPic.querySelector('img');
      if (img) {
        moveInstrumentation(iconImg, img);
        link.appendChild(img);
      }
    }

    menuCardItem.appendChild(link);
  } else {
    // No link - add title and image directly to card
    if (titleText) {
      const titleElement = createElementFromHTML(
        `<div class="tips-insight-quick-access-title">${titleText}</div>`,
        doc,
      );
      menuCardItem.appendChild(titleElement);
    }

    if (iconImg) {
      const optimizedPic = createOptimizedPicture(
        iconImg.src,
        iconImg.alt || titleText || '',
        false,
      );
      const img = optimizedPic.querySelector('img');
      if (img) {
        moveInstrumentation(iconImg, img);
        menuCardItem.appendChild(img);
      }
    }
  }

  return menuCardItem;
}

/**
 * Decorate the menu-cards block
 * @param {Element} block - The menu-cards block element
 */
export default function decorate(block) {
  const doc = block.ownerDocument;
  const children = [...block.children];

  // Create main container
  const menuCardsContainer = createElementFromHTML(
    '<div class="tips-insight-quick-access"></div>',
    doc,
  );

  // Skip first row (block title if exists) and process remaining rows as cards
  const cards = children.slice(1);

  cards.forEach((cardElement) => {
    const menuCard = createMenuCard(cardElement, doc);
    moveInstrumentation(cardElement, menuCard);
    menuCardsContainer.appendChild(menuCard);
  });

  // Replace block content
  block.textContent = '';
  block.appendChild(menuCardsContainer);
}

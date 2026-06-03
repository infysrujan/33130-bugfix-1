import { createOptimizedPicture } from '../../scripts/aem.js';
import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';

/**
 * Create a menu banner card element
 * @param {Element} cardElement - The raw card element from the block
 * @param {Document} doc - Document reference
 * @returns {Element} The formatted menu banner card
 */
function createMenuBannerCard(cardElement, doc) {
  const children = [...cardElement.children];

  // Extract menu banner card fields based on the model structure
  // [0] = cardTitle, [1] = cardImg, [2] = alt, [3] = cardLink
  const [titleDiv, imgDiv, altDiv, linkDiv] = children;

  const titleText = titleDiv?.textContent.trim();
  const cardImg = imgDiv?.querySelector('img');
  const altText = altDiv?.textContent.trim();
  const linkElement = linkDiv?.querySelector('a');

  // Create card list item
  const cardItem = createElementFromHTML('<li></li>', doc);

  // If link exists, wrap content in link
  if (linkElement) {
    const link = createElementFromHTML(
      `<a href="${linkElement.href}" class="thumb-square"${linkElement.title ? ` title="${linkElement.title}"` : ''}></a>`,
      doc,
    );

    // Add image to link
    if (cardImg) {
      const visualImg = createElementFromHTML(
        '<span class="visual-img"></span>',
        doc,
      );
      const optimizedPic = createOptimizedPicture(
        cardImg.src,
        altText || titleText || '',
        false,
      );
      const img = optimizedPic.querySelector('img');
      if (img) {
        moveInstrumentation(cardImg, img);
        visualImg.appendChild(img);
      }
      link.appendChild(visualImg);
    }

    // Add title to link
    if (titleText) {
      const titleElement = createElementFromHTML(
        `<span class="sub-title-small">${titleText}</span>`,
        doc,
      );
      link.appendChild(titleElement);
    }

    cardItem.appendChild(link);
  } else {
    // No link - add content directly to card
    if (cardImg) {
      const visualImg = createElementFromHTML(
        '<span class="visual-img"></span>',
        doc,
      );
      const optimizedPic = createOptimizedPicture(
        cardImg.src,
        altText || titleText || '',
        false,
      );
      const img = optimizedPic.querySelector('img');
      if (img) {
        moveInstrumentation(cardImg, img);
        visualImg.appendChild(img);
      }
      cardItem.appendChild(visualImg);
    }

    if (titleText) {
      const titleElement = createElementFromHTML(
        `<span class="sub-title-small">${titleText}</span>`,
        doc,
      );
      cardItem.appendChild(titleElement);
    }
  }

  return cardItem;
}

/**
 * Create inner content structure (eyebrow, title, cards)
 * @param {string} eyebrow - Eyebrow text
 * @param {Element} titleElement - Title element with RTE content
 * @param {Array} cardElements - Array of card elements
 * @param {Document} doc - Document reference
 * @returns {Element} The inner content element
 */
function createInnerContent(eyebrow, titleElement, cardElements, doc) {
  const inner = createElementFromHTML('<div class="inner"></div>', doc);

  // Add eyebrow
  if (eyebrow) {
    const eyebrowElement = createElementFromHTML(
      `<h4 class="sub-title-medium line">${eyebrow}</h4>`,
      doc,
    );
    inner.appendChild(eyebrowElement);
  }

  // Add title with RTE content and handle em tags
  if (titleElement) {
    const titleContainer = createElementFromHTML(
      '<div class="title-1"></div>',
      doc,
    );
    // Clone the title content and add text-blue class to em tags
    const titleContent = titleElement.cloneNode(true);
    const emTags = titleContent.querySelectorAll('em');
    emTags.forEach((em) => {
      em.classList.add('text-blue');
    });
    titleContainer.innerHTML = titleContent.innerHTML;
    inner.appendChild(titleContainer);
  }

  // Add cards list
  const cardsList = createElementFromHTML(
    '<ul class="list-thumb-square"></ul>',
    doc,
  );

  cardElements.forEach((cardElement) => {
    const card = createMenuBannerCard(cardElement, doc);
    moveInstrumentation(cardElement, card);
    cardsList.appendChild(card);
  });

  inner.appendChild(cardsList);

  return inner;
}

/**
 * Decorate the menu-banner block
 * @param {Element} block - The menu-banner block element
 */
export default function decorate(block) {
  const doc = block.ownerDocument;
  const children = [...block.children];

  // Extract block fields based on JSON model
  // [0] = backgroundImage, [1] = eyebrow, [2] = titleDesktop, [3] = titleMobile, [4+] = cards
  const [bgImageRow, eyebrowRow, titleDesktopRow, titleMobileRow, ...cardRows] = children;

  const bgImg = bgImageRow?.querySelector('img');
  const bgImageUrl = bgImg?.src || '';
  const eyebrow = eyebrowRow?.textContent.trim() || '';
  const titleDesktop = titleDesktopRow?.firstElementChild;
  const titleMobile = titleMobileRow?.firstElementChild;

  // Limit to max 4 cards
  const cards = cardRows.slice(0, 4);

  // Create main wrapper
  const wrapper = createElementFromHTML(
    '<div class="wrapper no-print"></div>',
    doc,
  );

  // Create desktop version with background
  const desktopTools = createElementFromHTML(
    '<div class="thumb-full large"></div>',
    doc,
  );

  if (bgImageUrl) {
    desktopTools.style.backgroundImage = `url(${bgImageUrl})`;
  }

  const desktopContainer = createElementFromHTML(
    '<div class="inner-container desktop-tools"></div>',
    doc,
  );

  const desktopInner = createInnerContent(eyebrow, titleDesktop, cards, doc);
  desktopContainer.appendChild(desktopInner);
  desktopTools.appendChild(desktopContainer);

  // Create mobile version
  const mobileContainer = createElementFromHTML(
    '<div class="inner-container mobile-tools"></div>',
    doc,
  );

  const mobileInner = createInnerContent(eyebrow, titleMobile, cards, doc);
  mobileContainer.appendChild(mobileInner);

  // Append both versions to wrapper
  wrapper.appendChild(desktopTools);
  wrapper.appendChild(mobileContainer);

  // Replace block content
  block.textContent = '';
  block.appendChild(wrapper);
}

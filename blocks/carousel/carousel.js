import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';
/**
 * Create the carousel header section
 * @param {string} title - The carousel title
 * @param {Element} linkElement - The link element with href, text, and title
 * @param {Document} doc - Document reference
 * @returns {Element} The header section element
 */
function createCarouselHeader(title, linkElement, doc) {
  const headerHTML = `
    <div class="carousel-header">
      ${title ? `<h2>${title}</h2>` : ''}
      ${linkElement ? `<a href="${linkElement.href}" class="link-primary"${linkElement.title ? ` title="${linkElement.title}"` : ''}>${linkElement.textContent}</a>` : ''}
    </div>
  `;
  return createElementFromHTML(headerHTML, doc);
}

/**
 * Create a carousel card element
 * @param {Element} cardElement - The raw card element from the block
 * @param {Document} doc - Document reference
 * @returns {Element} The formatted carousel card
 */
function createCarouselCard(cardElement, doc) {
  const card = createElementFromHTML('<div class="carousel-item"></div>', doc);

  const children = [...cardElement.children];

  // Extract carousel card fields based on the model structure
  const [
    nonActiveImageDesktopDiv,
    nonActiveImageMobileDiv,
    nonActiveImageAlt,
    activeImageDesktopDiv,
    activeImageMobileDiv,
    activeImageAlt,
    eyebrowDiv,
    cardTitleDiv,
    cardDescriptionDiv,
    buttonContainerDiv,
  ] = children;

  // Create image container with active and inactive states
  const imageContainer = createElementFromHTML('<div class="carousel-image-container"></div>', doc);
  const nonActivePictureDesktop = nonActiveImageDesktopDiv?.querySelector('picture');
  const nonActivePictureMobile = nonActiveImageMobileDiv?.querySelector('picture');
  const activePictureDesktop = activeImageDesktopDiv?.querySelector('picture');
  const activePictureMobile = activeImageDesktopDiv?.querySelector('picture');

  if (nonActivePictureDesktop || activePictureMobile) {
    const inactiveWrapper = createElementFromHTML('<div class="carousel-image-inactive"></div>', doc);
    const picture = createSmartImage(
      nonActivePictureDesktop,
      nonActivePictureMobile,
      nonActiveImageAlt,
    );
    if (picture) {
      inactiveWrapper.appendChild(picture);
    }
    imageContainer.appendChild(inactiveWrapper);
  }

  if (activePictureDesktop || activeImageMobileDiv) {
    const activeWrapper = createElementFromHTML('<div class="carousel-image-active"></div>', doc);
    const picture = createSmartImage(activePictureDesktop, activePictureMobile, activeImageAlt);
    if (picture) {
      activeWrapper.appendChild(picture);
    }
    imageContainer.appendChild(activeWrapper);
  }

  // Create content section
  const eyebrowText = eyebrowDiv?.textContent.trim();
  const titleText = cardTitleDiv?.textContent.trim();
  const descriptionHTML = cardDescriptionDiv?.innerHTML || '';
  const buttonLink = buttonContainerDiv?.querySelector('a');

  const contentHTML = `
    <div class="carousel-content">
      ${eyebrowText ? `<div class="carousel-eyebrow">${eyebrowText}</div>` : ''}
      ${titleText ? `<h3 class="carousel-title">${titleText}</h3>` : ''}
      ${descriptionHTML ? `<div class="carousel-description">${descriptionHTML}</div>` : ''}
      ${buttonLink ? `<span class="${buttonLink.className} carousel-cta">${buttonLink.textContent}</span>` : ''}
    </div>
  `;

  const contentWrapper = createElementFromHTML(contentHTML, doc);

  // Add image container to card first
  card.appendChild(imageContainer);

  // If button link exists, wrap the entire content in a single link (no nested anchors)
  if (buttonLink) {
    const cardLink = createElementFromHTML(`<a href="${buttonLink.href}" target="${buttonLink.target || '_self'}" class="carousel-item-link"${buttonLink.title ? ` title="${buttonLink.title}"` : ''}></a>`, doc);
    cardLink.appendChild(contentWrapper);
    card.appendChild(cardLink);
  } else {
    card.appendChild(contentWrapper);
  }

  return card;
}

/**
 * Initialize carousel slider functionality
 * @param {Element} track - The carousel track element
 */
function initCarousel(track) {
  const items = track.querySelectorAll('.carousel-item');
  if (items.length === 0) return;

  let currentIndex = 0;
  const totalItems = items.length;

  // Get navigation buttons from DOM (they're in the carousel block, not wrapper)
  const carousel = track.parentElement.parentElement;
  const prevButton = carousel.querySelector('.carousel-prev');
  const nextButton = carousel.querySelector('.carousel-next');

  // Update carousel position and active states
  function updateCarousel(animate = true) {
    if (animate) {
      track.style.transition = 'transform 0.4s ease-in-out';
    } else {
      track.style.transition = 'none';
    }

    // Calculate offset based on cumulative widths of previous cards
    // This handles variable width cards (active vs inactive)
    let offset = 0;
    const gap = window.innerWidth >= 1025 ? 24 : 16;

    // First, update active states so we get correct widths
    items.forEach((item, index) => {
      if (window.innerWidth >= 1025) {
        // Desktop: Only the current slide is active
        if (index === currentIndex) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      } else {
        // Mobile: Always show as active (images always visible)
        item.classList.add('active');
      }
    });

    // Force a layout recalculation to get updated widths
    // eslint-disable-next-line no-unused-expressions
    track.offsetHeight;

    // Calculate cumulative offset for all cards before current index
    for (let i = 0; i < currentIndex; i += 1) {
      offset -= (items[i].offsetWidth + gap);
    }

    track.style.transform = `translateX(${offset + 75 * (offset !== 0 ? 1 : 0)}px)`;

    // Update button states
    prevButton.disabled = currentIndex === 0;
    nextButton.disabled = currentIndex >= totalItems - 1;
  }

  // Check if device is mobile/tablet (disable drag on desktop)
  function isMobileOrTablet() {
    return window.innerWidth < 1025;
  }

  // Prevent context menu on long press
  track.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  });

  // Prevent drag on images
  items.forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });
  });

  // Navigation handlers - move one card at a time
  prevButton.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      updateCarousel();
    }
  });

  nextButton.addEventListener('click', () => {
    if (currentIndex < totalItems - 1) {
      currentIndex += 1;
      updateCarousel();
    }
  });

  // Handle window resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      // Reset to first slide on resize to avoid positioning issues
      currentIndex = 0;
      updateCarousel(false);
    }, 250);
  });

  // Initial setup - only set transform on desktop
  if (!isMobileOrTablet()) {
    updateCarousel(false);
  }
}

/**
 * Decorate the carousel block
 * @param {Element} block - The carousel block element
 */
export default function decorate(block) {
  const doc = block.ownerDocument;
  const children = [...block.children];

  // Extract carousel header information (first 2 rows)
  const titleElement = children[0]?.querySelector('p');
  const linkElement = children[1]?.querySelector('a');

  const title = titleElement?.textContent.trim() || '';

  // Create carousel wrapper
  const carouselWrapper = createElementFromHTML('<div class="carousel-wrapper"></div>', doc);

  // Add header if title or link exists
  if (title || linkElement) {
    const header = createCarouselHeader(title, linkElement, doc);
    carouselWrapper.appendChild(header);
  }

  // Create carousel track
  const carouselTrack = createElementFromHTML('<div class="carousel-track"></div>', doc);

  // Process carousel cards (remaining rows after the first 2)
  const carouselCards = children.slice(2);
  carouselCards.forEach((cardElement) => {
    const card = createCarouselCard(cardElement, doc);
    moveInstrumentation(cardElement, card);
    carouselTrack.appendChild(card);
  });

  carouselWrapper.appendChild(carouselTrack);

  // Add navigation buttons
  const prevButton = createElementFromHTML(`
    <button class="carousel-nav carousel-prev" aria-label="Previous"></button>
  `, doc);

  const nextButton = createElementFromHTML(`
    <button class="carousel-nav carousel-next" aria-label="Next"></button>
  `, doc);

  // Replace block content
  block.textContent = '';
  block.appendChild(carouselWrapper);

  // Append buttons to block (outside wrapper) so they're not clipped by overflow
  block.appendChild(prevButton);
  block.appendChild(nextButton);

  // Initialize carousel functionality
  if (carouselCards.length > 0) {
    initCarousel(carouselTrack);
  }
}

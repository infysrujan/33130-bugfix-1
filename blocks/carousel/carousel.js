import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';
import { applyLinkTarget } from '../../scripts/bbl-decorators.js';

const DESKTOP_BREAKPOINT = 1025;
const CAROUSEL_TRANSITION = 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)';

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
      ${linkElement ? `<a href="${linkElement.href}" class="link-primary" target="${linkElement.target || '_self'}"${linkElement.title ? ` title="${linkElement.title}"` : ''}>${linkElement.textContent}</a>` : ''}
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
      false,
    );
    if (picture) {
      inactiveWrapper.appendChild(picture);
    }
    imageContainer.appendChild(inactiveWrapper);
  }

  if (activePictureDesktop || activeImageMobileDiv) {
    const activeWrapper = createElementFromHTML('<div class="carousel-image-active"></div>', doc);
    const picture = createSmartImage(
      activePictureDesktop,
      activePictureMobile,
      activeImageAlt,
      false,
    );
    if (picture) {
      activeWrapper.appendChild(picture);
    }
    imageContainer.appendChild(activeWrapper);
  }

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

  card.appendChild(imageContainer);

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
  let currentTrackOffset = 0;
  let isSliding = false;
  let slideTimer;
  const totalItems = items.length;

  const carousel = track.parentElement.parentElement;
  const prevButton = carousel.querySelector('.carousel-prev');
  const nextButton = carousel.querySelector('.carousel-next');

  function measureItemWidth(item) {
    // eslint-disable-next-line no-unused-expressions
    item.offsetHeight;
    return item.offsetWidth;
  }

  function getActiveNaturalLeft() {
    if (currentIndex === 0) return 0;

    // The difference between the rendered card positions includes the actual
    // flex gap and any CSS sizing, without being affected by the track's
    // current transform.
    return items[currentIndex].getBoundingClientRect().left
      - items[0].getBoundingClientRect().left;
  }

  function getContentGridOffset() {
    const header = carousel.querySelector('.carousel-header');
    if (!header) return track.offsetLeft;

    const carouselRect = carousel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return headerRect.left - carouselRect.left;
  }

  function getTrackOffset(gridOffset) {
    if (window.innerWidth < DESKTOP_BREAKPOINT) return 0;
    if (currentIndex === 0) return 0;

    return gridOffset - getActiveNaturalLeft();
  }

  function positionNavButtons(gap, activeLeft) {
    if (window.innerWidth < DESKTOP_BREAKPOINT || carousel.offsetWidth === 0) return;

    const carouselRect = carousel.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const navTop = trackRect.top - carouselRect.top + trackRect.height / 2;
    const activeWidth = measureItemWidth(items[currentIndex]);
    const buttonOffset = (button) => button.offsetWidth / 2;

    prevButton.style.top = `${navTop}px`;
    nextButton.style.top = `${navTop}px`;
    prevButton.style.right = 'auto';
    nextButton.style.right = 'auto';

    if (currentIndex > 0) {
      prevButton.style.left = `${activeLeft - gap / 2 - buttonOffset(prevButton)}px`;
    }

    if (currentIndex < totalItems - 1) {
      const nextWidth = measureItemWidth(items[currentIndex + 1]);
      nextButton.style.left = `${activeLeft + activeWidth + gap + nextWidth + gap / 2 - buttonOffset(nextButton)}px`;
    }
  }

  function finishSlide() {
    isSliding = false;
    clearTimeout(slideTimer);
  }

  function updateCarousel(animate = true) {
    if (animate) {
      track.style.transition = CAROUSEL_TRANSITION;
    } else {
      track.style.transition = 'none';
    }

    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;

    items.forEach((item, index) => {
      if (window.innerWidth >= DESKTOP_BREAKPOINT) {
        item.classList.toggle('active', index === currentIndex);
      } else {
        item.classList.add('active');
      }
    });

    const applyLayout = () => {
      // eslint-disable-next-line no-unused-expressions
      track.offsetHeight;

      const gridOffset = getContentGridOffset();
      const shouldBeFullBleed = currentIndex > 0;
      const isFullBleed = track.classList.contains('is-sliding');

      if (shouldBeFullBleed !== isFullBleed) {
        // Keep the visible card in place while the track switches between its
        // right-anchored initial layout and the full-bleed sliding layout.
        track.style.transition = 'none';
        currentTrackOffset += shouldBeFullBleed ? gridOffset : -gridOffset;
        track.style.transform = `translateX(${currentTrackOffset}px)`;
        track.classList.toggle('is-sliding', shouldBeFullBleed);
        // eslint-disable-next-line no-unused-expressions
        track.offsetHeight;
        track.style.transition = animate ? CAROUSEL_TRANSITION : 'none';
      }

      currentTrackOffset = getTrackOffset(gridOffset);
      track.style.transform = `translateX(${currentTrackOffset}px)`;

      prevButton.disabled = currentIndex === 0;
      nextButton.disabled = currentIndex >= totalItems - 1;

      positionNavButtons(gap, gridOffset);
    };

    if (animate) {
      isSliding = true;
      clearTimeout(slideTimer);
      slideTimer = setTimeout(finishSlide, 550);
      requestAnimationFrame(() => {
        requestAnimationFrame(applyLayout);
      });
    } else {
      finishSlide();
      applyLayout();
    }
  }

  track.addEventListener('transitionend', (event) => {
    if (event.target === track && event.propertyName === 'transform') finishSlide();
  });

  function isMobileOrTablet() {
    return window.innerWidth < DESKTOP_BREAKPOINT;
  }

  track.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  });

  items.forEach((item) => {
    item.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });
  });

  prevButton.addEventListener('click', () => {
    if (!isSliding && currentIndex > 0) {
      currentIndex -= 1;
      updateCarousel();
    }
  });

  nextButton.addEventListener('click', () => {
    if (!isSliding && currentIndex < totalItems - 1) {
      currentIndex += 1;
      updateCarousel();
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      updateCarousel(false);
    }, 250);
  });

  if (!isMobileOrTablet()) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        updateCarousel(false);
      });
    });
  }
}

/**
 * Decorate the carousel block
 * @param {Element} block - The carousel block element
 */
export default function decorate(block) {
  const doc = block.ownerDocument;
  const children = [...block.children];

  const headerRows = children.filter((el) => el.children.length <= 1);
  const carouselCards = children.filter((el) => el.children.length > 1);

  const titleElement = headerRows[0]?.querySelector('p');
  const linkElement = headerRows[1]?.querySelector('a');
  applyLinkTarget(headerRows[1], 'a', headerRows[2]?.textContent?.trim());

  const title = titleElement?.textContent.trim() || '';

  const carouselWrapper = createElementFromHTML('<div class="carousel-wrapper"></div>', doc);

  if (title || linkElement) {
    const header = createCarouselHeader(title, linkElement, doc);
    carouselWrapper.appendChild(header);
  }

  const carouselTrack = createElementFromHTML('<div class="carousel-track"></div>', doc);
  carouselCards.forEach((cardElement) => {
    const card = createCarouselCard(cardElement, doc);
    moveInstrumentation(cardElement, card);
    carouselTrack.appendChild(card);
  });

  carouselWrapper.appendChild(carouselTrack);

  const prevButton = createElementFromHTML(`
    <button class="carousel-nav carousel-prev" aria-label="Previous"></button>
  `, doc);

  const nextButton = createElementFromHTML(`
    <button class="carousel-nav carousel-next" aria-label="Next"></button>
  `, doc);

  block.textContent = '';
  block.appendChild(carouselWrapper);
  block.appendChild(prevButton);
  block.appendChild(nextButton);

  if (carouselCards.length > 0) {
    initCarousel(carouselTrack);
  }
}

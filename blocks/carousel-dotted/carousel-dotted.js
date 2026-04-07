import { moveInstrumentation } from '../../scripts/scripts.js';
import {
  readBoolean,
  readDotsAlignment,
  readPosition,
} from '../../scripts/utils/carousel-helpers.js';
import { decorateButtonsV1 } from '../../scripts/bbl-decorators.js';

/**
 * Build a slide WITH IMAGE variation
 * Structure: Badge Text | Image | Description | Link
 * Cell layout (carousel-dotted-slide, slideType = withImage):
 *   0: variant, 1: slideType, 2: badgeText, 3: image, 4: description,
 *   5: link, 6: linkText, 7: linkTitle, 8: linkType
 */
function buildSlideWithImage(row, index, cells) {
  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item with-image';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Background image (cell 3)
  const picture = cells[3]?.querySelector('picture');
  if (picture) {
    const media = document.createElement('div');
    media.className = 'carousel-bg';
    media.append(picture);
    slide.append(media);
  }

  // Content container
  const content = document.createElement('div');
  content.className = 'carousel-dotted-content';

  // Badge text (cell 2)
  const badgeText = cells[2]?.textContent.trim();
  if (badgeText) {
    const badge = document.createElement('div');
    badge.className = 'carousel-badge';
    badge.textContent = badgeText;
    content.append(badge);
  }

  // Description (cell 4)
  if (cells[4]) {
    const description = document.createElement('div');
    description.className = 'carousel-dotted-description';
    while (cells[4].firstChild) description.append(cells[4].firstChild);
    content.append(description);
  }

  // Link/Button (cell 5)
  const link = cells[5]?.querySelector('a');
  if (link) {
    content.append(link);
  }

  slide.append(content);
  return slide;
}

/**
 * Build a slide WITHOUT IMAGE variation
 * Structure: Header Text | Default Text
 * Cell layout (carousel-dotted-slide, slideType = withoutImage):
 *   0: variant, 1: slideType,
 *   2: badgeText (empty), 3: image (empty), 4: description (empty),
 *   5: link group (merged, empty) — AEM UE merges link+linkText+linkTitle+linkType into 1 cell
 *   6: headerText, 7: defaultText
 */
function buildSlideWithoutImage(row, index, cells) {
  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item without-image';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Content container
  const content = document.createElement('div');
  content.className = 'carousel-dotted-content';

  // Header text (cell 6)
  const headerText = cells[6]?.textContent.trim();
  if (headerText) {
    const header = document.createElement('div');
    header.className = 'carousel-dotted-header';
    header.textContent = headerText;
    content.append(header);
  }

  // Default text (cell 7)
  if (cells[7]) {
    const defaultText = document.createElement('div');
    defaultText.className = 'carousel-default-text';
    while (cells[8].firstChild) defaultText.append(cells[8].firstChild);
    content.append(defaultText);
  }

  slide.append(content);
  return slide;
}

/**
 * Build a slide HERO BANNER IMAGE CAROUSEL or TEXT ANIMATION VARIANT
 * Structure: Image | Image Alt | Title | Subtitle | Button
 * Cell layout (carousel-dotted-slide, slideType = heroBannerImageCarousel / textAnimationVariant):
 *   0: variant, 1: slideType,
 *   2: badgeText (empty), 3: image (empty), 4: description (empty),
 *   5: link group (merged, empty) — link+linkText+linkTitle+linkType merged into 1 cell
 *   6: headerText (empty), 7: defaultText (empty),
 *   8: heroImage, 9: imageAlt, 10: title, 11: subtitle, 12: heroLink (merged)
 */
function buildSlideHeroVariant(row, index, cells, variant) {
  const slide = document.createElement('div');
  slide.className = `carousel-item ${variant}`;
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // heroImage (cell 8), title (cell 10), subtitle (cell 11), heroLink (cell 12)
  const heroImageCell = cells[8];
  const titleCell = cells[9];
  const subtitleCell = cells[10];
  const linkCell = cells[11];

  const picture = heroImageCell?.querySelector('picture');
  if (picture) {
    const media = document.createElement('div');
    media.className = 'carousel-bg';
    media.append(picture);
    slide.append(media);
  }

  const content = document.createElement('div');
  content.className = 'carousel-content content';

  if (titleCell) {
    const title = document.createElement('div');
    title.classList.add('carousel-title', 'animated-text');
    title.innerHTML = titleCell.innerHTML;
    content.append(title);
  }

  if (subtitleCell) {
    const subtitle = document.createElement('div');
    subtitle.classList.add('carousel-subtitle', 'text-animation-variant', 'animated-text');
    subtitle.innerHTML = subtitleCell.innerHTML;
    content.append(subtitle);
  }

  if (linkCell) {
    content.innerHTML += linkCell.innerHTML;
  }

  decorateButtonsV1(content);
  content.querySelector('a')?.classList.add('button-m', 'animated-text');

  slide.append(content);
  return slide;
}

/**
 * Build a slide - determines which variation to use and delegates.
 * Cell layout: cells[0] = variant (hidden), cells[1] = slideType (select)
 * slideType values:
 *  'withImage' | 'withoutImage' | 'heroBannerImageCarousel' | 'textAnimationVariant'
 */
function buildSlide(row, index) {
  const cells = [...row.children];

  // cells[1] is now a select with the slide type value
  const slideType = cells[1]?.textContent.trim();

  if (slideType === 'heroBannerImageCarousel') {
    return buildSlideHeroVariant(row, index, cells, 'hero-banner-image-carousel');
  }

  if (slideType === 'textAnimationVariant') {
    return buildSlideHeroVariant(row, index, cells, 'text-animation-variant');
  }

  if (slideType === 'withImage') {
    return buildSlideWithImage(row, index, cells);
  }

  // Default: withoutImage
  return buildSlideWithoutImage(row, index, cells);
}

/**
 * Build a slide for showArrowsDots variant.
 * Cell layout (carousel-dotted-slide-arrows):
 *  cells[0] = variant (hidden), cells[1] = slideType (select)
 * slideType values:
 *   withDefaultImage: 0:variant, 1:slideType, 2:defaultImage, 3:titleDefaultImage,
 *                     4:step, 5:descriptionDefaultImage  (no link group → no merging)
 *   withCircularImage: 0:variant, 1:slideType,
 *                      2-5: withDefaultImage fields (reserved, empty),
 *                      6:circularImage, 7:titleCircularImage, 8:descriptionCircularImage,
 *                      9:link (merged — AEM UE merges link+linkText+linkTitle+linkType into 1 cell)
 */
function buildSlideArrowsandDots(row, index) {
  const cells = [...row.children];
  const slide = document.createElement('div');
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // cells[1] is now a select with the slide type value
  const slideType = cells[1]?.textContent.trim();

  // Build a slide for the simpleCarousel / onlyImage variation.
  if (slideType === 'simpleCarousel' || slideType === 'onlyImage') {
    slide.className = 'carousel-dotted-item simple-carousel item';

    // onlyImage (cell 10), onlyImageAlt (cell 11)
    const onlyImageCell = cells[10];

    const picture = onlyImageCell?.querySelector('picture');
    if (picture) {
      slide.append(picture);
    }

    return slide;
  }

  if (slideType === 'withCircularImage') {
    slide.className = 'carousel-dotted-item with-circular-image item';

    // circularImage (cell 6), title (cell 7), description (cell 8), link (cell 9)
    const circularImageCell = cells[6];
    const titleCell = cells[7];
    const descriptionCell = cells[8];
    const linkCell = cells[9];

    // image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'circle-image';
    const picture = circularImageCell?.querySelector('picture');
    if (picture) imageContainer.append(picture);
    slide.append(imageContainer);

    // content container
    const content = document.createElement('div');
    content.className = 'caption';

    if (titleCell && titleCell.textContent.trim()) {
      const title = document.createElement('h3');
      title.className = 'title-2';
      title.innerHTML = titleCell.innerHTML;
      content.append(title);
    }

    if (descriptionCell && descriptionCell.textContent.trim()) {
      const description = document.createElement('div');
      description.className = 'name text-brown text-default';
      while (descriptionCell.firstChild) description.append(descriptionCell.firstChild);
      content.append(description);
    }

    if (linkCell && linkCell.textContent.trim()) {
      const linkWrap = document.createElement('div');
      linkWrap.className = 'button-group';
      const a = linkCell.querySelector('a');
      if (a) {
        a.className = 'sub-title-medium link-primary';
        linkWrap.append(a);
      } else {
        while (linkCell.firstChild) linkWrap.append(linkCell.firstChild);
      }
      content.append(linkWrap);
    }

    slide.append(content);
    return slide;
  }

  if (slideType === 'withDefaultImage') {
    slide.className = 'carousel-dotted-item with-default-image item has-caption bgd-white';

    // defaultImage (cell 2), title (cell 3), step (cell 4), description (cell 5)
    const defaultImageCell = cells[2];
    const titleCell = cells[3];
    const stepCell = cells[4];
    const descriptionCell = cells[5];

    // image
    const imageContainer = document.createElement('div');
    imageContainer.className = 'img-thumb';
    const picture = defaultImageCell?.querySelector('picture');
    if (picture) imageContainer.append(picture);
    slide.append(imageContainer);

    // content container
    const content = document.createElement('div');
    content.className = 'caption editor';

    if (titleCell && titleCell.textContent.trim()) {
      const title = document.createElement('h3');
      title.className = 'title-3';
      title.innerHTML = titleCell.innerHTML;
      content.append(title);
    }

    const hasTitle = titleCell && titleCell.textContent.trim();
    const hasStep = stepCell && stepCell.textContent.trim();
    const hasDesc = descriptionCell && descriptionCell.textContent.trim();

    if (hasTitle || hasStep || hasDesc) {
      const textWrap = document.createElement('div');
      textWrap.className = 'text-default editor pad-bot';

      if (hasStep) {
        const step = document.createElement('p');
        step.className = 'text-large text-light';
        step.innerHTML = stepCell.innerHTML;
        textWrap.append(step);
      }

      if (hasDesc) {
        while (descriptionCell.firstChild) textWrap.append(descriptionCell.firstChild);
      }
      content.append(textWrap);
    }

    slide.append(content);
    return slide;
  }

  slide.className = 'carousel-dotted-item';
  return slide;
}

/**
 * Initialize drag/swipe functionality for the carousel
 * @param {HTMLElement} block - The carousel block element
 * @param {Array} slideEls - Array of slide elements
 * @param {Function} setActive - Function to set active slide
 * @param {number} dragThreshold - Minimum drag distance to trigger slide change
 * @param {boolean} enableLooping - Whether to enable infinite looping
 */

function initializeDragSwipe(
  block,
  slideEls,
  setActive,
  dragThreshold = 50,
  enableLooping = false,
) {
  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let hasMoved = false;

  const handleStart = (e) => {
    if (e.target.closest('a, button')) return;
    isDragging = true;
    hasMoved = false;
    startX = e.type === 'touchstart' ? e.touches[0].pageX : (e.pageX || e.clientX);
    currentX = startX;
    block.classList.add('is-dragging');
  };

  const handleMove = (e) => {
    if (!isDragging) return;
    currentX = e.type === 'touchmove' ? e.touches[0].pageX : (e.pageX || e.clientX);
    if (Math.abs(currentX - startX) > 5) hasMoved = true;
  };

  const handleEnd = () => {
    if (!isDragging) return;

    isDragging = false;
    block.classList.remove('is-dragging');

    const deltaX = currentX - startX;

    if (hasMoved && Math.abs(deltaX) > dragThreshold) {
      const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));

      if (deltaX < -dragThreshold) {
        let nextIndex;
        if (enableLooping) {
          nextIndex = currentIndex < slideEls.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex < slideEls.length - 1 ? currentIndex + 1 : currentIndex;
        }
        if (nextIndex !== currentIndex) setActive(nextIndex);
      } else if (deltaX > dragThreshold) {
        let prevIndex;
        if (enableLooping) {
          prevIndex = currentIndex > 0 ? currentIndex - 1 : slideEls.length - 1;
        } else {
          prevIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }
        if (prevIndex !== currentIndex) setActive(prevIndex);
      }
    }

    // Reset drag state
    startX = 0;
    currentX = 0;
    hasMoved = false;
  };

  const handleCancel = () => {
    if (isDragging) {
      isDragging = false;
      block.classList.remove('is-dragging');
      startX = 0;
      currentX = 0;
      hasMoved = false;
    }
  };

  // Add mouse event listeners for desktop
  block.addEventListener('mousedown', handleStart);
  block.addEventListener('mousemove', handleMove);
  block.addEventListener('mouseup', handleEnd);
  block.addEventListener('mouseleave', handleCancel);

  // Add touch event listeners for mobile/tablet
  block.addEventListener('touchstart', handleStart, { passive: true });
  block.addEventListener('touchmove', handleMove, { passive: true });
  block.addEventListener('touchend', handleEnd);
  block.addEventListener('touchcancel', handleCancel);
}

/**
 * Initialize auto-scroll functionality for the carousel
 * @param {HTMLElement} block - The carousel block element
 * @param {Array} slideEls - Array of slide elements
 * @param {Function} setActive - Function to set active slide
 * @param {HTMLElement} prevArrow - Previous arrow button
 * @param {HTMLElement} nextArrow - Next arrow button
 * @param {Array} dotButtons - Array of dot button objects
 * @param {number} delay - Scroll delay in milliseconds
 * @param {number} itemsPerScroll - Number of items to scroll at once
 */
function initializeAutoScroll(
  block,
  slideEls,
  setActive,
  prevArrow,
  nextArrow,
  dotButtons,
  delay,
  itemsPerScroll,
) {
  let autoScrollInterval;

  const startAutoScroll = () => {
    if (autoScrollInterval) return;
    autoScrollInterval = setInterval(() => {
      const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));
      let nextIdx = currentIndex + itemsPerScroll;
      if (nextIdx >= slideEls.length) nextIdx = 0;
      setActive(nextIdx);
    }, delay);
  };

  const stopAutoScroll = () => {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  };

  // Start auto-scroll immediately
  startAutoScroll();

  // Pause auto-scroll on hover
  block.addEventListener('mouseenter', stopAutoScroll);
  block.addEventListener('mouseleave', startAutoScroll);

  // Pause auto-scroll when user interacts with navigation
  const pauseAutoScrollOnInteraction = () => {
    stopAutoScroll();
    // Resume after a delay (2x the scroll delay)
    setTimeout(startAutoScroll, delay * 2);
  };

  prevArrow.addEventListener('click', pauseAutoScrollOnInteraction);
  nextArrow.addEventListener('click', pauseAutoScrollOnInteraction);
  dotButtons.forEach(({ button }) => {
    button.addEventListener('click', pauseAutoScrollOnInteraction);
  });

  // Clean up interval when block is removed from DOM
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === block || node.contains(block)) {
          stopAutoScroll();
          observer.disconnect();
        }
      });
    });
  });

  if (block.parentNode) {
    observer.observe(block.parentNode, { childList: true });
  }
}

export default function decorate(block) {
  const rows = [...block.children];
  const hasAuthoringAttrs = rows.some((row) => [...row.attributes]
    .some(({ name }) => name.startsWith('data-aue-')));
  const isAuthoring = hasAuthoringAttrs && window.self !== window.top;

  // Read configuration values from block rows
  const dotsAlignment = readDotsAlignment(rows[0]);
  const dotsPosition = readPosition(rows[1]);
  const autoScroll = readBoolean(rows[2]);
  const scrollTimeDelay = rows[3]?.textContent.trim() || '';
  const showLinks = readBoolean(rows[4]);
  const seeMoreLink = showLinks ? rows[5]?.querySelector('a') : null;

  // Slides start at row 6, variant is in each slide's first cell
  const nextIndex = 6;
  const firstSlide = rows[nextIndex];
  const variant = firstSlide?.children[0]?.textContent.trim() || '';

  const showDots = variant === 'showDots';
  const showArrows = variant === 'showArrowsDots';

  const slides = rows.slice(nextIndex);
  block.className = 'carousel-dotted content';

  if (showDots) {
    block.classList.add(`dots-${dotsAlignment}-${dotsPosition}`);
  } else if (showArrows) {
    block.classList.add('dots-center-outside-container');
  } else {
    block.classList.add('no-dots');
  }

  if (showArrows) {
    block.classList.add('show-arrows-dots');
  }

  if (autoScroll) {
    block.classList.add('auto-scroll');
    if (scrollTimeDelay) block.dataset.scrollDelay = scrollTimeDelay;
  }

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');

  const slideEls = slides
    .map((row, index) => (showArrows
      ? buildSlideArrowsandDots(row, index)
      : buildSlide(row, index)))
    .filter(Boolean);

  const slidesWithImage = slideEls.filter((s) => s.classList.contains('with-image')).length;
  const slidesWithoutImage = slideEls.filter((s) => s.classList.contains('without-image')).length;
  const slidesHeroBanner = slideEls.filter((s) => s.classList.contains('hero-banner-image-carousel')).length;
  const slidesTextAnimation = slideEls.filter((s) => s.classList.contains('text-animation-variant')).length;
  const slidesCircularImage = slideEls.filter((s) => s.classList.contains('with-circular-image')).length;
  const slidesDefaultImage = slideEls.filter((s) => s.classList.contains('with-default-image')).length;
  const slidesSimpleCarousel = slideEls.filter((s) => s.classList.contains('simple-carousel')).length;
  const allHeroBanner = (slidesHeroBanner > 0 || slidesTextAnimation > 0)
    && slidesWithImage === 0
    && slidesWithoutImage === 0;
  const shouldCloneHeroSlide = allHeroBanner && slideEls.length > 1 && !isAuthoring;

  if (
    slidesWithImage > 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0
  ) {
    block.classList.add('all-with-image');
  } else if (
    slidesWithoutImage > 0
    && slidesWithImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0
  ) {
    block.classList.add('all-without-image');
  } else if (
    slidesHeroBanner > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesTextAnimation === 0
  ) {
    block.classList.add('all-hero-banner-image-carousel');
  } else if (
    slidesTextAnimation > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
  ) {
    block.classList.add('all-text-animation-variant');
  } else {
    block.classList.add('mixed-image-slides');
  }
  const dots = document.createElement('ul');
  dots.className = 'slick-dots';
  const allSimpleCarousel = slidesSimpleCarousel === slideEls.length && slidesSimpleCarousel > 0;
  if (slidesSimpleCarousel > 0) dots.classList.add('simple-carousel-dots');
  if (allSimpleCarousel) {
    block.classList.add('simple-carousel');
  }
  dots.setAttribute('role', 'tablist');

  // Create arrows
  const prevArrow = document.createElement('button');
  prevArrow.className = 'carousel-arrow carousel-arrow-prev';
  prevArrow.setAttribute('aria-label', 'Previous slide');
  prevArrow.type = 'button';

  const nextArrow = document.createElement('button');
  nextArrow.className = 'carousel-arrow carousel-arrow-next';
  nextArrow.setAttribute('aria-label', 'Next slide');
  nextArrow.type = 'button';

  let dotButtons;

  const zoomTimers = new Map();

  // Determine if we have circular or default image slides (needed for circular navigation)
  const circularOrDefaultImage = slidesCircularImage > 0 || slidesDefaultImage > 0;

  function triggerBgZoom(slideEl) {
    const bg = slideEl.querySelector('.carousel-bg');
    if (!bg) return;

    if (zoomTimers.has(slideEl)) {
      clearTimeout(zoomTimers.get(slideEl));
    }

    bg.classList.remove('bg-zoom-enter');
    // eslint-disable-next-line no-unused-expressions
    bg.offsetWidth;
    bg.classList.add('bg-zoom-enter');

    const timer = setTimeout(() => {
      bg.classList.remove('bg-zoom-enter');
      zoomTimers.delete(slideEl);
    }, 800);
    zoomTimers.set(slideEl, timer);
  }

  let isFirstLoad = true;

  function setActive(index) {
    const prevIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));

    const isHeroVariant = block.classList.contains('all-hero-banner-image-carousel')
      || block.classList.contains('all-text-animation-variant');

    const canUseCloneLoop = shouldCloneHeroSlide && allHeroBanner;

    const allWithoutImageTrack = slidesWithoutImage > 0
      && slidesWithImage === 0
      && slidesHeroBanner === 0
      && slidesTextAnimation === 0;

    const isLoopingForward = index === 0 && prevIndex === slideEls.length - 1;

    slideEls.forEach((slide, i) => {
      const active = i === index;
      const wasActive = slide.classList.contains('is-active');
      if (isHeroVariant && !wasActive && active && !isFirstLoad) {
        if (!isLoopingForward) {
          triggerBgZoom(slide);
          slide.classList.add('is-entering');
          setTimeout(() => slide.classList.remove('is-entering'), 600);
        }
      }

      slide.classList.toggle('is-active', active);
      slide.classList.toggle('is-current', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    dotButtons.forEach(({ li, button }, i) => {
      const active = i === index;
      li.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });

    // Disable arrow buttons only when not in circular navigation mode
    if (showArrows && circularOrDefaultImage) {
      // Keep arrows enabled for circular navigation
      prevArrow.disabled = false;
      nextArrow.disabled = false;
    } else {
      prevArrow.disabled = index === 0;
      nextArrow.disabled = index === slideEls.length - 1;
    }

    if (allHeroBanner || allWithoutImageTrack) {
      const trackWrapper = block.querySelector('.carousel-track-wrapper');
      if (trackWrapper) {
        const slideWidth = block.offsetWidth;

        if (isLoopingForward && canUseCloneLoop) {
          if (isHeroVariant && !isFirstLoad) {
            const cloneSlide = trackWrapper.lastElementChild;
            triggerBgZoom(cloneSlide);
            cloneSlide.classList.add('is-entering');
            setTimeout(() => cloneSlide.classList.remove('is-entering'), 600);
          }

          trackWrapper.style.transform = `translate3d(${-slideEls.length * slideWidth}px, 0px, 0px)`;
          setTimeout(() => {
            trackWrapper.style.transition = 'none';
            trackWrapper.style.transform = 'translate3d(0px, 0px, 0px)';
            trackWrapper.getBoundingClientRect();
            trackWrapper.style.transition = '';
          }, 700);
        } else {
          trackWrapper.style.transform = `translate3d(${-index * slideWidth}px, 0px, 0px)`;
        }
      }
    }
  }

  prevArrow.addEventListener('click', () => {
    const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));
    if (showArrows && circularOrDefaultImage) {
      // Enable circular navigation for showArrowsDots variant
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : slideEls.length - 1;
      setActive(prevIndex);
    } else if (currentIndex > 0) {
      setActive(currentIndex - 1);
    }
  });

  nextArrow.addEventListener('click', () => {
    const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));
    if (showArrows && circularOrDefaultImage) {
      // Enable circular navigation for showArrowsDots variant
      const nextSlideIndex = currentIndex < slideEls.length - 1 ? currentIndex + 1 : 0;
      setActive(nextSlideIndex);
    } else if (currentIndex < slideEls.length - 1) {
      setActive(currentIndex + 1);
    }
  });
  dotButtons = slideEls.map((slide, index) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'presentation');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-label', `Slide ${index + 1}`);
    button.addEventListener('click', () => setActive(index));
    li.append(button);
    dots.append(li);
    return { li, button };
  });

  const allWithoutImage = slidesWithoutImage > 0
    && slidesWithImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0;

  if (allHeroBanner) {
    const trackWrapper = document.createElement('div');
    trackWrapper.className = 'carousel-track-wrapper';
    if (shouldCloneHeroSlide) {
      const cloneFirst = slideEls[0].cloneNode(true);
      cloneFirst.setAttribute('aria-hidden', 'true');
      trackWrapper.replaceChildren(...slideEls, cloneFirst);
    } else {
      trackWrapper.replaceChildren(...slideEls);
    }
    block.replaceChildren(trackWrapper);
  } else if (allWithoutImage) {
    // Without-image variant uses track wrapper for sliding, but NO clone (looping is disabled)
    const trackWrapper = document.createElement('div');
    trackWrapper.className = 'carousel-track-wrapper';
    trackWrapper.replaceChildren(...slideEls);
    block.replaceChildren(trackWrapper);
  } else if (circularOrDefaultImage) {
    const trackWrapper = document.createElement('div');
    trackWrapper.className = 'carousel-track-wrapper';
    trackWrapper.replaceChildren(...slideEls);
    block.replaceChildren(trackWrapper);
  } else {
    block.replaceChildren(...slideEls);
  }

  if (showDots) {
    block.append(dots);
  } else if (showArrows) {
    if (circularOrDefaultImage) {
      const trackWrapper = block.querySelector('.carousel-track-wrapper');
      block.replaceChildren(prevArrow, trackWrapper, nextArrow, dots);
    } else {
      block.append(dots, prevArrow, nextArrow);
    }
  }

  if (seeMoreLink) {
    const moreWrap = document.createElement('div');
    moreWrap.className = 'carousel-dotted-more';
    seeMoreLink.classList.add('icon-arrow-left');
    moreWrap.append(seeMoreLink);
    block.append(moreWrap);
  }

  if (slideEls.length) {
    setActive(0);
  }

  requestAnimationFrame(() => {
    isFirstLoad = false;
  });

  if (autoScroll && scrollTimeDelay) {
    const delay = parseInt(scrollTimeDelay, 10);
    initializeAutoScroll(block, slideEls, setActive, prevArrow, nextArrow, dotButtons, delay, 1);
  }

  // Initialize drag/swipe functionality
  // Enable looping only if slides have images (like Grow Club section)
  // Disable looping for text-only slides (like News and Activities section)
  const enableLooping = slidesWithImage > 0
    || slidesHeroBanner > 0
    || slidesTextAnimation > 0
    || slidesCircularImage > 0
    || slidesDefaultImage > 0;
  initializeDragSwipe(block, slideEls, setActive, 50, enableLooping);
}

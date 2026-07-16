import {
  readBoolean,
  readDotsAlignment,
  readPosition,
} from '../../scripts/utils/carousel-helpers.js';
import buildCardListFragmentSlides, {
  updateFragmentTrack,
  setCardListTrackPosition,
  isFragmentNoScroll,
  tabletMin,
} from './card-list-carousel.js';
import buildContentCardsSlide from './build-content-cards-slide.js';
import buildImageSlide from './build-image-slide.js';
import buildTextSlide from './build-text-slide.js';
import buildHeroSlide from './build-hero-slide.js';
import buildArrowsDotsSlide from './build-arrows-dots-slide.js';
import buildMfCardListCarouselSlide from './build-mf-card-list-carousel-slide.js';
import buildMfFundCardsSlide from './build-mf-fund-cards-slide.js';

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
    return buildHeroSlide(row, index, cells, 'hero-banner-image-carousel');
  }

  if (slideType === 'textAnimationVariant') {
    return buildHeroSlide(row, index, cells, 'text-animation-variant');
  }

  if (slideType === 'withImage') {
    return buildImageSlide(row, index, cells);
  }

  if (slideType === 'contentInsertCarouselCards') {
    return buildContentCardsSlide(row, index, cells);
  }

  // Default: withoutImage
  return buildTextSlide(row, index, cells);
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
        if (nextIndex !== currentIndex) setActive(nextIndex, 'forward');
      } else if (deltaX > dragThreshold) {
        let prevIndex;
        if (enableLooping) {
          prevIndex = currentIndex > 0 ? currentIndex - 1 : slideEls.length - 1;
        } else {
          prevIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex;
        }
        if (prevIndex !== currentIndex) setActive(prevIndex, 'backward');
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
      setActive(nextIdx, 'forward');
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

export default async function decorate(block) {
  // UE deduplication guard: must run before the carouselInit check because UE may insert
  // a copy of the already-decorated block (including data-carousel-init and the `content`
  // class). When decorate() is called on that copy, we still need to clean up the stale
  // original. The `content` class is always added during decoration, making it the
  // reliable indicator of an already-decorated block.
  const section = block.closest('.section') || block.parentElement;
  section.querySelectorAll('.carousel-dotted.block').forEach((other) => {
    if (other === block) return;
    if (other.classList.contains('content')) other.remove();
  });

  // Prevent double-decoration of the same element (guards async re-entry)
  if (block.dataset.carouselInit) return;
  block.dataset.carouselInit = 'true';

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
  const seeMoreButtonContainer = showLinks ? rows[5]?.querySelector('.button-container') : null;
  const seeMoreLink = seeMoreButtonContainer?.querySelector('a') ?? (showLinks ? rows[5]?.querySelector('a') : null);
  const boolValues = new Set(['true', 'false']);
  const row6Text = showLinks ? rows[6]?.textContent?.trim() || '' : '';
  const targetRowPresent = boolValues.has(row6Text);
  const seeMoreTargetValue = targetRowPresent ? row6Text : '';

  // Dynamically find where slide rows start by detecting known slideType values in children[1].
  // This handles variants like showArrowsDots which have fewer active config rows than
  // the hardcoded index assumes (conditional model fields are not generated when inactive).
  const SLIDE_TYPES = new Set(['withImage', 'withoutImage', 'heroBannerImageCarousel', 'textAnimationVariant', 'contentInsertCarouselCards', 'cardListCarousel', 'mfCardListCarousel', 'withDefaultImage', 'withCircularImage', 'onlyImage']);
  const nextIndex = rows.findIndex((r) => SLIDE_TYPES.has(r.children[1]?.textContent.trim() || ''));

  const firstSlide = rows[nextIndex];
  const variant = firstSlide?.children[0]?.textContent.trim() || '';

  const showDots = variant === 'showDots';
  const showArrows = variant === 'showArrowsDots';
  const isMfCardListCarousel = variant === 'mf-card-list-carousel';

  const slides = rows.slice(nextIndex);
  const renderSlides = slides;
  block.classList.add('content');

  if (showDots) {
    block.classList.add(`dots-${dotsAlignment}-${dotsPosition}`);
  } else if (showArrows || isMfCardListCarousel) {
    block.classList.add('dots-center-outside-container');
  } else {
    block.classList.add('no-dots');
  }

  if (showArrows || isMfCardListCarousel) {
    block.classList.add('show-arrows-dots');
  }

  if (isMfCardListCarousel) {
    block.classList.add('mf-card-list-carousel');
  }

  if (autoScroll && !isAuthoring) {
    block.classList.add('auto-scroll');
    if (scrollTimeDelay) block.dataset.scrollDelay = scrollTimeDelay;
  }

  block.setAttribute('role', 'region');
  block.setAttribute('aria-roledescription', 'carousel');

  const slideEls = (await Promise.all(renderSlides.map((row, index) => {
    const rowVariant = row.children[0]?.textContent.trim();
    if (rowVariant === 'mf-card-list-carousel') {
      return buildMfCardListCarouselSlide(row, index);
    }
    const slideType = row.children[1]?.textContent.trim();
    if (slideType === 'cardListCarousel') {
      return buildCardListFragmentSlides(row, index);
    }

    if (slideType === 'mfCardListCarousel') {
      return buildMfFundCardsSlide(row, index);
    }

    if (showArrows) {
      return buildArrowsDotsSlide(row, index);
    }

    return buildSlide(row, index);
  }))).flat();
  slideEls.forEach((slide, slideIndex) => {
    slide.dataset.index = slideIndex;
  });

  const slidesWithImage = slideEls.filter((s) => s.classList.contains('with-image')).length;
  const slidesWithoutImage = slideEls.filter((s) => s.classList.contains('without-image')).length;
  const slidesHeroBanner = slideEls.filter((s) => s.classList.contains('hero-banner-image-carousel')).length;
  const slidesTextAnimation = slideEls.filter((s) => s.classList.contains('text-animation-variant')).length;
  const slidesCircularImage = slideEls.filter((s) => s.classList.contains('with-circular-image')).length;
  const slidesDefaultImage = slideEls.filter((s) => s.classList.contains('with-default-image')).length;
  const slidesFragment = slideEls.filter((s) => s.classList.contains('carousel-fragment')).length;
  const slidesContentCards = slideEls.filter((s) => s.classList.contains('content-cards')).length;
  const slidesMfCardList = slideEls.filter((s) => s.classList.contains('mf-card-list-carousel-item')).length;
  const slidesMfFundCards = slideEls.filter((s) => s.classList.contains('mf-fund-cards-item')).length;
  // Slides built by buildMfFundCardsSlide (pages of mutual-fund cards) don't set
  // isMfCardListCarousel (that flag is only for the separate 'mf-card-list-carousel'
  // block variant), so without this the arrow handlers below fall through to the
  // "stop at the ends" branch instead of looping.
  const isMfFundCardsCarousel = slidesMfFundCards > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0;
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
    slidesFragment > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0
  ) {
    block.classList.add('all-carousel-fragment');
  } else if (
    slidesTextAnimation > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
  ) {
    block.classList.add('all-text-animation-variant');
  } else if (
    slidesContentCards > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0
  ) {
    block.classList.add('all-content-cards');
  } else if (
    slidesMfCardList > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0
  ) {
    block.classList.add('all-mf-card-list-carousel');
  } else {
    block.classList.add('mixed-image-slides');
  }
  const dots = document.createElement('ul');
  dots.className = 'slick-dots';
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

  // Variants that use the wrapped arrow-track layout.
  const circularOrDefaultImage = slidesCircularImage > 0 || slidesDefaultImage > 0;
  const allFragmentTrack = slidesFragment > 0
    && slidesWithImage === 0
    && slidesWithoutImage === 0
    && slidesHeroBanner === 0
    && slidesTextAnimation === 0;
  const arrowTrackVariant = circularOrDefaultImage || allFragmentTrack;
  const isSimpleCarousel = slideEls.some((s) => s.classList.contains('simple-carousel'));
  const shouldCloneFragmentSlide = allFragmentTrack && slideEls.length > 1 && !isAuthoring;

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

  function setActive(index, direction = null) {
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

    // Keep arrows enabled for wrapped arrow-track variants so they can loop.
    if (showArrows && arrowTrackVariant) {
      prevArrow.disabled = false;
      nextArrow.disabled = false;
    } else if (showArrows && isSimpleCarousel) {
      prevArrow.disabled = false;
      nextArrow.disabled = false;
    } else if (isMfCardListCarousel || isMfFundCardsCarousel) {
      prevArrow.disabled = false;
      nextArrow.disabled = false;
    } else {
      prevArrow.disabled = index === 0;
      nextArrow.disabled = index === slideEls.length - 1;
    }

    if (allHeroBanner || allWithoutImageTrack || allFragmentTrack) {
      const trackWrapper = block.querySelector('.carousel-track-wrapper');
      if (trackWrapper) {
        if (allFragmentTrack) {
          updateFragmentTrack(
            block,
            trackWrapper,
            slideEls,
            index,
            prevIndex,
            direction,
            shouldCloneFragmentSlide,
          );
        } else {
          const slideWidth = trackWrapper.offsetWidth;

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
  }

  prevArrow.addEventListener('click', () => {
    const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));
    if (showArrows && arrowTrackVariant) {
      // Enable circular navigation for showArrowsDots variant
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : slideEls.length - 1;
      setActive(prevIndex, 'backward');
    } else if ((showArrows && isSimpleCarousel) || isMfCardListCarousel || isMfFundCardsCarousel) {
      setActive(currentIndex > 0 ? currentIndex - 1 : slideEls.length - 1);
    } else if (currentIndex > 0) {
      setActive(currentIndex - 1, 'backward');
    }
  });

  nextArrow.addEventListener('click', () => {
    const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));
    if (showArrows && arrowTrackVariant) {
      // Enable circular navigation for showArrowsDots variant
      const nextSlideIndex = currentIndex < slideEls.length - 1 ? currentIndex + 1 : 0;
      setActive(nextSlideIndex, 'forward');
    } else if ((showArrows && isSimpleCarousel) || isMfCardListCarousel || isMfFundCardsCarousel) {
      setActive(currentIndex < slideEls.length - 1 ? currentIndex + 1 : 0);
    } else if (currentIndex < slideEls.length - 1) {
      setActive(currentIndex + 1, 'forward');
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

  const renderHost = block;
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
    renderHost.replaceChildren(trackWrapper);
  } else if (allWithoutImage) {
    // Without-image variant uses track wrapper for sliding, but NO clone (looping is disabled)
    const trackWrapper = document.createElement('div');
    trackWrapper.className = 'carousel-track-wrapper';
    trackWrapper.replaceChildren(...slideEls);
    renderHost.replaceChildren(trackWrapper);
  } else if (arrowTrackVariant) {
    const trackWrapper = document.createElement('div');
    trackWrapper.className = 'carousel-track-wrapper';
    if (shouldCloneFragmentSlide) {
      const cloneLast = slideEls[slideEls.length - 1].cloneNode(true);
      cloneLast.setAttribute('aria-hidden', 'true');
      const cloneFirst = slideEls[0].cloneNode(true);
      cloneFirst.setAttribute('aria-hidden', 'true');
      trackWrapper.replaceChildren(cloneLast, ...slideEls, cloneFirst);
      if (allFragmentTrack) {
        trackWrapper.style.transform = 'translate3d(-100%, 0px, 0px)';
      }
    } else {
      trackWrapper.replaceChildren(...slideEls);
    }
    if (allFragmentTrack) {
      const trackViewport = document.createElement('div');
      trackViewport.className = 'carousel-track-viewport';
      if (shouldCloneFragmentSlide) {
        trackViewport.style.visibility = 'hidden';
      }
      trackViewport.append(trackWrapper);
      renderHost.replaceChildren(trackViewport);
    } else {
      renderHost.replaceChildren(trackWrapper);
    }
  } else {
    renderHost.replaceChildren(...slideEls);
  }

  const noNav = (allFragmentTrack && isFragmentNoScroll(slideEls)) || slideEls.length <= 1;

  if (showArrows || isMfCardListCarousel) {
    if (showArrows && arrowTrackVariant) {
      const trackContainer = allFragmentTrack
        ? block.querySelector('.carousel-track-viewport')
        : block.querySelector('.carousel-track-wrapper');
      if (!noNav) {
        renderHost.replaceChildren(prevArrow, trackContainer, nextArrow, dots);
      }
    } else if ((!isMfCardListCarousel || slideEls.length > 1) && !noNav) {
      renderHost.append(dots, prevArrow, nextArrow);
    }
  } else if (showDots || slidesContentCards > 0) {
    if (!noNav) {
      renderHost.append(dots);
    }
  } else if (slidesMfFundCards > 0 && slideEls.length > 1) {
    renderHost.append(dots);
  }

  if (seeMoreLink) {
    const moreWrap = document.createElement('div');
    moreWrap.className = 'carousel-dotted-more';
    const openInNewTab = seeMoreTargetValue === 'true' || seeMoreLink.target === '_blank';
    if (openInNewTab) seeMoreLink.setAttribute('target', '_blank');
    if (seeMoreButtonContainer) {
      moreWrap.append(seeMoreButtonContainer);
    } else {
      const linkWrap = document.createElement('span');
      linkWrap.append(seeMoreLink);
      moreWrap.append(linkWrap);
    }
    renderHost.append(moreWrap);
  }

  // No attribute stripping in authoring mode

  if (slideEls.length) {
    setActive(0);
    if (allFragmentTrack && shouldCloneFragmentSlide) {
      requestAnimationFrame(() => {
        const trackWrapper = block.querySelector('.carousel-track-wrapper');
        const trackViewport = block.querySelector('.carousel-track-viewport');
        if (trackWrapper) {
          trackWrapper.style.transition = 'none';
          setCardListTrackPosition(block, trackWrapper, slideEls, 0);
          trackWrapper.getBoundingClientRect();
          trackWrapper.style.transition = '';
        }
        if (trackViewport) {
          trackViewport.style.visibility = '';
        }
      });
    }
  }

  requestAnimationFrame(() => {
    isFirstLoad = false;
  });

  if (autoScroll && !isAuthoring) {
    const delay = scrollTimeDelay ? parseInt(scrollTimeDelay, 10) : 3000;
    initializeAutoScroll(block, slideEls, setActive, prevArrow, nextArrow, dotButtons, delay, 1);
  }

  // Initialize drag/swipe functionality
  // Enable looping only if slides have images (like Grow Club section)
  // Disable looping for text-only slides (like News and Activities section)
  const enableLooping = slidesWithImage > 0
    || slidesHeroBanner > 0
    || slidesTextAnimation > 0
    || slidesCircularImage > 0
    || slidesDefaultImage > 0
    || slidesFragment > 0
    || (isMfCardListCarousel && slideEls.length > 1);
  initializeDragSwipe(block, slideEls, setActive, 50, enableLooping);

  if (allFragmentTrack) {
    const breakpoint = window.matchMedia(`(max-width: ${tabletMin})`);
    breakpoint.addEventListener('change', () => {
      const currentIndex = slideEls.findIndex((slide) => slide.classList.contains('is-active'));
      const trackWrapper = block.querySelector('.carousel-track-wrapper');
      if (trackWrapper) {
        trackWrapper.style.transition = 'none';
        const idx = currentIndex >= 0 ? currentIndex : 0;
        setCardListTrackPosition(block, trackWrapper, slideEls, idx);
        trackWrapper.getBoundingClientRect();
        trackWrapper.style.transition = '';
      }
    });
  }
}

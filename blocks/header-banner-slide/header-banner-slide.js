import { moveInstrumentation } from '../../scripts/scripts.js';

function initCarousel(carousel, track) {
  const realTotal = track.children.length;
  if (realTotal <= 1) return;

  const autoplay = carousel.dataset.autoplay !== 'false';
  const speed = parseInt(carousel.dataset.autoplaySpeed, 10) || 3000;
  const hasAuthoringAttrs = !!track.querySelector('[data-aue-resource]');
  const isAuthoring = hasAuthoringAttrs && window.self !== window.top;
  const infinite = carousel.dataset.infinite !== 'false';
  const canClone = infinite && !isAuthoring;
  const STEP = 4;
  const maxIndex = realTotal - STEP;

  const GAP = parseFloat(getComputedStyle(track).gap) || 0;
  const itemWidth = (carousel.getBoundingClientRect().width - (STEP - 1) * GAP) / STEP;
  const itemStep = itemWidth + GAP;
  [...track.children].forEach((item) => { item.style.width = `${itemWidth}px`; });

  const positions = [];
  for (let i = 0; i <= maxIndex; i += STEP) positions.push(i);
  if (positions[positions.length - 1] < maxIndex) positions.push(maxIndex);

  const offset = canClone ? STEP : 0;

  if (canClone) {
    const realItems = [...track.children];
    realItems.slice(-STEP).reverse().forEach((c) => track.prepend(c.cloneNode(true)));
    realItems.slice(0, STEP).forEach((c) => track.appendChild(c.cloneNode(true)));
  }

  track.style.width = `${track.children.length * itemStep - GAP}px`;

  let posIdx = 0;
  let autoplayTimer = null;
  let isDragging = false;
  let startX = 0;
  let isWrapping = false;

  function moveTo(slideIdx, animate = true) {
    if (!animate) track.style.transition = 'none';
    track.style.transform = `translate3d(${-(offset + slideIdx) * itemStep}px, 0, 0)`;
    if (!animate) {
      requestAnimationFrame(() => requestAnimationFrame(() => { track.style.transition = ''; }));
    }
  }

  moveTo(0, false);

  function stopAutoplay() { clearInterval(autoplayTimer); autoplayTimer = null; }

  function next() {
    if (isWrapping) return;
    if (!infinite && posIdx >= positions.length - 1) { stopAutoplay(); return; }

    if (posIdx >= positions.length - 1) {
      if (!canClone) {
        posIdx = 0;
        moveTo(positions[posIdx]);
        return;
      }
      isWrapping = true;
      track.style.transform = `translate3d(${-(offset + realTotal) * itemStep}px, 0, 0)`;
      track.addEventListener('transitionend', () => {
        moveTo(0, false);
        posIdx = 0;
        isWrapping = false;
      }, { once: true });
    } else {
      posIdx += 1;
      moveTo(positions[posIdx]);
    }
  }

  function prev() {
    if (isWrapping) return;
    if (!infinite && posIdx <= 0) return;

    if (posIdx <= 0) {
      if (!canClone) {
        posIdx = positions.length - 1;
        moveTo(positions[posIdx]);
        return;
      }
      isWrapping = true;
      track.style.transform = 'translate3d(0px, 0, 0)';
      track.addEventListener('transitionend', () => {
        moveTo(positions[positions.length - 1], false);
        posIdx = positions.length - 1;
        isWrapping = false;
      }, { once: true });
    } else {
      posIdx -= 1;
      moveTo(positions[posIdx]);
    }
  }

  function startAutoplay() {
    if (!autoplay || autoplayTimer) return;
    autoplayTimer = setInterval(next, speed);
  }

  if (autoplay) startAutoplay();

  carousel.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    carousel.classList.add('is-dragging');
    stopAutoplay();
    e.preventDefault();
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    carousel.classList.remove('is-dragging');
    const diff = e.clientX - startX;
    if (diff < -50) {
      next();
    } else if (diff > 50) {
      prev();
    }
    startAutoplay();
  });

  carousel.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    stopAutoplay();
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    const diff = e.changedTouches[0].clientX - startX;
    if (diff < -50) {
      next();
    } else if (diff > 50) {
      prev();
    }
    startAutoplay();
  }, { passive: true });
}

export default function decorate(block) {
  const [titleRow, autoScrollRow, scrollDelayRow, infiniteLoopRow, ...slideItems] = block.children;

  const titleCell = titleRow?.children[0];
  const isAutoPlay = autoScrollRow?.children[0]?.textContent?.trim() !== 'false';
  const scrollTimeDelay = scrollDelayRow?.children[0]?.textContent?.trim() || '3000';
  const infiniteLoop = infiniteLoopRow?.children[0]?.textContent?.trim() !== 'false';

  block.innerHTML = '';

  if (titleCell) {
    titleCell.className = 'header-banner-slide-title';
    block.appendChild(titleCell);
  }

  const carousel = document.createElement('div');
  carousel.className = 'header-banner-slide-carousel content';
  carousel.dataset.autoplay = String(isAutoPlay);
  carousel.dataset.autoplaySpeed = scrollTimeDelay;
  carousel.dataset.infinite = String(infiniteLoop);

  const track = document.createElement('div');
  track.className = 'header-banner-slide-track';

  slideItems.forEach((item) => {
    const [imageCell] = item.children || [];
    const picture = imageCell?.querySelector('picture');
    const img = imageCell?.querySelector('img');

    const cardItem = document.createElement('div');
    cardItem.className = 'header-banner-slide-item';
    if (picture) cardItem.appendChild(picture);
    else if (img) cardItem.appendChild(img);

    moveInstrumentation(item, cardItem);
    track.appendChild(cardItem);
  });

  carousel.appendChild(track);
  block.appendChild(carousel);

  const ro = new ResizeObserver((entries) => {
    if (entries[0].contentRect.width > 0) {
      ro.disconnect();
      initCarousel(carousel, track);
    }
  });
  ro.observe(carousel);
}

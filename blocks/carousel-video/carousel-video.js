import { moveInstrumentation } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

const VISIBLE = 4;
const THUMB_GAP = 10; // 5px margin on each side of every thumb

function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url?.match(regex);
  return match ? match[1] : null;
}

export default async function decorate(block) {
  // Tell UE this block is a container that accepts carousel-video-item children.
  if (document.documentElement.classList.contains('adobe-ue-edit')) {
    block.setAttribute('data-aue-type', 'container');
    block.setAttribute('data-aue-filter', 'carousel-video');
  }

  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);

  const embedBaseUrl = configs.carouselVideoEmbedBaseUrl || 'https://www.youtube.com/embed/';
  const thumbBaseUrl = configs.carouselVideoThumbnailBaseUrl || 'https://img.youtube.com/vi/';
  const thumbQuality = configs.carouselVideoThumbnailQuality || 'hqdefault';

  const playerTitle = placeholders.carouselVideoPlayerTitle || 'YouTube Video Player';
  const prevLabel = placeholders.carouselVideoPrevLabel || 'Previous';
  const nextLabel = placeholders.carouselVideoNextLabel || 'Next';
  const thumbLabel = placeholders.carouselVideoThumbLabel || 'Play video';

  const rows = [...block.children];

  const allItems = rows.map((row) => {
    const cells = [...row.children];
    const firstCell = cells[0];
    const secondCell = cells[1];

    const link = firstCell?.querySelector('a');
    const text = firstCell?.textContent?.trim();
    const url = link?.getAttribute('href') || text || '';

    const thumbImg = secondCell?.querySelector('img');
    const thumbSrc = thumbImg ? thumbImg.src || thumbImg.getAttribute('src') : null;

    return { row, id: getYouTubeId(url), thumbSrc };
  });

  const items = allItems.filter((item) => item.id);
  const n = items.length;
  // Extra trailing clones needed when n < VISIBLE so every scroll position shows a full row.
  const extraCount = Math.max(0, VISIBLE - n);

  block.innerHTML = '';

  const orphanRows = allItems.filter((item) => !item.id);
  orphanRows.forEach(({ row }) => {
    const placeholder = document.createElement('div');
    placeholder.hidden = true;
    moveInstrumentation(row, placeholder);
    block.appendChild(placeholder);
  });

  if (n === 0) return;

  let activeIndex = 0;
  // rawScrollIndex: position in the 3-set infinite track
  // Set 0 = leading clones (positions 0..n-1)
  // Set 1 = originals      (positions n..2n-1)
  // Set 2 = trailing clones (positions 2n..3n-1)
  // Start pointing at the first original so the track shows real items on load.
  let rawScrollIndex = n;

  // ── Main player ──────────────────────────────────────────────────────────
  const mainPlayer = document.createElement('div');
  mainPlayer.className = 'cv-main-player';

  const iframe = document.createElement('iframe');
  iframe.src = `${embedBaseUrl}${items[0].id}`;
  iframe.title = playerTitle;
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('allowfullscreen', '');
  iframe.setAttribute('loading', 'lazy');
  mainPlayer.appendChild(iframe);
  block.appendChild(mainPlayer);

  // ── Thumbnail carousel ────────────────────────────────────────────────────
  const carouselSection = document.createElement('div');
  carouselSection.className = 'cv-carousel-section';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'cv-nav cv-prev';
  prevBtn.setAttribute('aria-label', prevLabel);

  const trackWrap = document.createElement('div');
  trackWrap.className = 'cv-track-wrap';

  const track = document.createElement('div');
  track.className = 'cv-track';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'cv-nav cv-next';
  nextBtn.setAttribute('aria-label', nextLabel);

  // Build a thumb button for one item; only the originals carry UE instrumentation.
  function createThumb(id, realIndex, row, thumbSrc) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cv-thumb';
    btn.setAttribute('aria-label', `${thumbLabel} ${realIndex + 1}`);

    const img = document.createElement('img');
    img.src = thumbSrc || `${thumbBaseUrl}${id}/${thumbQuality}.jpg`;
    img.alt = `Video ${realIndex + 1} thumbnail`;
    img.loading = 'lazy';
    btn.appendChild(img);

    if (row) moveInstrumentation(row, btn);
    track.appendChild(btn);
    return btn;
  }

  // Leading clones (set 0)
  const leadingClones = items.map(({ id, thumbSrc }, i) => createThumb(id, i, null, thumbSrc));
  // Originals (set 1) — carry UE instrumentation
  const thumbEls = items.map(({ row, id, thumbSrc }, i) => {
    const btn = createThumb(id, i, row, thumbSrc);
    if (i === 0) btn.classList.add('active');
    return btn;
  });
  // Trailing clones (set 2)
  const trailingClones = items.map(({ id, thumbSrc }, i) => createThumb(id, i, null, thumbSrc));
  // Extra trailing clones to keep the visible window full when n < VISIBLE
  const extraTrailingClones = Array.from({ length: extraCount }, (_, e) => {
    const { id, thumbSrc } = items[e % n];
    return createThumb(id, e % n, null, thumbSrc);
  });

  // All sets flattened; domI % n gives the real item index
  const allThumbBtns = [...leadingClones, ...thumbEls, ...trailingClones, ...extraTrailingClones];

  trackWrap.appendChild(track);
  carouselSection.appendChild(prevBtn);
  carouselSection.appendChild(trackWrap);
  carouselSection.appendChild(nextBtn);
  block.appendChild(carouselSection);

  // ── Dots ──────────────────────────────────────────────────────────────────
  const dotsEl = document.createElement('div');
  dotsEl.className = 'cv-dots';

  const dotEls = items.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'cv-dot';
    if (i === 0) dot.classList.add('active');
    dot.setAttribute('aria-label', `Video ${i + 1}`);
    dotsEl.appendChild(dot);
    return dot;
  });

  block.appendChild(dotsEl);

  // ── State helpers ─────────────────────────────────────────────────────────
  function setActive(index) {
    activeIndex = index;
    mainPlayer.classList.remove('active');
    setTimeout(() => {
      iframe.src = `${embedBaseUrl}${items[index].id}`;
      thumbEls.forEach((btn, i) => btn.classList.toggle('active', i === index));
      dotEls.forEach((d, i) => d.classList.toggle('active', i === index));
      requestAnimationFrame(() => mainPlayer.classList.add('active'));
    }, 0);
  }

  function getThumbWidth() {
    const btn = allThumbBtns[0];
    if (!btn) return 193;
    if (btn.offsetWidth > 0) return btn.offsetWidth;
    const computed = parseFloat(window.getComputedStyle(btn).width);
    return computed > 0 ? Math.round(computed) : 193;
  }

  function scrollTrack(rawNew) {
    rawScrollIndex = Math.max(0, Math.min(rawNew, 3 * n + extraCount - VISIBLE));
    const w = getThumbWidth();
    track.style.transform = `translate3d(-${rawScrollIndex * (w + THUMB_GAP)}px, 0px, 0px)`;
  }

  // Jump without triggering the CSS transition (used for seamless wrap resets).
  function scrollTrackSilent(rawNew) {
    rawScrollIndex = rawNew;
    const w = getThumbWidth();
    track.style.transition = 'none';
    track.style.transform = `translate3d(-${rawScrollIndex * (w + THUMB_GAP)}px, 0px, 0px)`;
    track.getBoundingClientRect(); // force reflow so the transition suppression takes effect
    track.style.transition = '';
  }

  // Scroll so the given index lands at the first (leftmost) visible slot.
  // Always picks the next occurrence ahead of (>=) the current position so
  // the track only ever moves rightward (clockwise).
  function scrollToFirst(index) {
    const candidates = [index, n + index, 2 * n + index];
    const ahead = candidates.filter((c) => c >= rawScrollIndex);
    const itemRaw = ahead.length > 0 ? Math.min(...ahead) : 2 * n + index;
    scrollTrack(itemRaw);
  }

  // Always move right (next direction) to the nearest occurrence of index.
  function scrollForward(index) {
    let target = rawScrollIndex + 1;
    while (target % n !== index) target += 1;
    scrollTrack(target);
  }

  // Always move left (prev direction) to the nearest occurrence of index.
  function scrollBackward(index) {
    let target = rawScrollIndex - 1;
    while (target >= 0 && target % n !== index) target -= 1;
    if (target < 0) target = index;
    scrollTrack(target);
  }

  // After each animated scroll, silently reset to the original zone so there
  // is always room to scroll in both directions (infinite loop illusion).
  track.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform') return;
    if (rawScrollIndex < n) {
      scrollTrackSilent(rawScrollIndex + n);
    } else if (rawScrollIndex >= 2 * n) {
      scrollTrackSilent(rawScrollIndex - n);
    }
  });

  // ── Event listeners ───────────────────────────────────────────────────────
  allThumbBtns.forEach((btn, domI) => {
    btn.addEventListener('click', () => {
      const realIndex = domI % n;
      setActive(realIndex);
      scrollToFirst(realIndex);
    });
  });

  prevBtn.addEventListener('click', () => {
    const newIndex = activeIndex === 0 ? n - 1 : activeIndex - 1;
    setActive(newIndex);
    scrollBackward(newIndex);
  });

  nextBtn.addEventListener('click', () => {
    const newIndex = activeIndex === n - 1 ? 0 : activeIndex + 1;
    setActive(newIndex);
    scrollForward(newIndex);
  });

  dotEls.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      setActive(i);
      scrollToFirst(i);
    });
  });

  // ── Initial state ─────────────────────────────────────────────────────────
  prevBtn.disabled = n <= 1;
  nextBtn.disabled = n <= 1;

  // Place the track at the start of the original set without animation.
  // Use rAF so offsetWidth reflects the actual rendered thumb size for the
  // current breakpoint rather than falling back to the hardcoded default.
  requestAnimationFrame(() => {
    scrollTrackSilent(n);
    mainPlayer.classList.add('active');
  });

  // Recalculate scroll offset on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scrollTrack(rawScrollIndex), 200);
  });
}

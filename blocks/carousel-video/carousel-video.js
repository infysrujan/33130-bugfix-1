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

  const embedBaseUrl = configs.youtubeEmbedBaseUrl || 'https://www.youtube.com/embed/';
  const thumbBaseUrl = configs.youtubeThumbnailBaseUrl || 'https://img.youtube.com/vi/';
  const thumbQuality = configs.youtubeThumbnailQuality || 'hqdefault';

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

  // All 3 sets flattened; domI % n gives the real item index
  const allThumbBtns = [...leadingClones, ...thumbEls, ...trailingClones];

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
    iframe.src = `${embedBaseUrl}${items[index].id}`;
    // Mark all 3 instances (leading clone, original, trailing clone)
    allThumbBtns.forEach((btn, domI) => btn.classList.toggle('active', domI % n === index));
    dotEls.forEach((d, i) => d.classList.toggle('active', i === index));
  }

  function getThumbWidth() {
    // Fall back to the CSS-declared width so the initial scroll is correct
    // even before the first browser layout pass.
    return allThumbBtns[0]?.offsetWidth || 185;
  }

  function scrollTrack(rawNew) {
    rawScrollIndex = Math.max(0, Math.min(rawNew, 3 * n - VISIBLE));
    const w = getThumbWidth();
    track.style.transform = `translateX(-${rawScrollIndex * (w + THUMB_GAP)}px)`;
  }

  // Jump without triggering the CSS transition (used for seamless wrap resets).
  function scrollTrackSilent(rawNew) {
    rawScrollIndex = rawNew;
    const w = getThumbWidth();
    track.style.transition = 'none';
    track.style.transform = `translateX(-${rawScrollIndex * (w + THUMB_GAP)}px)`;
    track.getBoundingClientRect(); // force reflow so the transition suppression takes effect
    track.style.transition = '';
  }

  // Return the DOM position (across all 3 sets) for realIndex that is
  // closest to the current rawScrollIndex — this drives infinite scrolling.
  function nearestRawForIndex(index) {
    const candidates = [index, n + index, 2 * n + index];
    return candidates.reduce((best, c) => (
      Math.abs(c - rawScrollIndex) < Math.abs(best - rawScrollIndex) ? c : best));
  }

  function ensureVisible(index) {
    const itemRaw = nearestRawForIndex(index);
    if (itemRaw < rawScrollIndex) {
      scrollTrack(itemRaw);
    } else if (itemRaw >= rawScrollIndex + VISIBLE) {
      scrollTrack(itemRaw - VISIBLE + 1);
    }
    // else item is already in the visible window — no scroll needed
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
      ensureVisible(realIndex);
    });
  });

  prevBtn.addEventListener('click', () => {
    const newIndex = activeIndex === 0 ? n - 1 : activeIndex - 1;
    setActive(newIndex);
    ensureVisible(newIndex);
  });

  nextBtn.addEventListener('click', () => {
    const newIndex = activeIndex === n - 1 ? 0 : activeIndex + 1;
    setActive(newIndex);
    ensureVisible(newIndex);
  });

  dotEls.forEach((dot, i) => {
    dot.addEventListener('click', () => {
      setActive(i);
      ensureVisible(i);
    });
  });

  // ── Initial state ─────────────────────────────────────────────────────────
  prevBtn.disabled = n <= 1;
  nextBtn.disabled = n <= 1;

  // Place the track at the start of the original set without animation.
  scrollTrackSilent(n);

  // Recalculate scroll offset on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => scrollTrack(rawScrollIndex), 200);
  });
}

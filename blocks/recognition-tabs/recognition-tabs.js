import { moveInstrumentation } from '../../scripts/scripts.js';

const SPLIDE_PATH = '/corporate/scripts/vendor/splide/splide.js';

/** @param {string} value */
function normalizeMatchKey(value) {
  return (value ?? '').trim().toLowerCase();
}

/** @param {Element} row */
function getRowCells(row) {
  return [...row.querySelectorAll(':scope > div')];
}

/** @returns {HTMLElement} */
function getOrCreateModal() {
  let modal = document.getElementById('recognition-tabs-video-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'recognition-tabs-video-modal';
  modal.className = 'recognition-tabs__video-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Video player');
  modal.hidden = true;

  modal.innerHTML = `
    <div class="recognition-tabs__video-modal-backdrop"></div>
    <div class="recognition-tabs__video-modal-content">
      <div class="recognition-tabs__video-modal-player">
        <button class="recognition-tabs__video-modal-close" type="button" aria-label="Close video">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  const closeModal = () => {
    modal.hidden = true;
    const player = modal.querySelector('.recognition-tabs__video-modal-player');
    if (player) {
      [...player.children].forEach(child => {
        if (!child.classList.contains('recognition-tabs__video-modal-close')) child.remove();
      });
    }
    document.body.style.overflow = '';
  };

  modal.querySelector('.recognition-tabs__video-modal-close').addEventListener('click', closeModal);
  modal.querySelector('.recognition-tabs__video-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  document.body.append(modal);
  return modal;
}

/**
 * @param {string} url
 * @returns {string | null} YouTube embed URL or null
 */
function getYouTubeEmbedUrl(url) {
  try {
    const u = new URL(url);
    let id = null;
    if (u.hostname === 'youtu.be') {
      id = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      id = u.searchParams.get('v');
      if (!id) {
        const match = u.pathname.match(/\/embed\/([^/?]+)/);
        if (match) id = match[1];
      }
    }
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
  } catch {
    return null;
  }
}

/** @param {string} videoUrl */
function openVideoModal(videoUrl) {
  const modal = getOrCreateModal();
  const player = modal.querySelector('.recognition-tabs__video-modal-player');

  // remove previous media but keep the close button
  [...player.children].forEach(child => {
    if (!child.classList.contains('recognition-tabs__video-modal-close')) child.remove();
  });

  const youtubeEmbed = getYouTubeEmbedUrl(videoUrl);

  if (youtubeEmbed) {
    const iframe = document.createElement('iframe');
    iframe.src = youtubeEmbed;
    iframe.className = 'recognition-tabs__video-player';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    player.append(iframe);
  } else {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.src = videoUrl;
    video.className = 'recognition-tabs__video-player';
    player.append(video);
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.recognition-tabs__video-modal-close').focus();
}

/**
 * @param {Element} cell
 * @returns {string}
 */
function extractVideoUrl(cell) {
  if (!cell) return '';
  const anchor = cell.querySelector('a');
  if (anchor?.href) return anchor.href;
  const text = cell.textContent?.trim() ?? '';
  return /^https?:\/\//i.test(text) ? text : '';
}

/**
 * @param {HTMLElement} row
 * @param {boolean} isSafetyPage
 * @returns {{ article: HTMLElement; categoryKey: string } | null}
 */
function buildCardFromRow(row, isSafetyPage = false) {
  const cells = getRowCells(row);
  if (cells.length < 3) return null;

  const picture = cells[0]?.querySelector('picture');
  const titleCell = cells[1];
  const categoryKey = normalizeMatchKey(cells[2]?.textContent ?? '');
  const videoUrl = extractVideoUrl(cells[3]);

  const article = document.createElement('article');
  article.className = 'recognition-tabs__card';
  if (isSafetyPage) article.classList.add('recognition-tabs__card--safety');

  const media = document.createElement('div');
  media.className = 'recognition-tabs__media';

  if (picture) {
    picture.classList.add('recognition-tabs__picture');
    media.append(picture);
  }

  if (videoUrl) {
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'recognition-tabs__play-btn';
    playBtn.setAttribute('aria-label', 'Play video');
    playBtn.innerHTML = `
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="rgba(255,255,255,0.9)"/>
        <path d="M19 15l16 9-16 9V15z" fill="#1a1a2e"/>
      </svg>
    `;
    playBtn.addEventListener('click', () => openVideoModal(videoUrl));
    media.append(playBtn);
  }

  const title = document.createElement('div');
  title.className = 'recognition-tabs__card-title';

  if (titleCell) {
    while (titleCell.firstChild) title.append(titleCell.firstChild);
  }

  article.append(media, title);
  moveInstrumentation(row, article);

  return { article, categoryKey };
}

/** @param {Element | undefined | null} row */
function parseTabLabels(row) {
  const ul = row?.querySelector(':scope ul');
  if (!ul) return [];

  return [...ul.querySelectorAll(':scope > li')].map(li => li.textContent?.trim() ?? '').filter(Boolean);
}

/** @param {number} slideCount */
function defaultSplideOptions(slideCount) {
  const multi = slideCount > 1;

  return {
    arrows: false,
    breakpoints: {
      768: {
        perPage: 2,
        gap: '12px',
        padding: { right: '109px' },
      },
      1024: {
        perPage: 3,
        gap: '12px',
        padding: { right: '74px' },
      },
    },
    drag: multi,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    gap: '15px',
    mediaQuery: 'min',
    pagination: false,
    perMove: 1,
    perPage: 1,
    speed: 500,
    type: 'slide',
    padding: { right: '44px' },
  };
}

/** @param {number} slideCount */
function safetySplideOptions(slideCount) {
  const multi = slideCount > 1;

  return {
    arrows: false,
    breakpoints: {
      768: {
        padding: { left: '0px', right: '0px' },
        pagination: false,
      },
      1200: {
        padding: { left: '0px', right: '0px' },
        pagination: false,
      },
    },
    drag: multi,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    gap: '24px',
    mediaQuery: 'min',
    pagination: true,
    perMove: 1,
    speed: 500,
    trimSpace: true,
    type: 'slide',
    padding: { left: '0px', right: '0px' },
  };
}

/**
 * @param {number} slideCount
 * @param {boolean} isSafetyPage
 */
function splideOptions(slideCount, isSafetyPage) {
  return isSafetyPage ? safetySplideOptions(slideCount) : defaultSplideOptions(slideCount);
}

/**
 * decorate the block
 * @param {Element} block the block
 */
export default function decorate(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  if (rows.length < 5) return;

  const isSafetyPage = block.classList.contains('safety-page');

  const subtitleRow = /** @type {HTMLElement} */ (rows[0]);
  const titleRow = /** @type {HTMLElement} */ (rows[1]);
  const descriptionContentRow = /** @type {HTMLElement} */ (rows[2]);
  const tabsRow = /** @type {HTMLElement} */ (rows[3]);
  const cardRows = rows.slice(4);

  const tabLabels = parseTabLabels(tabsRow);
  if (!tabLabels.length) return;

  /** @type {{ article: HTMLElement; categoryKey: string }[]} */
  const cards = [];

  cardRows.forEach(row => {
    const built = buildCardFromRow(/** @type {HTMLElement} */ (row), isSafetyPage);
    if (built) cards.push(built);
  });

  if (!cards.length) return;

  const rootId = block.id && /^[\w-]+$/.test(block.id) ? block.id : `recognition-tabs-${Math.random().toString(36).slice(2, 9)}`;

  if (!block.id) block.id = rootId;

  const inner = document.createElement('div');
  inner.className = 'recognition-tabs__inner';
  if (isSafetyPage) inner.classList.add('g-container');

  const header = document.createElement('header');
  header.className = 'recognition-tabs__header';

  const subtitle = document.createElement('div');
  subtitle.className = 'recognition-tabs__subtitle';
  const subtitleCell = subtitleRow.querySelector(':scope > div');
  if (subtitleCell) {
    while (subtitleCell.firstChild) subtitle.append(subtitleCell.firstChild);
  }
  moveInstrumentation(subtitleRow, subtitle);

  const title = document.createElement('div');
  title.className = 'recognition-tabs__title';
  const titleCell = titleRow.querySelector(':scope > div');
  if (titleCell) {
    while (titleCell.firstChild) title.append(titleCell.firstChild);
  }
  moveInstrumentation(titleRow, title);

  const description = document.createElement('div');
  description.className = 'recognition-tabs__description';
  if (isSafetyPage) description.classList.add('g-sm-4', 'g-md-4', 'g-lg-5');

  const descriptionCell = descriptionContentRow.querySelector(':scope > div');
  if (descriptionCell) {
    while (descriptionCell.firstChild) description.append(descriptionCell.firstChild);
  }
  moveInstrumentation(descriptionContentRow, description);

  header.append(subtitle, title);
  if (!isSafetyPage) header.append(description);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'recognition-tabs__tabs';
  if (isSafetyPage) tabsEl.classList.add('recognition-tabs__tabs--safety');
  tabsEl.setAttribute('role', 'tablist');
  moveInstrumentation(tabsRow, tabsEl);

  const panelId = `${rootId}-panel`;

  const panel = document.createElement('div');
  panel.className = 'recognition-tabs__panel';
  if (isSafetyPage) panel.classList.add('g-sm-4', 'g-md-8', 'g-lg-12');
  panel.id = panelId;
  panel.setAttribute('role', 'tabpanel');

  /** @type {HTMLButtonElement[]} */
  const tabButtons = [];

  tabLabels.forEach((label, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recognition-tabs__tab';
    btn.setAttribute('role', 'tab');
    btn.id = `${rootId}-tab-${index}`;
    btn.setAttribute('aria-controls', panelId);
    btn.textContent = label;
    btn.tabIndex = index === 0 ? 0 : -1;
    btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');

    tabButtons.push(btn);
    tabsEl.append(btn);
  });

  if (tabButtons.length) {
    panel.setAttribute('aria-labelledby', tabButtons[0].id);
  }

  if (isSafetyPage) {
    const introRow = document.createElement('div');
    introRow.className = 'recognition-tabs__intro-row';
    introRow.append(header, tabsEl);

    const descriptionGridRow = document.createElement('div');
    descriptionGridRow.className = 'recognition-tabs__description-row g-row';
    descriptionGridRow.append(description);

    const panelRow = document.createElement('div');
    panelRow.className = 'recognition-tabs__panel-row g-row';
    panelRow.append(panel);

    inner.append(introRow, descriptionGridRow, panelRow);
  } else {
    inner.append(header, tabsEl, panel);
  }

  block.replaceChildren(inner);

  /** @type {{ destroy: () => void; go: (target: string | number) => void; mount: () => void; on: Function } | null} */
  let splideInstance = null;
  let mountGeneration = 0;

  /** @param {HTMLElement} panelEl */
  function tearDownSplide(panelEl) {
    const carousel = panelEl.querySelector('.recognition-tabs__carousel');

    if (splideInstance) {
      try {
        splideInstance.destroy();
      } catch {
        /* Splide may throw if DOM already removed */
      }
      splideInstance = null;
    }

    if (carousel) {
      cards.forEach(({ article }) => {
        if (article.isConnected) article.remove();
      });
      carousel.remove();
    }
  }

  /**
   * @param {HTMLElement} panelEl
   * @param {{ article: HTMLElement }[]} visible
   */
  function buildSplideDom(panelEl, visible) {
    const carousel = document.createElement('div');
    carousel.className = 'recognition-tabs__carousel';
    carousel.setAttribute('aria-roledescription', 'carousel');

    const splideRoot = document.createElement('div');
    splideRoot.className = 'splide recognition-tabs__splide';
    if (isSafetyPage) splideRoot.classList.add('recognition-tabs__splide--safety');

    const track = document.createElement('div');
    track.className = 'splide__track';

    const list = document.createElement('ul');
    list.className = 'splide__list';

    visible.forEach(() => {
      const li = document.createElement('li');
      li.className = 'splide__slide recognition-tabs__slide';

      if (isSafetyPage) {
        li.classList.add('g-sm-4', 'g-md-3', 'g-lg-4');
      }

      list.append(li);
    });

    track.append(list);
    splideRoot.append(track);

    const arrowsEl = document.createElement('div');
    arrowsEl.className = 'recognition-tabs__arrows';

    const navBtnClass = 'corp-arrow-btn recognition-tabs__nav-btn';
    arrowsEl.innerHTML = `
      <button class="${navBtnClass} recognition-tabs__nav-btn--prev" type="button" aria-label="Previous slide">
        <span class="sr-only">Previous Slide</span>
      </button>
      <button class="${navBtnClass} recognition-tabs__nav-btn--next" type="button" aria-label="Next slide">
        <span class="sr-only">Next Slide</span>
      </button>
    `;

    carousel.append(splideRoot, arrowsEl);
    panelEl.append(carousel);

    const slides = [...list.querySelectorAll('.splide__slide')];
    visible.forEach((entry, i) => {
      slides[i]?.append(entry.article);
    });

    return { arrowsEl, splideRoot };
  }

  /**
   * @param {HTMLElement} splideRoot
   * @param {HTMLElement} arrowsEl
   * @param {number} gen
   * @param {number} slideCount
   */
  function mountSplide(splideRoot, arrowsEl, gen, slideCount) {
    const runMount = () => {
      import(SPLIDE_PATH).then(() => {
        if (gen !== mountGeneration || !splideRoot.isConnected) return;

        if (splideInstance) {
          try {
            splideInstance.destroy();
          } catch {
            /* noop */
          }
          splideInstance = null;
        }

        // eslint-disable-next-line no-undef
        splideInstance = new Splide(splideRoot, splideOptions(slideCount, isSafetyPage));

        const prevBtn = arrowsEl.querySelector('.recognition-tabs__nav-btn--prev');
        const nextBtn = arrowsEl.querySelector('.recognition-tabs__nav-btn--next');

        prevBtn?.addEventListener('click', () => splideInstance?.go('<'));
        nextBtn?.addEventListener('click', () => splideInstance?.go('>'));

        /** @param {{ index: number; Components: { Controller: { getEnd: () => number } } }} splide */
        const updateNavVisibility = splide => {
          if (gen !== mountGeneration || !arrowsEl.isConnected) return;

          const p = /** @type {HTMLButtonElement | null} */ (arrowsEl.querySelector('.recognition-tabs__nav-btn--prev'));
          const n = /** @type {HTMLButtonElement | null} */ (arrowsEl.querySelector('.recognition-tabs__nav-btn--next'));

          if (!p || !n) return;

          const end = splide.Components.Controller.getEnd();
          const needsScroll = end > 0;

          arrowsEl.classList.toggle('recognition-tabs__arrows--hidden', !needsScroll);
          if (!needsScroll) return;

          const atStart = splide.index <= 0;
          const atEnd = splide.index >= end;

          p.disabled = atStart;
          n.disabled = atEnd;
          p.classList.toggle('is-disabled', atStart);
          n.classList.toggle('is-disabled', atEnd);
        };

        splideInstance.on(['mounted', 'moved', 'updated'], () => updateNavVisibility(splideInstance));
        splideInstance.on('resized', () => updateNavVisibility(splideInstance));

        splideInstance.mount();
        updateNavVisibility(splideInstance);
      });
    };

    if (window.DELAYED_PHASE) {
      runMount();
    } else {
      document.addEventListener(
        'delayed-phase',
        () => {
          window.DELAYED_PHASE = true;
          runMount();
        },
        { once: true }
      );
    }
  }

  /** @param {string} tabLabel */
  function cardsForTab(tabLabel) {
    const key = normalizeMatchKey(tabLabel);
    return cards.filter(c => c.categoryKey === key);
  }

  /** @param {number} index */
  function setActiveTab(index) {
    const total = tabButtons.length;
    const safeIndex = Math.max(0, Math.min(index, total - 1));
    const label = tabButtons[safeIndex]?.textContent?.trim() ?? '';

    tabButtons.forEach((btn, i) => {
      const on = i === safeIndex;
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });

    if (tabButtons[safeIndex]) {
      panel.setAttribute('aria-labelledby', tabButtons[safeIndex].id);
    }

    mountGeneration += 1;
    const gen = mountGeneration;

    tearDownSplide(panel);

    const visible = cardsForTab(label);
    if (!visible.length) return;

    visible.forEach((entry, slideIdx) => {
      const img = entry.article.querySelector('img');
      if (img) img.loading = slideIdx === 0 ? 'eager' : 'lazy';
    });

    const { arrowsEl, splideRoot } = buildSplideDom(panel, visible);
    mountSplide(splideRoot, arrowsEl, gen, visible.length);
  }

  setActiveTab(0);

  tabsEl.addEventListener('click', e => {
    const btn = /** @type {HTMLButtonElement | null} */ (e.target?.closest?.('button[role="tab"]'));
    if (!btn || !tabsEl.contains(btn)) return;

    const idx = tabButtons.indexOf(btn);
    if (idx < 0) return;

    setActiveTab(idx);
  });

  tabsEl.addEventListener('keydown', e => {
    const btn = /** @type {HTMLButtonElement | null} */ (e.target?.closest?.('button[role="tab"]'));
    if (!btn || !tabsEl.contains(btn)) return;

    const idx = tabButtons.indexOf(btn);
    if (idx < 0) return;

    let next = idx;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = idx + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = idx - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabButtons.length - 1;
    else return;

    e.preventDefault();

    next = (next + tabButtons.length) % tabButtons.length;
    setActiveTab(next);
    tabButtons[next].focus();
  });
}

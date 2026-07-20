import { moveInstrumentation } from '../../scripts/scripts.js';
import { applyLinkTarget } from '../../scripts/bbl-decorators.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';
import { fetchConfigs } from '../../scripts/config.js';

const MOBILE_MQ = `(width <= ${
  getComputedStyle(document.documentElement).getPropertyValue('--bbl-breakpoint-mobile-max').trim()
})`;

const windowLoaded = document.readyState === 'complete'
  ? Promise.resolve()
  : new Promise((resolve) => { window.addEventListener('load', resolve, { once: true }); });

let globalMuted = true;

function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getAssetSrc(cell) {
  return cell?.querySelector('a')?.href
    || cell?.querySelector('img')?.src
    || cell?.textContent?.trim()
    || '';
}

function pauseBannerVideo(item) {
  item?.querySelector('video.hero-banner-video')?.pause();
  const iframe = item?.querySelector('iframe.hero-banner-video');
  if (iframe) {
    delete iframe.dataset.ytPendingPlay;
    if (iframe.ytPlayer) try { iframe.ytPlayer.pauseVideo(); } catch (_) { /* not ready */ }
    iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
  }
}

function applyGlobalMute(heroBanner) {
  heroBanner.querySelectorAll('video.hero-banner-video').forEach((video) => {
    video.muted = globalMuted;
  });
  heroBanner.querySelectorAll('iframe.hero-banner-video').forEach((iframe) => {
    if (iframe.ytPlayer && iframe.ytPlayerReady) {
      if (globalMuted) iframe.ytPlayer.mute(); else iframe.ytPlayer.unMute();
      if (typeof iframe.syncYTMuteUI === 'function') iframe.syncYTMuteUI(globalMuted);
    }
  });
}

function playBannerVideo(item) {
  if (window.matchMedia(MOBILE_MQ).matches) return;
  const video = item?.querySelector('video.hero-banner-video');
  if (video) {
    video.muted = globalMuted;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  }
  const iframe = item?.querySelector('iframe.hero-banner-video');
  if (iframe) {
    if (iframe.ytPlayer && iframe.ytPlayerReady) {
      try {
        if (globalMuted) iframe.ytPlayer.mute(); else iframe.ytPlayer.unMute();
        iframe.ytPlayer.playVideo();
        if (typeof iframe.syncYTMuteUI === 'function') iframe.syncYTMuteUI(globalMuted);
      } catch (_) { /* player not ready yet */ }
    } else {
      iframe.dataset.ytPendingPlay = '1';
    }
  }
}

function changeBanner(block) {
  function activateThumbnail(thumbnail) {
    const { index } = thumbnail.dataset;
    const currentItem = block.querySelector('.hero-banner-item.hero-banner-item-active');
    if (currentItem?.dataset.index === index) return;
    pauseBannerVideo(currentItem);
    block.querySelectorAll('[data-index]').forEach((el) => {
      el.classList.toggle('hero-banner-item-active', el.classList.contains('hero-banner-item') && el.dataset.index === index);
      el.classList.toggle('hero-banner-thumbnail-item-active', el.classList.contains('hero-banner-thumbnail-item') && el.dataset.index === index);
    });
  }

  block.addEventListener('mouseenter', (e) => {
    const thumbnail = e.target.closest('.hero-banner-thumbnail-item');
    if (!thumbnail) return;
    activateThumbnail(thumbnail);
    playBannerVideo(block.querySelector('.hero-banner-item.hero-banner-item-active'));
  }, true);

  block.addEventListener('click', (e) => {
    const thumbnail = e.target.closest('.hero-banner-thumbnail-item');
    if (!thumbnail) return;
    activateThumbnail(thumbnail);
  }, true);
}

function lazyLoadThumbnails(block) {
  const outer = block.querySelector('.hero-banner-thumbnail-outer');
  if (!outer) return;
  if (window.matchMedia('(max-width: 47.5rem)').matches) {
    outer.classList.add('hero-banner-thumbnail-outer-active');
    return;
  }
  function onScroll() {
    if (window.scrollY <= 0) return;
    outer.classList.add('hero-banner-thumbnail-outer-active');
    window.removeEventListener('scroll', onScroll);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
}

function stripInstrumentation(el) {
  [...el.querySelectorAll('*'), el].forEach((node) => {
    [...node.attributes]
      .filter(({ nodeName }) => nodeName.startsWith('data-aue-') || nodeName.startsWith('data-richtext-'))
      .forEach(({ nodeName }) => node.removeAttribute(nodeName));
  });
}

function createElement(tag, ...classNames) {
  const el = document.createElement(tag);
  if (classNames.length) el.classList.add(...classNames);
  return el;
}

/**
 * Applies className to a cell's content as one unit. If the cell has a single
 * child (the common case — one paragraph), the class goes directly on it. If
 * an author split the text into multiple paragraphs, wrap them all in one
 * div carrying the class, so every paragraph gets styled consistently
 * instead of only the first one.
 */
function normalizeCellContent(cell, className) {
  if (!cell?.firstElementChild) return;
  const wrapper = document.createElement('div');
  wrapper.classList.add(className);
  while (cell.firstChild) {
    wrapper.appendChild(cell.firstChild);
  }
  cell.appendChild(wrapper);
}

function createThumbItem(picture, index, { strip = false, active = false } = {}) {
  const item = createElement('li', 'hero-banner-thumbnail-item');
  if (active) item.classList.add('hero-banner-thumbnail-item-active');
  item.dataset.index = index;
  if (picture) {
    if (strip) stripInstrumentation(picture);
    const img = picture.querySelector('img');
    if (img) { img.className = 'hero-banner-thumbnail-img'; img.loading = 'eager'; item.append(img); }
  }
  return item;
}

// ─── Hero row parsing helpers ────────────────────────────────────────────────

function getCellText(cell) {
  if (!cell) return '';
  const aueValue = cell.dataset?.aueProp?.trim();
  if (aueValue) return aueValue;
  const nested = cell.querySelector('div, p, span, a, strong, em, h1, h2, h3, h4, h5, h6, li');
  return nested?.textContent?.trim() || cell.textContent?.trim() || '';
}

function getCellHref(cell) {
  return cell?.querySelector('a[href]')?.href?.trim() || '';
}

function isEmptyCell(cell) {
  if (!cell) return true;
  return !cell.querySelector('picture, img, video, iframe, source, a[href]')
    && !getCellText(cell);
}

function isMimeTypeCell(cell) {
  return /^(image|video)\/[a-z0-9.+-]+$/i.test(getCellText(cell));
}

function isBooleanCell(cell) {
  return /^(true|false)$/i.test(getCellText(cell));
}

function getBooleanCellValue(cell) {
  return /^true$/i.test(getCellText(cell));
}

function isTargetCell(cell) {
  return /^_(self|blank|parent|top)$/i.test(getCellText(cell));
}

function isLinkCell(cell) {
  return !!cell?.querySelector('a[href]');
}

function isYouTubeCell(cell) {
  const value = getCellHref(cell) || getCellText(cell);
  return /(?:youtube\.com|youtu\.be)/i.test(value);
}

function isVideoAssetCell(cell) {
  const value = getAssetSrc(cell);
  return !!cell?.querySelector('video, source[type^="video/"]')
    || /\.(mp4|m3u8|webm)([?#].*)?$/i.test(value);
}

function isImageOnlyCell(cell) {
  return !!cell?.querySelector('picture, img[src]')
    && !isVideoAssetCell(cell)
    && !cell?.querySelector('video, iframe');
}

function isPlainTextCell(cell) {
  return !!getCellText(cell)
    && !isBooleanCell(cell)
    && !isTargetCell(cell)
    && !isLinkCell(cell)
    && !isImageOnlyCell(cell)
    && !isVideoAssetCell(cell);
}

function hasHeadingLikeCell(cell) {
  return !!cell?.querySelector('h1, h2, h3, h4, h5, h6');
}

function getMeaningfulCells(row) {
  return [...row.children].filter((cell) => !isEmptyCell(cell) && !isMimeTypeCell(cell));
}

function parseHeroRow(row, variant) {
  const cells = getMeaningfulCells(row);
  let idx = 0;
  let end = cells.length - 1;

  const parsed = {
    mediaType: 'images',
    isDefault: false,
    imageCellDesktop: null,
    imageCellMobile: null,
    imageAltCell: null,
    youtubeUrlCell: null,
    damVideoCell: null,
    logoImageCell: null,
    thumbImgCell: null,
    preTitleCell: null,
    headingCell: null,
    bodyCells: [],
    linkCell: null,
    appStoreImageCell: null,
    appStoreLinkCell: null,
    googlePlayImageCell: null,
    googlePlayLinkCell: null,
    enableAppCtaMobileCell: null,
    targetCell: null,
  };

  parsed.mediaType = getCellText(cells[idx]) || 'images';
  idx += 1;

  if (isBooleanCell(cells[idx])) {
    parsed.isDefault = getBooleanCellValue(cells[idx]);
    idx += 1;
  }

  if (parsed.mediaType === 'images') {
    if (isImageOnlyCell(cells[idx])) {
      parsed.imageCellDesktop = cells[idx];
      idx += 1;
    }
    if (isImageOnlyCell(cells[idx])) {
      parsed.imageCellMobile = cells[idx];
      idx += 1;
    }
    if (isPlainTextCell(cells[idx])) {
      parsed.imageAltCell = cells[idx];
      idx += 1;
    }
  } else if (parsed.mediaType === 'bg-video') {
    if (isYouTubeCell(cells[idx])) {
      parsed.youtubeUrlCell = cells[idx];
      idx += 1;
    }
    if (isVideoAssetCell(cells[idx])) {
      parsed.damVideoCell = cells[idx];
      idx += 1;
    }
    if (!parsed.youtubeUrlCell && isYouTubeCell(cells[idx])) {
      parsed.youtubeUrlCell = cells[idx];
      idx += 1;
    }
    if (!parsed.damVideoCell && isVideoAssetCell(cells[idx])) {
      parsed.damVideoCell = cells[idx];
      idx += 1;
    }
  }

  if (isTargetCell(cells[end])) {
    parsed.targetCell = cells[end];
    end -= 1;
  }

  if (isBooleanCell(cells[end])) {
    parsed.enableAppCtaMobileCell = cells[end];
    end -= 1;
  }

  const peelStorePair = (prefix) => {
    if (
      end >= idx
      && isPlainTextCell(cells[end])
      && end - 2 >= idx
      && isLinkCell(cells[end - 1])
      && isImageOnlyCell(cells[end - 2])
    ) {
      end -= 1; // skip optional title cell
    }

    if (end >= idx + 1 && isLinkCell(cells[end]) && isImageOnlyCell(cells[end - 1])) {
      parsed[`${prefix}LinkCell`] = cells[end];
      parsed[`${prefix}ImageCell`] = cells[end - 1];
      end -= 2;
    }
  };

  peelStorePair('googlePlay');
  peelStorePair('appStore');

  const middle = cells.slice(idx, end + 1);

  const leadingImageCells = [];
  while (middle[0] && isImageOnlyCell(middle[0])) {
    leadingImageCells.push(middle.shift());
  }

  if (variant === 'hero-with-thumbnail-images') {
    if (leadingImageCells.length >= 2) {
      [parsed.logoImageCell, parsed.thumbImgCell] = leadingImageCells;
    } else if (leadingImageCells.length === 1) {
      [parsed.thumbImgCell] = leadingImageCells;
    }
  } else if (leadingImageCells.length) {
    [parsed.logoImageCell] = leadingImageCells;
  }

  for (let i = middle.length - 1; i >= 0; i -= 1) {
    if (isLinkCell(middle[i])) {
      [parsed.linkCell] = middle.splice(i, 1);
      break;
    }
  }

  if (middle[0] && hasHeadingLikeCell(middle[0])) {
    parsed.headingCell = middle.shift();
  } else {
    parsed.preTitleCell = middle.shift() || null;
    if (middle[0] && hasHeadingLikeCell(middle[0])) {
      parsed.headingCell = middle.shift();
    } else {
      parsed.headingCell = middle.shift() || null;
    }
  }

  parsed.bodyCells = middle;

  return parsed;
}

function appendCellChildren(sourceCell, target) {
  if (!sourceCell || !target) return;
  while (sourceCell.firstChild) {
    target.appendChild(sourceCell.firstChild);
  }
}

// ─── Custom video controls ───────────────────────────────────────────────────

const VI = {};

async function loadHeroIcons() {
  const base = window.hlx?.codeBasePath ?? '';
  const names = ['play', 'pause', 'muted', 'volume', 'fullscreen', 'share'];
  const svgs = await Promise.all(
    names.map((name) => fetch(`${base}/icons/hero-${name}.svg`).then((r) => (r.ok ? r.text() : '')).catch(() => '')),
  );
  names.forEach((name, i) => { VI[name] = svgs[i]; });
}

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function buildControls(bannerItem) {
  const bar = createElement('div', 'hero-banner-video-controls');
  bar.innerHTML = `
    <div class="hero-ctrl-seek-row">
      <input type="range" class="hero-ctrl-seek" min="0" max="1000" value="0" step="1" aria-label="Seek">
    </div>
    <div class="hero-ctrl-bar">
      <button class="hero-ctrl-btn hero-ctrl-play" aria-label="Play">${VI.play}</button>
      <div class="hero-ctrl-vol-group">
        <button class="hero-ctrl-btn hero-ctrl-mute" aria-label="Mute">${VI.volume}</button>
        <input type="range" class="hero-ctrl-volume" min="0" max="100" value="50" step="1" aria-label="Volume">
      </div>
      <span class="hero-ctrl-time">0:00 / 0:00</span>
      <div class="hero-ctrl-right">
        <button class="hero-ctrl-btn hero-ctrl-share" aria-label="Share">${VI.share}<span class="hero-ctrl-share-tip">Link copied!</span></button>
        <button class="hero-ctrl-btn hero-ctrl-fullscreen" aria-label="Enter fullscreen">${VI.fullscreen}</button>
      </div>
    </div>`;
  bannerItem.append(bar);
  return bar;
}

function wireShare(btn, url) {
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(url || window.location.href).catch(() => {});
    btn.classList.add('hero-ctrl-share-active');
    setTimeout(() => btn.classList.remove('hero-ctrl-share-active'), 2000);
  });
}

function wireFullscreen(btn, bannerItem) {
  btn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else bannerItem.requestFullscreen();
  });
  document.addEventListener('fullscreenchange', () => {
    btn.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  });
}

function wireDAMControls(video, bar, videoWrapper, bannerItem, shareUrl) {
  const playBtn = bar.querySelector('.hero-ctrl-play');
  const muteBtn = bar.querySelector('.hero-ctrl-mute');
  const volSlider = bar.querySelector('.hero-ctrl-volume');
  const seekBar = bar.querySelector('.hero-ctrl-seek');
  const timeEl = bar.querySelector('.hero-ctrl-time');

  video.removeAttribute('controls');
  video.volume = 0.5;

  const centerBtn = createElement('button', 'hero-banner-center-play');
  centerBtn.setAttribute('aria-label', 'Play');
  centerBtn.innerHTML = VI.play;
  videoWrapper.append(centerBtn);

  const triggerFlash = (icon, label) => {
    centerBtn.innerHTML = icon;
    centerBtn.setAttribute('aria-label', label);
    centerBtn.classList.remove('hero-banner-center-play-flash');
    void centerBtn.offsetWidth; // eslint-disable-line no-void
    centerBtn.classList.add('hero-banner-center-play-flash');
  };

  const togglePlay = () => {
    if (video.paused) { triggerFlash(VI.play, 'Play'); video.play(); } else { triggerFlash(VI.pause, 'Pause'); video.pause(); }
  };

  video.addEventListener('click', togglePlay);
  playBtn.addEventListener('click', togglePlay);
  centerBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });

  video.addEventListener('play', () => {
    playBtn.innerHTML = VI.pause;
    playBtn.setAttribute('aria-label', 'Pause');
    centerBtn.classList.add('hero-banner-center-play-hidden');
  });
  video.addEventListener('pause', () => {
    playBtn.innerHTML = VI.play;
    playBtn.setAttribute('aria-label', 'Play');
    centerBtn.innerHTML = VI.play;
    centerBtn.setAttribute('aria-label', 'Play');
    centerBtn.classList.remove('hero-banner-center-play-hidden', 'hero-banner-center-play-flash');
  });

  const syncMuteBtn = () => {
    const muted = video.muted || video.volume === 0;
    muteBtn.innerHTML = muted ? VI.muted : VI.volume;
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    volSlider.value = muted ? 0 : Math.round(video.volume * 100);
  };

  muteBtn.addEventListener('click', () => {
    globalMuted = !globalMuted;
    applyGlobalMute(bannerItem.closest('.block'));
  });
  video.addEventListener('volumechange', syncMuteBtn);

  syncMuteBtn();

  volSlider.addEventListener('input', () => {
    video.volume = volSlider.value / 100;
    video.muted = Number(volSlider.value) === 0;
  });

  video.addEventListener('loadedmetadata', () => { timeEl.textContent = `0:00 / ${fmtTime(video.duration)}`; });
  video.addEventListener('timeupdate', () => {
    const pct = video.duration ? (video.currentTime / video.duration) * 1000 : 0;
    seekBar.value = pct;
    timeEl.textContent = `${fmtTime(video.currentTime)} / ${fmtTime(video.duration)}`;
  });
  seekBar.addEventListener('input', () => { if (video.duration) video.currentTime = (seekBar.value / 1000) * video.duration; });

  wireShare(bar.querySelector('.hero-ctrl-share'), shareUrl);
  wireFullscreen(bar.querySelector('.hero-ctrl-fullscreen'), bannerItem);
}

// YouTube IFrame API bootstrap (once per page)
let ytReady = false;
const ytQueue = [];
const prevYTReady = window.onYouTubeIframeAPIReady;
window.onYouTubeIframeAPIReady = () => {
  if (typeof prevYTReady === 'function') prevYTReady();
  ytReady = true;
  ytQueue.splice(0).forEach((cb) => cb());
};

function onYTReady(cb) {
  if (ytReady) { cb(); return; }
  ytQueue.push(cb);
}

function loadYTScript(src) {
  if (window.YT || document.querySelector('script[src*="youtube.com/iframe_api"]')) return;
  const s = document.createElement('script');
  s.src = src || 'https://www.youtube.com/iframe_api';
  document.head.append(s);
}

let ytCounter = 0;
function wireYouTubeControls(iframe, bar, bannerItem, ytSrc, shareUrl) {
  const playBtn = bar.querySelector('.hero-ctrl-play');
  const muteBtn = bar.querySelector('.hero-ctrl-mute');
  const volSlider = bar.querySelector('.hero-ctrl-volume');
  const seekBar = bar.querySelector('.hero-ctrl-seek');
  const timeEl = bar.querySelector('.hero-ctrl-time');

  if (!iframe.id) { ytCounter += 1; iframe.id = `hero-yt-${ytCounter}`; }

  const overlay = createElement('div', 'hero-banner-iframe-overlay');
  iframe.insertAdjacentElement('afterend', overlay);

  loadYTScript(ytSrc);
  onYTReady(() => {
    let pollId = null;

    const player = new window.YT.Player(iframe.id, {
      events: {
        onReady: ({ target }) => {
          iframe.ytPlayerReady = true;
          iframe.syncYTMuteUI = (muted) => {
            muteBtn.innerHTML = muted ? VI.muted : VI.volume;
            muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
            volSlider.value = muted ? 0 : Math.round(target.getVolume());
          };
          const isDesktopActiveSlide = !window.matchMedia(MOBILE_MQ).matches
            && bannerItem.classList.contains('hero-banner-item-active');
          if (isDesktopActiveSlide) {
            if (iframe.dataset.ytPendingPlay) delete iframe.dataset.ytPendingPlay;
            if (globalMuted) target.mute(); else target.unMute();
            target.playVideo();
          }
          target.setVolume(50);
          iframe.syncYTMuteUI(globalMuted);
          timeEl.textContent = `0:00 / ${fmtTime(target.getDuration())}`;
        },
        onStateChange: ({ data, target }) => {
          const { PlayerState } = window.YT;
          const playing = data === PlayerState.PLAYING;
          playBtn.innerHTML = playing ? VI.pause : VI.play;
          playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
          if (playing) {
            const muted = target.isMuted();
            muteBtn.innerHTML = muted ? VI.muted : VI.volume;
            muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
            volSlider.value = muted ? 0 : Math.round(target.getVolume());
            if (!pollId) {
              pollId = setInterval(() => {
                const cur = target.getCurrentTime();
                const dur = target.getDuration();
                seekBar.value = dur ? (cur / dur) * 1000 : 0;
                timeEl.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
              }, 500);
            }
          } else {
            clearInterval(pollId); pollId = null;
            if (data === PlayerState.ENDED) { target.seekTo(0); target.playVideo(); }
          }
        },
      },
    });
    iframe.ytPlayer = player;

    playBtn.addEventListener('click', () => {
      if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
      else player.playVideo();
    });

    muteBtn.addEventListener('click', () => {
      globalMuted = !globalMuted;
      applyGlobalMute(bannerItem.closest('.block'));
    });

    volSlider.addEventListener('input', () => {
      const v = Number(volSlider.value);
      player.setVolume(v);
      if (v === 0) {
        player.mute();
        muteBtn.innerHTML = VI.muted;
      } else {
        player.unMute();
        muteBtn.innerHTML = VI.volume;
      }
    });

    seekBar.addEventListener('input', () => {
      const dur = player.getDuration();
      if (dur) player.seekTo((seekBar.value / 1000) * dur, true);
    });

    wireShare(bar.querySelector('.hero-ctrl-share'), shareUrl);
    wireFullscreen(bar.querySelector('.hero-ctrl-fullscreen'), bannerItem);

    overlay.addEventListener('click', () => {
      if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
      else player.playVideo();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const [configs] = await Promise.all([fetchConfigs(), loadHeroIcons()]);
  const ytApiSrc = configs.heroIframeApi;
  const isMobile = window.matchMedia('(width <= 47.5rem)').matches;
  const variant = block.children[0]?.textContent?.trim() || 'default';
  const bannerList = createElement('ul', 'hero-banner-list');
  let thumbnailList = '';

  if (variant === 'hero-with-thumbnail-images') {
    thumbnailList = createElement('ul', 'hero-banner-thumbnail-list', 'content');
  }

  const heroRows = [...block.children].slice(1, 9);
  const parsedRows = heroRows.map((row) => parseHeroRow(row, variant));

  let defaultIndex = parsedRows.findIndex((row) => row.isDefault);
  if (defaultIndex < 0) defaultIndex = 0;

  heroRows.forEach((row, i) => {
    const parsed = parsedRows[i];
    const bannerItem = createElement('li', 'hero-banner-item');
    if (i === defaultIndex) bannerItem.classList.add('hero-banner-item-active');
    bannerItem.dataset.index = i;

    if (parsed.mediaType === 'bg-video') {
      const youtubeUrl = getCellHref(parsed.youtubeUrlCell) || getCellText(parsed.youtubeUrlCell) || '';
      const damVideoSrc = getAssetSrc(parsed.damVideoCell);

      if (youtubeUrl) {
        const ytId = getYouTubeId(youtubeUrl);
        const iframe = document.createElement('iframe');
        iframe.className = 'hero-banner-video';
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        const iframeWrapper = createElement('div', 'hero-banner-video-wrapper');
        iframeWrapper.append(iframe);
        bannerItem.append(iframeWrapper);
        const bar = buildControls(iframeWrapper);
        if (isMobile) {
          iframe.src = ytId ? `https://www.youtube.com/embed/${ytId}?autoplay=0&controls=0&enablejsapi=1&playsinline=1` : youtubeUrl;
          wireYouTubeControls(iframe, bar, bannerItem, ytApiSrc, youtubeUrl);
        } else {
          windowLoaded.then(() => {
            const isActive = bannerItem.classList.contains('hero-banner-item-active');
            const autoplay = isActive ? 1 : 0;
            iframe.src = ytId ? `https://www.youtube.com/embed/${ytId}?autoplay=${autoplay}&mute=1&controls=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : youtubeUrl;
            wireYouTubeControls(iframe, bar, bannerItem, ytApiSrc, youtubeUrl);
          });
        }
      } else if (damVideoSrc) {
        const video = document.createElement('video');
        video.className = 'hero-banner-video';
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        if (!isMobile) {
          video.muted = true;
          video.setAttribute('muted', '');
          video.loop = true;
        }
        const source = document.createElement('source');
        source.src = damVideoSrc;
        source.type = 'video/mp4';
        video.append(source);
        const videoWrapper = createElement('div', 'hero-banner-video-wrapper');
        videoWrapper.append(video);
        bannerItem.append(videoWrapper);
        const bar = buildControls(videoWrapper);
        wireDAMControls(video, bar, videoWrapper, bannerItem, damVideoSrc);

        if (isMobile) {
          video.pause();

          const playBtn = bar.querySelector('.hero-ctrl-play');
          if (playBtn) {
            playBtn.innerHTML = VI.play;
            playBtn.setAttribute('aria-label', 'Play');
          }

          const centerBtn = videoWrapper.querySelector('.hero-banner-center-play');
          if (centerBtn) {
            centerBtn.classList.remove('hero-banner-center-play-hidden');
          }
        } else if (i === defaultIndex) {
          windowLoaded.then(() => video.play().catch(() => {}));
        }
      }
    } else {
      const pictureDesktop = parsed.imageCellDesktop?.querySelector('picture');
      const pictureMobile = parsed.imageCellMobile?.querySelector('picture');

      if (pictureDesktop || pictureMobile) {
        const heroPicture = createSmartImage(
          pictureDesktop,
          pictureMobile,
          parsed.imageAltCell,
          i === defaultIndex,
        );
        if (heroPicture) {
          const img = heroPicture.querySelector('img');
          if (img) {
            img.className = 'hero-banner-img';
            if (i === defaultIndex) img.fetchPriority = 'high';
          }
          bannerItem.append(heroPicture);
        }
      }
    }

    const contentInner = createElement('div', 'hero-banner-content-inner');

    const logoImg = parsed.logoImageCell?.querySelector('img');
    if (logoImg) {
      logoImg.className = 'hero-banner-logo';
      const logoWrapper = createElement('div', 'hero-banner-logo-wrapper');
      logoWrapper.append(logoImg);
      contentInner.append(logoWrapper);
    }

    const contentGroup = createElement('div', 'hero-banner-content-group');

    if (parsed.preTitleCell?.firstElementChild) {
      const preTitleEl = parsed.preTitleCell.firstElementChild;
      preTitleEl.classList.add('hero-banner-pre-title');
      if (preTitleEl.firstElementChild) preTitleEl.firstElementChild.classList.add('hero-banner-pre-title');
    }

    parsed.bodyCells.forEach((cell) => normalizeCellContent(cell, 'hero-banner-content-inner-text'));

    const isAppCta = variant === 'simple-app-cta';
    const hasButtonLink = !isAppCta && !!parsed.linkCell?.querySelector('a[href]');
    const contentCells = [
      parsed.preTitleCell,
      parsed.headingCell,
      ...parsed.bodyCells,
      ...(hasButtonLink ? [parsed.linkCell] : []),
    ].filter(Boolean);

    contentCells.forEach((cell) => appendCellChildren(cell, contentGroup));

    if (isAppCta) {
      const appCtasEl = createElement('div', 'hero-app-ctas');
      [
        [parsed.appStoreImageCell, parsed.appStoreLinkCell],
        [parsed.googlePlayImageCell, parsed.googlePlayLinkCell],
      ].forEach(([imgCell, linkCtaCell]) => {
        const pic = imgCell?.querySelector('picture');
        const anchor = linkCtaCell?.querySelector('a');
        if (!pic || !anchor) return;
        const ctaLink = document.createElement('a');
        ctaLink.href = anchor.href;
        ctaLink.target = '_blank';
        ctaLink.rel = 'noopener noreferrer';
        if (anchor.title) ctaLink.title = anchor.title;
        ctaLink.classList.add('hero-app-cta-link');
        ctaLink.append(pic.cloneNode(true));
        appCtasEl.append(ctaLink);
      });
      if (appCtasEl.children.length) contentGroup.append(appCtasEl);

      const enableAppCtaMobile = getBooleanCellValue(parsed.enableAppCtaMobileCell);
      if (!enableAppCtaMobile) {
        bannerItem.classList.add('no-mobile-app-cta');
        if (parsed.linkCell?.innerHTML?.trim()) {
          const fallback = createElement('div', 'hero-app-cta-mobile-fallback');
          fallback.innerHTML = parsed.linkCell.innerHTML;
          contentGroup.append(fallback);
        }
      }
    }

    const targetValue = getCellText(parsed.targetCell) || '';
    if (targetValue) applyLinkTarget(contentGroup, 'a.button-m', targetValue);

    contentInner.append(contentGroup);
    const content = createElement('div', 'hero-banner-content', 'content');
    content.append(contentInner);
    bannerItem.append(content);

    if (variant === 'hero-with-thumbnail-images') {
      const thumbPicture = parsed.thumbImgCell?.querySelector('picture');
      const cloned = thumbPicture?.cloneNode(true);
      const thumbImg = thumbPicture?.querySelector('img');
      if (thumbImg) {
        thumbImg.className = 'hero-banner-thumbnail-img';
        thumbImg.style.display = 'none';
        thumbImg.setAttribute('aria-hidden', 'true');
        bannerItem.append(thumbImg);
      }
      if (i !== defaultIndex) {
        thumbnailList.append(createThumbItem(cloned, i, { strip: true, active: false }));
      }
    }

    moveInstrumentation(row, bannerItem);
    bannerList.append(bannerItem);
  });

  const mainImgContainer = createElement('div', 'hero-banner-container');
  mainImgContainer.append(bannerList);

  const wrapper = createElement('div', 'hero-banner', `hero-banner-${variant}`);
  if (variant === 'simple-app-cta') wrapper.classList.add('hero-banner-simple');
  wrapper.append(mainImgContainer);

  if (variant === 'hero-with-thumbnail-images') {
    const thumbnailOuter = createElement('div', 'hero-banner-thumbnail-outer');
    thumbnailOuter.append(thumbnailList);
    wrapper.append(thumbnailOuter);
  }

  block.replaceChildren(wrapper);
  changeBanner(block);
  lazyLoadThumbnails(block);
}

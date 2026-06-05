import { moveInstrumentation } from '../../scripts/scripts.js';
import { decorateButtonsV1, applyLinkTarget } from '../../scripts/bbl-decorators.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';
import { fetchConfigs } from '../../scripts/config.js';

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
  }
}

function playBannerVideo(item) {
  const video = item?.querySelector('video.hero-banner-video');
  if (video) {
    video.muted = false;
    video.removeAttribute('muted');
    video.play()
      .then(() => { video.volume = 0.5; })
      .catch(() => {
        video.muted = true;
        video.play().then(() => { video.volume = 0.5; }).catch(() => {});
      });
  }
  const iframe = item?.querySelector('iframe.hero-banner-video');
  if (iframe) {
    if (iframe.ytPlayer && iframe.ytPlayerReady) {
      try {
        iframe.ytPlayer.unMute();
        iframe.ytPlayer.setVolume(50);
        iframe.ytPlayer.playVideo();
      } catch (_) { /* player not ready yet */ }
    } else {
      iframe.dataset.ytPendingPlay = '1';
    }
  }
}

function changeBanner(block) {
  block.addEventListener('mouseenter', (e) => {
    const thumbnail = e.target.closest('.hero-banner-thumbnail-item');
    if (!thumbnail) return;
    const { index } = thumbnail.dataset;

    const currentItem = block.querySelector('.hero-banner-item.hero-banner-item-active');
    if (currentItem?.dataset.index === index) return;

    pauseBannerVideo(currentItem);

    block.querySelectorAll('[data-index]').forEach((el) => {
      el.classList.toggle('hero-banner-item-active', el.classList.contains('hero-banner-item') && el.dataset.index === index);
      el.classList.toggle('hero-banner-thumbnail-item-active', el.classList.contains('hero-banner-thumbnail-item') && el.dataset.index === index);
    });

    playBannerVideo(block.querySelector('.hero-banner-item.hero-banner-item-active'));
  }, true);

  block.addEventListener('mouseleave', () => {
    pauseBannerVideo(block.querySelector('.hero-banner-item.hero-banner-item-active'));
  });
}

function lazyLoadThumbnails(block) {
  const outer = block.querySelector('.hero-banner-thumbnail-outer');
  if (!outer) return;
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
      <button class="hero-ctrl-btn hero-ctrl-play" aria-label="Pause">${VI.pause}</button>
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

function wireShare(btn) {
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
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

function wireDAMControls(video, bar, videoWrapper, bannerItem) {
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

  muteBtn.addEventListener('click', () => { video.muted = !video.muted; });
  video.addEventListener('volumechange', syncMuteBtn);

  muteBtn.innerHTML = VI.volume;
  muteBtn.setAttribute('aria-label', 'Mute');
  volSlider.value = Math.round(video.volume * 100);

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

  wireShare(bar.querySelector('.hero-ctrl-share'));
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
function wireYouTubeControls(iframe, bar, bannerItem, ytSrc) {
  const playBtn = bar.querySelector('.hero-ctrl-play');
  const muteBtn = bar.querySelector('.hero-ctrl-mute');
  const volSlider = bar.querySelector('.hero-ctrl-volume');
  const seekBar = bar.querySelector('.hero-ctrl-seek');
  const timeEl = bar.querySelector('.hero-ctrl-time');

  if (!iframe.id) { ytCounter += 1; iframe.id = `hero-yt-${ytCounter}`; }

  loadYTScript(ytSrc);
  onYTReady(() => {
    let pollId = null;

    const player = new window.YT.Player(iframe.id, {
      events: {
        onReady: ({ target }) => {
          iframe.ytPlayerReady = true;
          if (iframe.dataset.ytPendingPlay) {
            delete iframe.dataset.ytPendingPlay;
            target.unMute();
            target.setVolume(50);
            target.playVideo();
          }
          target.unMute();
          target.setVolume(50);
          volSlider.value = 50;
          timeEl.textContent = `0:00 / ${fmtTime(target.getDuration())}`;
        },
        onStateChange: ({ data, target }) => {
          const { PlayerState } = window.YT;
          const playing = data === PlayerState.PLAYING;
          playBtn.innerHTML = playing ? VI.pause : VI.play;
          playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
          if (playing) {
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
    iframe.ytPlayer = player; // expose for cross-slide pause coordination

    playBtn.addEventListener('click', () => {
      if (player.getPlayerState() === window.YT.PlayerState.PLAYING) player.pauseVideo();
      else player.playVideo();
    });

    muteBtn.addEventListener('click', () => {
      if (player.isMuted()) {
        player.unMute(); muteBtn.innerHTML = VI.volume; muteBtn.setAttribute('aria-label', 'Mute'); volSlider.value = player.getVolume();
      } else {
        player.mute(); muteBtn.innerHTML = VI.muted; muteBtn.setAttribute('aria-label', 'Unmute'); volSlider.value = 0;
      }
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

    wireShare(bar.querySelector('.hero-ctrl-share'));
    wireFullscreen(bar.querySelector('.hero-ctrl-fullscreen'), bannerItem);
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

  const heroRows = [...block.children].slice(1, 8);

  // Pre-pass: find which item has isDefault checked (stored as "true" at children[1])
  let defaultIndex = 0;
  const hasExplicitDefault = heroRows.some((row, i) => {
    if (row.children[1]?.textContent?.trim() === 'true') {
      defaultIndex = i;
      return true;
    }
    return false;
  });
  if (!hasExplicitDefault) defaultIndex = 0;

  heroRows.forEach((row, i) => {
    const bannerItem = createElement('li', 'hero-banner-item');
    if (i === defaultIndex) bannerItem.classList.add('hero-banner-item-active');
    bannerItem.dataset.index = i;

    const mediaType = row.children[0]?.textContent?.trim() || 'images';

    // col 0 = mediaType; isDefault boolean only produces a DOM cell when checked
    let col = 1;
    const possibleIsDefault = row.children[col]?.textContent?.trim();
    if (possibleIsDefault === 'true' || possibleIsDefault === 'false') col += 1;

    // All 5 conditional media cells are always present in the DOM (empty when unused)
    const imageCellDesktop = row.children[col]; col += 1;
    const imageCellMobile = row.children[col]; col += 1;
    const imageAlt = row.children[col]; col += 1;
    const youtubeUrlCell = row.children[col]; col += 1;
    const damVideoCell = row.children[col]; col += 1;

    const logoImageCell = row.children[col]; col += 1;
    const thumbImgCell = row.children[col]; col += 1;
    const preTitleCell = row.children[col]; col += 1;
    const headingCell = row.children[col]; col += 1;
    const textCell = row.children[col]; col += 1;
    const linkCell = row.children[col]; col += 1;
    if (!row.children[col]?.querySelector('picture, a[href]')) col += 1;
    const appStoreImageCell = row.children[col]; col += 1;
    const appStoreLinkCell = row.children[col]; col += 1;
    const googlePlayImageCell = row.children[col]; col += 1;
    const googlePlayLinkCell = row.children[col]; col += 1;
    const enableAppCtaMobileCell = row.children[col]; col += 1;
    const targetCell = row.children[col];
    const targetValue = targetCell?.textContent?.trim() || '';

    if (mediaType === 'bg-video') {
      const youtubeUrl = youtubeUrlCell?.querySelector('a')?.href
        || youtubeUrlCell?.textContent?.trim()
        || '';
      const damVideoSrc = getAssetSrc(damVideoCell);

      if (youtubeUrl) {
        const ytId = getYouTubeId(youtubeUrl);
        const iframe = document.createElement('iframe');
        if (isMobile) {
          iframe.src = ytId ? `https://www.youtube.com/embed/${ytId}?mute=1&loop=1&playlist=${ytId}` : youtubeUrl;
        } else {
          iframe.src = ytId ? `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}` : youtubeUrl;
        }
        iframe.className = 'hero-banner-video';
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('allowfullscreen', '');
        iframe.setAttribute('loading', 'lazy');
        bannerItem.append(iframe);
        if (!isMobile) {
          const bar = buildControls(bannerItem);
          wireYouTubeControls(iframe, bar, bannerItem, ytApiSrc);
        }
      } else if (damVideoSrc) {
        const video = document.createElement('video');
        video.className = 'hero-banner-video';
        video.muted = true;
        video.setAttribute('muted', '');
        video.loop = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        if (!isMobile) {
          video.autoplay = true;
          video.setAttribute('autoplay', '');
        }
        if (isMobile) video.controls = true;
        const source = document.createElement('source');
        source.src = damVideoSrc;
        source.type = 'video/mp4';
        video.append(source);
        const videoWrapper = createElement('div', 'hero-banner-video-wrapper');
        videoWrapper.append(video);
        bannerItem.append(videoWrapper);
        if (!isMobile) {
          const bar = buildControls(videoWrapper);
          wireDAMControls(video, bar, videoWrapper, bannerItem);
          if (i === defaultIndex) {
            video.addEventListener('play', () => {
              video.muted = false;
              video.removeAttribute('muted');
              video.volume = 0.5;
            }, { once: true });
            video.play().catch(() => {});
          }
        }
      }
    } else {
      const pictureDesktop = imageCellDesktop?.querySelector('picture');
      const pictureMobile = imageCellMobile?.querySelector('picture');

      if (pictureDesktop || pictureMobile) {
        const heroPicture = createSmartImage(pictureDesktop, pictureMobile, imageAlt);
        if (heroPicture) {
          const img = heroPicture.querySelector('img');
          if (img) {
            img.className = 'hero-banner-img';
            img.loading = 'lazy';
          }
          bannerItem.append(heroPicture);
        }
      }
    }

    const contentInner = createElement('div', 'hero-banner-content-inner');
    const logoImg = logoImageCell?.querySelector('img');
    if (logoImg) {
      logoImg.className = 'hero-banner-logo';
      const logoWrapper = createElement('div', 'hero-banner-logo-wrapper');
      logoWrapper.append(logoImg);
      contentInner.append(logoWrapper);
    }

    const contentGroup = createElement('div', 'hero-banner-content-group');
    if (preTitleCell?.firstElementChild) {
      const preTitleEl = preTitleCell.firstElementChild;
      preTitleEl.classList.add('hero-banner-pre-title');
      if (preTitleEl.firstElementChild) preTitleEl.firstElementChild.classList.add('hero-banner-pre-title');
    }
    if (textCell?.firstElementChild) textCell.firstElementChild.classList.add('hero-banner-content-inner-text');
    const isAppCta = variant === 'simple-app-cta';
    [preTitleCell, headingCell, textCell, ...(isAppCta ? [] : [linkCell])].forEach((cell) => {
      if (cell) contentGroup.innerHTML += cell.innerHTML;
    });
    decorateButtonsV1(contentGroup);

    if (isAppCta) {
      const appCtasEl = createElement('div', 'hero-app-ctas');
      [[appStoreImageCell, appStoreLinkCell], [googlePlayImageCell, googlePlayLinkCell]]
        .forEach(([imgCell, linkCtaCell]) => {
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

      const enableAppCtaMobile = enableAppCtaMobileCell?.textContent?.trim() === 'true';
      if (!enableAppCtaMobile) {
        bannerItem.classList.add('no-mobile-app-cta');
        if (linkCell?.innerHTML?.trim()) {
          const fallback = createElement('div', 'hero-app-cta-mobile-fallback');
          fallback.innerHTML = linkCell.innerHTML;
          contentGroup.append(fallback);
        }
      }
    }
    applyLinkTarget(contentGroup, 'a.button', targetValue);

    contentInner.append(contentGroup);
    const content = createElement('div', 'hero-banner-content', 'content');
    content.append(contentInner);
    bannerItem.append(content);

    if (variant === 'hero-with-thumbnail-images') {
      const thumbPicture = thumbImgCell?.querySelector('picture');
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

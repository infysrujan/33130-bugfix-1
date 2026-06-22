/**
 * VIDEO MODAL — drop-in utility
 *
 * HOW TO INTEGRATE:
 *   1. Call `addVideoPlayButton(mediaEl, videoUrl)` after you build each card's media element.
 *      - `mediaEl`  : the container div that holds the card image (must have position:relative in CSS)
 *      - `videoUrl` : a YouTube URL  OR  a direct .mp4 / .webm URL
 *   2. That's it. The play button and modal are wired up automatically.
 */

/**
 * Detects a YouTube URL and returns the /embed/ version with autoplay.
 * Returns null for non-YouTube URLs.
 * @param {string} url
 * @returns {string | null}
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

/**
 * Lazily creates a single shared modal and appends it to <body>.
 * Subsequent calls return the same element.
 * @returns {HTMLElement}
 */
function getOrCreateModal() {
  let modal = document.getElementById('video-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'video-modal';
  modal.className = 'video-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Video player');
  modal.hidden = true;

  modal.innerHTML = `
    <div class="video-modal__backdrop"></div>
    <div class="video-modal__content">
      <div class="video-modal__player">
        <button class="video-modal__close" type="button" aria-label="Close video">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  const closeModal = () => {
    modal.hidden = true;
    const player = modal.querySelector('.video-modal__player');
    [...player.children].forEach(child => {
      if (!child.classList.contains('video-modal__close')) child.remove();
    });
    document.body.style.overflow = '';
  };

  modal.querySelector('.video-modal__close').addEventListener('click', closeModal);
  modal.querySelector('.video-modal__backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  document.body.append(modal);
  return modal;
}

/**
 * Opens the modal and plays the given video URL.
 * Supports YouTube links (iframe embed) and direct video files (mp4, webm, etc).
 * @param {string} videoUrl
 */
function openVideoModal(videoUrl) {
  const modal = getOrCreateModal();
  const player = modal.querySelector('.video-modal__player');

  // clear previous media, keep close button
  [...player.children].forEach(child => {
    if (!child.classList.contains('video-modal__close')) child.remove();
  });

  const youtubeEmbed = getYouTubeEmbedUrl(videoUrl);

  if (youtubeEmbed) {
    const iframe = document.createElement('iframe');
    iframe.src = youtubeEmbed;
    iframe.className = 'video-modal__media';
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('frameborder', '0');
    player.append(iframe);
  } else {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.src = videoUrl;
    video.className = 'video-modal__media';
    player.append(video);
  }

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.querySelector('.video-modal__close').focus();
}

/**
 * Adds a play button overlay to a card's media element.
 * Clicking the button opens the video modal.
 *
 * @param {HTMLElement} mediaEl  - The card's media wrapper div (needs position:relative)
 * @param {string}      videoUrl - YouTube URL or direct video file URL
 */
export function addVideoPlayButton(mediaEl, videoUrl) {
  if (!mediaEl || !videoUrl) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'video-modal__play-btn';
  btn.setAttribute('aria-label', 'Play video');
  btn.innerHTML = `
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="28" cy="28" r="28" fill="rgba(255,255,255,0.9)"/>
      <path d="M22 17l20 11-20 11V17z" fill="#1a1a2e"/>
    </svg>
  `;
  btn.addEventListener('click', () => openVideoModal(videoUrl));
  mediaEl.append(btn);
}

/**
 * Helper: reads a video URL from a cell element.
 * Handles both <a href="..."> (how EDS delivers asset fields) and plain URL text.
 *
 * @param {Element | undefined} cell
 * @returns {string}
 */
export function extractVideoUrl(cell) {
  if (!cell) return '';
  const anchor = cell.querySelector('a');
  if (anchor?.href) return anchor.href;
  const text = cell.textContent?.trim() ?? '';
  return /^https?:\/\//i.test(text) ? text : '';
}

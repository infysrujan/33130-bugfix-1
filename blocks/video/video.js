function getYouTubeId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function buildYouTubeEmbed(ytId, autoplay, muted, loop, orientation) {
  const params = new URLSearchParams({
    rel: '0',
    enablejsapi: '1',
    ...(autoplay && { autoplay: '1' }),
    ...(muted && { mute: '1' }),
    ...(loop && { loop: '1', playlist: ytId }),
  });

  const wrapper = document.createElement('div');
  wrapper.className = `video-embed video-embed-youtube video-orientation-${orientation}`;

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube.com/embed/${ytId}?${params.toString()}`;
  iframe.title = 'YouTube video';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.loading = 'lazy';

  wrapper.append(iframe);
  return wrapper;
}

function buildDamVideo(src, poster, posterAlt, autoplay, muted, loop) {
  const wrapper = document.createElement('div');
  wrapper.className = 'video-embed video-embed-dam';

  const video = document.createElement('video');
  video.src = src;
  video.controls = true;
  video.playsInline = true;
  if (poster) {
    video.poster = poster;
    video.setAttribute('aria-label', posterAlt || '');
  }
  if (autoplay) video.autoplay = true;
  if (muted) video.muted = true;
  if (loop) video.loop = true;

  wrapper.append(video);
  return wrapper;
}

function buildErrorState(message) {
  const div = document.createElement('div');
  div.className = 'video-error';
  div.textContent = message;
  return div;
}

export default function decorate(block) {
  const rows = [...block.children];
  block.innerHTML = '';

  rows.forEach((row) => {
    const cols = [...row.children];
    const videoSource = cols[0]?.textContent?.trim() || 'youtube';
    const youtubeUrl = cols[1]?.textContent?.trim();
    const orientation = cols[2]?.textContent?.trim() || 'landscape';
    const damVideoEl = cols[3]?.querySelector('a');
    const posterEl = cols[4]?.querySelector('picture, img');
    const posterAlt = cols[5]?.textContent?.trim() || '';
    const videoTitle = cols[6]?.textContent?.trim();
    const videoDescEl = cols[7];
    const autoplay = cols[8]?.textContent?.trim() === 'true';
    const muted = cols[9]?.textContent?.trim() === 'true';
    const loop = cols[10]?.textContent?.trim() === 'true';

    const item = document.createElement('div');
    item.className = 'video-item';

    // Video embed
    let embed;
    if (videoSource === 'youtube') {
      const ytId = youtubeUrl ? getYouTubeId(youtubeUrl) : null;
      embed = ytId
        ? buildYouTubeEmbed(ytId, autoplay, muted, loop, orientation)
        : buildErrorState('Invalid or missing YouTube URL.');
    } else if (videoSource === 'dam') {
      const src = damVideoEl?.href || '';
      const poster = posterEl?.querySelector('img')?.src || posterEl?.src || '';
      embed = src
        ? buildDamVideo(src, poster, posterAlt, autoplay, muted, loop)
        : buildErrorState('No DAM video file provided.');
    } else {
      embed = buildErrorState('Unknown video source.');
    }

    item.append(embed);

    // Caption
    if (videoTitle || videoDescEl?.textContent?.trim()) {
      const caption = document.createElement('div');
      caption.className = 'video-caption';
      if (videoTitle) {
        const h3 = document.createElement('h3');
        h3.className = 'video-title';
        h3.textContent = videoTitle;
        caption.append(h3);
      }
      if (videoDescEl?.innerHTML?.trim()) {
        const desc = document.createElement('div');
        desc.className = 'video-description';
        desc.innerHTML = videoDescEl.innerHTML;
        caption.append(desc);
      }
      item.append(caption);
    }

    block.append(item);
  });
}

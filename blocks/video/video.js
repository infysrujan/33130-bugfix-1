function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Field order: mediaType, youtubeUrl, videoAsset
  // rows[0] = mediaType
  // rows[1] = youtubeUrl  (empty when mediaType=image-upload)
  // rows[2] = videoAsset  (empty when mediaType=youtube-url)

  const mediaType = rows[0]?.querySelector('div')?.textContent?.trim();

  block.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';

  if (mediaType === 'youtube-url') {
    const youtubeLink = rows[1]?.querySelector('a');
    const youtubeText = rows[1]?.querySelector('div')?.textContent?.trim();
    const youtubeUrl = youtubeLink?.getAttribute('href') || youtubeText || '';

    const ytId = getYouTubeId(youtubeUrl);
    if (ytId) {
      const embedContainer = document.createElement('div');
      embedContainer.className = 'video-embed';

      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${ytId}`;
      iframe.title = 'YouTube Video Player';
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('loading', 'lazy');

      embedContainer.appendChild(iframe);
      wrapper.appendChild(embedContainer);
    }
  } else if (mediaType === 'image-upload') {
    const assetRow = rows[2];
    const assetImg = assetRow?.querySelector('img');
    const assetLink = assetRow?.querySelector('a');
    const assetText = assetRow?.querySelector('div')?.textContent?.trim();
    const assetPath = assetImg?.getAttribute('src')
      || assetLink?.getAttribute('href')
      || assetText
      || '';

    // Hide header, footer, full-bleed-special section and breadcrumb when image-upload type
    document.querySelectorAll('header, footer, .section.full-bleed-special, .breadcrumb-container, .breadcrumb').forEach((el) => {
      el.style.display = 'none';
    });

    if (assetPath) {
      const embedContainer = document.createElement('div');
      embedContainer.className = 'video-embed';

      const videoEl = document.createElement('video');
      videoEl.src = assetPath;
      videoEl.controls = true;
      videoEl.playsinline = true;

      embedContainer.appendChild(videoEl);
      wrapper.appendChild(embedContainer);
    }
  }

  block.appendChild(wrapper);
}

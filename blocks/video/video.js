function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getAssetPath(row) {
  const link = row?.querySelector('a');
  const img = row?.querySelector('img');
  const text = row?.querySelector('div')?.textContent?.trim();
  return link?.getAttribute('href') || img?.getAttribute('src') || text || '';
}

function openVideoInNewTab(videoPath) {
  const absoluteVideoPath = new URL(videoPath, window.location.origin).href;
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
      video { max-width: 100%; max-height: 100vh; }
    </style>
  </head>
  <body>
    <video src="${absoluteVideoPath}" controls autoplay playsinline></video>
  </body>
</html>`;
  const blob = new Blob([html], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
}

export default function decorate(block) {
  const rows = [...block.children];

  // Field order matches _video.json model definition:
  // rows[0] = mediaType
  // rows[1] = youtubeUrl      (youtube-url)
  // rows[2] = damVideoAsset   (dam-video)
  // rows[3] = ctaVideoAsset   (cta-video)
  // rows[4] = ctaButtonName   (cta-video)
  // rows[5] = ctaButtonTitle  (cta-video)
  // rows[6] = imageVideoAsset (image-video)
  // rows[7] = imageAsset      (image-video)

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
  } else if (mediaType === 'dam-video') {
    const assetPath = getAssetPath(rows[2]);

    if (assetPath) {
      const embedContainer = document.createElement('div');
      embedContainer.className = 'video-embed';

      const videoEl = document.createElement('video');
      videoEl.src = assetPath;
      videoEl.controls = true;
      videoEl.setAttribute('playsinline', '');

      embedContainer.appendChild(videoEl);
      wrapper.appendChild(embedContainer);
    }
  } else if (mediaType === 'cta-video') {
    const videoPath = getAssetPath(rows[3]);
    const buttonName = rows[4]?.querySelector('div')?.textContent?.trim() || 'Watch Video';
    const buttonTitle = rows[5]?.querySelector('div')?.textContent?.trim() || buttonName;

    if (videoPath) {
      const ctaLink = document.createElement('a');
      ctaLink.href = '#';
      ctaLink.textContent = buttonName;
      ctaLink.title = buttonTitle;
      ctaLink.className = 'video-cta-button';

      ctaLink.addEventListener('click', (e) => {
        e.preventDefault();
        openVideoInNewTab(videoPath);
      });

      wrapper.appendChild(ctaLink);
    }
  } else if (mediaType === 'image-video') {
    const videoPath = getAssetPath(rows[6]);
    const imgRow = rows[7];
    const imgEl = imgRow?.querySelector('img');
    const imgSrc = imgEl?.getAttribute('src') || getAssetPath(imgRow);
    const imgAlt = imgEl?.getAttribute('alt') || 'Watch video';

    if (imgSrc && videoPath) {
      const anchor = document.createElement('a');
      anchor.href = '#';
      anchor.className = 'video-image-link';
      anchor.setAttribute('aria-label', 'Watch video');

      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        openVideoInNewTab(videoPath);
      });

      const image = document.createElement('img');
      image.src = imgSrc;
      image.alt = imgAlt;

      anchor.appendChild(image);
      wrapper.appendChild(anchor);
    }
  }

  block.appendChild(wrapper);
}

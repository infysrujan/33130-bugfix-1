function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Row 0: videoType (select value)
  const videoType = rows[0]?.querySelector('div')?.textContent?.trim();

  // AEM renders ALL model fields as rows in order, even conditionally hidden ones.
  // Field order: videoType, youtubeUrl, damAssetPath, ctaButtonName, ctaButtonTitle,
  //              imageVideoDamPath, imageDamPath
  // rows[0] = videoType
  // rows[1] = youtubeUrl         (empty when videoType=cta|image)
  // rows[2] = damAssetPath       (empty when videoType=videourl|image)
  // rows[3] = ctaButtonName      (empty when videoType=videourl|image)
  // rows[4] = ctaButtonTitle     (empty when videoType=videourl|image)
  // rows[5] = imageVideoDamPath  (empty when videoType=videourl|cta)
  // rows[6] = imageDamPath       (empty when videoType=videourl|cta)

  block.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';

  if (videoType === 'videourl') {
    const youtubeRow = rows[1];
    const youtubeLink = youtubeRow?.querySelector('a');
    const youtubeText = youtubeRow?.querySelector('div')?.textContent?.trim();
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
  } else if (videoType === 'cta') {
    const damRow = rows[2];
    const damLink = damRow?.querySelector('a');
    const damText = damRow?.querySelector('div')?.textContent?.trim();
    const damPath = damLink?.getAttribute('href') || damText || '';

    const ctaButtonName = rows[3]?.querySelector('div')?.textContent?.trim() || 'Watch Video';
    const ctaButtonTitle = rows[4]?.querySelector('div')?.textContent?.trim() || '';

    const ctaContainer = document.createElement('div');
    ctaContainer.className = 'video-cta';

    const link = document.createElement('a');
    link.href = damPath || '#';
    link.className = 'video-cta-link';
    link.textContent = ctaButtonName;
    if (ctaButtonTitle) link.title = ctaButtonTitle;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const absoluteSrc = link.href;
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${ctaButtonName}</title>
        <style>*{margin:0;padding:0;box-sizing:border-box;}
        body{background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;}
        video{width:100%;max-height:100vh;outline:none;}</style></head><body>
        <video src="${absoluteSrc}" controls autoplay playsinline></video>
        </body></html>`;
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    });

    ctaContainer.appendChild(link);
    wrapper.appendChild(ctaContainer);
  } else if (videoType === 'image') {
    const videoDamPath = rows[5]?.querySelector('div')?.textContent?.trim() || '';

    const imagePicture = rows[6]?.querySelector('picture');

    if (imagePicture) {
      const imageContainer = document.createElement('div');
      imageContainer.className = 'video-image';

      imageContainer.appendChild(imagePicture);

      if (videoDamPath) {
        imageContainer.style.cursor = 'pointer';
        imageContainer.addEventListener('click', async () => {
          const tempAnchor = document.createElement('a');
          tempAnchor.href = videoDamPath;
          const absoluteSrc = tempAnchor.href;
          try {
            const response = await fetch(absoluteSrc, { credentials: 'include' });
            const videoBlob = await response.blob();
            const videoBlobUrl = URL.createObjectURL(videoBlob);
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Video</title>
              <style>*{margin:0;padding:0;box-sizing:border-box;}
              body{background:#000;display:flex;justify-content:center;align-items:center;min-height:100vh;}
              video{width:100%;max-height:100vh;}</style></head><body>
              <video src="${videoBlobUrl}" controls autoplay playsinline></video>
              </body></html>`;
            const pageBlob = new Blob([html], { type: 'text/html' });
            const pageBlobUrl = URL.createObjectURL(pageBlob);
            window.open(pageBlobUrl, '_blank');
          } catch {
            window.open(absoluteSrc, '_blank');
          }
        });
      }

      wrapper.appendChild(imageContainer);
    }
  }

  block.appendChild(wrapper);
}

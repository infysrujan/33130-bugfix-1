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
    const videoDamPath = rows[1]?.querySelector('div')?.textContent?.trim() || '';
    const imagePicture = rows[2]?.querySelector('picture');

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

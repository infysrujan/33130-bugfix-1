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
  // Field order: videoType, youtubeUrl, damAssetPath, ctaButtonName, ctaButtonTitle
  // rows[0] = videoType
  // rows[1] = youtubeUrl  (empty when videoType=cta)
  // rows[2] = damAssetPath (empty when videoType=videourl)
  // rows[3] = ctaButtonName (empty when videoType=videourl)
  // rows[4] = ctaButtonTitle (empty when videoType=videourl)

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
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');

    ctaContainer.appendChild(link);
    wrapper.appendChild(ctaContainer);
  }

  block.appendChild(wrapper);
}

function getYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export default function decorate(block) {
  const rows = [...block.children];

  // Row 0: videoType (select field value rendered as text)
  const videoTypeCell = rows[0]?.querySelector('div');
  const videoType = videoTypeCell?.textContent?.trim();

  // Row 1: either YouTube URL (text) or DAM asset path (anchor link)
  const contentRow = rows[1];
  const contentLink = contentRow?.querySelector('a');
  const contentText = contentRow?.querySelector('div')?.textContent?.trim();
  const contentValue = contentLink?.href || contentText || '';

  block.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'video-wrapper';

  if (videoType === 'videourl') {
    const ytId = getYouTubeId(contentValue);
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
    if (contentValue) {
      const ctaContainer = document.createElement('div');
      ctaContainer.className = 'video-cta';

      const link = document.createElement('a');
      link.href = contentValue;
      link.className = 'video-cta-link';
      link.textContent = 'Watch Video';

      ctaContainer.appendChild(link);
      wrapper.appendChild(ctaContainer);
    }
  }

  block.appendChild(wrapper);
}

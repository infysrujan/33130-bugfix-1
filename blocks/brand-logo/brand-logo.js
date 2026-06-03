/**
 * Decorates the Brand Logo block.
 * Creates a clickable logo that links to the homepage.
 * @param {Element} block The brand-logo block element
 */
export default function decorate(block) {
  // Extract the picture element (logo image)
  const picture = block.querySelector('picture');

  // Extract the link (typically the home page URL)
  const anchor = block.querySelector('a');

  // Extract alt text from the block data or image
  const img = block.querySelector('img');
  const altText = img?.alt || 'Brand Logo';

  // Clear the block content
  block.textContent = '';

  // Create the logo container
  const logoContainer = document.createElement('div');
  logoContainer.className = 'brand-logo-container';

  if (anchor && picture) {
    // Create a link wrapper for the logo
    const link = document.createElement('a');
    link.href = anchor.href;
    link.className = 'brand-logo-link';
    link.setAttribute('aria-label', altText);

    // Ensure the image has proper alt text
    const clonedPicture = picture.cloneNode(true);
    const clonedImg = clonedPicture.querySelector('img');
    if (clonedImg) {
      clonedImg.alt = altText;
      clonedImg.className = 'brand-logo-image';
    }

    link.appendChild(clonedPicture);
    logoContainer.appendChild(link);
  } else if (picture) {
    // No link provided, just display the logo
    const clonedPicture = picture.cloneNode(true);
    const clonedImg = clonedPicture.querySelector('img');
    if (clonedImg) {
      clonedImg.alt = altText;
      clonedImg.className = 'brand-logo-image';
    }
    logoContainer.appendChild(clonedPicture);
  }

  block.appendChild(logoContainer);
}

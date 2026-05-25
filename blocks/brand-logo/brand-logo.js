/**
 * Decorates the Brand Logo block.
 * Creates a clickable logo that links to the homepage.
 * @param {Element} block The brand-logo block element
 */
export default function decorate(block) {
  const rows = [...block.children];

  // Extract the picture element (logo image) from first row
  const picture = rows[0]?.querySelector('picture');

  // Extract the link (typically the home page URL)
  const anchor = block.querySelector('a');

  // Extract alt text from the block data or image
  const img = block.querySelector('img');
  const altText = img?.alt || 'Brand Logo';

  // Extract print logo picture from row 3 and its alt text from row 4 (optional fields)
  const printLogoPicture = rows[3]?.querySelector('picture, img');
  const printLogoAltText = rows[4]?.textContent?.trim() || '';

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

  // Render print logo in <main> so it isn't hidden by print styles on the header.
  // Guard against duplicate insertion when the header rebuilds on viewport change.
  if (printLogoPicture) {
    const printContainer = document.createElement('div');
    printContainer.className = 'brand-logo-print-logo';
    const clonedLogo = printLogoPicture.cloneNode(true);
    const clonedImg = clonedLogo.tagName === 'IMG' ? clonedLogo : clonedLogo.querySelector('img');
    if (clonedImg) {
      clonedImg.loading = 'eager';
      if (printLogoAltText) clonedImg.alt = printLogoAltText;
    }
    printContainer.appendChild(clonedLogo);
    block.appendChild(printContainer);
  }
}

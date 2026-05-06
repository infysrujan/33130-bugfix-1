import createSmartImage from '../../scripts/utils/smartcrop-helper.js';

export default function decorate(block) {
  const [
    imgElDesktop,
    imgElMobile,
    imgAlt,
    budgeTextEl,
    titleEl,
    descriptionEl,
    buttonEl,
  ] = block.children;
  // const pictureHTML = imgEl?.querySelector('img')?.outerHTML || '';
  const pictureDesktop = imgElDesktop?.querySelector('picture');
  const pictureMobile = imgElMobile?.querySelector('picture');

  let pictureHTML = '';

  if (pictureDesktop || pictureMobile) {
    const picture = createSmartImage(imgElDesktop, imgElMobile, imgAlt);
    pictureHTML = picture?.outerHTML || '';
  }
  const budgeText = budgeTextEl?.textContent?.trim() || '';
  const titleName = titleEl?.textContent?.trim() || '';
  const description = descriptionEl?.querySelector('p')?.innerHTML?.trim() || '';
  const buttonHTML = buttonEl?.innerHTML?.trim() || '';

  block.innerHTML = `
    <div class="cross-banner content">
      <div class="cross-banner-image">
        ${pictureHTML}
      </div>
      <div class="cross-banner-content">
        ${budgeText ? `<div class="cross-banner-badge">${budgeText}</div>` : ''}
        <div class="cross-banner-title">${titleName}</div>
        <div class="cross-banner-description">${description}</div>
        <div class="cross-banner-button">${buttonHTML}</div>
      </div>
    </div>
  `;
}

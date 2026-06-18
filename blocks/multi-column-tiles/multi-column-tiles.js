import { moveInstrumentation } from '../../scripts/scripts.js';
import createSmartImage from '../../scripts/utils/smartcrop-helper.js';

let blockName = '';
function buildTile(row, doc) {
  const [
    imgElDesktop,
    imageLinkDiv,
    titleDiv,
  ] = row.children;

  const pictureDesktop = imgElDesktop?.querySelector('picture');
  const existingAlt = imgElDesktop?.querySelector('img')?.getAttribute('alt') || '';

  let pictureHTML = '';
  if (pictureDesktop) {
    const picture = createSmartImage(
      imgElDesktop,
      null,
      { textContent: existingAlt },
      false,
      blockName,
    );
    pictureHTML = picture?.outerHTML || '';
  }

  const linkAnchor = imageLinkDiv?.querySelector('a');
  const linkHref = linkAnchor?.getAttribute('href') || imageLinkDiv?.textContent?.trim() || '';
  const title = titleDiv?.textContent?.trim() || '';

  const tile = doc.createElement('div');
  tile.className = 'multi-column-tiles-tile';
  tile.addEventListener('touchstart', () => tile.classList.add('is-active'), { passive: true });
  tile.addEventListener('touchend', () => tile.classList.remove('is-active'), { passive: true });
  tile.addEventListener('touchcancel', () => tile.classList.remove('is-active'), { passive: true });

  const imageWrapper = doc.createElement('div');
  imageWrapper.className = 'multi-column-tiles-image';
  imageWrapper.innerHTML = pictureHTML;

  const titleEl = doc.createElement('h5');
  titleEl.className = 'multi-column-tiles-title';
  titleEl.textContent = title;

  const separatorEl = doc.createElement('span');
  separatorEl.className = 'multi-column-tiles-separator';
  titleEl.appendChild(separatorEl);

  if (linkHref) {
    const anchor = doc.createElement('a');
    anchor.href = linkHref;
    anchor.className = 'multi-column-tiles-link';
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    if (title) anchor.setAttribute('title', title);
    anchor.setAttribute('aria-label', title);
    anchor.appendChild(imageWrapper);
    anchor.appendChild(titleEl);
    tile.appendChild(anchor);
  } else {
    tile.appendChild(imageWrapper);
    tile.appendChild(titleEl);
  }

  return tile;
}

export default function decorate(block) {
  const doc = block.ownerDocument;
  const rows = [...block.children].slice(0, 4);

  blockName = block.getAttribute('data-block-name');
  const wrapper = doc.createElement('div');
  wrapper.className = `multi-column-tiles-wrapper tiles-count-${rows.length}`;

  rows.forEach((row) => {
    const tile = buildTile(row, doc);
    moveInstrumentation(row, tile);
    wrapper.appendChild(tile);
  });

  block.innerHTML = '';
  block.appendChild(wrapper);
}

import { moveInstrumentation } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

const resolveFragmentPath = (cell) => {
  if (!cell) return '';
  const href = cell.querySelector('a')?.getAttribute('href')?.trim();
  if (href) return href;
  const text = cell.textContent.trim();
  return text.startsWith('/') ? text : '';
};

export default async function buildMfCardListCarouselSlide(row, index) {
  const doc = row.ownerDocument;
  const cells = [...row.children];

  const titleCell = cells[1];
  const fragmentPathCell = cells[2];

  const slide = doc.createElement('div');
  slide.className = 'carousel-dotted-item mf-card-list-carousel-item';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  // Optional title
  const titleText = titleCell?.textContent.trim();
  if (titleText) {
    const headerEl = doc.createElement('div');
    headerEl.className = 'mf-card-list-carousel-header';
    const h2 = doc.createElement('h2');
    h2.className = 'title-2';
    h2.textContent = titleText;
    headerEl.append(h2);
    slide.append(headerEl);
  }

  // Fragment content
  const fragmentPath = resolveFragmentPath(fragmentPathCell);
  if (!fragmentPath) {
    return slide;
  }

  const fragment = await loadFragment(fragmentPath);
  const section = fragment?.querySelector(':scope .section');
  if (!section) {
    return slide;
  }

  const contentWrapper = doc.createElement('div');
  contentWrapper.className = 'mf-card-list-carousel-content';
  [...section.childNodes].forEach((node) => contentWrapper.append(node.cloneNode(true)));
  slide.append(contentWrapper);

  return slide;
}

import { moveInstrumentation } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

function getFragmentPath(cells) {
  const linkPath = cells
    .map((cell) => cell.querySelector('a')?.getAttribute('href')?.trim())
    .find((href) => href);

  if (linkPath) return linkPath;

  const textPath = cells
    .map((cell) => cell.textContent.trim())
    .find((text) => text.startsWith('/'));

  return textPath || '';
}

export default async function buildCardListFragmentSlide(row, index) {
  const cells = [...row.children];
  const fragmentPath = getFragmentPath(cells);

  const slide = document.createElement('div');
  slide.className = 'carousel-dotted-item carousel-fragment';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  if (!fragmentPath) return slide;

  try {
    const fragment = await loadFragment(fragmentPath);
    const section = fragment?.querySelector(':scope .section');

    if (section) {
      slide.classList.add(...section.classList);
      slide.append(...section.childNodes);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load carousel fragment', error);
  }

  return slide;
}

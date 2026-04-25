import { moveInstrumentation } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

const getFragmentPath = (cells) => cells.map((cell) => cell.querySelector('a')?.getAttribute('href')?.trim()).find(Boolean)
  ?? cells.map((cell) => cell.textContent.trim()).find((text) => text.startsWith('/'))
  ?? '';

const tabletMin = getComputedStyle(document.documentElement).getPropertyValue('--bbl-breakpoint-tablet-min').trim();

const getChunkSize = (cardList) => {
  const isNarrow = window.matchMedia(`(max-width: ${tabletMin})`).matches;
  const isMultiColumn = cardList.classList.contains('cards-3') || cardList.classList.contains('cards-4');
  return !isNarrow && isMultiColumn ? 3 : 1;
};

const chunkItems = (items, size) => Array.from(
  { length: Math.ceil(items.length / size) },
  (_, i) => items.slice(
    i * size,
    i * size + size,
  ),
);

const createSlide = (row, index, doc) => {
  const slide = doc.createElement('div');
  slide.className = 'carousel-dotted-item carousel-fragment';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);
  return slide;
};

const createErrorSlide = (row, index, message, doc) => {
  const slide = createSlide(row, index, doc);
  slide.textContent = message;
  return slide;
};

const createFragmentSlide = (row, slideIndex, section, itemsChunk, doc) => {
  const slide = createSlide(row, slideIndex, doc);
  slide.append(...[...section.childNodes].map((node) => node.cloneNode(true)));

  const lists = slide.querySelectorAll('.cards-list');
  const list = lists[lists.length - 1];
  list?.replaceChildren(...itemsChunk.map((item) => item.cloneNode(true)));

  return slide;
};

export const getCardListCarouselOffsetForSlide = (block, trackWrapper, slideEl) => {
  const wrapperWidth = block.querySelector('.carousel-track-wrapper')?.parentElement?.offsetWidth
    || trackWrapper.offsetWidth;
  const isMobile = window.matchMedia(`(max-width: ${tabletMin})`).matches;

  if (!slideEl) return 0;

  if (!isMobile) {
    return Math.max(0, slideEl.offsetLeft);
  }

  const targetOffset = slideEl.offsetLeft + (slideEl.offsetWidth / 2)
    - (wrapperWidth / 2);

  return Math.max(0, targetOffset);
};

export const getCardListCarouselOffset = (
  block,
  trackWrapper,
  slideEls,
  index,
) => getCardListCarouselOffsetForSlide(
  block,
  trackWrapper,
  slideEls[index],
);

export const setCardListTrackPosition = (block, trackWrapper, slideEls, index) => {
  const targetOffset = getCardListCarouselOffset(block, trackWrapper, slideEls, index);
  trackWrapper.style.transform = `translate3d(${-targetOffset}px, 0px, 0px)`;
};

export const handleCardListLoopTransition = (
  block,
  trackWrapper,
  slideEls,
  isLoopingForward,
  isLoopingBackward,
  shouldCloneFragmentSlide,
) => {
  if (!(isLoopingForward || isLoopingBackward) || !shouldCloneFragmentSlide) {
    return false;
  }

  const cloneSlide = isLoopingForward
    ? trackWrapper.lastElementChild
    : trackWrapper.firstElementChild;
  const cloneOffset = getCardListCarouselOffsetForSlide(block, trackWrapper, cloneSlide);
  const resetOffset = isLoopingForward
    ? getCardListCarouselOffset(block, trackWrapper, slideEls, 0)
    : getCardListCarouselOffset(block, trackWrapper, slideEls, slideEls.length - 1);

  trackWrapper.style.transform = `translate3d(${-cloneOffset}px, 0px, 0px)`;
  setTimeout(() => {
    trackWrapper.style.transition = 'none';
    trackWrapper.style.transform = `translate3d(${-resetOffset}px, 0px, 0px)`;
    trackWrapper.getBoundingClientRect();
    trackWrapper.style.transition = '';
  }, 700);

  return true;
};

export default async function buildCardListFragmentSlides(row, index) {
  const doc = row.ownerDocument;
  const fragmentPath = getFragmentPath([...row.children]);

  if (!fragmentPath) return [createErrorSlide(row, index, 'Missing fragment path', doc)];

  const fragment = await loadFragment(fragmentPath);
  const section = fragment?.querySelector(':scope .section');
  const cardList = section?.querySelector('.cards-list');
  const items = cardList ? [...cardList.querySelectorAll(':scope > .cards-list-item')] : [];

  if (!section || !cardList || !items.length) {
    return [createErrorSlide(row, index, 'Fragment loaded without card-list content', doc)];
  }

  return chunkItems(items, getChunkSize(cardList)).map(
    (chunk, i) => createFragmentSlide(row, index + i, section, chunk, doc),
  );
}

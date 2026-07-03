import { moveInstrumentation } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';
import { openModal } from '../../scripts/utils/modal.js';

const getFragmentPath = (cells) => cells.map((cell) => cell.querySelector('a')?.getAttribute('href')?.trim()).find(Boolean)
  ?? cells.map((cell) => cell.textContent.trim()).find((text) => text.startsWith('/'))
  ?? '';

export const tabletMin = getComputedStyle(document.documentElement).getPropertyValue('--bbl-breakpoint-tablet-min').trim();

const getChunkSize = (cardList) => {
  const isNarrow = window.matchMedia(`(max-width: ${tabletMin})`).matches;
  const isMultiColumn = cardList.classList.contains('cards-3') || cardList.classList.contains('cards-4');
  return !isNarrow && isMultiColumn ? 3 : 1;
};

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

const bindSlideModalHandler = (slide, doc) => {
  slide.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    if (!trigger) return;
    event.preventDefault();
    const fragmentPath = trigger.getAttribute('data-modal');
    if (fragmentPath) openModal(doc, { fragmentPath, dialogClass: 'card-list-modal-body' });
  });
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

export const isFragmentNoScroll = (slideEls) => slideEls.length === 1
  && slideEls[0]?.classList.contains('no-scroll');

export const updateFragmentTrack = (
  block,
  trackWrapper,
  slideEls,
  index,
  prevIndex,
  direction,
  shouldCloneFragmentSlide,
) => {
  const isLoopingForward = index === 0 && prevIndex === slideEls.length - 1;
  const isLoopingBackward = index === slideEls.length - 1 && prevIndex === 0;
  const fragIsLoopingForward = direction === 'forward' && isLoopingForward;
  const fragIsLoopingBackward = direction === 'backward' && isLoopingBackward;

  if ((fragIsLoopingForward || fragIsLoopingBackward) && shouldCloneFragmentSlide) {
    const cloneSlide = fragIsLoopingForward
      ? trackWrapper.lastElementChild
      : trackWrapper.firstElementChild;
    const cloneOffset = getCardListCarouselOffsetForSlide(block, trackWrapper, cloneSlide);
    const resetOffset = fragIsLoopingForward
      ? getCardListCarouselOffset(block, trackWrapper, slideEls, 0)
      : getCardListCarouselOffset(block, trackWrapper, slideEls, slideEls.length - 1);

    trackWrapper.style.transform = `translate3d(${-cloneOffset}px, 0px, 0px)`;
    setTimeout(() => {
      trackWrapper.style.transition = 'none';
      trackWrapper.style.transform = `translate3d(${-resetOffset}px, 0px, 0px)`;
      trackWrapper.getBoundingClientRect();
      trackWrapper.style.transition = '';
    }, 700);
    return;
  }

  setCardListTrackPosition(block, trackWrapper, slideEls, index);
};

export default function buildCardListFragmentSlides(row, index) {
  const doc = row.ownerDocument;
  const fragmentPath = getFragmentPath([...row.children]);

  if (!fragmentPath) return Promise.resolve([createErrorSlide(row, index, 'Missing fragment path', doc)]);

  return loadFragment(fragmentPath).then((fragment) => {
    const section = fragment?.querySelector(':scope .section');
    const cardList = section?.querySelector('.cards-list');
    const items = cardList ? [...cardList.querySelectorAll(':scope > .cards-list-item')] : [];

    if (!section || !cardList || !items.length) {
      return [createErrorSlide(row, index, 'Fragment loaded without card-list content', doc)];
    }

    const chunkSize = getChunkSize(cardList);

    if (items.length <= chunkSize) {
      const slide = createFragmentSlide(row, index, section, items, doc);
      slide.classList.add('no-scroll');
      bindSlideModalHandler(slide, doc);
      return [slide];
    }

    const chunks = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      if (chunk.length < chunkSize) {
        chunks.push(items.slice(-chunkSize));
        break;
      }
      chunks.push(chunk);
    }

    return chunks.map((chunk, i) => {
      const slide = createFragmentSlide(row, index + i, section, chunk, doc);
      bindSlideModalHandler(slide, doc);
      return slide;
    });
  });
}

import { moveInstrumentation } from '../../scripts/scripts.js';
import { loadFragment } from '../fragment/fragment.js';

function getFragmentPath(cells) {
  const linkPath = cells
    .map((cell) => cell.querySelector('a')?.getAttribute('href')?.trim())
    .find((href) => href);

  if (linkPath) return linkPath;

  return cells.map((cell) => cell.textContent.trim()).find((text) => text.startsWith('/')) || '';
}

function getChunkSize(cardList) {
  if (window.matchMedia('(width <= 47.5rem)').matches) return 1;

  if (cardList.classList.contains('cards-3') || cardList.classList.contains('cards-4')) return 3;
  return 1;
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createErrorSlide(row, index, message, doc) {
  const slide = doc.createElement('div');
  slide.className = 'carousel-dotted-item carousel-fragment';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);
  slide.textContent = message;
  return slide;
}

function createFragmentSlide(row, slideIndex, section, itemsChunk, doc) {
  const slide = doc.createElement('div');
  slide.className = 'carousel-dotted-item carousel-fragment';
  slide.dataset.index = slideIndex;
  moveInstrumentation(row, slide);

  const sectionContent = [...section.childNodes].map((node) => node.cloneNode(true));
  const clonedCardList = sectionContent.find(
    (node) => node.nodeType === Node.ELEMENT_NODE && node.matches('.card-list-wrapper'),
  );

  if (clonedCardList) {
    const list = clonedCardList.querySelector('.cards-list');
    if (list) {
      list.classList.add('fragment-carousel-group');
      list.replaceChildren(...itemsChunk.map((item) => item.cloneNode(true)));
    }
  }

  slide.append(...sectionContent);
  return slide;
}

export default async function buildCardListFragmentSlides(row, index) {
  const doc = row.ownerDocument;
  const cells = [...row.children];
  const fragmentPath = getFragmentPath(cells);

  if (!fragmentPath) {
    return [createErrorSlide(row, index, 'Missing fragment path', doc)];
  }

  const fragment = await loadFragment(fragmentPath);
  const section = fragment?.querySelector(':scope .section');
  const cardList = section?.querySelector('.cards-list');
  const items = cardList ? [...cardList.querySelectorAll(':scope > .cards-list-item')] : [];

  if (!section || !cardList || !items.length) {
    return [createErrorSlide(row, index, 'Fragment loaded without card-list content', doc)];
  }

  const chunkSize = getChunkSize(cardList);
  return chunkItems(items, chunkSize).map((itemsChunk, chunkIndex) => createFragmentSlide(
    row,
    index + chunkIndex,
    section,
    itemsChunk,
    doc,
  ));
}

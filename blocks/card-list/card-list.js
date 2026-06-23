import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import { openModal } from '../../scripts/utils/modal.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import { createCardListItem } from './card-list-item.js';

function stripAuthoringInstrumentation(root) {
  if (!root) return;
  [root, ...root.querySelectorAll('*')].forEach((el) => {
    [...el.attributes]
      .filter(({ name }) => name.startsWith('data-aue-') || name.startsWith('data-richtext-'))
      .forEach(({ name }) => el.removeAttribute(name));
  });
}

function removeDuplicateAuthoringBlocks(block) {
  const blockResource = block.dataset.aueResource;
  if (!blockResource) return;

  block.ownerDocument.querySelectorAll('.card-list.block').forEach((other) => {
    if (other === block) return;
    if (other.dataset.aueResource !== blockResource) return;
    if (!other.querySelector(':scope > .cards-list')) return;
    other.remove();
  });
}

function getSourceRows(block) {
  return [...block.children].filter((row) => !row.classList.contains('cards-list'));
}

function bindModalHandler(block, doc) {
  if (block.dataset.cardListModalBound) return;
  block.dataset.cardListModalBound = 'true';

  block.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    if (!trigger || !block.contains(trigger)) return;
    event.preventDefault();
    const fragmentPath = trigger.getAttribute('data-modal');
    if (fragmentPath) openModal(doc, { fragmentPath, dialogClass: 'card-list-modal-body' });
  });
}

export default function decorate(block) {
  const isAuthoring = isAuthoringInstance(block);
  if (block.dataset.decorated && !isAuthoring) return;
  block.dataset.decorated = 'true';

  const doc = block.ownerDocument;

  if (isAuthoring) {
    removeDuplicateAuthoringBlocks(block);
    block.querySelectorAll(':scope > .cards-list').forEach((container) => container.remove());
  }

  const sourceRows = getSourceRows(block);
  if (isAuthoring) {
    sourceRows.forEach((row) => { row.style.display = 'none'; });
  }

  const [LayoutRow, Alignment, cardsPerRowEl, ...cardRows] = sourceRows;
  const cardListLayout = LayoutRow?.textContent?.trim();
  const cardListAlignment = Alignment?.textContent?.trim();
  const cardsPerRow = cardsPerRowEl?.textContent?.trim();
  const container = createElementFromHTML(
    `<div class="cards-list ${cardListLayout} ${cardListAlignment} ${cardsPerRow}"></div>`,
    doc,
  );

  [LayoutRow, Alignment, cardsPerRowEl].forEach((row) => {
    if (row) row.hidden = true;
  });

  cardRows.forEach((row) => {
    const card = createCardListItem(row, doc);
    if (!isAuthoring) {
      moveInstrumentation(row, card);
    }
    container.appendChild(card);
    if (!isAuthoring) {
      row.remove();
    }
  });

  block.appendChild(container);

  if (isAuthoring) {
    stripAuthoringInstrumentation(container);
  }

  bindModalHandler(block, doc);
}

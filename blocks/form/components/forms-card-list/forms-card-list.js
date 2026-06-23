import { openModal } from '../../../../scripts/utils/modal.js';

function bindModalHandler(panel, doc) {
  if (panel.dataset.cardListModalBound) return;
  panel.dataset.cardListModalBound = 'true';
  panel.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    if (!trigger || !panel.contains(trigger)) return;
    event.preventDefault();
    const fragmentPath = trigger.getAttribute('data-modal');
    if (fragmentPath) openModal(doc, { fragmentPath, dialogClass: 'card-list-modal-body' });
  });
}

export default function decorate(panel) {
  panel.classList.add('forms-card-list');

  const layout = panel.dataset.cardListLayout || 'default';
  const alignment = panel.dataset.cardListAlignment || 'default';
  const cardsPerRow = panel.dataset.cardsPerRow || '';

  const containerClasses = ['cards-list', layout, alignment, cardsPerRow]
    .filter(Boolean)
    .join(' ');

  const container = document.createElement('div');
  container.className = containerClasses;

  [...panel.children].forEach((child) => container.appendChild(child));
  panel.appendChild(container);

  bindModalHandler(panel, panel.ownerDocument);
  return panel;
}

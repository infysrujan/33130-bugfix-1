import { createElementFromHTML } from './scripts.js';
import { loadFragment } from '../blocks/fragment/fragment.js';

/**
 * Creates (or returns existing) the shared custom-modal element.
 * @param {Document} doc
 * @returns {HTMLElement}
 */
export function createModal(doc) {
  if (doc.querySelector('.custom-modal')) return doc.querySelector('.custom-modal');

  const modal = createElementFromHTML(`
    <div class="custom-modal" aria-hidden="true">
      <div class="modal-overlay"></div>
      <div class="modal-content" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="Close modal">&times;</button>
        <div class="modal-body"></div>
      </div>
    </div>`, doc);

  const hide = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    doc.body.classList.remove('modal-open');
  };

  modal.querySelector('.modal-close')?.addEventListener('click', hide);
  modal.querySelector('.modal-overlay')?.addEventListener('click', hide);
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) hide();
  });

  return doc.body.appendChild(modal);
}

/**
 * Loads a fragment into the shared modal and opens it.
 * @param {Document} doc
 * @param {string} fragmentPath
 * @param {Function} [onLoad] Optional callback(modalBody) called after content is injected
 */
export async function openModal(doc, fragmentPath, onLoad) {
  const modal = createModal(doc);
  const modalBody = modal.querySelector('.modal-body');
  if (!modalBody) return;

  try {
    const fragment = await loadFragment(fragmentPath);
    if (!fragment) throw new Error(`Unable to load fragment: ${fragmentPath}`);

    modalBody.replaceChildren(...fragment.children);
    if (typeof onLoad === 'function') onLoad(modalBody);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    doc.body.classList.add('modal-open');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load modal content', error);
  }
}

/**
 * Closes the shared modal if open.
 * @param {Document} doc
 */
export function closeModal(doc) {
  const modal = doc.querySelector('.custom-modal');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  doc.body.classList.remove('modal-open');
}

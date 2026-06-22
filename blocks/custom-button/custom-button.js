import { openModal } from '../../scripts/utils/modal.js';
import { applyLinkTarget } from '../../scripts/bbl-decorators.js';

const parseBool = (el) => el?.textContent.trim().toLowerCase() === 'true';

export default function decorate(block) {
  const doc = block.ownerDocument;

  [...block.children].forEach((row) => {
    const anchor = row.querySelector('a');
    if (!anchor) return;

    const boolCells = [...row.children].filter((cell) => {
      const t = cell.textContent.trim().toLowerCase();
      return t === 'true' || t === 'false';
    });

    const targetLink = boolCells.length === 2 ? parseBool(boolCells[0]) : anchor.target === '_blank';
    const enableModal = parseBool(boolCells.at(-1));

    boolCells.forEach((cell) => { cell.hidden = true; });

    if (enableModal) {
      const href = anchor.getAttribute('href');
      if (href) {
        anchor.removeAttribute('href');
        anchor.addEventListener('click', (e) => {
          e.preventDefault();
          openModal(doc, { fragmentPath: href });
        });
      }
    } else {
      applyLinkTarget(row, 'a', targetLink);
    }
  });
}

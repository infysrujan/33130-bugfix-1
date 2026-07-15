import { openModal } from '../../scripts/utils/modal.js';
import { applyLinkTarget } from '../../scripts/bbl-decorators.js';
import { loadFragment } from '../fragment/fragment.js';

const parseBool = (el) => el?.textContent.trim().toLowerCase() === 'true';

export default function decorate(block) {
  const doc = block.ownerDocument;

  [...block.children].forEach((row) => {
    const anchor = row.querySelector('a');
    if (!anchor) return;

    const allCells = [...row.children];

    // "Open link in new tab" (targetLink) is NOT authored as a cell: UE bakes it
    // straight into the anchor as target="_blank" and omits the targetLink cell
    // entirely (so a new-tab row has one fewer cell). Read it from the anchor.
    // The two modal booleans are always the last two cells of the row, regardless
    // of whether the targetLink cell was emitted.
    const targetLink = anchor.getAttribute('target') === '_blank';
    const enableModal = parseBool(allCells[allCells.length - 2]);
    const enableCookieModal = parseBool(allCells[allCells.length - 1]);

    // Hide every cell after the anchor cell (the raw boolean values).
    allCells.slice(1).forEach((cell) => { cell.hidden = true; });

    if (enableCookieModal) {
      const href = anchor.getAttribute('href');
      if (href) {
        anchor.removeAttribute('href');
        anchor.addEventListener('click', async (e) => {
          e.preventDefault();
          if (typeof window.showCookieModal !== 'function') {
            await loadFragment(href);
          }
          window.showCookieModal?.(anchor);
        });
      }
    } else if (enableModal) {
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

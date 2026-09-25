function detectVariant(block) {
  const rows = [...block.children];
  const firstRow = rows[0];
  const firstCellVariant = firstRow?.children[0]?.dataset.variant;

  if (firstCellVariant === 'simple-tab-carousel' || firstCellVariant === 'icon-tab-carousel') {
    return firstCellVariant;
  }

  const isMediaTab = [...firstRow.children].every((cell) => {
    const img = cell.querySelector('img');
    if (!img) return false;
    const cellClone = cell.cloneNode(true);
    cellClone.querySelector('img')?.remove();
    return cellClone.textContent.trim() === '';
  });

  if (isMediaTab) return 'media-tab';
  return firstCellVariant || 'simple-tab';
}

/**
 * Apply per-tab section style classes (carried from tabs-helper.js as the
 * data-panel-classes JSON array) onto each .tab-panel by index, so different
 * tabs keep their own section styles.
 * @param {Element} block
 */
function applyPanelClasses(block) {
  let panelClassList = [];
  try {
    panelClassList = JSON.parse(block.dataset.panelClasses || '[]');
  } catch {
    panelClassList = [];
  }
  if (!Array.isArray(panelClassList) || !panelClassList.length) return;

  const panels = block.querySelectorAll(':scope .tabs-content > .tab-panel');
  panels.forEach((panel, index) => {
    const classes = (panelClassList[index] || '').split(' ').filter(Boolean);
    if (classes.length) panel.classList.add(...classes);
  });

  // Carrier data no longer needed once applied — keep the block markup clean.
  delete block.dataset.panelClasses;
}

export default async function decorate(block) {
  const variant = detectVariant(block);
  const { default: decorateVariation } = await import(`./variations/${variant}.js`);
  await decorateVariation(block);
  applyPanelClasses(block);
}

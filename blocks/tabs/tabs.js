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

export default async function decorate(block) {
  const variant = detectVariant(block);
  const { default: decorateVariation } = await import(`./variations/${variant}.js`);
  await decorateVariation(block);
}

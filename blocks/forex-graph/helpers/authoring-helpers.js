export default function parseAuthoring(block) {
  const rows = [...block.children];
  const goLabel = rows[0]?.textContent?.trim() || 'GO';
  const printLabel = rows[1]?.textContent?.trim() || 'PRINT';
  const downloadLabel = rows[2]?.textContent?.trim() || 'DOWNLOADS';
  const disclaimerHtml = rows[3]?.firstElementChild?.innerHTML || '';
  const fromLabel = rows[4]?.textContent?.trim() || 'From';
  const toLabel = rows[5]?.textContent?.trim() || 'To';
  const buyingLabel = rows[6]?.textContent?.trim() || 'Buying';
  const sellingLabel = rows[7]?.textContent?.trim() || 'Selling';

  return {
    goLabel,
    printLabel,
    downloadLabel,
    disclaimerHtml,
    fromLabel,
    toLabel,
    buyingLabel,
    sellingLabel,
  };
}

export default function parseAuthoring(block) {
  const rows = [...block.children];

  if (rows.length >= 8) {
    return {
      fromLabel: rows[0]?.textContent?.trim() || 'From',
      toLabel: rows[1]?.textContent?.trim() || 'To',
      goLabel: rows[2]?.textContent?.trim() || 'GO',
      printLabel: rows[3]?.textContent?.trim() || 'PRINT',
      downloadLabel: rows[4]?.textContent?.trim() || 'DOWNLOADS',
      buyingLabel: rows[5]?.textContent?.trim() || 'Buying',
      sellingLabel: rows[6]?.textContent?.trim() || 'Selling',
      disclaimerHtml: rows[7]?.firstElementChild?.innerHTML || '',
    };
  }

  return {
    fromLabel: '',
    toLabel: '',
    goLabel: rows[0]?.textContent?.trim() || 'GO',
    printLabel: rows[1]?.textContent?.trim() || 'PRINT',
    downloadLabel: rows[2]?.textContent?.trim() || 'DOWNLOADS',
    buyingLabel: '',
    sellingLabel: '',
    disclaimerHtml: rows[3]?.firstElementChild?.innerHTML || '',
  };
}

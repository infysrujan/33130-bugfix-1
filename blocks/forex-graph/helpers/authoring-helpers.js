export default function parseAuthoring(block) {
  const rows = [...block.children];
  const goLabel = rows[0]?.textContent?.trim() || 'GO';
  const printLabel = rows[1]?.textContent?.trim() || 'PRINT';
  const downloadLabel = rows[2]?.textContent?.trim() || 'DOWNLOADS';
  const disclaimerHtml = rows[3]?.firstElementChild?.innerHTML || '';

  return {
    goLabel,
    printLabel,
    downloadLabel,
    disclaimerHtml,
  };
}

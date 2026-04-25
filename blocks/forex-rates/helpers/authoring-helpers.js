function parseColumns(listElement) {
  if (!listElement) return [];
  return [...listElement.querySelectorAll('li')]
    .map((li) => li.innerHTML.trim())
    .filter(Boolean);
}

export default function parseAuthoring(block) {
  const rows = [...block.children];
  const calendarLabel = rows[0]?.textContent?.trim() || 'Update as of';
  const ctaLabel = rows[1]?.textContent?.trim() || 'GO';
  const printCtaLabel = rows[2]?.textContent?.trim() || 'PRINT';
  const headingsSource = rows[3];
  const headingsList = headingsSource?.querySelector('ul');
  let columns = parseColumns(headingsList);
  if (!columns.length && headingsSource) {
    columns = [...headingsSource.querySelectorAll('p,strong,span')]
      .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  const disclaimerHtml = rows[4]?.firstElementChild?.innerHTML || '';

  return {
    calendarLabel,
    ctaLabel,
    printCtaLabel,
    columns,
    disclaimerHtml,
  };
}

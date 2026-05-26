const COLUMN_SORT_KEYS_SECONDARY = ['BOND_SYMBOL', 'NAME_ENG', null, null, 'REMAIN_TERM', 'CURRENT_COUPON', 'MATURITY_DATE'];
const SUB_SORT_KEYS_SECONDARY = { 2: ['BID_PRICE', 'BID_YIELD'], 3: ['OFFER_PRICE', 'OFFER_YIELD'] };

const COLUMN_SORT_KEYS_GOV = ['BOND_SYMBOL', 'NAME_ENG', 'ISSUE_RATING', 'ISSUER_RATING', null, 'REMAIN_TERM', 'CURRENT_COUPON', 'MATURITY_DATE'];
const SUB_SORT_KEYS_GOV = { 4: ['OFFER_PRICE', 'OFFER_YIELD'] };
const MATURITY_VALUES = ['less1', '1to5', '6to10', 'more10'];

function getText(row) {
  if (!row) return '';
  return (row.querySelector('p')?.textContent || row.querySelector('div')?.textContent || '').trim();
}

export default function parseAuthoring(block) {
  const rows = [...block.children];
  return {
    boardType: getText(rows[0]) || 'secondary-market',
    calendarLabel: getText(rows[1]) || 'Updated as of',
    filterLabel: getText(rows[2]) || 'Filter',
    clearFilterLabel: getText(rows[3]) || 'Clear Filter',
    printLabel: getText(rows[4]) || 'Print',
    ctaButtonLabel: getText(rows[5]) || 'Go',
    tableHeadingEl: rows[6]?.querySelector('ul') || null,
    remarksHtml: rows[7]?.querySelector('div')?.innerHTML || '',
    maturityDateLabel: getText(rows[8]) || 'Maturity Date',
    maturityRateLabel: getText(rows[9]) || 'Remaining Maturity',
    maturityTypesEl: rows[10]?.querySelector('ul') || null,
  };
}

export function parseTableHeading(ul, isGov = false) {
  if (!ul) return [];
  const colKeys = isGov ? COLUMN_SORT_KEYS_GOV : COLUMN_SORT_KEYS_SECONDARY;
  const subKeys = isGov ? SUB_SORT_KEYS_GOV : SUB_SORT_KEYS_SECONDARY;
  return [...ul.children].map((li, i) => {
    const label = li.querySelector('p')?.textContent?.trim() || li.childNodes[0]?.textContent?.trim() || '';
    const subUl = li.querySelector('ul');
    const sub = subUl
      ? [...subUl.children].map((subLi, j) => ({
        label: subLi.textContent?.trim(),
        sortKey: subKeys[i]?.[j] || null,
      }))
      : null;
    const defaultColspan = i === 0 ? 2 : 1;
    const colspanValue = sub ? sub.length : defaultColspan;
    return {
      label,
      sortKey: colKeys[i] || null,
      sub,
      rowspan: sub ? 1 : 2,
      colspan: colspanValue,
    };
  });
}

export function parseMaturityTypes(ul) {
  if (!ul) return [];
  return [...ul.children].map((li, i) => ({
    label: li.textContent?.trim(),
    value: MATURITY_VALUES[i] || `type${i}`,
  }));
}

import { moveInstrumentation } from '../../scripts/scripts.js';

/** Classes from poc-table multiselect (applied to the generated <table>) */
const TABLE_STYLE_CLASSES = [
  'striped',
  'header-first-row',
  'header-first-column',
  'table-all-borders',
  'table-bottom-borders',
  'table-no-borders',
];

const RE_TH_SUFFIX = /\s*\(th\)\s*$/i;

function stripThSuffix(text) {
  return text.replace(RE_TH_SUFFIX, '').trim();
}

function hasKeyword(text, keyword) {
  return typeof text === 'string' && text.includes(keyword);
}

function isHeadingMarker(el) {
  return el?.tagName === 'P' && hasKeyword(el.textContent, '#heading');
}

function isRowMarker(el) {
  return el?.tagName === 'P' && hasKeyword(el.textContent, '#row');
}

function liHasMerge(li) {
  const txt = li.textContent.trim();
  if (hasKeyword(txt, '#merge')) return true;
  const fp = li.querySelector(':scope > p:first-child');
  return Boolean(fp && hasKeyword(fp.textContent, '#merge'));
}

function isSplitLi(li) {
  return [...li.querySelectorAll(':scope > p')].some((p) => hasKeyword(p.textContent, '#split'));
}

function getDirectUl(li) {
  return li.querySelector(':scope > ul');
}

/**
 * Text in <p> after removing #split / #merge tokens (keeps rest of line).
 */
function titleFromSplitParagraph(p) {
  if (!p) return '';
  let t = p.innerHTML.replace(/<br\s*\/?>/gi, ' ');
  const tmp = document.createElement('div');
  tmp.innerHTML = t;
  t = tmp.textContent || '';
  return stripThSuffix(t.replace(/#split/gi, '').replace(/#merge/gi, '').trim());
}

function unwrapLiBody(li) {
  const frag = document.createDocumentFragment();
  [...li.childNodes].forEach((n) => frag.append(n.cloneNode(true)));
  return frag;
}

function removeMergeMarkerFromFragment(frag) {
  const firstP = frag.querySelector('p');
  if (firstP && hasKeyword(firstP.textContent, '#merge')) {
    firstP.innerHTML = firstP.innerHTML.replace(/#merge\s*/gi, '').replace(/<br\s*\/?>\s*/i, '');
    if (!firstP.textContent.trim()) firstP.remove();
  }
  const tn = frag.firstChild;
  if (tn?.nodeType === Node.TEXT_NODE && hasKeyword(tn.textContent, '#merge')) {
    tn.textContent = tn.textContent.replace(/#merge\s*/gi, '').replace(/^\s+/, '');
  }
}

function cleanThCellContent(frag) {
  frag.querySelectorAll('p').forEach((p) => {
    if (/^#(heading|row|split|merge)\b/i.test(p.textContent.trim())) {
      p.remove();
    }
  });
}

function stripThSuffixInElement(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let n = walker.nextNode();
  while (n) {
    nodes.push(n);
    n = walker.nextNode();
  }
  nodes.forEach((tn) => {
    tn.textContent = stripThSuffix(tn.textContent);
  });
}

/**
 * Column group widths from a #heading <ul> (used for data row colspans).
 */
function getColumnGroups(headingUl) {
  const groups = [];
  [...headingUl.children].forEach((li) => {
    if (li.tagName !== 'LI') return;
    if (isSplitLi(li)) {
      const ul = getDirectUl(li);
      groups.push(ul ? ul.children.length : 1);
    } else {
      groups.push(1);
    }
  });
  return groups;
}

function sumGroups(groups) {
  return groups.reduce((a, b) => a + b, 0);
}

function headingNeedsSecondRow(headingUl) {
  return [...headingUl.children].some((li) => li.tagName === 'LI' && isSplitLi(li));
}

function addSplitHeaderCells(li, tr1, tr2) {
  const p = li.querySelector(':scope > p');
  const nestedUl = getDirectUl(li);
  if (!nestedUl) return;

  const n = nestedUl.children.length;
  const titleInP = titleFromSplitParagraph(p).length > 0;

  const th1 = document.createElement('th');
  if (titleInP) {
    th1.colSpan = n;
    th1.innerHTML = p.innerHTML.replace(/#split/gi, '').trim();
  } else {
    const firstLi = nestedUl.children[0];
    th1.colSpan = n;
    if (firstLi) {
      th1.append(...unwrapLiBody(firstLi).childNodes);
    }
  }
  cleanThCellContent(th1);
  stripThSuffixInElement(th1);
  tr1.appendChild(th1);

  const subLis = [...nestedUl.children];
  if (titleInP) {
    subLis.forEach((sub) => {
      const th = document.createElement('th');
      th.append(...unwrapLiBody(sub).childNodes);
      cleanThCellContent(th);
      stripThSuffixInElement(th);
      tr2.appendChild(th);
    });
  } else if (n === 2) {
    const th = document.createElement('th');
    th.colSpan = n;
    const second = subLis[1];
    if (second) th.append(...unwrapLiBody(second).childNodes);
    cleanThCellContent(th);
    stripThSuffixInElement(th);
    tr2.appendChild(th);
  } else {
    for (let i = 1; i < n; i += 1) {
      const th = document.createElement('th');
      th.append(...unwrapLiBody(subLis[i]).childNodes);
      cleanThCellContent(th);
      stripThSuffixInElement(th);
      tr2.appendChild(th);
    }
  }
}

function buildHeadingRows(headingUl) {
  const tr1 = document.createElement('tr');
  const tr2 = document.createElement('tr');
  const secondRowNeeded = headingNeedsSecondRow(headingUl);

  [...headingUl.children].forEach((li) => {
    if (li.tagName !== 'LI') return;
    if (isSplitLi(li)) {
      addSplitHeaderCells(li, tr1, tr2);
    } else {
      const th = document.createElement('th');
      th.append(...unwrapLiBody(li).childNodes);
      cleanThCellContent(th);
      stripThSuffixInElement(th);
      if (secondRowNeeded) th.rowSpan = 2;
      tr1.appendChild(th);
    }
  });

  const rows = [tr1];
  if (tr2.childElementCount > 0) rows.push(tr2);
  else {
    tr1.querySelectorAll('th[rowspan]').forEach((th) => th.removeAttribute('rowspan'));
  }
  return rows;
}

/**
 * When #heading shares a <p> with preceding copy (e.g. "...<br>#heading"), split for parsing.
 * @returns {{ lead: HTMLParagraphElement|null, headingP: HTMLParagraphElement }}
 */
function splitPWithHeading(p) {
  const html = p.innerHTML;
  const parts = html.split(/#heading/i);
  const beforeHtml = (parts[0] ?? '').replace(/<br\s*\/?>\s*$/i, '').trim();
  const headingP = document.createElement('p');
  headingP.textContent = '#heading';
  if (!beforeHtml) return { lead: null, headingP };
  const lead = document.createElement('p');
  lead.innerHTML = beforeHtml;
  return { lead, headingP };
}

/** True when <p> has #heading plus other content (virtual split for table boundaries). */
function paragraphNeedsHeadingSplit(p) {
  if (!isHeadingMarker(p)) return false;
  const html = p.innerHTML;
  const parts = html.split(/#heading/i);
  const beforeHtml = (parts[0] ?? '').replace(/<br\s*\/?>\s*$/i, '').trim();
  return beforeHtml.length > 0;
}

/**
 * Expands mixed <p>…#heading</p> into [lead <p>, <p>#heading</p>] for linear table parsing.
 * @param {HTMLElement[]} elements
 * @returns {HTMLElement[]}
 */
function flattenHeadingParagraphs(elements) {
  const out = [];
  elements.forEach((el) => {
    if (el.tagName === 'P' && paragraphNeedsHeadingSplit(el)) {
      const { lead, headingP } = splitPWithHeading(el);
      if (lead && lead.textContent.trim()) out.push(lead);
      out.push(headingP);
    } else {
      out.push(el);
    }
  });
  return out;
}

/**
 * Fill a <td> from an <li>: each #heading among direct children starts a nested table; following
 * <p>#row</p> + <ul> pairs are that table's rows. Multiple #headings yield multiple tables.
 */
function fillTdFromLi(td, li) {
  const flattened = flattenHeadingParagraphs([...li.children]);
  if (!flattened.some((e) => isHeadingMarker(e))) {
    const frag = unwrapLiBody(li);
    removeMergeMarkerFromFragment(frag);
    td.append(frag);
    stripThSuffixInElement(td);
    if (td.textContent.trim() === '-') td.classList.add('poc-table-cell-empty');
    return;
  }

  let i = 0;
  while (i < flattened.length) {
    if (isHeadingMarker(flattened[i])) {
      /* eslint-disable-next-line no-use-before-define -- consumeTableFromElements below */
      const { table, nextI } = consumeTableFromElements(flattened, i);
      if (table) {
        table.classList.add('poc-table-table-nested');
        td.append(table);
      }
      i = nextI;
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'poc-table-cell-lead';
      while (i < flattened.length && !isHeadingMarker(flattened[i])) {
        wrap.append(flattened[i].cloneNode(true));
        i += 1;
      }
      if (wrap.childNodes.length) td.append(wrap);
    }
  }

  stripThSuffixInElement(td);
}

function buildBodyRow(ul, columnGroups) {
  const tr = document.createElement('tr');
  const lis = [...ul.children].filter((c) => c.tagName === 'LI');
  const totalCols = sumGroups(columnGroups);

  if (lis.length === 1 && liHasMerge(lis[0])) {
    const td = document.createElement('td');
    td.colSpan = totalCols || columnGroups.length || 1;
    const frag = unwrapLiBody(lis[0]);
    removeMergeMarkerFromFragment(frag);
    td.append(frag);
    stripThSuffixInElement(td);
    tr.appendChild(td);
    return tr;
  }

  lis.forEach((li, idx) => {
    const td = document.createElement('td');
    const span = columnGroups[idx] ?? 1;
    if (span > 1) td.colSpan = span;
    fillTdFromLi(td, li);
    if (td.textContent.trim() === '-') td.classList.add('poc-table-cell-empty');
    tr.appendChild(td);
  });

  return tr;
}

/**
 * One table: <p>#heading</p> + heading <ul>, then each following <p>#row</p> + <ul> until
 * the sequence stops (e.g. next #heading or non-row content).
 * @param {HTMLElement[]} els
 * @param {number} startIdx
 * @returns {{ table: HTMLTableElement|null, nextI: number }}
 */
function consumeTableFromElements(els, startIdx) {
  const el = els[startIdx];
  if (!el || el.tagName !== 'P' || !isHeadingMarker(el)) {
    return { table: null, nextI: startIdx + 1 };
  }
  const headingUl = els[startIdx + 1];
  if (!headingUl || headingUl.tagName !== 'UL') {
    return { table: null, nextI: startIdx + 1 };
  }

  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const columnGroups = getColumnGroups(headingUl);
  buildHeadingRows(headingUl).forEach((r) => thead.appendChild(r));

  let i = startIdx + 2;
  while (i < els.length) {
    const rowP = els[i];
    if (!rowP || rowP.tagName !== 'P' || !isRowMarker(rowP)) break;
    const rowUl = els[i + 1];
    if (!rowUl || rowUl.tagName !== 'UL') break;
    tbody.appendChild(buildBodyRow(rowUl, columnGroups));
    i += 2;
  }

  const table = document.createElement('table');
  table.classList.add('poc-table-table');
  if (thead.childElementCount) table.appendChild(thead);
  table.appendChild(tbody);
  return { table, nextI: i };
}

/**
 * Walk sibling elements: each #heading starts a new table; #row blocks belong only to that table.
 * @param {HTMLElement[]} flattenedEls
 * @param {(table: HTMLTableElement) => void} [onTable]
 * @returns {HTMLTableElement[]}
 */
function buildTablesFromElementList(flattenedEls, onTable) {
  const tables = [];
  let idx = 0;
  while (idx < flattenedEls.length) {
    if (isHeadingMarker(flattenedEls[idx])) {
      const { table, nextI } = consumeTableFromElements(flattenedEls, idx);
      if (table) {
        if (onTable) onTable(table);
        tables.push(table);
      }
      idx = nextI;
    } else {
      idx += 1;
    }
  }
  return tables;
}

function resolveSourceRoot(block) {
  const marker = [...block.querySelectorAll(':scope p')].find((p) => hasKeyword(p.textContent, '#heading'));
  if (marker?.parentElement) return marker.parentElement;
  return block.querySelector(':scope > div') || block;
}

/**
 * @param {HTMLElement} block
 */
export default function decorate(block) {
  const root = resolveSourceRoot(block);
  if (!root) return;

  const flattened = flattenHeadingParagraphs([...root.children]);
  const applyBlockStyles = (table) => {
    TABLE_STYLE_CLASSES.forEach((c) => {
      if (block.classList.contains(c)) table.classList.add(c);
    });
  };
  const tables = buildTablesFromElementList(flattened, applyBlockStyles);
  if (!tables.length) return;

  if (tables.length === 1) {
    moveInstrumentation(root, tables[0]);
    block.replaceChildren(tables[0]);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'poc-table-tables';
  tables.forEach((t) => wrap.append(t));
  moveInstrumentation(root, wrap);
  block.replaceChildren(wrap);
}

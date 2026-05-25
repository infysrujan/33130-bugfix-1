import {
  buildBlock,
  decorateBlock,
  loadBlock,
  toClassName,
} from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function getCellText(cell) {
  if (!cell) return '';
  const paragraphs = [...cell.querySelectorAll('p')]
    .map((p) => p.textContent.trim())
    .filter(Boolean);

  if (paragraphs.length) {
    return paragraphs.join(',');
  }

  return cell.textContent.trim();
}

function parseVariationClasses(cell) {
  const raw = getCellText(cell);
  if (!raw) return [];

  const classes = raw
    .split(',')
    .map((item) => toClassName(item.trim()))
    .filter(Boolean);

  return [...new Set(classes)];
}

function applyVariationClasses(table, styles, id) {
  if (!table) return;
  table.classList.add(...styles);
  if (id) table.setAttribute('id', id);
}

function replaceNestedTablePlaceholders(parentTable, nestedTables, cloneAll = false) {
  const usageCount = new Map();
  const walker = document.createTreeWalker(parentTable, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    if (/\{\{\s*[-\w]+\s*\}\}/.test(walker.currentNode.textContent)) {
      textNodes.push(walker.currentNode);
    }
  }

  textNodes.forEach((textNode) => {
    const text = textNode.textContent;
    const matcher = /\{\{\s*([-\w]+)\s*\}\}/g;
    let match = matcher.exec(text);

    if (!match) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    while (match) {
      const [token, nestedId] = match;
      const before = text.slice(cursor, match.index);
      if (before) fragment.append(document.createTextNode(before));

      const table = nestedTables.get(nestedId);
      if (table) {
        const used = usageCount.get(nestedId) || 0;
        // In authoring (cloneAll=true), always clone. In dev, use first instance directly
        const tableToInsert = cloneAll || used > 0 ? table.cloneNode(true) : table;
        usageCount.set(nestedId, used + 1);
        fragment.append(tableToInsert);
      } else {
        fragment.append(document.createTextNode(token));
      }

      cursor = match.index + token.length;
      match = matcher.exec(text);
    }

    const after = text.slice(cursor);
    if (after) fragment.append(document.createTextNode(after));

    textNode.replaceWith(fragment);
  });
}

function findAnchorAfterMarker(markerNode) {
  let next = markerNode.nextSibling;

  while (next) {
    if (next.nodeType === Node.TEXT_NODE) {
      if (!next.textContent.trim()) {
        next = next.nextSibling;
      } else {
        return null;
      }
    } else if (next.nodeType === Node.ELEMENT_NODE) {
      const tagName = next.tagName.toLowerCase();
      if (tagName === 'br') {
        next = next.nextSibling;
      } else if (tagName === 'a') {
        return next;
      } else {
        const nested = next.querySelector('a');
        return nested || null;
      }
    } else {
      next = next.nextSibling;
    }
  }

  return null;
}

async function transformDownloadMarkers(root) {
  const downloadBlocks = [];
  const candidates = [...root.querySelectorAll('*')];

  candidates.forEach((element) => {
    const markerNodes = [...element.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && /#download/i.test(node.textContent),
    );

    markerNodes.forEach((markerNode) => {
      const anchor = findAnchorAfterMarker(markerNode);
      if (!anchor) return;

      markerNode.textContent = markerNode.textContent.replace(/#download/gi, '');
      if (!markerNode.textContent.trim()) {
        markerNode.remove();
      }

      const previous = anchor.previousSibling;
      if (previous?.nodeType === Node.ELEMENT_NODE && previous.tagName.toLowerCase() === 'br') {
        previous.remove();
      }

      const downloadBlock = buildBlock('download-file', [[anchor.cloneNode(true)]]);
      anchor.replaceWith(downloadBlock);
      decorateBlock(downloadBlock);
      downloadBlocks.push(downloadBlock);
    });
  });

  await Promise.all(downloadBlocks.map((downloadBlock) => loadBlock(downloadBlock)));
}

function highlightDashCells(table) {
  if (!table.classList.contains('dash-cell-highlight')) return;
  table.querySelectorAll('td').forEach((td) => {
    if (td.textContent.trim() === '-') {
      td.classList.add('cell-dash');
    }
  });
}

function applyMixedBlueHeader(table) {
  if (!table.classList.contains('header-mixed-blue')) return;
  table.querySelectorAll('tr.header-row').forEach((row) => {
    const cells = [...row.querySelectorAll('td')];
    const mid = Math.ceil(cells.length / 2);
    cells.forEach((td, i) => {
      td.classList.add(i < mid ? 'mixed-blue-light' : 'mixed-blue-dark');
    });
  });
}

function markHeaderRows(table) {
  const rows = [...table.querySelectorAll('tr')];
  if (!rows.length) return;

  const firstRow = rows[0];
  const maxRowspan = [...firstRow.querySelectorAll('td')].reduce(
    (max, td) => Math.max(max, td.rowSpan || 1),
    1,
  );

  for (let i = 0; i < maxRowspan && i < rows.length; i += 1) {
    rows[i].classList.add('header-row');
  }
}

function isAuthoringInstance(block) {
  const section = block.closest('.section');
  const hasAueAttrs = [block, section]
    .filter(Boolean)
    .some((el) => [...el.attributes].some(({ name }) => name.startsWith('data-aue-')));

  return hasAueAttrs && window.self !== window.top;
}

function appendRows(targetTable, sourceTable) {
  const targetBody = targetTable.tBodies[0] || targetTable;
  const sourceRows = [...sourceTable.querySelectorAll('tr')];
  sourceRows.forEach((row) => targetBody.append(row));
}

function mergeTablesInSection(block) {
  const section = block.closest('.section');
  if (!section) return;

  const mergeCandidates = [...section.querySelectorAll('.table table.merge-tables')];
  if (mergeCandidates.length < 2) return;

  const targetTable = mergeCandidates[0];

  mergeCandidates.slice(1).forEach((sourceTable) => {
    [...sourceTable.classList].forEach((cls) => targetTable.classList.add(cls));
    appendRows(targetTable, sourceTable);
    sourceTable.closest('.table')?.remove();
  });

  markHeaderRows(targetTable);
  applyMixedBlueHeader(targetTable);
  highlightDashCells(targetTable);
}

function hasMatchingPlaceholders(table, nestedTables) {
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const match = /\{\{\s*([-\w]+)\s*\}\}/.exec(walker.currentNode.textContent);
    if (match && nestedTables.has(match[1])) return true;
  }
  return false;
}

function getSectionNestedTableMap(section) {
  const map = new Map();
  [...section.querySelectorAll('.table.block')].forEach((tableBlock) => {
    const table = tableBlock.querySelector('table');
    if (!table || !table.classList.contains('nested-table')) return;
    const { nestedId } = table.dataset;
    if (nestedId) map.set(nestedId, { table, block: tableBlock });
  });
  return map;
}

function resolveAdjacentNestedTables(block) {
  const section = block.closest('.section');
  if (!section) return;

  const authoring = isAuthoringInstance(block);
  if (!authoring) {
    if (section.dataset.adjacentNestedResolved) return;
    section.dataset.adjacentNestedResolved = 'true';
  }

  const nestedEntries = getSectionNestedTableMap(section);
  if (nestedEntries.size === 0) return;

  const tableMap = new Map([...nestedEntries.entries()].map(([id, { table }]) => [id, table]));

  [...section.querySelectorAll('.table.block')].forEach((tableBlock) => {
    const table = tableBlock.querySelector('table');
    if (!table || table.classList.contains('nested-table')) return;
    if (!hasMatchingPlaceholders(table, tableMap)) return;

    replaceNestedTablePlaceholders(table, tableMap, authoring);

    if (!authoring) {
      nestedEntries.forEach(({ block: nestedBlock }) => nestedBlock.remove());
    }
  });
}

function scheduleResolveAdjacentNestedTables(block) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      resolveAdjacentNestedTables(block);
    });
  });
}

function scheduleMergeTables(block, parentTable) {
  if (!parentTable.classList.contains('merge-tables')) return;
  if (isAuthoringInstance(block)) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      mergeTablesInSection(block);
    });
  });
}

export default async function decorate(block) {
  const rows = [...block.children];
  if (rows.length < 2) return;

  const firstRowText = rows[0]?.textContent.trim().toLowerCase();
  const tableRowIndex = rows.findIndex((row, i) => i > 0 && row.querySelector('table'));
  if (tableRowIndex === -1) return;
  const parentTable = rows[tableRowIndex].querySelector('table');

  // Row 0 always holds variation classes (and doubles as the id)
  const row0Styles = firstRowText
    .split(',').map((item) => toClassName(item.trim())).filter(Boolean);
  // When the table is not immediately at index 1, row 1 is a dedicated styles row
  const row1Styles = tableRowIndex > 1 ? parseVariationClasses(rows[1].children[0]) : [];
  const parentStyles = [...new Set([...row0Styles, ...row1Styles])];

  if (parentStyles.includes('scroll')) {
    block.classList.add('scroll');
  }

  const nestedRow = tableRowIndex > 2 ? rows[tableRowIndex - 1] : null;
  const nestedTableId = nestedRow?.children[0]?.textContent.trim() || null;

  applyVariationClasses(parentTable, parentStyles, firstRowText);
  if (nestedTableId) parentTable.dataset.nestedId = nestedTableId;

  // Non-hierarchical nested table: render normally and schedule section-level resolution
  if (parentStyles.includes('nested-table')) {
    const isAuthoring = block.hasAttribute('data-aue-resource');
    markHeaderRows(parentTable);
    applyMixedBlueHeader(parentTable);
    highlightDashCells(parentTable);
    moveInstrumentation(rows[tableRowIndex], parentTable);
    block.textContent = '';
    block.append(parentTable);
    if (isAuthoring) {
      rows.slice(tableRowIndex + 1).forEach((row) => block.append(row));
    }
    scheduleResolveAdjacentNestedTables(block);
    return;
  }

  await transformDownloadMarkers(parentTable);

  markHeaderRows(parentTable);
  applyMixedBlueHeader(parentTable);
  highlightDashCells(parentTable);

  moveInstrumentation(rows[tableRowIndex], parentTable);

  block.textContent = '';
  block.append(parentTable);

  scheduleMergeTables(block, parentTable);
  scheduleResolveAdjacentNestedTables(block);
}

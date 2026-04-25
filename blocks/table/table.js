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

function applyVariationClasses(table, styles) {
  if (!table || !styles.length) return;
  table.classList.add(...styles);
}

function getNestedTables(rows) {
  const nestedTables = new Map();

  rows.forEach((row) => {
    const cols = [...row.children];
    const nestedId = getCellText(cols[0]);
    const variationStyles = parseVariationClasses(cols[1]);
    const nestedTable = cols[2]?.querySelector('table');

    if (!nestedId || !nestedTable) return;

    applyVariationClasses(nestedTable, variationStyles);
    nestedTables.set(nestedId, nestedTable);
  });

  return nestedTables;
}

function hasUnresolvedPlaceholders(table, nestedTables) {
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const match = /\{\{\s*([-\w]+)\s*\}\}/.exec(walker.currentNode.textContent);
    if (match && !nestedTables.has(match[1])) return true;
  }
  return false;
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

  const parentStyles = parseVariationClasses(rows[0].children[0]);
  if (parentStyles.includes('scroll')) {
    block.classList.add('scroll');
  }
  const parentTable = rows[1].querySelector('table');
  if (!parentTable) return;

  applyVariationClasses(parentTable, parentStyles);

  const nestedRows = rows.slice(2);
  const isAuthoring = block.hasAttribute('data-aue-resource');

  const nestedTables = getNestedTables(nestedRows);

  if (isAuthoring) {
    // In authoring: copy nested tables to placeholders, keep nested structure outside
    replaceNestedTablePlaceholders(parentTable, nestedTables, true);
  } else {
    // In dev site: process normally like before
    if (hasUnresolvedPlaceholders(parentTable, nestedTables)) return;
    replaceNestedTablePlaceholders(parentTable, nestedTables, false);
  }

  await transformDownloadMarkers(parentTable);

  markHeaderRows(parentTable);
  applyMixedBlueHeader(parentTable);
  highlightDashCells(parentTable);

  moveInstrumentation(rows[1], parentTable);

  block.textContent = '';
  block.append(parentTable);

  // In authoring mode, preserve and display nested table rows
  if (isAuthoring && nestedRows.length > 0) {
    nestedRows.forEach((row) => {
      block.append(row);
    });
  }

  scheduleMergeTables(block, parentTable);
}

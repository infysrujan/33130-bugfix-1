import {
  buildBlock,
  decorateBlock,
  decorateIcons,
  loadBlock,
} from '../../scripts/aem.js';

const MAX_NESTED_TABLE_DEPTH = 3;
const tableDataCache = new Map();

function toInt(value, fallback = 1) {
  const parsed = parseInt(String(value || '').trim(), 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

function sanitizeClassName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^0-9a-z]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeEndpoint(endpoint) {
  if (!endpoint) return '';

  const raw = String(endpoint).trim();
  if (!raw) return '';

  const [path, query = ''] = raw.split('?');
  const isJson = /\.json$/i.test(path);
  const normalizedPath = isJson ? path : `${path}.json`;

  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

async function fetchTableData(endpoint) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  if (!normalizedEndpoint) return null;

  if (tableDataCache.has(normalizedEndpoint)) {
    return tableDataCache.get(normalizedEndpoint);
  }

  const response = await fetch(normalizedEndpoint);
  if (!response.ok) {
    throw new Error(`Failed to fetch table endpoint: ${normalizedEndpoint}`);
  }

  const data = await response.json();
  tableDataCache.set(normalizedEndpoint, data);
  return data;
}

function getBlockConfig(block) {
  const rows = [...block.children];
  const variant = rows[0]?.textContent?.trim() || 'default';
  const endpointLink = rows[1]?.querySelector('a');
  const endpoint = endpointLink?.getAttribute('href') || rows[1]?.textContent?.trim() || '';
  return { variant, endpoint };
}

function applyCellStyles(cell, rowData) {
  const styles = String(rowData.styles || '').split(',').map((style) => style.trim()).filter(Boolean);
  styles.forEach((style) => {
    cell.classList.add(`table-cell-${sanitizeClassName(style)}`);
  });

  if (rowData.cellColor) {
    const cellColor = String(rowData.cellColor).trim();
    if (cellColor) {
      cell.classList.add(`table-cell-color-${sanitizeClassName(cellColor)}`);
      cell.style.backgroundColor = cellColor;
    }
  }
}

function createTextNode(value) {
  return document.createTextNode(String(value || ''));
}

function normalizeContent(content) {
  return String(content || '')
    .replaceAll(String.fromCharCode(8), '\\b')
    .replace(/\\n/g, '\n');
}

function splitByBulletMarker(content) {
  const segments = String(content || '').split('\\b');
  if (segments.length === 1) {
    return { lead: segments[0], bullets: [] };
  }

  const [leadSegment, ...bulletSegments] = segments;
  return {
    lead: leadSegment,
    bullets: bulletSegments
      .map((item) => item.replace(/^\s+/, ''))
      .filter((item) => item.trim()),
  };
}

async function createDownloadPlaceholder(downloadLink) {
  if (!downloadLink) return createTextNode('');

  const anchor = document.createElement('a');
  anchor.href = downloadLink;
  anchor.textContent = 'Download';

  const downloadBlock = buildBlock('download-file', [[anchor]]);
  decorateBlock(downloadBlock);
  await loadBlock(downloadBlock);
  return downloadBlock;
}

async function appendInlineContent(container, text, context) {
  const tokenRegex = /(\{\{table\}\}|\{\{download\}\}|:[A-Za-z0-9_-]+:|\n)/g;
  let cursor = 0;
  let match = tokenRegex.exec(text);

  while (match) {
    if (match.index > cursor) {
      container.append(createTextNode(text.slice(cursor, match.index)));
    }

    const token = match[0];

    if (token === '\n') {
      container.append(document.createElement('br'));
    } else if (token === '{{table}}') {
      // eslint-disable-next-line no-use-before-define, no-await-in-loop
      const nestedTable = await createNestedTablePlaceholder(
        context.tableLink,
        context.depth + 1,
        context.visitedEndpoints,
      );
      if (nestedTable) {
        container.append(nestedTable);
      }
    } else if (token === '{{download}}') {
      // eslint-disable-next-line no-await-in-loop
      const downloadNode = await createDownloadPlaceholder(context.downloadLink);
      container.append(downloadNode);
    } else {
      const iconName = token.slice(1, -1).trim();
      if (iconName) {
        const icon = document.createElement('span');
        icon.className = `icon icon-${sanitizeClassName(iconName)}`;
        container.append(icon);
      }
    }

    cursor = match.index + token.length;
    match = tokenRegex.exec(text);
  }

  if (cursor < text.length) {
    container.append(createTextNode(text.slice(cursor)));
  }
}

async function renderContent(content, context) {
  const root = document.createElement('div');
  root.className = 'table-cell-content';

  const normalizedContent = normalizeContent(content);
  const { lead, bullets } = splitByBulletMarker(normalizedContent);

  if (!bullets.length) {
    await appendInlineContent(root, normalizedContent, context);
    return root;
  }

  if (lead && lead.trim()) {
    const leadParagraph = document.createElement('p');
    await appendInlineContent(leadParagraph, lead, context);
    root.append(leadParagraph);
  }

  const ul = document.createElement('ul');
  bullets.forEach(() => {
    const li = document.createElement('li');
    ul.append(li);
  });

  await Promise.all(
    bullets.map((item, idx) => appendInlineContent(ul.children[idx], item, context)),
  );
  root.append(ul);

  return root;
}

function markOccupied(occupied, row, col, rowSpan, colSpan) {
  for (let r = row; r < row + rowSpan; r += 1) {
    for (let c = col; c < col + colSpan; c += 1) {
      if (!occupied[r]) occupied[r] = [];
      occupied[r][c] = true;
    }
  }
}

function findNextFreeCell(occupied, rowCount, colCount, startIndex = 0) {
  const totalCells = rowCount * colCount;
  let index = startIndex;

  while (index < totalCells) {
    const row = Math.floor(index / colCount);
    const col = index % colCount;
    if (!occupied[row]?.[col]) {
      return { row, col, index };
    }
    index += 1;
  }

  return null;
}

async function buildTableElement(sheetData, depth = 0, visitedEndpoints = new Set()) {
  const dataRows = Array.isArray(sheetData?.data) ? sheetData.data : [];
  if (!dataRows.length) return null;

  const rowCount = toInt(dataRows[0]?.noRows, 0);
  const colCount = toInt(dataRows[0]?.noCols, 0);
  if (!rowCount || !colCount) return null;

  const table = document.createElement('table');
  table.className = 'table-block-grid';
  const tbody = document.createElement('tbody');
  table.append(tbody);

  const trList = Array.from({ length: rowCount }, () => {
    const tr = document.createElement('tr');
    tbody.append(tr);
    return tr;
  });

  const occupied = [];
  let scanIndex = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const rowData = dataRows[i];
    const next = findNextFreeCell(occupied, rowCount, colCount, scanIndex);
    if (!next) break;

    const rowSpan = toInt(rowData.rowSpan, 1);
    const colSpan = toInt(rowData.colSpan, 1);

    const td = document.createElement('td');
    if (rowSpan > 1) td.rowSpan = rowSpan;
    if (colSpan > 1) td.colSpan = colSpan;

    applyCellStyles(td, rowData);

    // eslint-disable-next-line no-await-in-loop
    const contentNode = await renderContent(rowData.content, {
      tableLink: rowData.tableLink,
      downloadLink: rowData.downloadLink,
      depth,
      visitedEndpoints,
    });
    td.append(contentNode);

    trList[next.row].append(td);
    markOccupied(occupied, next.row, next.col, rowSpan, colSpan);
    scanIndex = next.index + 1;
  }

  return table;
}

async function createNestedTablePlaceholder(tableLink, depth, visitedEndpoints) {
  if (!tableLink || depth > MAX_NESTED_TABLE_DEPTH) return null;

  const normalizedLink = normalizeEndpoint(tableLink);
  if (!normalizedLink || visitedEndpoints.has(normalizedLink)) return null;

  const nextVisited = new Set(visitedEndpoints);
  nextVisited.add(normalizedLink);

  try {
    const nestedData = await fetchTableData(normalizedLink);
    const nestedTable = await buildTableElement(nestedData, depth, nextVisited);
    if (!nestedTable) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'table-embedded';
    wrapper.append(nestedTable);
    return wrapper;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load nested table:', error);
    return null;
  }
}

export default async function decorate(block) {
  const { variant, endpoint } = getBlockConfig(block);
  const normalizedEndpoint = normalizeEndpoint(endpoint);

  block.textContent = '';
  block.classList.add(`table-variant-${sanitizeClassName(variant || 'default')}`);

  if (!normalizedEndpoint) {
    // eslint-disable-next-line no-console
    console.error('Table endpoint is missing');
    return;
  }

  try {
    const data = await fetchTableData(normalizedEndpoint);
    const visitedEndpoints = new Set([normalizedEndpoint]);
    const table = await buildTableElement(data, 0, visitedEndpoints);

    if (!table) {
      block.textContent = 'No table data available';
      return;
    }

    block.append(table);
    decorateIcons(block);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to build table block:', error);
    block.textContent = 'Unable to load table data';
  }
}

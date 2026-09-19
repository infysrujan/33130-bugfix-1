// Minimal CSV parser for the url-compare bulk input file.
// Expected columns (header row required): name, baseUrl, destinationUrl, threshold (optional)

function parseLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * @param {string} content Raw CSV file contents
 * @returns {Array<{ name: string, baseUrl: string, destUrl: string, threshold?: number }>}
 */
export function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return [];

  const header = parseLine(lines[0]).map((cell) => cell.toLowerCase());
  const nameIdx = header.indexOf('name');
  const baseIdx = header.findIndex((cell) => cell === 'baseurl' || cell === 'base');
  const destIdx = header.findIndex((cell) => cell === 'destinationurl' || cell === 'destination' || cell === 'desturl');
  const thresholdIdx = header.indexOf('threshold');

  if (baseIdx === -1 || destIdx === -1) {
    throw new Error('CSV must have "baseUrl" and "destinationUrl" columns');
  }

  return lines.slice(1).map((line, index) => {
    const cells = parseLine(line);
    const threshold = thresholdIdx !== -1 && cells[thresholdIdx] ? parseFloat(cells[thresholdIdx]) : undefined;
    return {
      name: (nameIdx !== -1 && cells[nameIdx]) || `row-${index + 1}`,
      baseUrl: cells[baseIdx],
      destUrl: cells[destIdx],
      threshold: Number.isNaN(threshold) ? undefined : threshold,
    };
  }).filter((row) => row.baseUrl && row.destUrl);
}

export default parseCsv;

// Builds a single self-contained HTML tracker report for a batch of URL comparisons.

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderViewportRow(viewport) {
  const statusClass = viewport.passed ? 'pass' : 'fail';
  const statusLabel = viewport.passed ? 'PASS' : 'FAIL';
  const diffPct = (viewport.diffRatio * 100).toFixed(2);

  return `
    <div class="viewport-block ${statusClass}">
      <div class="viewport-header">
        <span class="badge ${statusClass}">${statusLabel}</span>
        <strong>${escapeHtml(viewport.label)}</strong>
        <span>${viewport.width}&times;${viewport.height}</span>
        <span>diff: ${diffPct}% (${viewport.diffPixels}/${viewport.totalPixels}px)</span>
      </div>
      <div class="viewport-images">
        <figure>
          <figcaption>Base</figcaption>
          <img src="${escapeHtml(viewport.baseImage)}" loading="lazy" alt="Base screenshot" />
        </figure>
        <figure>
          <figcaption>Destination</figcaption>
          <img src="${escapeHtml(viewport.destImage)}" loading="lazy" alt="Destination screenshot" />
        </figure>
        <figure>
          <figcaption>Diff</figcaption>
          <img src="${escapeHtml(viewport.diffImage)}" loading="lazy" alt="Diff screenshot" />
        </figure>
      </div>
    </div>`;
}

function renderResultRow(result) {
  const statusClass = result.passed ? 'pass' : 'fail';
  const statusLabel = result.passed ? 'PASS' : 'FAIL';

  return `
  <details class="result ${statusClass}" ${result.passed ? '' : 'open'}>
    <summary>
      <span class="badge ${statusClass}">${statusLabel}</span>
      <strong>${escapeHtml(result.name)}</strong>
      <span class="urls">
        <a href="${escapeHtml(result.baseUrl)}" target="_blank" rel="noopener">base</a>
        vs
        <a href="${escapeHtml(result.destUrl)}" target="_blank" rel="noopener">destination</a>
      </span>
      <span class="threshold">threshold: ${(result.threshold * 100).toFixed(1)}%</span>
    </summary>
    ${result.viewports.map(renderViewportRow).join('\n')}
  </details>`;
}

/**
 * @param {Array<object>} results
 * @param {{ total: number, passed: number, failed: number }} summary
 */
export function buildHtmlReport(results, summary) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>URL Visual Comparison Report</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; color: #222; }
  h1 { margin-top: 0; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .summary .tile { background: #fff; border-radius: 8px; padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
  .summary .tile .count { font-size: 2rem; font-weight: bold; display: block; }
  .summary .tile.total .count { color: #333; }
  .summary .tile.passed .count { color: #1a7f37; }
  .summary .tile.failed .count { color: #cf222e; }
  .result { background: #fff; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
  .result summary { padding: 12px 16px; cursor: pointer; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; list-style: none; }
  .result summary::-webkit-details-marker { display: none; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; color: #fff; }
  .badge.pass { background: #1a7f37; }
  .badge.fail { background: #cf222e; }
  .urls { color: #555; font-size: 0.85rem; }
  .urls a { color: #0969da; }
  .threshold { margin-left: auto; color: #777; font-size: 0.8rem; }
  .viewport-block { border-top: 1px solid #eee; padding: 12px 16px; }
  .viewport-header { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; font-size: 0.85rem; color: #444; flex-wrap: wrap; }
  .viewport-images { display: flex; gap: 12px; overflow-x: auto; }
  .viewport-images figure { margin: 0; flex: 1; min-width: 200px; }
  .viewport-images figcaption { font-size: 0.75rem; color: #777; margin-bottom: 4px; }
  .viewport-images img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
</style>
</head>
<body>
  <h1>URL Visual Comparison Report</h1>
  <div class="summary">
    <div class="tile total"><span class="count">${summary.total}</span>Total</div>
    <div class="tile passed"><span class="count">${summary.passed}</span>Passed</div>
    <div class="tile failed"><span class="count">${summary.failed}</span>Failed</div>
  </div>
  ${results.map(renderResultRow).join('\n')}
</body>
</html>`;
}

export default buildHtmlReport;

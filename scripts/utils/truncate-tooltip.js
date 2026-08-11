/**
 * Utility for rendering a table cell with truncated text and a hover tooltip.
 *
 * When the bond/item name exceeds `maxLength` characters, the cell gets a
 * `data-title` attribute containing the full name (used by the CSS tooltip),
 * and the visible text is sliced to `maxLength` with an ellipsis appended.
 *
 * Usage (inside a template-literal row builder):
 *   import { truncateNameCell } from '../../scripts/utils/truncate-tooltip.js';
 *   ...
 *   ${truncateNameCell(name, 'db-td-name')}
 */

const DEFAULT_MAX_LENGTH = 80;

/**
 * Escape HTML special characters to prevent XSS in template literals.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build a `<td>` HTML string for an item name.
 *
 * - If `name.length > maxLength`: adds a `data-title` attribute with the full
 *   escaped name so the CSS `[data-title]::after` tooltip can display it, and
 *   renders the inner span with the truncated text + "…".
 * - Otherwise: renders a plain `<td>` without the tooltip attribute.
 *
 * @param {string} name        - The full (unescaped) name string.
 * @param {string} tdClass     - CSS class(es) to apply to the `<td>`.
 * @param {string} spanClass   - CSS class to apply to the inner `<span>`.
 * @param {number} [maxLength] - Character threshold; defaults to 80.
 * @returns {string} HTML string for the table cell.
 */
export default function truncateNameCell(
  name,
  tdClass = '',
  spanClass = 'db-td-name-text',
  maxLength = DEFAULT_MAX_LENGTH,
) {
  const escaped = escapeHtml(name);
  if (name.length > maxLength) {
    return `<td class="${tdClass}" data-title="${escaped}"><span class="${spanClass}">${escapeHtml(name.slice(0, maxLength))}...</span></td>`;
  }
  return `<td class="${tdClass}"><span class="${spanClass}">${escaped}</span></td>`;
}

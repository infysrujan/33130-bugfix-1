import { loadCSS } from '../../scripts/aem.js';

export default function decorate(block) {
  // Load table.css so variant classes (outline-border, border-bottom, etc.) apply
  loadCSS('/blocks/table/table.css');

  // Add .table class so table.css selectors (.table table.outline-border etc.) match
  block.classList.add('table');

  // Remove variant-text rows (e.g. "outline-border,border-bottom,...") that
  // appear as raw content when this block name is used instead of "Table".
  block.querySelectorAll(':scope > div').forEach((row) => {
    const text = row.textContent.trim();
    if (/^[\w-]+(,[\w-]+)*$/.test(text)) row.remove();
  });
}

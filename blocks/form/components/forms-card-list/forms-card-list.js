/**
 * Forms Card List Component
 *
 * Container that wraps forms-card-list-item children in a responsive CSS grid.
 * Base resourceType: core/fd/components/form/panelcontainer/v1/panelcontainer
 *
 * Children (forms-card-list-item) are already decorated before this runs.
 * This decorator solely applies the grid wrapper and panel class.
 */

/**
 * Default export — called by mappings.js when fd['fd:viewType'] === 'forms-card-list'.
 *
 * @param {HTMLElement} panel – The panel container element rendered by form.js
 * @returns {HTMLElement}
 */
export default function decorate(panel) {
  panel.classList.add('forms-card-list');

  const grid = document.createElement('div');
  grid.className = 'forms-card-list-grid';

  [...panel.children].forEach((child) => grid.appendChild(child));

  panel.appendChild(grid);
  return panel;
}

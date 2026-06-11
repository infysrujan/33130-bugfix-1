/**
 * Creates an HTML element with optional className, textContent, and attributes.
 *
 * @param {string} tag
 * @param {object} [opts]
 * @param {string} [opts.className]
 * @param {string} [opts.text]
 * @param {Record<string,string>} [opts.attrs]
 * @returns {HTMLElement}
 */
export default function createTaggedElement(tag, { className, text, attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

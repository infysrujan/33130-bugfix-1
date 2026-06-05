/**
 * Creates a DOM element with optional className, text content, and HTML attributes.
 * @param {string} tag - HTML tag name
 * @param {object} [options]
 * @param {string} [options.className]
 * @param {string} [options.text]
 * @param {object} [options.attrs]
 * @returns {HTMLElement}
 */
export default function createTaggedElement(tag, { className, text, attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

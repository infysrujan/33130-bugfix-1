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

/**
 * Checks whether auto-blocking/decoration should skip managing a given attribute
 * on an element. Elements opt out by listing attribute names in
 * `data-skip-attr-auto-blocking` (comma-separated), e.g. "title" or "title,href".
 * @param {Element} el element to check
 * @param {string} attr attribute name auto-blocking is about to set
 * @returns {boolean}
 */
export function isAutoBlockingAttrSkipped(el, attr) {
  const skipList = el.getAttribute('data-skip-attr-auto-blocking');
  if (!skipList) return false;
  return skipList.split(',').map((a) => a.trim()).includes(attr);
}

/**
 * Adds an attribute name to an element's `data-skip-attr-auto-blocking` list,
 * merging with any existing entries instead of overwriting them.
 * @param {Element} el element to update
 * @param {string} attr attribute name to skip during auto-blocking
 */
export function addAutoBlockingExclusion(el, attr) {
  const existing = el.getAttribute('data-skip-attr-auto-blocking');
  const list = existing ? existing.split(',').map((a) => a.trim()).filter(Boolean) : [];
  if (!list.includes(attr)) list.push(attr);
  el.setAttribute('data-skip-attr-auto-blocking', list.join(','));
}

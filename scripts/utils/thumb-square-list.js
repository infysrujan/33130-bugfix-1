/**
 * Builds a ul.list-thumb-square compatible with menu-banner styles.
 *
 * Each item can be a button (JS action) or an anchor (navigation link).
 *
 * @param {Array<{
 *   iconEl?: Element,
 *   label: string,
 *   href?: string,
 *   dataset?: Record<string, string>
 * }>} items
 * @param {Document} doc
 * @returns {HTMLUListElement}
 */
export default function buildThumbSquareList(items, doc) {
  const ul = doc.createElement('ul');
  ul.className = 'list-thumb-square';

  items.forEach(({
    iconEl, label, href, dataset = {},
  }) => {
    const li = doc.createElement('li');

    const inner = doc.createElement(href ? 'a' : 'button');
    inner.className = 'thumb-square';
    if (href) {
      inner.href = href;
    } else {
      inner.type = 'button';
    }

    Object.entries(dataset).forEach(([key, val]) => {
      inner.dataset[key] = val;
    });

    if (iconEl) {
      const visualImg = doc.createElement('span');
      visualImg.className = 'visual-img';
      visualImg.appendChild(iconEl.cloneNode(true));
      inner.appendChild(visualImg);
    }

    const labelEl = doc.createElement('span');
    labelEl.className = 'sub-title-small';
    labelEl.textContent = label;
    inner.appendChild(labelEl);

    li.appendChild(inner);
    ul.appendChild(li);
  });

  return ul;
}

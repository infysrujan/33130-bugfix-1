/**
 * Forms Menu Card Component
 *
 * A display-only component (fieldType: "plain-text", fd:viewType: "forms-menu-card")
 * that renders a responsive grid of feature-highlight cards inside an Adaptive Form.
 *
 * Authored data (stored in fd.properties):
 *   cardIcons        : string[]  – Asset paths to card icons, one per row
 *   cardTitles       : string[]  – Bold heading for each card
 *   cardDescriptions : string[]  – Description per card (supports inline HTML / richtext)
 *
 * All three arrays are parallel and order-matched. Missing icons render without an icon slot.
 */

/**
 * Parses a multi-value field into a clean string array.
 * Universal Editor stores multi-value fields as arrays; doc-based stores as newline strings.
 *
 * @param {string|string[]} value
 * @returns {string[]}
 */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value).split('\n').map((v) => v.trim()).filter(Boolean);
}

/**
 * Resolves a property value from the fd object, checking multiple storage locations:
 * 1. fd.properties[key]               – nested (standard AEM Forms runtime)
 * 2. fd.properties['properties.key']  – dot-notation key preserved inside properties
 * 3. fd['properties.key']             – flat dot-notation directly on fd
 * 4. fd[key]                          – directly on fd (doc-based payloads)
 *
 * @param {Object} fd
 * @param {string} key
 * @returns {*}
 */
function getProp(fd, key) {
  const nested = fd.properties?.[key];
  if (nested !== undefined && nested !== null && nested !== '') return nested;
  const nestedDot = fd.properties?.[`properties.${key}`];
  if (nestedDot !== undefined && nestedDot !== null && nestedDot !== '') return nestedDot;
  const flat = fd[`properties.${key}`];
  if (flat !== undefined && flat !== null && flat !== '') return flat;
  return fd[key];
}

/**
 * Builds the icon element. Supports:
 * - Image assets (.png, .jpg, .gif, .webp, .svg used as <img>)
 * - Inline SVG strings (starts with '<svg')
 * Returns null when no icon path is provided.
 *
 * @param {string} iconPath
 * @param {string} altText
 * @returns {HTMLElement|null}
 */
function buildIconElement(iconPath, altText) {
  if (!iconPath) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'forms-menu-card-icon';
  wrapper.setAttribute('aria-hidden', 'true');

  const trimmed = iconPath.trim();
  if (trimmed.startsWith('<svg')) {
    wrapper.innerHTML = trimmed;
  } else {
    const img = document.createElement('img');
    img.src = trimmed;
    img.alt = altText || '';
    img.loading = 'lazy';
    img.width = 48;
    img.height = 48;
    wrapper.appendChild(img);
  }

  return wrapper;
}

/**
 * Builds a single feature card element.
 *
 * @param {string} iconPath
 * @param {string} title
 * @param {string} description  – may contain inline HTML from richtext
 * @param {number} index        – used for aria-label fallback
 * @returns {HTMLElement}
 */
function buildCard(iconPath, title, description, index) {
  const card = document.createElement('div');
  card.className = 'forms-menu-card-item';
  card.setAttribute('aria-label', title || `Card ${index + 1}`);

  const iconEl = buildIconElement(iconPath, title);
  if (iconEl) card.appendChild(iconEl);

  if (title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'forms-menu-card-title';
    titleEl.textContent = title;
    card.appendChild(titleEl);
  }

  const divider = document.createElement('hr');
  divider.className = 'forms-menu-card-divider';
  card.appendChild(divider);

  if (description) {
    const descEl = document.createElement('div');
    descEl.className = 'forms-menu-card-description';
    descEl.innerHTML = description;
    card.appendChild(descEl);
  }

  return card;
}

/**
 * Default export — called by mappings.js when fd['fd:viewType'] === 'forms-menu-card'.
 *
 * @param {HTMLElement} fieldDiv – The .field-wrapper element rendered by form.js
 * @param {Object}      fd       – The field definition / JSON model from AEM Forms
 * @returns {HTMLElement}
 */
export default function decorate(fieldDiv, fd) {
  const icons = toArray(getProp(fd, 'cardIcons'));
  const titles = toArray(getProp(fd, 'cardTitles'));
  const descriptions = toArray(getProp(fd, 'cardDescriptions'));

  const cardCount = Math.max(icons.length, titles.length, descriptions.length);
  if (cardCount === 0) return fieldDiv;

  const grid = document.createElement('div');
  grid.className = 'forms-menu-card-grid';

  for (let i = 0; i < cardCount; i += 1) {
    grid.appendChild(buildCard(icons[i] || '', titles[i] || '', descriptions[i] || '', i));
  }

  fieldDiv.innerHTML = '';
  fieldDiv.classList.add('field-forms-menu-card');
  fieldDiv.appendChild(grid);

  return fieldDiv;
}

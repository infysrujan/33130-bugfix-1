/**
 * Forms Card List Item Component
 *
 * Renders a single feature-highlight card inside a forms-card-list container.
 * Base resourceType: core/fd/components/form/image/v1/image (display-only, no form data)
 *
 * Authored fields (fd.properties):
 *   icon            : string  – DAM asset path to card icon
 *   iconAlt         : string  – Alt text for the icon image
 *   title           : string  – Bold card heading (standard AEM Forms title field)
 *   cardDescription : string  – Body text below the divider (supports inline HTML)
 */

/**
 * Resolves a property from the fd object, checking all storage locations
 * produced by the properties.* naming convention in the component model.
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
 * Builds the icon wrapper. Supports DAM asset paths and inline SVG strings.
 * Returns null when no icon is provided.
 *
 * @param {string} iconPath
 * @param {string} altText
 * @returns {HTMLElement|null}
 */
function buildIconElement(iconPath, altText) {
  if (!iconPath) return null;

  const wrapper = document.createElement('div');
  wrapper.className = 'forms-card-list-icon';
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
 * Default export — called by mappings.js when fd['fd:viewType'] === 'forms-card-list-item'.
 *
 * @param {HTMLElement} fieldDiv – The .field-wrapper element rendered by form.js
 * @param {Object}      fd       – The field definition from AEM Forms
 * @returns {HTMLElement}
 */
export default function decorate(fieldDiv, fd) {
  fieldDiv.classList.add('field-forms-card-list-item');

  const iconPath = getProp(fd, 'icon');
  const iconAlt = getProp(fd, 'iconAlt') || fd.title || '';
  const title = fd.title || '';
  const description = getProp(fd, 'cardDescription') || '';

  const card = document.createElement('div');
  card.className = 'forms-card-list-card';
  card.setAttribute('aria-label', title || 'Card');

  const iconEl = buildIconElement(iconPath, iconAlt);
  if (iconEl) card.appendChild(iconEl);

  if (title) {
    const titleEl = document.createElement('h3');
    titleEl.className = 'forms-card-list-title';
    titleEl.textContent = title;
    card.appendChild(titleEl);
  }

  const divider = document.createElement('hr');
  divider.className = 'forms-card-list-divider';
  card.appendChild(divider);

  if (description) {
    const descEl = document.createElement('div');
    descEl.className = 'forms-card-list-description';
    descEl.innerHTML = description;
    card.appendChild(descEl);
  }

  fieldDiv.innerHTML = '';
  fieldDiv.appendChild(card);

  return fieldDiv;
}

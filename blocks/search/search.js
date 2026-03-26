/**
 * Decorates the Search block.
 * Creates a search link with an icon for the header navigation.
 * @param {Element} block The search block element
 */
export default function decorate(block) {
  const pathname = window.location.pathname.toLowerCase();
  if (pathname.endsWith('/search') || pathname === '/search') {
    block.textContent = '';
    block.style.display = 'none';
    return;
  }

  const rows = [...block.children];
  if (rows.length === 0) return;

  // Extract the search link from the first row
  const anchor = block.querySelector('a');
  const searchUrl = anchor?.href || '#';

  // Extract aria label from the second row or use default
  let ariaLabel = 'Search';
  if (rows.length > 1) {
    const ariaLabelCell = rows[1]?.querySelector('p');
    ariaLabel = ariaLabelCell?.textContent?.trim() || ariaLabel;
  }

  // Clear the block content
  block.textContent = '';

  // Create the search wrapper
  const searchWrapper = document.createElement('div');
  searchWrapper.className = 'search-wrapper';

  // Create the search link
  const searchLink = document.createElement('a');
  searchLink.href = searchUrl;
  searchLink.classList.add('search-link', 'icon-search');
  searchLink.setAttribute('aria-label', ariaLabel);
  searchLink.setAttribute('title', ariaLabel);

  const searchPlaceholder = document.createElement('span');
  searchPlaceholder.className = 'search-placeholder';
  searchPlaceholder.setAttribute('aria-hidden', 'true');
  searchPlaceholder.textContent = 'Search';
  searchLink.appendChild(searchPlaceholder);

  searchWrapper.appendChild(searchLink);
  block.appendChild(searchWrapper);
}

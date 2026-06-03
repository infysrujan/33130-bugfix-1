import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// Breakpoint matching design system tokens (760px tablet, 1024px desktop)
const DESKTOP_BREAKPOINT = 1024;

/**
 * Builds the footer structure from EDS content
 * Creates both mobile (accordion) and desktop (multi-column) layouts
 * @param {Element} block The footer block element
 */
function buildFooterStructure(block) {
  // Find the main content wrapper
  const contentWrapper = block.querySelector('.default-content-wrapper');
  if (!contentWrapper) return;

  // Get the main list (contains all footer sections)
  const mainList = contentWrapper.querySelector('ul');
  if (!mainList) return;

  // Create footer container
  const footerContainer = document.createElement('div');
  footerContainer.className = 'footer-container';

  // Create inner container for max-width constraint
  const innerContainer = document.createElement('div');
  innerContainer.className = 'footer-inner content';

  // Create row for columns
  const row = document.createElement('div');
  row.className = 'footer-row';

  // Process each section (Personal, Business, etc.)
  const sections = Array.from(mainList.children);
  sections.forEach((section) => {
    const sectionList = section.querySelector('ul');
    if (!sectionList) return;

    // Get section title
    const titleElement = section.querySelector('strong');
    if (!titleElement) return;
    const title = titleElement.textContent.trim();

    // Create column wrapper
    const column = document.createElement('div');
    column.className = 'footer-column';

    // Create group-link wrapper (for accordion functionality)
    const groupLink = document.createElement('div');
    groupLink.className = 'footer-group';

    // Create title header
    const header = document.createElement('h3');
    header.className = 'footer-title';
    header.textContent = title;

    // Create toggle icon for mobile
    const icon = document.createElement('span');
    icon.className = 'footer-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    header.appendChild(icon);

    // Create links container
    const linksContainer = document.createElement('div');
    linksContainer.className = 'footer-links';

    // Copy the links
    const linksList = document.createElement('ul');
    const links = Array.from(sectionList.querySelectorAll('li'));
    links.forEach((link) => {
      const newLi = link.cloneNode(true);
      linksList.appendChild(newLi);
    });
    linksContainer.appendChild(linksList);

    // Assemble the structure
    groupLink.appendChild(header);
    groupLink.appendChild(linksContainer);
    column.appendChild(groupLink);
    row.appendChild(column);
  });

  innerContainer.appendChild(row);
  footerContainer.appendChild(innerContainer);

  // Create bottom bar (copyright, legal links)
  const bottomBar = document.createElement('div');
  bottomBar.className = 'footer-bottom';

  const bottomInner = document.createElement('div');
  bottomInner.className = 'footer-inner content';

  // Get copyright and legal links (the <p> elements after the main <ul>)
  // Filter out paragraphs that contain <strong> tags (those are section titles)
  const paragraphs = Array.from(contentWrapper.querySelectorAll('p'));
  paragraphs.forEach((p) => {
    // Skip paragraphs that contain <strong> tags (section titles)
    if (p.querySelector('strong')) return;

    const newP = p.cloneNode(true);
    bottomInner.appendChild(newP);
  });

  bottomBar.appendChild(bottomInner);
  footerContainer.appendChild(bottomBar);

  // Replace content
  contentWrapper.innerHTML = '';
  contentWrapper.appendChild(footerContainer);
}

/**
 * Adds accordion functionality for mobile/tablet
 */
function setupAccordion(block) {
  const headers = block.querySelectorAll('.footer-title');

  headers.forEach((header) => {
    header.addEventListener('click', () => {
      // Only work on mobile/tablet (< 1024px)
      if (window.innerWidth >= DESKTOP_BREAKPOINT) return;

      const parent = header.closest('.footer-group');
      const isActive = parent.classList.contains('active');

      // Close all other sections (single-expansion pattern)
      const allGroups = block.querySelectorAll('.footer-group');
      allGroups.forEach((group) => {
        group.classList.remove('active');
      });

      // Toggle current section
      if (!isActive) {
        parent.classList.add('active');
      }
    });
  });
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  block.append(footer);

  // Build the footer structure
  buildFooterStructure(block);

  // Setup accordion for mobile
  setupAccordion(block);
}

import {
  activateTab,
  enableMouseDragScroll,
  createBaseButton,
  moveCellContent,
  createTabsNavWrapper,
  createCarouselArrows,
  createContentPanels,
  loadNestedBlocks,
  addKeyboardNavigation,
} from '../helpers/tabs-utils.js';

export default async function decorate(block) {
  block.classList.add('icon-tab-carousel');
  const rows = [...block.children];
  const [imageRow, tabButtonRow, ...contentRows] = rows;

  const iconImages = imageRow ? [...imageRow.children].map((cell) => cell.querySelector('img')) : [];
  if (imageRow) imageRow.remove();

  const { tabsNavWrapper, tabsNav } = createTabsNavWrapper();
  enableMouseDragScroll(tabsNav);

  const tabButtons = [...tabButtonRow.children].map((cell, index) => {
    const button = createBaseButton(cell, index);
    if (iconImages[index]) button.appendChild(iconImages[index]);
    moveCellContent(cell, button);
    // Wrap the label (everything except the icon) in a span so it can wrap/break
    // independently of the icon and doesn't run behind the carousel arrows.
    const label = document.createElement('span');
    label.className = 'tabs-nav-label';
    [...button.childNodes].forEach((node) => {
      if (node.nodeName !== 'IMG') label.appendChild(node);
    });
    if (label.childNodes.length) button.appendChild(label);
    tabsNav.appendChild(button);
    button.addEventListener('click', () => activateTab(block, index));
    return button;
  });

  createCarouselArrows(tabsNav, tabsNavWrapper);
  block.appendChild(tabsNavWrapper);
  tabButtonRow.remove();

  const { tabsContent, panels } = createContentPanels(block, contentRows);
  await loadNestedBlocks(panels);
  block.appendChild(tabsContent);

  activateTab(block, 0);
  addKeyboardNavigation(tabsNav, tabButtons, block);
}

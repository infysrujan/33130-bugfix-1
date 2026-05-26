import {
  activateTab,
  createBaseButton,
  moveCellContent,
  createTabsNavWrapper,
  createContentPanels,
  loadNestedBlocks,
  addKeyboardNavigation,
} from '../helpers/tabs-utils.js';

export default async function decorate(block) {
  block.classList.add('tiled-tab');
  const rows = [...block.children];
  const [tabButtonRow, ...contentRows] = rows;

  const { tabsNavWrapper, tabsNav } = createTabsNavWrapper();

  const tabButtons = [...tabButtonRow.children].map((cell, index) => {
    const button = createBaseButton(cell, index);
    moveCellContent(cell, button);
    tabsNav.appendChild(button);
    button.addEventListener('click', () => activateTab(block, index));
    return button;
  });

  block.appendChild(tabsNavWrapper);
  tabButtonRow.remove();

  const { tabsContent, panels } = createContentPanels(block, contentRows);
  await loadNestedBlocks(panels);
  block.appendChild(tabsContent);

  activateTab(block, 0);
  addKeyboardNavigation(tabsNav, tabButtons, block);
}

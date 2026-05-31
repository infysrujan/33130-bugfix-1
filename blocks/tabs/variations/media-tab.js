import { moveInstrumentation } from '../../../scripts/scripts.js';
import {
  activateTab,
  createBaseButton,
  moveCellContent,
  createTabsNavWrapper,
  createDropdown,
  createContentPanels,
  loadNestedBlocks,
  addKeyboardNavigation,
} from '../helpers/tabs-utils.js';

export default async function decorate(block) {
  block.classList.add('media-tab');
  const rows = [...block.children];
  const [imageRow, tabButtonRow, ...contentRows] = rows;

  if (imageRow) {
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'tabs-images';

    [...imageRow.children].forEach((cell) => {
      const imageItem = document.createElement('div');
      moveInstrumentation(cell, imageItem);
      imageItem.appendChild(cell.firstElementChild);
      imagesContainer.appendChild(imageItem);
    });

    block.appendChild(imagesContainer);
    imageRow.remove();
  }

  const { tabsNavWrapper, tabsNav } = createTabsNavWrapper();
  const { tabsDropdown, select } = createDropdown();

  const tabButtons = [...tabButtonRow.children].map((cell, index) => {
    const button = createBaseButton(cell, index);
    moveCellContent(cell, button);
    tabsNav.appendChild(button);

    const option = document.createElement('option');
    option.value = index;
    option.textContent = button.textContent.trim();
    if (index === 0) option.selected = true;
    select.appendChild(option);

    button.addEventListener('click', () => activateTab(block, index));
    return button;
  });

  select.addEventListener('change', (e) => activateTab(block, parseInt(e.target.value, 10)));
  tabsNavWrapper.insertBefore(tabsDropdown, tabsNav);
  block.appendChild(tabsNavWrapper);
  tabButtonRow.remove();

  const { tabsContent, panels } = createContentPanels(block, contentRows);
  await loadNestedBlocks(panels);
  block.appendChild(tabsContent);

  activateTab(block, 0);
  addKeyboardNavigation(tabsNav, tabButtons, block);
}

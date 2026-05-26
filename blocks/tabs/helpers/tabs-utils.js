import { loadBlock, decorateBlock } from '../../../scripts/aem.js';
import { moveInstrumentation } from '../../../scripts/scripts.js';

export function activateTab(tabsContainer, targetIndex) {
  const isMediaTab = tabsContainer.classList.contains('media-tab');

  if (isMediaTab) {
    const imageItems = tabsContainer.querySelectorAll('.tabs-images > div');
    imageItems.forEach((item, index) => {
      item.classList.toggle('active', index === targetIndex);
    });
  }

  const tabButtons = tabsContainer.querySelectorAll('.tabs-nav button');
  tabButtons.forEach((button, index) => {
    button.classList.toggle('active', index === targetIndex);
    button.setAttribute('aria-selected', index === targetIndex ? 'true' : 'false');
  });

  const contentPanels = tabsContainer.querySelectorAll('.tabs-content > div');
  contentPanels.forEach((panel, index) => {
    panel.classList.toggle('active', index === targetIndex);
    panel.setAttribute('aria-hidden', index === targetIndex ? 'false' : 'true');
  });

  const dropdown = tabsContainer.querySelector('.tabs-dropdown select');
  if (dropdown) dropdown.selectedIndex = targetIndex;
}

export function enableMouseDragScroll(scroller) {
  let startX = 0;
  let startScrollLeft = 0;
  let pending = false;
  const DRAG_THRESHOLD = 5;

  const stopDragging = (e) => {
    pending = false;
    if (!scroller.classList.contains('is-dragging')) return;
    scroller.classList.remove('is-dragging');
    scroller.releasePointerCapture(e.pointerId);
  };

  scroller.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || scroller.scrollWidth <= scroller.clientWidth) return;
    startX = e.clientX;
    startScrollLeft = scroller.scrollLeft;
    pending = true;
  });

  scroller.addEventListener('pointermove', (e) => {
    if (!pending && !scroller.classList.contains('is-dragging')) return;
    if (pending && Math.abs(e.clientX - startX) > DRAG_THRESHOLD) {
      pending = false;
      scroller.classList.add('is-dragging');
      scroller.setPointerCapture(e.pointerId);
    }
    if (!scroller.classList.contains('is-dragging')) return;
    e.preventDefault();
    scroller.scrollLeft = startScrollLeft - (e.clientX - startX);
  });

  scroller.addEventListener('pointerup', stopDragging);
  scroller.addEventListener('pointercancel', stopDragging);
}

export function createBaseButton(cell, index) {
  const button = document.createElement('button');
  moveInstrumentation(cell, button);
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
  button.setAttribute('aria-controls', `tab-panel-${index}`);
  button.id = `tab-${index}`;
  const variantAttr = cell.dataset.variant;
  if (variantAttr) button.setAttribute('data-tab-variant', variantAttr);
  return button;
}

export function moveCellContent(cell, target) {
  const wrapper = cell.querySelector('div, p');
  const cellContent = wrapper || cell;
  while (cellContent.firstChild) {
    target.appendChild(cellContent.firstChild);
  }
}

export function createTabsNavWrapper() {
  const tabsNavWrapper = document.createElement('div');
  tabsNavWrapper.className = 'tabs-nav-wrapper';
  const tabsNav = document.createElement('div');
  tabsNav.className = 'tabs-nav';
  tabsNav.setAttribute('role', 'tablist');
  tabsNavWrapper.appendChild(tabsNav);
  return { tabsNavWrapper, tabsNav };
}

export function createDropdown() {
  const tabsDropdown = document.createElement('div');
  tabsDropdown.className = 'tabs-dropdown';
  const select = document.createElement('select');
  select.setAttribute('name', 'tab-selector');
  select.setAttribute('aria-label', 'Select tab');
  tabsDropdown.appendChild(select);
  return { tabsDropdown, select };
}

export function createCarouselArrows(tabsNav, tabsNavWrapper) {
  const prevBtn = document.createElement('button');
  prevBtn.className = 'tabs-nav-prev icon-arrow-left';
  prevBtn.setAttribute('aria-label', 'Previous tabs');

  const nextBtn = document.createElement('button');
  nextBtn.className = 'tabs-nav-next icon-arrow-left';
  nextBtn.setAttribute('aria-label', 'Next tabs');

  const updateArrows = () => {
    const { scrollLeft, scrollWidth, clientWidth } = tabsNav;
    prevBtn.classList.toggle('hidden', scrollLeft <= 0);
    nextBtn.classList.toggle('hidden', scrollLeft + clientWidth >= scrollWidth - 1);
  };

  prevBtn.addEventListener('click', () => {
    tabsNav.scrollBy({ left: -(tabsNav.clientWidth / 2), behavior: 'smooth' });
  });

  nextBtn.addEventListener('click', () => {
    tabsNav.scrollBy({ left: tabsNav.clientWidth / 2, behavior: 'smooth' });
  });

  tabsNav.addEventListener('scroll', updateArrows);
  tabsNavWrapper.insertBefore(prevBtn, tabsNav);
  tabsNavWrapper.appendChild(nextBtn);
  requestAnimationFrame(updateArrows);
}

export function createContentPanels(block, contentRows) {
  const tabsContent = document.createElement('div');
  tabsContent.className = 'tabs-content';

  const panels = contentRows.map((row, index) => {
    const contentPanel = document.createElement('div');
    contentPanel.className = 'tab-panel';
    moveInstrumentation(row, contentPanel);
    contentPanel.setAttribute('role', 'tabpanel');
    contentPanel.setAttribute('aria-labelledby', `tab-${index}`);
    contentPanel.id = `tab-panel-${index}`;
    contentPanel.setAttribute('aria-hidden', index === 0 ? 'false' : 'true');

    const cell = row.children[0];
    while (cell.firstChild) {
      contentPanel.appendChild(cell.firstChild);
    }

    tabsContent.appendChild(contentPanel);
    row.remove();
    return contentPanel;
  });

  return { tabsContent, panels };
}

export async function loadNestedBlocks(panels) {
  await Promise.all(panels.map(async (contentPanel) => {
    const allDivs = contentPanel.querySelectorAll('div[class]');
    const blocksToLoad = [...allDivs].filter((el) => {
      if (el.classList.length !== 1) return false;
      if (el.dataset.blockStatus) return false;
      const className = el.classList[0];
      if (className.startsWith('tab-') || className.startsWith('tabs-')) return false;
      return true;
    });

    blocksToLoad.forEach((nestedBlock) => decorateBlock(nestedBlock));
    await Promise.all(blocksToLoad.map((nestedBlock) => loadBlock(nestedBlock)));
  }));
}

export function addKeyboardNavigation(tabsNav, tabButtons, block) {
  tabsNav.addEventListener('keydown', (e) => {
    const currentIndex = tabButtons.findIndex((btn) => btn === document.activeElement);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      newIndex = currentIndex > 0 ? currentIndex - 1 : tabButtons.length - 1;
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      newIndex = currentIndex < tabButtons.length - 1 ? currentIndex + 1 : 0;
    } else if (e.key === 'Home') {
      e.preventDefault();
      newIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      newIndex = tabButtons.length - 1;
    }

    if (newIndex !== currentIndex) {
      tabButtons[newIndex].focus();
      activateTab(block, newIndex);
    }
  });
}

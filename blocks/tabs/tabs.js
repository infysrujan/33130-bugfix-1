import { loadBlock, decorateBlock } from '../../scripts/aem.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

function activateTab(tabsContainer, targetIndex) {
  const isMediaTab = tabsContainer.classList.contains('media-tab');

  // Handle image carousel for media tabs
  if (isMediaTab) {
    const imageItems = tabsContainer.querySelectorAll('.tabs-images > div');
    imageItems.forEach((item, index) => {
      if (index === targetIndex) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Handle tab buttons
  const tabButtons = tabsContainer.querySelectorAll('.tabs-nav button');
  tabButtons.forEach((button, index) => {
    if (index === targetIndex) {
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
    } else {
      button.classList.remove('active');
      button.setAttribute('aria-selected', 'false');
    }
  });

  // Handle content panels
  const contentPanels = tabsContainer.querySelectorAll('.tabs-content > div');
  contentPanels.forEach((panel, index) => {
    if (index === targetIndex) {
      panel.classList.add('active');
      panel.setAttribute('aria-hidden', 'false');
    } else {
      panel.classList.remove('active');
      panel.setAttribute('aria-hidden', 'true');
    }
  });

  // Update dropdown
  const dropdown = tabsContainer.querySelector('.tabs-dropdown select');
  if (dropdown) {
    dropdown.selectedIndex = targetIndex;
  }
}

function enableMouseDragScroll(scroller) {
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

export default async function decorate(block) {
  const rows = [...block.children];

  // Detect variant from first row's first cell data attribute (set by tabs-helper)
  const firstRow = rows[0];
  const firstCellVariant = firstRow?.children[0]?.dataset.variant;
  const isCarouselVariant = firstCellVariant === 'simple-tab-carousel'
    || firstCellVariant === 'icon-tab-carousel';

  // Detect variant: check if first row has image-only cells (skip for carousel variants)
  const isMediaTab = !isCarouselVariant && [...firstRow.children].every((cell) => {
    const img = cell.querySelector('img');
    if (!img) return false;
    // Clone cell and remove image to check for additional content
    const cellClone = cell.cloneNode(true);
    const imgClone = cellClone.querySelector('img');
    if (imgClone) imgClone.remove();
    // Media tab cells should have no text content beyond the image
    const remainingText = cellClone.textContent.trim();
    return remainingText === '';
  });

  let tabButtonRow;
  let contentRows;
  let imageRow;

  if (isMediaTab || firstCellVariant === 'icon-tab-carousel') {
    // Media Tab: row 0 = images, row 1 = buttons, row 2+ = content
    [imageRow, tabButtonRow] = rows;
    contentRows = rows.slice(2);
  } else {
    // Simple/Tiled Tab: row 0 = buttons, row 1+ = content
    [tabButtonRow] = rows;
    contentRows = rows.slice(1);
  }

  // Add variant class based on actual button row
  if (isMediaTab) {
    block.classList.add('media-tab');
  } else if (isCarouselVariant) {
    block.classList.add(firstCellVariant);
  } else {
    // Check if first button cell has tiled-tab or simple-tab variant
    const firstButtonCell = tabButtonRow?.children[0];
    const variantAttr = firstButtonCell?.dataset.variant;
    if (variantAttr === 'tiled-tab') {
      block.classList.add('tiled-tab');
    } else {
      block.classList.add('simple-tab');
    }
  }

  // Create image carousel for media tabs
  if (isMediaTab && imageRow) {
    const imagesContainer = document.createElement('div');
    imagesContainer.className = 'tabs-images';

    [...imageRow.children].forEach((cell) => {
      const imageItem = document.createElement('div');
      moveInstrumentation(cell, imageItem);
      imageItem.appendChild(cell.firstElementChild); // Move img element
      imagesContainer.appendChild(imageItem);
    });

    block.appendChild(imagesContainer);
    imageRow.remove();
  }

  // Extract icons from image row for icon-tab-carousel (icons go into button cells)
  let iconCarouselImages = [];
  if (firstCellVariant === 'icon-tab-carousel' && imageRow) {
    iconCarouselImages = [...imageRow.children].map((cell) => cell.querySelector('img'));
    imageRow.remove();
  }

  // Create tabs navigation and dropdown container
  const tabsNavWrapper = document.createElement('div');
  tabsNavWrapper.className = 'tabs-nav-wrapper';

  // Create tabs navigation
  const tabsNav = document.createElement('div');
  tabsNav.className = 'tabs-nav';
  tabsNav.setAttribute('role', 'tablist');

  // Create dropdown for mobile (not needed for tiled-tab or carousel variants)
  const isTiledTab = block.classList.contains('tiled-tab') || isCarouselVariant;
  let tabsDropdown;
  let select;

  if (!isTiledTab) {
    tabsDropdown = document.createElement('div');
    tabsDropdown.className = 'tabs-dropdown';
    select = document.createElement('select');
    select.setAttribute('name', 'tab-selector');
    select.setAttribute('aria-label', 'Select tab');
  }

  const tabButtons = [...tabButtonRow.children].map((cell, index) => {
    // Create button for desktop
    const button = document.createElement('button');
    moveInstrumentation(cell, button);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    button.setAttribute('aria-controls', `tab-panel-${index}`);
    button.id = `tab-${index}`;

    // Get variant from cell's data attribute (set by tabs-helper)
    const variantAttr = cell.dataset.variant;
    if (variantAttr) {
      button.setAttribute('data-tab-variant', variantAttr);
    }

    // For icon-tab-carousel, prepend icon image into the button
    if (firstCellVariant === 'icon-tab-carousel' && iconCarouselImages[index]) {
      button.appendChild(iconCarouselImages[index]);
    }

    // Move content from cell to button (unwrap from wrapper divs if needed)
    const wrapper = cell.querySelector('div, p');
    const cellContent = wrapper || cell;
    while (cellContent.firstChild) {
      button.appendChild(cellContent.firstChild);
    }

    tabsNav.appendChild(button);

    // Create option for dropdown (skip for tiled-tab and carousel variants)
    if (!isTiledTab) {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = button.textContent.trim();
      if (index === 0) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    // Add click handler
    button.addEventListener('click', () => {
      activateTab(block, index);
    });

    return button;
  });

  // Append dropdown only if not tiled-tab or carousel
  if (!isTiledTab) {
    tabsDropdown.appendChild(select);

    // Dropdown change handler
    select.addEventListener('change', (e) => {
      activateTab(block, parseInt(e.target.value, 10));
    });

    tabsNavWrapper.appendChild(tabsDropdown);
  }

  tabsNavWrapper.appendChild(tabsNav);

  // Add prev/next arrows for carousel variants
  if (isCarouselVariant) {
    enableMouseDragScroll(tabsNav);

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

  block.appendChild(tabsNavWrapper);
  tabButtonRow.remove();

  // Create content container
  const tabsContent = document.createElement('div');
  tabsContent.className = 'tabs-content';

  // Create and append all panels in DOM order first, then load nested blocks in parallel
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

  // Load nested blocks in parallel (order no longer matters for DOM position)
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

  block.appendChild(tabsContent);

  // Activate first tab
  activateTab(block, 0);

  // Keyboard navigation
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

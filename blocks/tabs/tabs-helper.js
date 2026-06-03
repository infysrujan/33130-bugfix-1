import {
  buildBlock,
  readBlockConfig,
  toClassName,
  toCamelCase,
} from '../../scripts/aem.js';

export default function decorateTabs(main) {
  const sections = [...main.querySelectorAll(':scope > div')];

  // Detect authoring mode - check if any section has data-aue attributes
  const isAuthoringMode = sections.some((section) => [...section.attributes].some((attr) => attr.name.startsWith('data-aue-')));

  // In authoring mode, don't combine sections - keep content tree as-is
  if (isAuthoringMode) {
    return;
  }

  const tabGroups = [];
  let currentGroup = [];

  // Process each section and group tabs together
  sections.forEach((section) => {
    // Extract tab metadata from section
    const sectionMeta = section.querySelector('div.section-metadata');
    const tabData = sectionMeta ? readBlockConfig(sectionMeta) : {};
    const tabName = tabData['tab-name'];

    if (tabName && tabName.trim() !== '') {
      const tabVariant = tabData['tab-variant'] || 'simple-tab';

      // Extract icon/image data based on variant
      let tabIcon = null;
      let tabIconAlt = '';

      if (tabVariant === 'tiled-tab') {
        tabIcon = tabData['tab-icon'];
        tabIconAlt = tabData['tab-icon-alt-tiled'] || '';
      } else if (tabVariant === 'media-tab') {
        tabIcon = tabData['tab-icon-media'];
        tabIconAlt = tabData['tab-icon-alt-media'] || '';
      } else if (tabVariant === 'icon-tab-carousel') {
        tabIcon = tabData['tab-icon-carousel'];
        tabIconAlt = tabData['tab-icon-alt-carousel'] || '';
      }

      // Get all content from this section (excluding section-metadata)
      const contentElements = [...section.children].filter(
        (child) => !child.classList.contains('section-metadata'),
      );

      currentGroup.push({
        section,
        tabName,
        tabVariant,
        tabIcon,
        tabIconAlt,
        content: contentElements,
        sectionMetadata: tabData, // Store all metadata including style
      });
    } else if (currentGroup.length > 0) {
      // End current group when non-tab section is found
      tabGroups.push(currentGroup);
      currentGroup = [];
    }
  });

  // Add final group if it exists
  if (currentGroup.length > 0) {
    tabGroups.push(currentGroup);
  }

  // Create tabs blocks for each group
  tabGroups.forEach((group) => {
    // Filter out tabs with empty names only — allow tabs with no authored content
    // (content can be injected dynamically by blocks like promotional-card-selector)
    const validTabs = group.filter((tab) => tab.tabName && tab.tabName.trim() !== '');

    if (validTabs.length === 0) {
      return;
    }

    const tabsBlockRows = [];
    const firstVariant = validTabs[0].tabVariant;

    // For media-tab, create image row first
    if (firstVariant === 'media-tab') {
      const imageCells = [];
      validTabs.forEach(({ tabIcon, tabIconAlt }) => {
        if (tabIcon) {
          const imageCell = document.createElement('div');
          const img = document.createElement('img');
          img.src = tabIcon;
          img.alt = tabIconAlt || '';
          imageCell.appendChild(img);
          imageCells.push(imageCell);
        }
      });
      if (imageCells.length > 0) {
        tabsBlockRows.push(imageCells);
      }
    }

    if (firstVariant === 'icon-tab-carousel') {
      const imageCells = [];
      validTabs.forEach(({ tabIcon, tabIconAlt }) => {
        if (tabIcon) {
          const imageCell = document.createElement('div');
          const img = document.createElement('img');
          img.src = tabIcon;
          img.alt = tabIconAlt || '';
          imageCell.appendChild(img);
          imageCells.push(imageCell);
        }
      });
      if (imageCells.length > 0) {
        tabsBlockRows.push(imageCells);
      }
    }

    // Create tab buttons row
    const tabButtonCells = [];
    validTabs.forEach(({
      tabName, tabVariant, tabIcon, tabIconAlt,
    }) => {
      // Create cell object with elements
      const cellContent = { elems: [] };

      if (tabVariant === 'tiled-tab' && tabIcon) {
        // Tiled Tab: Icon + Tab Name
        const img = document.createElement('img');
        img.src = tabIcon;
        img.alt = tabIconAlt || '';
        cellContent.elems.push(img);
        cellContent.elems.push(document.createTextNode(tabName));
      } else {
        // Simple Tab (and Media Tab buttons): Just text
        cellContent.elems.push(document.createTextNode(tabName));
      }

      tabButtonCells.push(cellContent);
    });
    tabsBlockRows.push(tabButtonCells);

    // Create content rows (one row per tab)
    validTabs.forEach(({ content }) => {
      const contentCell = document.createElement('div');

      // Move all content elements to this cell
      content.forEach((element) => {
        contentCell.appendChild(element);
      });

      tabsBlockRows.push([contentCell]);
    });

    // Build the tabs block
    const tabsBlock = buildBlock('tabs', tabsBlockRows);

    // Add variant data attributes to button cells
    // For media-tab: button row is second row (index 1)
    // For simple/tiled: button row is first row (index 0)
    const buttonRowIndex = firstVariant === 'media-tab' ? 1 : 0;
    const buttonRow = tabsBlock.children[buttonRowIndex];
    if (buttonRow) {
      const buttonCells = [...buttonRow.children];
      buttonCells.forEach((cell, index) => {
        if (index < validTabs.length) {
          cell.dataset.variant = validTabs[index].tabVariant;
        }
      });
    }

    // Get the first original section to preserve its attributes
    const firstSection = validTabs[0].section;
    const firstSectionMeta = validTabs[0].sectionMetadata;

    // Wrap in section and preserve section-level metadata
    const tabsSection = document.createElement('div');
    tabsSection.className = 'section';

    // Process and add style classes from section-metadata (same as decorateSections)
    if (firstSectionMeta.style) {
      const styles = firstSectionMeta.style.split(',')
        .filter((style) => style)
        .map((style) => toClassName(style.trim()));
      styles.forEach((style) => tabsSection.classList.add(style));
    }

    // Set section ID from metadata if present (same as decorateSections)
    if (firstSectionMeta.id) {
      tabsSection.id = toClassName(firstSectionMeta.id);
    }

    // Set data attributes from other metadata fields (same as decorateSections)
    const ignoredMetaKeys = ['style', 'id', 'tab-name', 'tab-variant', 'tab-icon', 'tab-icon-alt-tiled', 'tab-icon-media', 'tab-icon-alt-media', 'tab-icon-carousel', 'tab-icon-alt-carousel'];
    Object.keys(firstSectionMeta).forEach((key) => {
      if (!ignoredMetaKeys.includes(key)) {
        tabsSection.dataset[toCamelCase(key)] = firstSectionMeta[key];
      }
    });

    // Copy section attributes from original section (data attributes, etc.)
    if (firstSection.id && !firstSectionMeta.id) {
      // Only copy if not already set from metadata
      tabsSection.id = firstSection.id;
    }
    [...firstSection.attributes].forEach((attr) => {
      if (attr.name.startsWith('data-') || attr.name === 'id') {
        tabsSection.setAttribute(attr.name, attr.value);
      }
    });

    tabsSection.appendChild(tabsBlock);

    // Insert tabs section before the first section of the group
    firstSection.insertAdjacentElement('beforebegin', tabsSection);

    // In preview/published mode, remove original sections
    validTabs.forEach(({ section }) => {
      section.remove();
    });
  });
}

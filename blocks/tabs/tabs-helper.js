import {
  buildBlock,
  readBlockConfig,
  toClassName,
  toCamelCase,
} from '../../scripts/aem.js';
import buildAuthoringNav from './helpers/tabs-authoring.js';

export default function decorateTabs(main) {
  const sections = [...main.querySelectorAll(':scope > div')];

  const isAuthoringMode = sections.some((section) => [...section.attributes].some((attr) => attr.name.startsWith('data-aue-')));

  const tabGroups = [];
  let currentGroup = [];

  sections.forEach((section) => {
    const sectionMeta = section.querySelector('div.section-metadata');
    const tabData = sectionMeta ? readBlockConfig(sectionMeta) : {};
    const tabName = tabData['tab-name'];

    if (tabName && tabName.trim() !== '') {
      const tabVariant = tabData['tab-variant'] || 'simple-tab';

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
        sectionMetadata: tabData,
      });
    } else if (currentGroup.length > 0) {
      tabGroups.push(currentGroup);
      currentGroup = [];
    }
  });

  if (currentGroup.length > 0) {
    tabGroups.push(currentGroup);
  }

  if (isAuthoringMode) {
    buildAuthoringNav(tabGroups);
    return;
  }

  tabGroups.forEach((group) => {
    const validTabs = group.filter((tab) => tab.tabName && tab.tabName.trim() !== '');

    if (validTabs.length === 0) {
      return;
    }

    const tabsBlockRows = [];
    const firstVariant = validTabs[0].tabVariant;

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

    const tabButtonCells = [];
    validTabs.forEach(({
      tabName, tabVariant, tabIcon, tabIconAlt,
    }) => {
      const cellContent = { elems: [] };

      if (tabVariant === 'tiled-tab' && tabIcon) {
        const img = document.createElement('img');
        img.src = tabIcon;
        img.alt = tabIconAlt || '';
        cellContent.elems.push(img);
        cellContent.elems.push(document.createTextNode(tabName));
      } else {
        cellContent.elems.push(document.createTextNode(tabName));
      }

      tabButtonCells.push(cellContent);
    });
    tabsBlockRows.push(tabButtonCells);

    validTabs.forEach(({ content }) => {
      const contentCell = document.createElement('div');
      content.forEach((element) => {
        contentCell.appendChild(element);
      });
      tabsBlockRows.push([contentCell]);
    });

    const tabsBlock = buildBlock('tabs', tabsBlockRows);

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

    const firstSection = validTabs[0].section;
    const firstSectionMeta = validTabs[0].sectionMetadata;

    const tabsSection = document.createElement('div');
    tabsSection.className = 'section';

    if (firstSectionMeta.style) {
      const styles = firstSectionMeta.style.split(',')
        .filter((style) => style)
        .map((style) => toClassName(style.trim()));
      styles.forEach((style) => tabsSection.classList.add(style));
    }

    if (firstSectionMeta.id) {
      tabsSection.id = toClassName(firstSectionMeta.id);
    }

    const ignoredMetaKeys = ['style', 'id', 'tab-name', 'tab-variant', 'tab-icon', 'tab-icon-alt-tiled', 'tab-icon-media', 'tab-icon-alt-media', 'tab-icon-carousel', 'tab-icon-alt-carousel'];
    Object.keys(firstSectionMeta).forEach((key) => {
      if (!ignoredMetaKeys.includes(key)) {
        tabsSection.dataset[toCamelCase(key)] = firstSectionMeta[key];
      }
    });

    if (firstSection.id && !firstSectionMeta.id) {
      tabsSection.id = firstSection.id;
    }
    [...firstSection.attributes].forEach((attr) => {
      if (attr.name.startsWith('data-') || attr.name === 'id') {
        tabsSection.setAttribute(attr.name, attr.value);
      }
    });

    tabsSection.appendChild(tabsBlock);

    firstSection.insertAdjacentElement('beforebegin', tabsSection);

    validTabs.forEach(({ section }) => {
      section.remove();
    });
  });
}

import { getMetadata } from '../../scripts/aem.js';
import createGlobalDropdown from '../../scripts/utils/dropdown-helpers.js';
import { getParentPageUrl } from '../breadcrumb/breadcrumb.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Collect sections marked in the section model as sub-nav targets (is-subnav-section).
 */
function collectSections() {
  // For your decorateSections, sections are direct children of main: main > div.section
  const sections = [...document.querySelectorAll('main > .section')];

  return sections
    .map((section) => {
      if (section.dataset.isSubnavSection !== 'true') return null;
      // Label to show in dropdown:
      // 1) use section's Sub Nav Title (subnavLabel) from section model
      // 2) fallback to first heading text
      const label = section.dataset.subnavLabel || section.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim();
      if (!label) return null;

      return { label, element: section };
    })
    .filter(Boolean);
}

/**
 * Pair each `.locate-us-container` with a sub-nav tab by DOM order: first container
 * with tab 1 (tab-name-1), second with tab 2 (tab-name-2), etc.
 * Re-queries the document on each sync so containers still work if they appear after
 * this block decorates.
 */
function bindLocateUsContainersToTabs(tabButtons) {
  if (!tabButtons.length) return;

  tabButtons.forEach((btn, index) => {
    if (!btn.id) btn.id = `sub-nav-tab-${index}`;
  });

  let activeIndex = 0;

  const syncPanels = () => {
    const containers = [...document.querySelectorAll('.locate-us-container')];
    containers.forEach((panel, index) => {
      if (!panel.id) panel.id = `sub-nav-locate-panel-${index}`;
      panel.setAttribute('role', 'tabpanel');
      const tab = tabButtons[index];
      if (tab) {
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', tab.id);
      }
    });
    tabButtons.forEach((btn, i) => {
      const on = i === activeIndex;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    containers.forEach((panel, i) => {
      const paired = i < tabButtons.length;
      panel.hidden = !paired || i !== activeIndex;
    });
  };

  tabButtons.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      activeIndex = index;
      syncPanels();
    });
  });

  syncPanels();
  requestAnimationFrame(syncPanels);
}

/**
 * Main decorate function for the sub-nav block.
 * Will turn the block into a dropdown that navigates between sections.
 */
export default function decorate(block) {
  const isSubNav = getMetadata('issubnav') === 'true';

  if (!isSubNav) {
    block.remove();
    return;
  }

  // Read block config:
  // classes from block model (subnav-dropdown | subnav-without-dropdown | subnav-tab)
  const blockClasses = [...block.classList];
  const hasDropdownClass = blockClasses.includes('subnav-dropdown');
  const hasTabClass = blockClasses.includes('subnav-tab');

  // Helper: get value from a block row (second cell = value column)
  const getRowValue = (row) => row?.children?.[0]?.textContent?.trim() ?? '';
  // Build UI: wrapper + back button (always)
  const wrapper = document.createElement('div');
  wrapper.className = 'wrapper content';

  const backButton = document.createElement('button');
  backButton.type = 'button';
  backButton.className = 'sub-nav-back';
  backButton.setAttribute('aria-label', 'Go back to previous page');
  backButton.innerHTML = '<span class="sub-nav-back-circle icon-arrow-left"></span>';
  backButton.addEventListener('click', async () => {
    const parentUrl = await getParentPageUrl();
    if (parentUrl) {
      window.location.href = parentUrl;
      return;
    }
    window.history.back();
  });

  if (hasTabClass) {
    const rows = [...block.children];
    // Model order:
    // classes,
    // tab-name-1,
    // tab-name-2 → rows 0 and 2 are tab names
    const tabName1 = getRowValue(rows[0]);
    const tabName2 = getRowValue(rows[1]);
    const tabNames = [tabName1, tabName2].filter(Boolean);

    if (tabNames.length) {
      const tabList = document.createElement('div');
      tabList.className = 'sub-nav-tabs';
      tabList.setAttribute('role', 'tablist');
      const tabButtons = [];
      tabNames.forEach((name, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `sub-nav-tab-btn${index === 0 ? ' active' : ''}`;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        btn.textContent = name;
        tabButtons.push(btn);
        tabList.appendChild(btn);
      });
      bindLocateUsContainersToTabs(tabButtons);
      wrapper.append(backButton, tabList);
    } else {
      wrapper.append(backButton);
    }
  } else if (hasDropdownClass) {
    const sections = collectSections();
    if (sections.length) {
      const linksHTML = `<ul>${sections.map(({ label: optLabel }, index) => `<li><a href="#" data-section-index="${index}" class="global-dropdown-link">${escapeHtml(optLabel)}</a></li>`).join('')}</ul>`;
      const initialLabel = sections[0]?.label ?? 'Select';
      const subNavSelect = createGlobalDropdown(initialLabel, linksHTML, document);
      subNavSelect.classList.add('sub-nav-select');

      subNavSelect.querySelectorAll('.global-dropdown-link').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const sectionIndex = parseInt(link.dataset.sectionIndex, 10);
          if (
            Number.isNaN(sectionIndex)
            || sectionIndex < 0
            || sectionIndex >= sections.length
          ) {
            return;
          }

          const targetSection = sections[sectionIndex].element;
          if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }

          subNavSelect.querySelector('.global-dropdown-trigger').textContent = link.textContent;
          subNavSelect.classList.remove('is-open');
          subNavSelect.querySelector('.global-dropdown-trigger').setAttribute('aria-expanded', 'false');
        });
      });

      wrapper.append(backButton, subNavSelect);
    } else {
      wrapper.append(backButton);
    }
  } else {
    // only back button on the left, no dropdown on the right
    wrapper.append(backButton);
  }

  block.textContent = '';
  block.appendChild(wrapper);
}

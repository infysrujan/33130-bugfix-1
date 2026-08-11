import { moveInstrumentation } from '../../scripts/scripts.js';

/**
 * Build a single filter option card: li > label > [input] [option-icon?] [option-text]
 *
 * @param {Element} sourceItem   - Original EDS <li> (may contain an .icon span with img)
 * @param {string}  inputType    - 'radio' | 'checkbox'
 * @param {string}  groupName    - Shared name attribute for the input group
 * @param {number}  index        - Position within the group
 * @param {boolean} stackedLayout - true = icon-on-top (lifestyle), false = icon-inline (benefits)
 */
function buildFilterOptionCard(sourceItem, inputType, groupName, index, stackedLayout) {
  const listItem = document.createElement('li');
  listItem.className = 'option-item';

  const optionCard = document.createElement('label');
  optionCard.className = `option-card${
    stackedLayout ? ' option-card-stacked' : ''
  }`;
  optionCard.htmlFor = `${groupName}-${index}`;

  // Native input — visually hidden, accessible via label
  const nativeInput = document.createElement('input');
  nativeInput.type = inputType;
  nativeInput.name = groupName;
  nativeInput.id = `${groupName}-${index}`;
  optionCard.appendChild(nativeInput);

  // Icon — lifted from EDS .icon > img, if present in the source list item
  const sourceIconImg = sourceItem.querySelector('.icon img');
  if (sourceIconImg) {
    const iconWrapper = document.createElement('span');
    iconWrapper.className = `option-icon option-icon-${
      stackedLayout ? 'above' : 'inline'
    }`;
    iconWrapper.setAttribute('aria-hidden', 'true');

    const iconImg = sourceIconImg.cloneNode(true);
    // Remove inline size attributes; sizes controlled entirely by CSS
    iconImg.removeAttribute('width');
    iconImg.removeAttribute('height');
    iconWrapper.appendChild(iconImg);
    optionCard.appendChild(iconWrapper);
  }

  // Text — strip .icon markup from a clone so only the text node remains
  const textClone = sourceItem.cloneNode(true);
  textClone.querySelectorAll('.icon').forEach((iconEl) => iconEl.remove());

  const optionText = document.createElement('span');
  optionText.className = 'option-text';
  optionText.textContent = textClone.textContent.trim();
  optionCard.appendChild(optionText);

  listItem.appendChild(optionCard);
  return listItem;
}

/**
 * Build a complete filter group: section > [group-header] > option-list
 *
 * @param {object} group - Group configuration
 * @param {number} groupIndex - Used to generate unique input group names
 */
function buildFilterGroup(group, groupIndex) {
  const section = document.createElement('div');
  section.className = 'filter-group';

  // Header: title + optional hint
  const groupHeader = document.createElement('div');
  groupHeader.className = 'filter-group-header';

  const groupTitle = document.createElement('h2');
  groupTitle.className = 'filter-group-title';
  groupTitle.textContent = group.displayTitle;
  groupHeader.appendChild(groupTitle);

  if (group.sectionHint) {
    const selectionHint = document.createElement('span');
    selectionHint.className = 'filter-group-hint';
    selectionHint.textContent = group.sectionHint;
    groupHeader.appendChild(selectionHint);
  }

  section.appendChild(groupHeader);

  const groupName = `filter-group-${groupIndex}`;
  const inputType = group.isLifestyle ? 'checkbox' : 'radio';

  // Sections whose items have no icons (e.g. Monthly Income) also get a mobile
  // <select> dropdown — matching the live site's responsive behaviour.
  const hasIcons = group.items.some((item) => !!item.querySelector('.icon'));
  const needsMobileDropdown = !hasIcons && !group.isLifestyle;

  // --- Desktop card list (hidden on mobile when a dropdown is present) ---
  const optionList = document.createElement('ul');
  optionList.className = `option-list${
    group.isLifestyle ? ' option-list-three-column' : ''
  }`;

  group.items.forEach((item, i) => {
    optionList.appendChild(
      buildFilterOptionCard(item, inputType, groupName, i, group.isLifestyle),
    );
  });

  const desktopCards = document.createElement('div');
  desktopCards.className = needsMobileDropdown
    ? 'filter-options-desktop'
    : 'filter-options-always';
  desktopCards.appendChild(optionList);
  section.appendChild(desktopCards);

  // --- Mobile <select> dropdown (hidden on tablet / desktop) ---
  if (needsMobileDropdown) {
    const mobileDropdown = document.createElement('div');
    mobileDropdown.className = 'filter-options-mobile';

    const select = document.createElement('select');
    select.className = 'filter-dropdown';
    select.dataset.groupName = groupName;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- Select --';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    group.items.forEach((item, i) => {
      const clone = item.cloneNode(true);
      clone.querySelectorAll('.icon').forEach((el) => el.remove());
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = clone.textContent.trim();
      select.appendChild(opt);
    });

    mobileDropdown.appendChild(select);
    section.appendChild(mobileDropdown);
  }

  return section;
}

/**
 * Build a filter-state object from the current selections in the block.
 * Returns { income: string, benefit: string, lifestyles: string[] }.
 *
 * The group title is used to assign semantic keys:
 *   title includes "income"    → income
 *   isLifestyle === true       → lifestyles (array, up to 3)
 *   everything else            → benefit
 *
 * @param {Element}       block
 * @param {Array<object>} filterGroups
 * @returns {{ income: string, benefit: string, lifestyles: string[] }}
 */
function buildFilterState(block, filterGroups) {
  const state = { income: '', benefit: '', lifestyles: [] };

  filterGroups.forEach((group, i) => {
    if (group.isLifestyle) {
      const checked = [
        ...block.querySelectorAll(`input[name="filter-group-${i}"]:checked`),
      ];
      state.lifestyles = checked
        .map(
          (input) => input
            .closest('.option-card')
            ?.querySelector('.option-text')
            ?.textContent
            ?.trim() ?? '',
        )
        .filter(Boolean);
    } else {
      const checked = block.querySelector(
        `input[name="filter-group-${i}"]:checked`,
      );
      const value = checked
        ?.closest('.option-card')
        ?.querySelector('.option-text')
        ?.textContent
        ?.trim() ?? '';
      const titleLower = group.displayTitle.toLowerCase();
      if (titleLower.includes('income')) {
        state.income = value;
      } else {
        state.benefit = value;
      }
    }
  });

  return state;
}

/**
 * Sync the Start Over visibility and Apply disabled state against current selections.
 * Both Start Over (visible) and Apply (enabled) require every filter group
 * to have at least one option selected.
 */
function syncActionButtonState(block, filterGroups, startOverButton, applyButton) {
  const groupStates = filterGroups.map((g, i) => {
    const hasChecked = !!block.querySelector(`input[name="filter-group-${i}"]:checked`);
    return { title: g.displayTitle, isLifestyle: g.isLifestyle, hasChecked };
  });
  const everyGroupSelected = groupStates.every((s) => s.hasChecked);
  startOverButton.style.display = everyGroupSelected ? '' : 'none';
  applyButton.disabled = !everyGroupSelected;
}

/**
 * EDS decorate entry point.
 *
 * Block row mapping (matches _credit-card-selector.json model):
 *   Row 0  applyButtonText
 *   Row 1  applyButtonTitle       — accessibility title attribute
 *   Row 2  applyButtonType        — primary | secondary | tertiary
 *   Row 3  startOverButtonText
 *   Row 4  startOverButtonTitle   — accessibility title attribute
 *   Row 5  startOverButtonType    — primary | secondary | tertiary
 *   Row 6+ credit-card-section items (subSectionTitle | rich-text list)
 *
 * The main heading is authored at section level — not read from the block.
 * The results/card-list panel is a separate "Credit Card Results" block —
 * see blocks/credit-card-results — coupled only via document-level custom
 * events (credit-card-filter-applied / credit-card-filter-reset), not DOM.
 *
 * Column assignment:
 *   Sections whose title contains "lifestyle" → right column (checkbox, max 3 selections)
 *   All other sections                        → left column  (radio, single-select)
 */
export default function decorate(block) {
  // UE inserts a fresh block element when a newly-added block is edited for the first time.
  // The original decorated block stays in the DOM alongside the new one, causing duplication.
  // Only remove the stale block if it shares the same data-aue-resource (same AEM content path).
  // This prevents accidentally removing legitimately different selector instance on the same page.
  const blockResource = block.dataset.aueResource;
  document.querySelectorAll('.credit-card-selector.block').forEach((other) => {
    if (other === block) return;
    if (!other.querySelector('.card-selector-collapsible')) return; // not yet decorated
    const otherResource = other.dataset.aueResource;
    // If both have a resource and they differ, these are different blocks — leave them alone.
    if (blockResource && otherResource && otherResource !== blockResource) return;
    other.remove();
  });

  // Remove any previously built interactive UI so decorate() is safe to re-call
  // (UE re-calls decorate when a child item is added to the block).
  const existingUI = block.querySelector('.card-selector-collapsible');
  if (existingUI) {
    // Restore UE instrumentation attrs from built elements back to source rows/fields.
    existingUI.querySelectorAll('.filter-group').forEach((groupEl) => {
      const restore = groupEl.ccsRestore;
      if (!restore) return;
      moveInstrumentation(groupEl, restore.sourceRow);
      restore.fieldPairs.forEach(([builtEl, sourceEl]) => {
        if (builtEl && sourceEl) moveInstrumentation(builtEl, sourceEl);
      });
    });
    existingUI.remove();
  }
  block.parentElement?.querySelector(':scope > .collapse-toggle-bar')?.remove();

  // Un-hide authored rows that were hidden by a previous decoration pass.
  [...block.children].forEach((row) => { row.classList.remove('ccs-source-row'); });

  const rows = [...block.children];
  const readRowText = (row) => row?.querySelector('p')?.textContent?.trim() ?? '';

  // ── Config rows 0–5 ───────────────────────────────────────────────────────
  const applyButtonConfig = {
    label: readRowText(rows[0]),
    titleAttr: readRowText(rows[1]),
    variant: readRowText(rows[2]),
  };

  const startOverButtonConfig = {
    label: readRowText(rows[3]),
    titleAttr: readRowText(rows[4]),
    variant: readRowText(rows[5]),
  };

  // ── Section rows 6+ ───────────────────────────────────────────────────────
  const filterGroups = [];
  for (let i = 6; i < rows.length; i += 1) {
    const cells = [...rows[i].children];
    const rawTitle = cells[0]?.querySelector('p')?.textContent?.trim() ?? '';

    // Extract hint from parenthetical in title, e.g. "Lifestyles (Select up to 3 options)"
    // → displayTitle: "Lifestyles", sectionHint: "Select up to 3 options"
    const parenMatch = rawTitle.match(/\(([^)]+)\)\s*$/);
    const displayTitle = rawTitle
      .replace(/\s*\([^)]+\)\s*$/, '') // strip parenthetical
      .replace(/ Selection$/i, '')
      .trim();
    // [0] = full match including surrounding parentheses — matches live site
    const sectionHint = parenMatch?.[0]?.trim() ?? '';

    const listItems = [...(cells[1]?.querySelectorAll('li') ?? [])];
    const isLifestyle = rawTitle.toLowerCase().includes('lifestyle');
    if (listItems.length > 0) {
      filterGroups.push({
        displayTitle,
        sectionHint,
        items: listItems,
        isLifestyle,
        maxSelect: isLifestyle ? 3 : 1,
        sourceRow: rows[i],
      });
    }
  }
  // ── Build DOM ─────────────────────────────────────────────────────────────
  // Hide authored rows via CSS class instead of inline style — the !important rule
  // in the stylesheet prevents Universal Editor from overriding it when the author
  // interacts with other elements on the page.
  rows.forEach((row) => { row.classList.add('ccs-source-row'); });

  // Two-column content area
  const selectorContent = document.createElement('div');
  selectorContent.className = 'card-selector-content';

  const primaryFilterColumn = document.createElement('div');
  primaryFilterColumn.className = 'filter-column filter-column-primary';

  const lifestyleFilterColumn = document.createElement('div');
  lifestyleFilterColumn.className = 'filter-column filter-column-lifestyle';

  filterGroups.forEach((group, index) => {
    const groupElement = buildFilterGroup(group, index);
    const groupTitleEl = groupElement.querySelector('.filter-group-title');
    const optionsAreaEl = groupElement.querySelector('.filter-options-desktop, .filter-options-always');

    // Move component-level (row) attrs to the built group element.
    moveInstrumentation(group.sourceRow, groupElement);

    // Move field-level attrs to built elements by matching data-aue-prop.
    // The attrs live on deep descendants (e.g. <p>, inner <div>), not on the
    // direct cell divs, so we must use querySelectorAll('[data-aue-prop]').
    const fieldMap = {
      subSectionTitle: groupTitleEl,
      content: optionsAreaEl,
    };
    const fieldPairs = []; // [builtEl, sourceEl] pairs needed for restoration

    group.sourceRow.querySelectorAll('[data-aue-prop]').forEach((sourceFieldEl) => {
      const prop = sourceFieldEl.dataset.aueProp;
      const targetEl = fieldMap[prop];
      if (targetEl) {
        fieldPairs.push([targetEl, sourceFieldEl]);
        moveInstrumentation(sourceFieldEl, targetEl);
      }
    });

    // Clear any remaining data-aue-* from other source row descendants
    // (cell wrapper divs, unknown props, etc.) so nothing leaks into the tree.
    group.sourceRow.querySelectorAll('*').forEach((el) => {
      [...el.attributes]
        .filter(({ nodeName }) => nodeName.startsWith('data-aue-') || nodeName.startsWith('data-richtext-'))
        .forEach(({ nodeName }) => el.removeAttribute(nodeName));
    });

    // Store refs for restoration before a subsequent decoration pass.
    groupElement.ccsRestore = { sourceRow: group.sourceRow, fieldPairs };

    if (group.isLifestyle) {
      lifestyleFilterColumn.appendChild(groupElement);
    } else {
      primaryFilterColumn.appendChild(groupElement);
    }
  });

  selectorContent.appendChild(primaryFilterColumn);
  selectorContent.appendChild(lifestyleFilterColumn);

  // ── Collapsible wrapper — encloses the content grid ─────────────────────
  const collapsibleWrapper = document.createElement('div');
  collapsibleWrapper.className = 'card-selector-collapsible';
  collapsibleWrapper.appendChild(selectorContent);

  block.appendChild(collapsibleWrapper);

  // Toggle bar: appended to the full-width section wrapper (not the centered
  // block) so the floating chevron's positioning context spans the section
  // edge, matching production, rather than the narrower centered filter box.
  const toggleBar = document.createElement('div');
  toggleBar.className = 'collapse-toggle-bar';

  const collapseToggleButton = document.createElement('button');
  collapseToggleButton.type = 'button';
  collapseToggleButton.className = 'collapse-toggle-button';
  collapseToggleButton.setAttribute('aria-expanded', 'true');
  collapseToggleButton.setAttribute('aria-label', 'Toggle card selector');
  toggleBar.appendChild(collapseToggleButton);
  block.parentElement.appendChild(toggleBar);

  // ── Action buttons (inside lifestyle column, pushed to bottom) ────────────
  const selectorActions = document.createElement('div');
  selectorActions.className = 'selector-actions';

  const ALLOWED_VARIANTS = new Set(['primary', 'secondary', 'tertiary']);

  const startOverButton = document.createElement('button');
  startOverButton.type = 'button';
  // startOverButton.className = 'selector-button selector-button-secondary';
  startOverButton.classList.add('button-m');
  startOverButton.classList.add('secondary');
  startOverButton.textContent = startOverButtonConfig.label;
  if (startOverButtonConfig.titleAttr) startOverButton.title = startOverButtonConfig.titleAttr;
  startOverButton.style.display = 'none';

  const applyButton = document.createElement('button');
  applyButton.type = 'button';
  const applyVariant = ALLOWED_VARIANTS.has(applyButtonConfig.variant)
    ? applyButtonConfig.variant
    : 'primary';
  // applyButton.className = `selector-button selector-button-${applyVariant}`;
  applyButton.classList.add('button-m');
  applyButton.classList.add(`${applyVariant}`);
  applyButton.textContent = applyButtonConfig.label;
  if (applyButtonConfig.titleAttr) applyButton.title = applyButtonConfig.titleAttr;
  applyButton.disabled = true;

  selectorActions.appendChild(startOverButton);
  selectorActions.appendChild(applyButton);
  lifestyleFilterColumn.appendChild(selectorActions);

  // ── Event listeners ───────────────────────────────────────────────────────

  function resetFilterSelections() {
    block.querySelectorAll('input').forEach((input) => { input.checked = false; });
    block.querySelectorAll('.option-card.is-selected').forEach((card) => {
      card.classList.remove('is-selected');
    });
    // Reset any mobile <select> dropdowns back to the placeholder
    block.querySelectorAll('.filter-dropdown').forEach((select) => {
      select.value = '';
      select.classList.remove('has-value');
    });
    // Notify the results block that filters have been cleared
    document.dispatchEvent(new CustomEvent('credit-card-filter-reset'));
    syncActionButtonState(block, filterGroups, startOverButton, applyButton);
  }

  startOverButton.addEventListener('click', resetFilterSelections);

  // Bfcache restore (e.g. browser Back) reinstates the exact pre-navigation DOM,
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) resetFilterSelections();
  });

  applyButton.addEventListener('click', () => {
    const filterState = buildFilterState(block, filterGroups);
    document.dispatchEvent(
      new CustomEvent('credit-card-filter-applied', { detail: filterState }),
    );
  });

  // Single delegated listener covers all option changes (radios, checkboxes, mobile selects)
  block.addEventListener('change', (e) => {
    const changedInput = e.target;

    // --- Mobile <select> dropdown ---
    if (changedInput.classList.contains('filter-dropdown')) {
      const itemIndex = parseInt(changedInput.value, 10);
      const { groupName } = changedInput.dataset;
      // Sync the hidden radio inputs so state-tracking works uniformly
      block.querySelectorAll(`input[name="${groupName}"]`).forEach((radio, i) => {
        radio.checked = i === itemIndex;
        radio.closest('.option-card')?.classList.toggle('is-selected', i === itemIndex);
      });
      // Mirror the selected-card blue border onto the dropdown itself
      changedInput.classList.toggle('has-value', changedInput.value !== '');
      syncActionButtonState(block, filterGroups, startOverButton, applyButton);
      return;
    }

    if (!changedInput.matches('input[type="radio"], input[type="checkbox"]')) return;

    // Enforce max selections per lifestyle checkbox group
    if (changedInput.type === 'checkbox' && changedInput.checked) {
      const groupIndex = parseInt(changedInput.name.replace('filter-group-', ''), 10);
      const maxAllowed = filterGroups[groupIndex]?.maxSelect ?? 3;
      const currentCount = block.querySelectorAll(
        `input[name="${changedInput.name}"]:checked`,
      ).length;
      if (currentCount > maxAllowed) {
        changedInput.checked = false;
        return;
      }
    }

    // Remove selected state from sibling cards on radio change
    if (changedInput.type === 'radio') {
      block.querySelectorAll(`input[name="${changedInput.name}"]`).forEach((sibling) => {
        sibling.closest('.option-card')?.classList.remove('is-selected');
      });
    }

    // Toggle the visual selected state on the clicked card
    changedInput.closest('.option-card')?.classList.toggle('is-selected', changedInput.checked);

    syncActionButtonState(block, filterGroups, startOverButton, applyButton);
  });

  // Collapse / expand the content grid
  collapseToggleButton.addEventListener('click', () => {
    const isNowCollapsed = collapsibleWrapper.classList.toggle('is-collapsed');
    toggleBar.classList.toggle('is-collapsed', isNowCollapsed);
    collapseToggleButton.setAttribute('aria-expanded', String(!isNowCollapsed));
  });
}

import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import { getLang, isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import createGlobalDropdown, { attachScrollableDropdownPanel } from '../../scripts/utils/dropdown-helpers.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';
import { openModal } from '../../scripts/utils/modal.js';

function formatDate(dateStr, monthYearOnly = false) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const isThai = getLang() === 'th';
  if (isThai) {
    const month = date.toLocaleString('th-TH', { month: 'long' });
    const year = date.getFullYear() + 543;
    return monthYearOnly ? `${month} ${year}` : `${date.getDate()} ${month} ${year}`;
  }
  const options = { month: 'long', year: 'numeric', ...(monthYearOnly ? {} : { day: 'numeric' }) };
  return date.toLocaleDateString('en-US', options);
}

function isToggleCell(cell) {
  const text = cell?.textContent?.trim().toLowerCase() || '';
  return text === 'true' || text === 'false' || cell?.innerHTML?.trim() === '';
}

function extractToggledLink(cells, valueCellSelector) {
  const valueCell = cells.find(valueCellSelector);
  if (!valueCell) return { enabled: false, cell: null, toggleCell: null };

  const indexInAll = cells.indexOf(valueCell);
  const prevCell = cells[indexInAll - 1];
  const isToggle = isToggleCell(prevCell);
  const isDisabled = isToggle && prevCell?.textContent?.trim().toLowerCase() === 'false';

  return { enabled: !isDisabled, cell: valueCell, toggleCell: isToggle ? prevCell : null };
}

function buildCardWrapper(
  cardLinkHref,
  cardLinkTarget,
  cardLinkTitle,
  overlayHref,
  enableOverlayModal,
) {
  const wrapper = createElementFromHTML('<div class="menu-card-action-item-link"></div>', document);
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('tabindex', '0');
  if (cardLinkTitle) wrapper.setAttribute('title', cardLinkTitle);

  if (enableOverlayModal) {
    wrapper.setAttribute('data-modal', overlayHref);
  } else {
    wrapper.setAttribute('data-href', cardLinkHref);
  }

  wrapper.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('[role="link"]')) return;
    if (!enableOverlayModal) {
      e.preventDefault();
      window.location.href = wrapper.getAttribute('data-href');
    }
  });

  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      wrapper.click();
    }
  });

  return wrapper;
}

function createCardItem(cardRow, doc) {
  const cells = [...cardRow.children];

  if (!cells.some((c) => c.textContent.trim().length > 0)) return null;

  const [imageDiv, titleDiv, descDiv, actionTypeDiv] = cells;

  const headingEl = titleDiv?.querySelector('h1, h2, h3, h4, h5, h6');
  const titleText = titleDiv?.textContent?.trim() || '';
  const titleType = headingEl?.tagName?.toLowerCase() || 'h3';
  const actionType = actionTypeDiv?.textContent?.trim().toLowerCase().replace('-button', '') || 'default';

  let remaining = cells.slice(4);

  const isDateCell = (cell) => {
    const text = cell?.textContent?.trim() || '';
    return text.length >= 8 && !Number.isNaN(Date.parse(text)) && !cell?.querySelector('a');
  };

  let dateText = '';
  const lastCell = remaining[remaining.length - 1];
  const hasToggle = isToggleCell(lastCell);
  const dateCell = hasToggle ? remaining[remaining.length - 2] : lastCell;

  if (isDateCell(dateCell)) {
    dateText = formatDate(dateCell.textContent.trim(), hasToggle && lastCell.textContent.trim() === 'true');
    remaining = remaining.slice(0, hasToggle ? -2 : -1);
  }

  const processLink = (selector) => {
    const { enabled, cell, toggleCell } = extractToggledLink(remaining, selector);
    const anchor = enabled && cell ? cell.querySelector('a') : null;
    remaining = remaining.filter((c) => c !== cell && c !== toggleCell);
    return { enabled, anchor };
  };

  const { enabled: enableOverlayModal, anchor: modalAnchor } = processLink(
    (c) => c.querySelector('a[href*="/fragments/"]'),
  );
  const overlayHref = modalAnchor?.getAttribute('href') || '';

  const { enabled: isCardClickable, anchor: cardLinkAnchor } = processLink(
    (c) => {
      if (c.querySelector('ul')) return false;
      const a = c.querySelector('a');
      if (!a) return false;
      const text = a.textContent?.trim() || '';
      const href = a.getAttribute('href')?.trim() || '';
      return text.includes('/') || (text && href.endsWith(text)) || text === href;
    },
  );
  const cardLinkHref = cardLinkAnchor?.getAttribute('href') || '';
  const cardLinkTarget = cardLinkAnchor?.target || '';
  const cardLinkTitle = cardLinkAnchor?.title?.trim() || '';

  const actionCells = remaining.filter(
    (c) => c.querySelector('a') && !c.querySelector('h1, h2, h3, h4, h5, h6, img, picture'),
  );

  const card = createElementFromHTML('<div class="menu-card-action-item"></div>', doc);
  const inner = createElementFromHTML('<div class="menu-card-action-inner"></div>', doc);

  if (imageDiv?.querySelector('img')) inner.appendChild(imageDiv);

  if (titleText) {
    if (!headingEl) titleDiv.innerHTML = `<${titleType}>${titleText}</${titleType}>`;
    titleDiv.className = 'menu-card-action-title';
    inner.appendChild(titleDiv);
  }

  if (descDiv?.innerHTML?.trim()) {
    descDiv.className = 'menu-card-action-description';
    descDiv.querySelectorAll('a').forEach((a) => {
      a?.setAttribute('data-skip-attr-auto-blocking', 'title');
      a.removeAttribute('title');
    });
    inner.appendChild(descDiv);
    inner.querySelector('.menu-card-action-title')?.classList.add('has-description');
  }

  const appendDownloadLink = (anchor) => {
    const dlLink = createDownloadLink(anchor, doc);
    if (dlLink) {
      dlLink.classList.remove('content');
      dlLink.querySelector('.download-files')?.addEventListener('click', (e) => e.stopPropagation());
      inner.appendChild(dlLink);
    }
  };

  if (actionType === 'download' && actionCells.length > 0) {
    const dlCell = actionCells.filter((c) => !c.querySelector('ul')).pop()
      ?? actionCells[actionCells.length - 1];
    const dlCellIndex = remaining.indexOf(dlCell);
    const dlLabelCell = remaining.find(
      (c) => c !== dlCell && !isToggleCell(c) && !c.querySelector('a') && c.textContent?.trim(),
    );
    const toggle = remaining.slice(dlCellIndex + 1).find((c) => {
      const text = c?.textContent?.trim().toLowerCase();
      return text === 'true' || text === 'false';
    });
    const openInNewTab = toggle?.textContent?.trim().toLowerCase() === 'true';
    if (toggle) {
      remaining = remaining.filter((c) => c !== toggle);
    }
    const downloadAnchor = dlCell.querySelector('a');
    if (downloadAnchor && dlLabelCell?.textContent?.trim()) {
      downloadAnchor.textContent = dlLabelCell.textContent.trim();
    }
    appendDownloadLink(downloadAnchor);
    if (openInNewTab) inner.querySelector('.download-files')?.setAttribute('target', '_blank');
  } else if (actionType === 'multiple-download' && actionCells.length > 0) {
    const multipleCell = actionCells[actionCells.length - 1];
    const temp = createElementFromHTML(`<div>${multipleCell.innerHTML}</div>`, doc);
    temp.querySelectorAll('a').forEach(appendDownloadLink);
  } else if (actionType === 'select-dropdown') {
    const dropdownCell = remaining.find((c) => c.querySelector('ul') || c.querySelectorAll('a').length > 1);
    const dropdownCellIdx = remaining.indexOf(dropdownCell);
    const labelSearch = dropdownCellIdx > 0 ? remaining.slice(0, dropdownCellIdx) : [];
    const labelCell = [...labelSearch].reverse().find(
      (c) => !c.querySelector('a') && !isToggleCell(c) && c.textContent?.trim(),
    );
    const label = labelCell?.textContent.trim() || 'Select';
    if (dropdownCell) {
      inner.appendChild(createGlobalDropdown(label, dropdownCell.innerHTML, doc));
    }
  } else if (actionType && actionCells.length > 0) {
    const buttonContainer = actionCells[0].querySelector('.button-container') ?? actionCells[0];
    const btn = buttonContainer.cloneNode(true);
    const buttonLink = btn.querySelector('a');
    buttonLink?.removeAttribute('data-modal');

    if (!isCardClickable && enableOverlayModal && overlayHref && buttonLink) {
      buttonLink.setAttribute('href', overlayHref);
      buttonLink.setAttribute('data-modal', overlayHref);
    }

    if (actionType !== 'default') {
      btn.classList.add(`action-${actionType}`);
    }

    inner.appendChild(btn);
  }

  if (dateText) {
    const dateEl = doc.createElement('div');
    dateEl.className = 'menu-card-action-date pad-top-30';
    dateEl.textContent = dateText;
    inner.appendChild(dateEl);
  }

  if (isCardClickable) {
    const wrapper = buildCardWrapper(
      cardLinkHref,
      cardLinkTarget,
      cardLinkTitle,
      overlayHref,
      enableOverlayModal,
    );
    wrapper.appendChild(inner);
    card.appendChild(wrapper);
  } else {
    card.appendChild(inner);
  }

  return card;
}

function removeDuplicateAuthoringBlocks(block) {
  const blockResource = block.dataset.aueResource;
  if (!blockResource) return;

  block.ownerDocument.querySelectorAll('.menu-card-actions.block').forEach((other) => {
    if (other === block) return;
    if (other.dataset.aueResource !== blockResource) return;
    if (!other.querySelector(':scope > .menu-card-action')) return;
    other.remove();
  });
}

function getSourceRows(block) {
  return [...block.children].filter((row) => !row.classList.contains('menu-card-action'));
}

function bindModalHandler(block, doc) {
  if (block.dataset.menuCardActionsModalBound) return;
  block.dataset.menuCardActionsModalBound = 'true';

  block.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    if (!trigger || !block.contains(trigger)) return;
    const nestedLink = event.target.closest('a, [role="link"]');
    if (nestedLink && nestedLink !== trigger) return;
    event.preventDefault();
    const fragmentPath = trigger.getAttribute('data-modal');
    if (fragmentPath) openModal(doc, { fragmentPath });
  });
}

export default function decorate(block) {
  const isAuthoring = isAuthoringInstance(block);
  if (block.dataset.decorated && !isAuthoring) return;
  block.dataset.decorated = 'true';

  const doc = block.ownerDocument;

  if (isAuthoring) {
    removeDuplicateAuthoringBlocks(block);
    block.querySelectorAll(':scope > .menu-card-action').forEach((c) => c.remove());
  }

  const sourceRows = getSourceRows(block);
  const [layoutRow, ...cardRows] = sourceRows;

  const layoutText = layoutRow?.textContent?.trim().toLowerCase() || '';
  const isScrollable = layoutText === 'scrollable';
  const customClasses = layoutText && layoutText !== 'stacked' ? ` ${layoutText}` : '';
  const layout = isScrollable ? 'scrollable' : `stacked${customClasses}`;

  const container = createElementFromHTML(`<div class="menu-card-action content ${layout}"></div>`, doc);

  const section = block.closest('.menu-card-actions-container');
  ['text', 'image'].forEach((type, i) => {
    section?.querySelector(`.default-content-wrapper > p:nth-of-type(${i + 1})`)
      ?.classList.add(`default-content-wrapper-${type}`);
  });

  if (layoutRow) layoutRow.hidden = true;

  cardRows.forEach((row) => {
    const card = createCardItem(row, doc);
    if (!card) return;
    moveInstrumentation(row, card);
    row.remove();
    container.appendChild(card);
  });

  block.appendChild(container);

  getSourceRows(block).filter((row) => row !== layoutRow).forEach((row) => block.appendChild(row));

  if (isScrollable) attachScrollableDropdownPanel(container, doc);

  bindModalHandler(block, doc);
}

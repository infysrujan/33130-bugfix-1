import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import { getLang, isAuthoringInstance, applyLinkTarget } from '../../scripts/bbl-decorators.js';
import createGlobalDropdown from '../../scripts/utils/dropdown-helpers.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';
import { openModal } from '../../scripts/utils/modal.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (getLang() === 'th') {
    return `${date.getDate()} ${date.toLocaleString('th-TH', { month: 'long' })} ${date.getFullYear() + 543}`;
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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

  const img = imageDiv?.querySelector('img');
  const headingEl = titleDiv?.querySelector('h1, h2, h3, h4, h5, h6');
  const titleText = titleDiv?.textContent?.trim() || '';
  const titleType = headingEl?.tagName?.toLowerCase() || 'h3';
  const title = headingEl?.outerHTML?.trim()
    ?? (titleText ? `<${titleType}>${titleText}</${titleType}>` : '');
  const description = descDiv?.innerHTML?.trim() || '';
  const actionType = actionTypeDiv?.textContent?.trim().toLowerCase().replace('-button', '') || 'default';

  let remaining = cells.slice(4);

  let dateText = '';
  const lastCell = remaining[remaining.length - 1];
  const lastCellText = lastCell?.textContent?.trim() || '';
  if (lastCellText.length >= 8 && !Number.isNaN(Date.parse(lastCellText))
    && !lastCell?.querySelector('a')) {
    dateText = formatDate(lastCellText);
    remaining = remaining.slice(0, -1);
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

  if (img) inner.appendChild(img.cloneNode(true));

  if (title) {
    inner.appendChild(createElementFromHTML(`<div class="menu-card-action-title">${title}</div>`, doc));
  }

  if (description) {
    inner.appendChild(createElementFromHTML(`<div class="menu-card-action-description">${description}</div>`, doc));
    inner.querySelector('.menu-card-action-title')?.classList.add('has-description');
  }

  const appendDownloadLink = (anchor) => {
    const dlLink = createDownloadLink(anchor, doc);
    if (dlLink) {
      dlLink.querySelector('.download-files')?.addEventListener('click', (e) => e.stopPropagation());
      inner.appendChild(dlLink);
    }
  };

  if (actionType === 'download' && actionCells.length > 0) {
    const dlCell = actionCells[actionCells.length - 1];
    const { enabled: openInNewTab, toggleCell: dlToggleCell } = extractToggledLink(
      remaining,
      (c) => c === dlCell,
    );
    if (dlToggleCell) remaining = remaining.filter((c) => c !== dlToggleCell);
    const dlAnchor = dlCell.querySelector('a');
    if (dlToggleCell) applyLinkTarget(dlCell, 'a', openInNewTab);
    appendDownloadLink(dlAnchor);
  } else if (actionType === 'multiple-download' && actionCells.length > 0) {
    const multipleCell = actionCells[actionCells.length - 1];
    const temp = createElementFromHTML(`<div>${multipleCell.innerHTML}</div>`, doc);
    temp.querySelectorAll('a').forEach(appendDownloadLink);
  } else if (actionType === 'select-dropdown') {
    const dropdownCell = actionCells.find((c) => c.querySelector('ul') || c.querySelectorAll('a').length >= 1);
    if (dropdownCell) {
      const labelCellIdx = remaining.indexOf(dropdownCell) - 1;
      const label = (labelCellIdx >= 0 && !remaining[labelCellIdx].querySelector('a'))
        ? remaining[labelCellIdx].textContent.trim()
        : remaining[labelCellIdx]?.textContent.trim() || 'Select';
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

function stripAuthoringInstrumentation(root) {
  if (!root) return;
  [root, ...root.querySelectorAll('*')].forEach((el) => {
    [...el.attributes]
      .filter(({ name }) => name.startsWith('data-aue-') || name.startsWith('data-richtext-'))
      .forEach(({ name }) => el.removeAttribute(name));
  });
}

function removeDuplicateAuthoringBlocks(block) {
  const blockResource = block.dataset.aueResource;
  if (!blockResource) return;

  block.ownerDocument.querySelectorAll('.menu-card-actions.block').forEach((other) => {
    if (other === block) return;
    if (other.dataset.aueResource !== blockResource) return;
    if (!other.classList.contains('has-preview') && !other.querySelector('.menu-card-actions-preview')) return;
    other.remove();
  });
}

function getPreviewContainer(block, doc) {
  const previewContainers = [...block.querySelectorAll(':scope > .menu-card-actions-preview')];
  const previewContainer = previewContainers.shift() || doc.createElement('div');

  previewContainers.forEach((container) => container.remove());

  previewContainer.className = 'menu-card-actions-preview';
  if (!previewContainer.isConnected) block.appendChild(previewContainer);

  return previewContainer;
}

function renderCardActions(target, rows, block, doc) {
  const firstRowText = rows[0]?.textContent?.trim().toLowerCase() || '';
  const isFirstRowLayout = rows[0]?.children.length === 1
    && /^[a-z-]+$/.test(firstRowText)
    && !rows[0].querySelector('a, img, h1, h2, h3, h4, h5, h6');

  const layoutClass = isFirstRowLayout ? firstRowText : '';
  const isScrollable = layoutClass === 'scrollable';
  const customClasses = layoutClass && layoutClass !== 'stacked' ? ` ${layoutClass}` : '';
  const layout = isScrollable ? 'scrollable' : `stacked${customClasses}`;
  const cardRows = isFirstRowLayout ? rows.slice(1) : rows;

  const section = block.closest('.menu-card-actions-container');
  ['text', 'image'].forEach((type, i) => {
    section?.querySelector(`.default-content-wrapper > p:nth-of-type(${i + 1})`)
      ?.classList.add(`default-content-wrapper-${type}`);
  });

  const container = createElementFromHTML(`<div class="menu-card-action ${layout}"></div>`, doc);

  if (isFirstRowLayout) rows[0].hidden = true;

  cardRows.forEach((row) => {
    const card = createCardItem(row, doc);

    if (!card) return;

    if (!isAuthoringInstance(block)) {
      moveInstrumentation(row, card);
      row.remove();
    }
    container.appendChild(card);
  });

  target.appendChild(container);

  if (!block.dataset.menuCardActionsDecorated) {
    block.dataset.menuCardActionsDecorated = 'true';
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
}

export default function decorate(block) {
  const doc = block.ownerDocument;

  if (isAuthoringInstance(block)) {
    removeDuplicateAuthoringBlocks(block);

    block.querySelectorAll(':scope > div').forEach((row) => {
      if (!row.classList.contains('menu-card-actions-preview')) {
        row.dataset.configRow = '';
        row.style.display = 'none';
      }
    });

    block.classList.add('has-preview');
    const previewContainer = getPreviewContainer(block, doc);

    previewContainer.innerHTML = '';
    const allRows = [...block.querySelectorAll(':scope > div[data-config-row]')];
    renderCardActions(previewContainer, allRows, block, doc);
    stripAuthoringInstrumentation(previewContainer);
    return;
  }

  const allRows = [...block.children];
  renderCardActions(block, allRows, block, doc);
}

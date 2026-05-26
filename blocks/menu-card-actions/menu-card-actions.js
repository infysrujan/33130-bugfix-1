import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import createGlobalDropdown from '../../scripts/utils/dropdown-helpers.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';
import { openModal } from '../../scripts/utils/modal.js';

function getTextValue(value) {
  return value?.toString().trim() || '';
}

function formatMenuCardDate(dateStr) {
  if (!dateStr) return '';
  const lang = getLang();
  const date = new Date(dateStr);
  if (lang === 'th') {
    const buddhistYear = date.getFullYear() + 543;
    const month = date.toLocaleString('th-TH', { month: 'long' });
    const day = date.getDate();
    return `${day} ${month} ${buddhistYear}`;
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function parseBooleanFlag(value, defaultValue = false) {
  const normalizedValue = getTextValue(value).toLowerCase();
  if (!normalizedValue) return defaultValue;
  if (normalizedValue === 'true') return true;
  if (normalizedValue === 'false') return false;
  return defaultValue;
}

function isBooleanLikeValue(value) {
  const normalizedValue = getTextValue(value).toLowerCase();
  return normalizedValue === 'true' || normalizedValue === 'false';
}

function getOverlayHref(linkDiv) {
  const linkedHref = linkDiv?.querySelector('a')?.getAttribute('href')?.trim();
  if (linkedHref && !isBooleanLikeValue(linkedHref)) return linkedHref;
  const textValue = getTextValue(linkDiv?.textContent);
  if (textValue && !isBooleanLikeValue(textValue)) return textValue;
  return '';
}

function createMenuCardItem(cardElement, doc) {
  const [
    imageDiv,
    titleDiv,
    descDiv,
    actionTypeTextDiv,
    defaultButtonDiv,
    downloadButtonDivA,
    downloadButtonDivB,
    dropdownLabletDiv,
    dropdownLinksDiv,
  ] = [...cardElement.children];

  const downloadButtonDiv = downloadButtonDivA?.querySelector('a')
    ? downloadButtonDivA
    : downloadButtonDivB;

  const img = imageDiv?.querySelector('img');
  const title = titleDiv?.innerHTML?.trim();
  const description = descDiv?.innerHTML;
  const actionTypeText = actionTypeTextDiv?.textContent?.trim();
  const defaultButton = defaultButtonDiv?.querySelector('a');
  const downloadButton = downloadButtonDiv?.querySelector('a');
  const dropdownLable = dropdownLabletDiv?.textContent?.trim();
  const dropdownLinks = dropdownLinksDiv?.innerHTML;

  const card = createElementFromHTML(
    '<div class="menu-card-action-item"></div>',
    doc,
  );

  const inner = createElementFromHTML(
    '<div class="menu-card-action-inner"></div>',
    doc,
  );

  /* ---------------- IMAGE ---------------- */
  if (img) {
    const newImg = img.cloneNode(true);
    inner.appendChild(newImg);
  }

  /* ---------------- TITLE ---------------- */
  if (title) {
    inner.appendChild(
      createElementFromHTML(
        `<div class="menu-card-action-title">${title}</div>`,
        doc,
      ),
    );
  }

  /* ---------------- DESCRIPTION ---------------- */
  if (description) {
    inner.appendChild(
      createElementFromHTML(
        `<div class="menu-card-action-description">${description}</div>`,
        doc,
      ),
    );
    inner.querySelector('.menu-card-action-title')?.classList.add('has-description');
  }

  /* ---------------- ACTION DEFAULT ---------------- */
  if (actionTypeText === 'default' && defaultButton) {
    const defaultButtonClone = defaultButton.cloneNode(true);
    inner.appendChild(defaultButtonClone);
  }

  /* ---------------- ACTION : DOWNLOAD ---------------- */
  if (actionTypeText === 'download' && downloadButton) {
    inner.appendChild(createDownloadLink(downloadButton, doc));
  }

  /* ---------------- ACTION : DROPDOWN ---------------- */
  if (actionTypeText === 'select-dropdown') {
    const dropdown = createGlobalDropdown(dropdownLable || 'Select', dropdownLinks, doc);
    inner.appendChild(dropdown);
  }

  card.appendChild(inner);
  return card;
}

export default function decorate(block) {
  const doc = block.ownerDocument;
  const [mobileRow, ...cardRows] = [...block.children];
  const mobileExperience = mobileRow?.textContent?.trim();
  const section = block.closest('.menu-card-actions-container');
  ['text', 'image'].forEach((type, i) => {
    section?.querySelector(`.default-content-wrapper > p:nth-of-type(${i + 1})`)
      ?.classList.add(`default-content-wrapper-${type}`);
  });

  const container = createElementFromHTML(
    `<div class="menu-card-action ${mobileExperience}"></div>`,
    doc,
  );

  cardRows.forEach((row) => {
    const card = createMenuCardItem(row, doc);
    moveInstrumentation(row, card);
    container.appendChild(card);
  });

  block.textContent = '';
  block.appendChild(container);

  block.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    if (!trigger || !block.contains(trigger)) return;
    event.preventDefault();
    const fragmentPath = trigger.getAttribute('data-modal');
    if (fragmentPath) openModal(doc, { fragmentPath });
  });
}

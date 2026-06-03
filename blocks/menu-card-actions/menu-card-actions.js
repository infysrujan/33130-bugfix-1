import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import createGlobalDropdown from '../../scripts/utils/dropdown-helpers.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';

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
}

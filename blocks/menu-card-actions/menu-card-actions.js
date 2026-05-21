import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import { getLang } from '../../scripts/bbl-decorators.js';
import createGlobalDropdown from '../../scripts/utils/dropdown-helpers.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';
import { loadFragment } from '../fragment/fragment.js';

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

function decorateModalContent(modalBody) {
  let hasTitle = false;
  const wrappers = [...modalBody.querySelectorAll('.default-content-wrapper')];
  const [firstWrapper] = wrappers;
  const headings = wrappers.flatMap((wrapper) => [...wrapper.querySelectorAll('h1, h2, h3, h4, h5, h6')]);
  const lastHeading = headings.at(-1);

  if (firstWrapper) firstWrapper.classList.add('card-list-modal-content');

  wrappers.forEach((wrapper) => {
    let textIndex = 0;
    [...wrapper.children].forEach((el, index) => {
      if (el.matches('h1, h2, h3, h4, h5, h6')) {
        if (!hasTitle) {
          el.classList.add('card-list-modal-title');
          hasTitle = true;
        } else if (el === lastHeading) {
          el.classList.add('card-list-modal-last-title');
        } else {
          el.classList.add('card-list-modal-subtitle');
        }
        return;
      }
      if (!el.matches('p')) return;
      const isMedia = !!el.querySelector('picture, img');
      const classes = [
        'card-list-modal-paragraph',
        `card-list-modal-paragraph-${index + 1}`,
        isMedia ? 'card-list-modal-media' : 'card-list-modal-text',
      ];
      if (!isMedia) {
        textIndex += 1;
        classes.push(
          `card-list-modal-text-${textIndex}`,
          textIndex === 1 ? 'card-list-modal-intro' : 'card-list-modal-description',
        );
      }
      el.classList.add(...classes);
    });
  });

  wrappers.slice(1).forEach((wrapper) => wrapper.replaceWith(...wrapper.childNodes));
}

function createModal(doc) {
  if (doc.querySelector('.custom-modal')) return doc.querySelector('.custom-modal');

  const modal = createElementFromHTML(`
    <div class="custom-modal" aria-hidden="true">
      <div class="modal-overlay"></div>
      <div class="modal-content" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" aria-label="Close modal">&times;</button>
        <div class="modal-body card-list-modal-body"></div>
      </div>
    </div>`, doc);

  const closeModal = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    doc.body.classList.remove('modal-open');
  };

  modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
  modal.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
  doc.addEventListener('keydown', (e) => e.key === 'Escape' && modal.classList.contains('active') && closeModal());

  return doc.body.appendChild(modal);
}

async function openModal(doc, fragmentPath) {
  const modal = createModal(doc);
  const modalBody = modal.querySelector('.modal-body');
  if (!modalBody) return;

  try {
    const fragment = await loadFragment(fragmentPath);
    if (!fragment) throw new Error(`Unable to load fragment: ${fragmentPath}`);
    modalBody.replaceChildren(...fragment.children);
    decorateModalContent(modalBody);
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    doc.body.classList.add('modal-open');
  } catch {
    // Modal content failed to load; keep the current page state unchanged.
  }
}

function createMenuCardItem(cardElement, doc) {
  const cells = [...cardElement.children];
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
    multipleDownloadLinksDiv,
    isCardClickableDiv,
    cardLinkDiv,
    enableOverlayModalDiv,
    overlayHrefDiv,
  ] = cells;

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
  const multipleDownloadLinks = multipleDownloadLinksDiv?.innerHTML;
  const isCardClickable = parseBooleanFlag(isCardClickableDiv?.textContent, false);
  const cardLinkAnchor = cardLinkDiv?.querySelector('a');
  const cardLinkHref = cardLinkAnchor?.href || '';
  const cardLinkTarget = cardLinkAnchor?.target || '';
  const cardLinkTitle = cardLinkAnchor?.title?.trim() || '';
  const enableOverlayModal = isBooleanLikeValue(enableOverlayModalDiv?.textContent)
    ? parseBooleanFlag(enableOverlayModalDiv?.textContent, false)
    : !!getOverlayHref(enableOverlayModalDiv);
  const overlayHref = isBooleanLikeValue(enableOverlayModalDiv?.textContent)
    ? getOverlayHref(overlayHrefDiv)
    : getOverlayHref(enableOverlayModalDiv);
  const dateTextRaw = cells.at(-1)?.textContent?.trim() || '';

  let dateText = '';
  if (dateTextRaw) {
    const parsedDate = new Date(dateTextRaw);
    if (!Number.isNaN(parsedDate.getTime())) {
      dateText = formatMenuCardDate(dateTextRaw);
    } else {
      dateText = dateTextRaw;
    }
  }

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
    defaultButtonClone.removeAttribute('data-modal');
    if (enableOverlayModal && overlayHref) {
      defaultButtonClone.removeAttribute('href');
      defaultButtonClone.setAttribute('data-modal', overlayHref);
    }
    inner.appendChild(defaultButtonClone);
  }

  /* ---------------- ACTION : DOWNLOAD ---------------- */
  if (actionTypeText === 'download' && downloadButton) {
    const dlLink = createDownloadLink(downloadButton, doc);
    dlLink?.querySelector('.download-files')?.addEventListener('click', (e) => e.stopPropagation());
    inner.appendChild(dlLink);
  }

  /* ---------------- ACTION : MULTIPLE DOWNLOAD ---------------- */
  if (actionTypeText === 'multiple-download' && multipleDownloadLinks) {
    const temp = createElementFromHTML(`<div>${multipleDownloadLinks}</div>`, doc);
    temp.querySelectorAll('a').forEach((anchor) => {
      const downloadLink = createDownloadLink(anchor, doc);
      if (downloadLink) {
        downloadLink.classList.add('multiple-download-wrapper');
        downloadLink.querySelector('.download-files')?.addEventListener('click', (e) => e.stopPropagation());
        inner.appendChild(downloadLink);
      }
    });
  }

  /* ---------------- ACTION : DROPDOWN ---------------- */
  if (actionTypeText === 'select-dropdown') {
    const dropdown = createGlobalDropdown(dropdownLable || 'Select', dropdownLinks, doc);
    inner.appendChild(dropdown);
  }

  /* ---------------- DATE TEXT ---------------- */
  if (dateText) {
    const dateTextWrapper = doc.createElement('div');
    dateTextWrapper.className = 'menu-card-action-date pad-top-30';
    dateTextWrapper.textContent = dateText;
    inner.appendChild(dateTextWrapper);
  }

  if (isCardClickable && cardLinkHref) {
    const wrapper = createElementFromHTML('<a class="menu-card-action-item-link"></a>', doc);
    if (cardLinkTitle) wrapper.setAttribute('title', cardLinkTitle);
    if (cardLinkTarget) wrapper.setAttribute('target', cardLinkTarget);
    if (cardLinkTarget === '_blank') wrapper.setAttribute('rel', 'noopener noreferrer');
    if (enableOverlayModal && overlayHref) {
      wrapper.setAttribute('data-modal', overlayHref);
    } else if (!enableOverlayModal) {
      wrapper.setAttribute('href', cardLinkHref);
    }
    wrapper.appendChild(inner);
    card.appendChild(wrapper);
  } else {
    card.appendChild(inner);
  }

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
    if (fragmentPath) openModal(doc, fragmentPath);
  });
}

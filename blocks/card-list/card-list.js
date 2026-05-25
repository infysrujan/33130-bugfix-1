import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';
import { loadFragment } from '../fragment/fragment.js';

function decorateModalContent(modalBody) {
  let hasTitle = false;
  const wrappers = [...modalBody.querySelectorAll('.default-content-wrapper')];
  const [firstWrapper] = wrappers;
  const headings = wrappers.flatMap((wrapper) => [...wrapper.querySelectorAll('h1, h2, h3, h4, h5, h6')]);
  const lastHeading = headings.at(-1);

  if (firstWrapper) {
    firstWrapper.classList.add('card-list-modal-content');
  }

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

  wrappers.slice(1).forEach((wrapper) => {
    wrapper.replaceWith(...wrapper.childNodes);
  });
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
    // fragment failed to load — modal stays closed
  }
}

function getTextValue(value) {
  return value?.toString().trim() || '';
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

function createCardListItem(cardElement, doc) {
  const cells = [...cardElement.children];

  const actionTypeText = cells[6]?.textContent?.trim().replace('-button', '') || 'default';
  const openInNewTab = parseBooleanFlag(cells[8]?.textContent, false);
  const multipleDownloadLinks = cells[9]?.querySelector('a') ? cells[9].innerHTML : null;
  const imageLayout = cells[10]?.textContent?.trim() || 'default';
  const enableTitleUnderline = parseBooleanFlag(cells[11]?.textContent, false);
  const isCardClickable = parseBooleanFlag(cells[12]?.textContent, false);
  const cardLinkAnchor = cells[13]?.querySelector('a');
  const cardLinkHref = cardLinkAnchor?.getAttribute('href') || '';
  const cardLinkTarget = cardLinkAnchor?.getAttribute('target') || '';
  const cardLinkTitle = cardLinkAnchor?.getAttribute('title') || '';
  const overlayHref = getOverlayHref(cells[14]);
  const enableOverlayModal = !!overlayHref;

  const img = cells[0]?.querySelector('img');
  const promoTag = cells[1]?.textContent?.trim();
  const title = cells[2]?.innerHTML?.trim();
  const subtitle = cells[3]?.textContent?.trim() || '';
  const description = cells[4]?.innerHTML;
  const remark = cells[5]?.innerHTML;
  const defaultButton = cells[7]?.querySelector('a');

  const card = createElementFromHTML('<div class="cards-list-item"></div>', doc);
  const inner = createElementFromHTML('<div class="cards-list-inner"></div>', doc);
  const content = createElementFromHTML('<div class="cards-list-content"></div>', doc);

  if (img) {
    const newImg = img.cloneNode(true);
    const imageWrapper = createElementFromHTML(
      `<div class="cards-list-image cards-list-image-${imageLayout}"></div>`,
      doc,
    );
    imageWrapper.appendChild(newImg);
    inner.appendChild(imageWrapper);
  }

  if (promoTag) {
    content.appendChild(
      createElementFromHTML(`<div class="cards-list-promo-tag"><p>${promoTag}</p></div>`, doc),
    );
  }

  if (title) {
    const titleClasses = ['cards-list-title'];
    if (enableTitleUnderline) titleClasses.push('has-title-underline');
    content.appendChild(
      createElementFromHTML(`<div class="${titleClasses.join(' ')}">${title}</div>`, doc),
    );
  }

  if (subtitle) {
    content.appendChild(
      createElementFromHTML(`<div class="cards-list-subtitle"><p>${subtitle}</p></div>`, doc),
    );
  }

  if (description) {
    content.appendChild(
      createElementFromHTML(`<div class="cards-list-description">${description}</div>`, doc),
    );
    content.querySelector('.cards-list-title')?.classList.add('has-description');
  }

  if (remark) {
    content.appendChild(
      createElementFromHTML(`<div class="cards-list-remark">${remark}</div>`, doc),
    );
  }

  if (content.children.length) inner.appendChild(content);

  if (actionTypeText === 'default' && defaultButton) {
    const buttonLink = defaultButton.cloneNode(true);

    // Always clear target/rel first, then re-apply based on openInNewTab boolean
    buttonLink.removeAttribute('target');
    buttonLink.removeAttribute('rel');
    buttonLink.removeAttribute('data-modal');

    if (enableOverlayModal && overlayHref) {
      // Modal takes priority — remove href, set data-modal
      buttonLink.removeAttribute('href');
      buttonLink.setAttribute('data-modal', overlayHref);
    } else if (openInNewTab) {
      buttonLink.setAttribute('target', '_blank');
      buttonLink.setAttribute('rel', 'noopener noreferrer');
    }

    const buttonWrapper = createElementFromHTML('<div class="cards-list-button"></div>', doc);
    buttonWrapper.appendChild(buttonLink);
    inner.appendChild(buttonWrapper);
  }

  if (actionTypeText === 'multiple-download' && multipleDownloadLinks) {
    const temp = createElementFromHTML(`<div>${multipleDownloadLinks}</div>`, doc);
    const buttonWrapper = createElementFromHTML(
      '<div class="cards-list-button cards-list-downloads"></div>',
      doc,
    );

    temp.querySelectorAll('a').forEach((anchor) => {
      const downloadLink = createDownloadLink(anchor, doc);
      if (downloadLink) {
        downloadLink.classList.add('multiple-download-wrapper');
        downloadLink.querySelector('.download-files')?.addEventListener('click', (e) => e.stopPropagation());
        buttonWrapper.appendChild(downloadLink);
      }
    });

    if (buttonWrapper.children.length) inner.appendChild(buttonWrapper);
  }

  if (isCardClickable && cardLinkHref) {
    const wrapper = createElementFromHTML('<a class="cards-list-item-link"></a>', doc);

    if (cardLinkTitle) wrapper.setAttribute('title', cardLinkTitle);

    if (enableOverlayModal && overlayHref) {
      // Modal takes priority — no href, set data-modal, click handler opens modal
      wrapper.setAttribute('data-modal', overlayHref);
    } else {
      wrapper.setAttribute('href', cardLinkHref);
      if (cardLinkTarget) wrapper.setAttribute('target', cardLinkTarget);
      if (cardLinkTarget === '_blank') wrapper.setAttribute('rel', 'noopener noreferrer');
    }

    wrapper.appendChild(inner);
    card.appendChild(wrapper);
  } else {
    card.appendChild(inner);
  }

  return card;
}

export default function decorate(block) {
  if (block.dataset.decorated) return;
  block.dataset.decorated = 'true';

  const doc = block.ownerDocument;
  const [LayoutRow, Alignment, cardsPerRowEl, ...cardRows] = [...block.children];
  const cardListLayout = LayoutRow?.textContent?.trim();
  const cardListAlignment = Alignment?.textContent?.trim();
  const cardsPerRow = cardsPerRowEl?.textContent?.trim();
  const container = createElementFromHTML(
    `<div class="cards-list ${cardListLayout} ${cardListAlignment} ${cardsPerRow}"></div>`,
    doc,
  );

  [LayoutRow, Alignment, cardsPerRowEl].forEach((row) => {
    if (row) row.hidden = true;
  });

  cardRows.forEach((row) => {
    const card = createCardListItem(row, doc);
    moveInstrumentation(row, card);
    container.appendChild(card);
    row.remove();
  });

  block.appendChild(container);

  block.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    if (!trigger || !block.contains(trigger)) return;
    event.preventDefault();
    const fragmentPath = trigger.getAttribute('data-modal');
    if (fragmentPath) openModal(doc, fragmentPath);
  });
}

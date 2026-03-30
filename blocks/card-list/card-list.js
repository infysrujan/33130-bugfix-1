import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';

function isTruthy(value) {
  return value?.toString().trim().toLowerCase() === 'true';
}

function getLinkConfig(linkDiv) {
  const anchor = linkDiv?.querySelector('a');
  const href = anchor?.href || '';
  const target = anchor?.target || '';
  const title = anchor?.title || '';
  return href ? { href, target, title } : null;
}

function createCardListItem(cardElement, doc) {
  const cells = [...cardElement.children];
  const [
    imageDiv,
    titleDiv,
    descDiv,
    remarkDiv,
    buttonDiv,
    imageLayoutDiv,
    enableTitleUnderlineDiv,
    isCardClickableDiv,
    cardLinkDiv,
    enableOverlayModalDiv,
    overlayLinkDiv,
  ] = cells;

  const img = imageDiv?.querySelector('img');
  const title = titleDiv?.innerHTML?.trim();
  const description = descDiv?.innerHTML;
  const remark = remarkDiv?.innerHTML;
  const buttonEl = buttonDiv?.querySelector('a');
  const imageLayout = imageLayoutDiv?.textContent?.trim() || 'default';
  const enableTitleUnderline = isTruthy(enableTitleUnderlineDiv?.textContent);
  const isCardClickable = isTruthy(isCardClickableDiv?.textContent);
  const enableOverlayModal = isTruthy(enableOverlayModalDiv?.textContent);
  const overlayHref = overlayLinkDiv?.textContent?.trim() || '';
  const cardLinkConfig = getLinkConfig(cardLinkDiv);

  const card = createElementFromHTML('<div class="cards-list-item"></div>', doc);
  const inner = createElementFromHTML('<div class="cards-list-inner"></div>', doc);

  if (img) {
    const newImg = img.cloneNode(true);
    const imageWrapper = createElementFromHTML(
      `<div class="cards-list-image cards-list-image-${imageLayout}"></div>`,
      doc,
    );
    imageWrapper.appendChild(newImg);
    inner.appendChild(imageWrapper);
  }

  if (title) {
    const titleClasses = ['cards-list-title'];
    if (enableTitleUnderline) titleClasses.push('has-title-underline');
    inner.appendChild(
      createElementFromHTML(`<div class="${titleClasses.join(' ')}">${title}</div>`, doc),
    );
  }

  if (description) {
    inner.appendChild(
      createElementFromHTML(`<div class="cards-list-description">${description}</div>`, doc),
    );
    inner.querySelector('.cards-list-title')?.classList.add('has-description');
  }

  if (remark) {
    inner.appendChild(
      createElementFromHTML(`<div class="cards-list-remark">${remark}</div>`, doc),
    );
  }

  if (buttonEl) {
    let buttonHTML;
    if (enableOverlayModal && overlayHref) {
      const titleAttr = buttonEl.title ? ` title="${buttonEl.title}"` : '';
      buttonHTML = `<a data-modal="${overlayHref}"${titleAttr}>${buttonEl.innerHTML}</a>`;
    } else {
      buttonHTML = buttonEl.outerHTML;
    }
    inner.appendChild(
      createElementFromHTML(`<div class="cards-list-button">${buttonHTML}</div>`, doc),
    );
  }

  if (isCardClickable && cardLinkConfig) {
    const titleAttr = cardLinkConfig.title ? ` title="${cardLinkConfig.title}"` : '';
    const targetAttr = cardLinkConfig.target ? ` target="${cardLinkConfig.target}"` : '';
    const relAttr = cardLinkConfig.target === '_blank' ? ' rel="noopener noreferrer"' : '';

    let hrefAttr;
    if (enableOverlayModal && overlayHref) {
      hrefAttr = `data-modal="${overlayHref}"`;
    } else {
      hrefAttr = `href="${cardLinkConfig.href}"`;
    }

    const wrapper = createElementFromHTML(
      `<a class="cards-list-item-link" ${hrefAttr}${targetAttr}${titleAttr}${relAttr}></a>`,
      doc,
    );
    wrapper.appendChild(inner);
    card.appendChild(wrapper);
  } else {
    card.appendChild(inner);
  }

  return card;
}

export default function decorate(block) {
  if (block.dataset.decorated === 'true') return;
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

  cardRows.forEach((row) => {
    const card = createCardListItem(row, doc);
    moveInstrumentation(row, card);
    container.appendChild(card);
  });

  block.textContent = '';
  block.appendChild(container);
}

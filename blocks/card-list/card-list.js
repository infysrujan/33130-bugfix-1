import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';

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
    // eslint-disable-next-line no-unused-vars
    targetAudienceDiv,
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
  const enableTitleUnderline = enableTitleUnderlineDiv?.textContent?.trim();
  const isCardClickable = isCardClickableDiv?.textContent?.trim();
  const enableOverlayModal = enableOverlayModalDiv?.textContent?.trim();
  const overlayHref = overlayLinkDiv?.querySelector('a')?.getAttribute('href')?.trim()
    || overlayLinkDiv?.textContent?.trim()
    || '';

  const cardLinkConfig = getLinkConfig(cardLinkDiv);

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

  if (title) {
    const titleClasses = ['cards-list-title'];
    if (enableTitleUnderline === 'true') titleClasses.push('has-title-underline');
    content.appendChild(
      createElementFromHTML(`<div class="${titleClasses.join(' ')}">${title}</div>`, doc),
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

  if (content.children.length) {
    inner.appendChild(content);
  }

  if (buttonEl) {
    let buttonHTML;
    if (enableOverlayModal === 'true' && overlayHref) {
      const titleAttr = buttonEl.title ? ` title="${buttonEl.title}"` : '';
      buttonHTML = `<a data-modal="${overlayHref}"${titleAttr}>${buttonEl.innerHTML}</a>`;
    } else {
      buttonHTML = buttonEl.outerHTML;
    }
    inner.appendChild(
      createElementFromHTML(`<div class="cards-list-button">${buttonHTML}</div>`, doc),
    );
  }

  if (isCardClickable === 'true' && cardLinkConfig) {
    const titleAttr = cardLinkConfig.title ? ` title="${cardLinkConfig.title}"` : '';
    const targetAttr = cardLinkConfig.target ? ` target="${cardLinkConfig.target}"` : '';
    const relAttr = cardLinkConfig.target === '_blank' ? ' rel="noopener noreferrer"' : '';

    let hrefAttr;
    if (enableOverlayModal === 'true' && overlayHref) {
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

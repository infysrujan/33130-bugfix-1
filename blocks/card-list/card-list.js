import { moveInstrumentation, createElementFromHTML } from '../../scripts/scripts.js';

function isTruthy(value) {
  return value?.toString().trim().toLowerCase() === 'true';
}

function getLinkConfig(linkDiv, targetDiv, linkTitleDiv) {
  const anchor = linkDiv?.querySelector('a');
  const href = anchor?.href || linkDiv?.textContent?.trim() || '';
  const targetSetting = targetDiv?.querySelector('div')?.textContent?.trim()
    || targetDiv?.textContent?.trim()
    || '';
  const target = targetSetting.toLowerCase() === 'true'
    ? '_blank'
    : anchor?.target || '';
  const title = linkTitleDiv?.textContent?.trim() || anchor?.title || '';

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
    enableTitleUnderlineDiv,
    isCardClickableDiv,
    ...cardLinkCells
  ] = cells;

  const img = imageDiv?.querySelector('img');
  const title = titleDiv?.innerHTML?.trim();
  const description = descDiv?.innerHTML;
  const remark = remarkDiv?.innerHTML;
  const buttonEl = buttonDiv?.querySelector('a');
  const imageLayoutDiv = cardLinkCells[0];
  const imageLayout = imageLayoutDiv?.textContent?.trim() || 'default';
  const enableTitleUnderline = isTruthy(enableTitleUnderlineDiv?.textContent);
  const isCardClickable = isTruthy(isCardClickableDiv?.textContent);
  const interactiveCells = cardLinkCells.slice(1);
  const cardLinkDiv = interactiveCells.find(
    (cell) => cell?.querySelector('a') || cell?.textContent?.trim(),
  );
  const cardLinkIndex = interactiveCells.indexOf(cardLinkDiv);
  const linkConfigCells = cardLinkIndex >= 0
    ? interactiveCells.slice(cardLinkIndex + 1)
    : [];
  const cardTargetSettingsDiv = linkConfigCells.find((cell) => {
    const text = cell?.querySelector('div')?.textContent?.trim()
      || cell?.textContent?.trim()
      || '';
    return ['true', 'false'].includes(text.toLowerCase());
  });
  const cardLinkTitleDiv = linkConfigCells.find((cell) => {
    const text = cell?.textContent?.trim() || '';
    return text && !['true', 'false'].includes(text.toLowerCase());
  });
  const cardLinkConfig = getLinkConfig(
    cardLinkDiv,
    cardTargetSettingsDiv,
    cardLinkTitleDiv,
  );

  const card = createElementFromHTML(
    '<div class="cards-list-item"></div>',
    doc,
  );

  const inner = createElementFromHTML(
    '<div class="cards-list-inner"></div>',
    doc,
  );

  /* ---------------- IMAGE ---------------- */
  if (img) {
    const newImg = img.cloneNode(true);
    const imageWrapper = createElementFromHTML(
      `<div class="cards-list-image cards-list-image-${imageLayout}"></div>`,
      doc,
    );
    imageWrapper.appendChild(newImg);
    inner.appendChild(imageWrapper);
  }

  /* ---------------- TITLE ---------------- */
  if (title) {
    const titleClasses = ['cards-list-title'];
    if (enableTitleUnderline) titleClasses.push('has-title-underline');

    inner.appendChild(
      createElementFromHTML(
        `<div class="${titleClasses.join(' ')}">${title}</div>`,
        doc,
      ),
    );
  }

  /* ---------------- DESCRIPTION ---------------- */
  if (description) {
    inner.appendChild(
      createElementFromHTML(
        `<div class="cards-list-description">${description}</div>`,
      ),
    );
    inner.querySelector('.cards-list-title')?.classList.add('has-description');
  }

  if (remark) {
    inner.appendChild(
      createElementFromHTML(
        `<div class="cards-list-remark">${remark}</div>`,
        doc,
      ),
    );
  }

  if (buttonEl && !isCardClickable) {
    inner.appendChild(
      createElementFromHTML(
        `<div class="cards-list-button">${buttonEl.innerHTML}</div>`,
        doc,
      ),
    );
  }

  if (isCardClickable && cardLinkConfig) {
    const titleAttr = cardLinkConfig.title ? ` title="${cardLinkConfig.title}"` : '';
    const targetAttr = cardLinkConfig.target ? ` target="${cardLinkConfig.target}"` : '';
    const relAttr = cardLinkConfig.target === '_blank' ? ' rel="noopener noreferrer"' : '';
    const wrapper = createElementFromHTML(
      `<a class="cards-list-item-link" href="${cardLinkConfig.href}"${targetAttr}${titleAttr}${relAttr}></a>`,
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

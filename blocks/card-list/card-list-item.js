import { createElementFromHTML } from '../../scripts/scripts.js';
import createDownloadLink from '../../scripts/utils/download-helpers.js';
import createGlobalDropdown from '../../scripts/utils/dropdown-helpers.js';
import { applyLinkTarget, getLang } from '../../scripts/bbl-decorators.js';

export function getTextValue(value) {
  return value?.toString().trim() || '';
}

export function formatMenuCardDate(dateStr) {
  if (!dateStr) return '';
  const lang = getLang();
  const date = new Date(dateStr);
  if (lang === 'th') {
    const buddhistYear = date.getFullYear() + 543;
    const month = date.toLocaleString('th-TH', { month: 'long' });
    const day = date.getDate();
    return `${day} ${month} ${buddhistYear}`;
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function parseBooleanFlag(value, defaultValue = false) {
  const normalizedValue = getTextValue(value).toLowerCase();
  if (!normalizedValue) return defaultValue;
  if (normalizedValue === 'true') return true;
  if (normalizedValue === 'false') return false;
  return defaultValue;
}

export function isBooleanLikeValue(value) {
  const normalizedValue = getTextValue(value).toLowerCase();
  return normalizedValue === 'true' || normalizedValue === 'false';
}

export function getOverlayHref(linkDiv) {
  const linkedHref = linkDiv?.querySelector('a')?.getAttribute('href')?.trim();
  if (linkedHref && !isBooleanLikeValue(linkedHref)) return linkedHref;

  const textValue = getTextValue(linkDiv?.textContent);
  if (textValue && !isBooleanLikeValue(textValue)) return textValue;

  return '';
}

export function createCardListItem(cardElement, doc) {
  const cells = [...cardElement.children];
  const [
    imageDiv,
    promoTagDiv,
    titleDiv,
    subtitleDiv,
    descDiv,
    remarkDiv,
    actionTypeTextDiv,
    defaultButtonDiv,
    targetOrDownloadDiv,
  ] = cells;

  const actionTypeText = actionTypeTextDiv?.textContent?.trim().replace('-button', '') || 'default';

  const cell8Text = targetOrDownloadDiv?.textContent?.trim() ?? '';
  const hasTargetFlag = isBooleanLikeValue(cell8Text);
  const openInNewTab = hasTargetFlag ? parseBooleanFlag(cell8Text, false) : false;

  const downloadOffset = hasTargetFlag ? 1 : 0;
  const downloadLinksCell = cells[8 + downloadOffset]?.querySelector('a')
    ? cells[8 + downloadOffset]
    : null;
  const multipleDownloadLinks = downloadLinksCell?.querySelector('a')
    ? downloadLinksCell.innerHTML
    : null;

  const stubOffset = downloadLinksCell === cells[9 + downloadOffset] ? 1 : 0;

  const relIdx = cells.slice(9 + downloadOffset + stubOffset).findIndex(
    (c) => !isBooleanLikeValue(c.textContent?.trim() ?? ''),
  );
  const base = relIdx === -1
    ? cells.length
    : (9 + downloadOffset + stubOffset) + relIdx;

  const img = imageDiv?.querySelector('img');
  const promoTag = promoTagDiv?.textContent?.trim();
  const title = titleDiv?.innerHTML?.trim();
  const subtitle = subtitleDiv?.textContent?.trim() || '';
  const description = descDiv?.innerHTML;
  const remark = remarkDiv?.innerHTML;
  const dateTextRaw = cells[cells.length - 1]?.textContent?.trim() || '';
  let financialDate = '';
  if (dateTextRaw) {
    const parsedDate = new Date(dateTextRaw);
    financialDate = !Number.isNaN(parsedDate.getTime())
      ? formatMenuCardDate(dateTextRaw)
      : dateTextRaw;
  }
  const defaultButton = defaultButtonDiv?.querySelector('a');
  const imageLayout = cells[base]?.textContent?.trim() || 'default';
  const enableTitleUnderline = parseBooleanFlag(cells[base + 1]?.textContent, false);
  const isCardClickable = parseBooleanFlag(cells[base + 2]?.textContent, false);
  const cardLinkAnchor = cells[base + 3]?.querySelector('a');
  const cardLinkHref = cardLinkAnchor?.getAttribute('href') || '';
  const cardLinkTarget = cardLinkAnchor?.target || '';
  const cardLinkTitle = cardLinkAnchor?.title || '';
  const cell4Text = cells[base + 4]?.textContent?.trim();
  const isCell4Boolean = isBooleanLikeValue(cell4Text);
  let overlayHref;
  if (isCell4Boolean) {
    overlayHref = getOverlayHref(cells[base + 5]);
  } else {
    overlayHref = getOverlayHref(cells[base + 4]);
  }
  const enableOverlayModal = isCell4Boolean ? parseBooleanFlag(cell4Text, false) : !!overlayHref;

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

  if (content.children.length) {
    inner.appendChild(content);
  }

  if (actionTypeText === 'default' && defaultButton) {
    const buttonWrapper = createElementFromHTML('<div class="cards-list-button"></div>', doc);
    buttonWrapper.innerHTML = defaultButtonDiv.innerHTML;
    const buttonLink = buttonWrapper.querySelector('a');
    if (buttonLink) {
      buttonLink.removeAttribute('data-modal');
      if (enableOverlayModal && overlayHref) {
        buttonLink.removeAttribute('href');
        buttonLink.setAttribute('data-modal', overlayHref);
      }
    }
    applyLinkTarget(buttonWrapper, 'a.button-m', openInNewTab);
    inner.appendChild(buttonWrapper);
  }

  if (actionTypeText === 'select-dropdown') {
    const label = cells[cells.length - 3]?.textContent?.trim() || 'Select';
    const linksHTML = cells[cells.length - 2]?.innerHTML || '';
    const buttonWrapper = createElementFromHTML('<div class="cards-list-button"></div>', doc);
    buttonWrapper.appendChild(createGlobalDropdown(label, linksHTML, doc));
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

    if (buttonWrapper.children.length) {
      inner.appendChild(buttonWrapper);
    }
  }

  if (financialDate) {
    inner.appendChild(
      createElementFromHTML(`<div class="cards-list-date">${financialDate}</div>`, doc),
    );
  }

  if (isCardClickable && cardLinkHref) {
    const wrapper = createElementFromHTML('<a class="cards-list-item-link"></a>', doc);

    if (cardLinkTitle) wrapper.setAttribute('title', cardLinkTitle);
    if (cardLinkTarget) wrapper.setAttribute('target', cardLinkTarget);
    if (cardLinkTarget === '_blank') wrapper.setAttribute('rel', 'noopener noreferrer');

    wrapper.target = openInNewTab ? '_blank' : '_self';
    if (openInNewTab) wrapper.setAttribute('rel', 'noopener noreferrer');

    if (enableOverlayModal && overlayHref) {
      wrapper.setAttribute('data-modal', overlayHref);
    } else {
      wrapper.setAttribute('href', cardLinkHref);
    }

    wrapper.appendChild(inner);
    card.appendChild(wrapper);
  } else {
    card.appendChild(inner);
  }

  return card;
}

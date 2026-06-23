import { createElementFromHTML } from '../../../../scripts/scripts.js';
import createDownloadLink from '../../../../scripts/utils/download-helpers.js';
import createGlobalDropdown from '../../../../scripts/utils/dropdown-helpers.js';
import { applyLinkTarget, getLang } from '../../../../scripts/bbl-decorators.js';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const lang = getLang();
  const date = new Date(dateStr);
  if (lang === 'th') {
    const buddhistYear = date.getFullYear() + 543;
    const month = date.toLocaleString('th-TH', { month: 'long' });
    return `${date.getDate()} ${month} ${buddhistYear}`;
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getHref(field) {
  if (!field) return '';
  if (typeof field === 'string') return field.trim();
  return field.href?.trim() || '';
}

function getLinkClass(linkType) {
  if (linkType === 'tertiary') return 'button-tertiary';
  if (linkType) return `button ${linkType}`;
  return 'button';
}

export default function decorate(fieldDiv, fd) {
  fieldDiv.classList.add('field-forms-card-list-item');

  const doc = fieldDiv.ownerDocument;

  const imagePath = fd.cardListImage || '';
  const imageAlt = fd.cardListImageAlt || '';
  const imageLayout = fd.imageLayout || 'default';
  const promoTag = fd.promoTag || '';
  const title = fd.title || '';
  const titleType = fd.titleType || 'h2';
  const subtitle = fd.subtitle || '';
  const description = fd.description || '';
  const remarkText = fd['remark-text'] || '';
  const enableTitleUnderline = !!fd.enableTitleUnderline;
  const actionType = (fd.buttonActionType || 'default-button').replace('-button', '');
  const openInNewTab = !!fd.targetLink;
  const linkHref = getHref(fd.link);
  const linkText = fd.linkText || '';
  const linkTitle = fd.linkTitle || '';
  const linkType = fd.linkType || '';
  const multipleDownloadLinksHTML = fd.multipleDownloadLinks || '';
  const dropdownLabel = fd.dropdownLable || 'Select';
  const dropLinksHTML = fd['drop-links'] || '';
  const isCardClickable = !!fd.isCardClickable;
  const cardLinkHref = getHref(fd.cardLink);
  const cardLinkTitle = fd.cardLinkTitle || '';
  const enableOverlayModal = !!fd.enableOverlayModal;
  const fragmentPath = getHref(fd.fragmentPath);
  const financialDateRaw = fd.financialDate || '';

  const card = createElementFromHTML('<div class="cards-list-item"></div>', doc);
  const inner = createElementFromHTML('<div class="cards-list-inner"></div>', doc);
  const content = createElementFromHTML('<div class="cards-list-content"></div>', doc);

  if (imagePath) {
    const img = document.createElement('img');
    img.src = imagePath;
    img.alt = imageAlt;
    img.loading = 'lazy';
    const imageWrapper = createElementFromHTML(
      `<div class="cards-list-image cards-list-image-${imageLayout}"></div>`,
      doc,
    );
    imageWrapper.appendChild(img);
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
      createElementFromHTML(
        `<div class="${titleClasses.join(' ')}"><${titleType}>${title}</${titleType}></div>`,
        doc,
      ),
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

  if (remarkText) {
    content.appendChild(
      createElementFromHTML(`<div class="cards-list-remark">${remarkText}</div>`, doc),
    );
  }

  if (content.children.length) inner.appendChild(content);

  if (actionType === 'default' && linkHref) {
    const buttonLink = document.createElement('a');
    buttonLink.href = enableOverlayModal && fragmentPath ? '#' : linkHref;
    buttonLink.className = getLinkClass(linkType);
    if (linkText) buttonLink.textContent = linkText;
    if (linkTitle) buttonLink.title = linkTitle;
    if (enableOverlayModal && fragmentPath) {
      buttonLink.removeAttribute('href');
      buttonLink.setAttribute('data-modal', fragmentPath);
    }
    const buttonWrapper = createElementFromHTML('<div class="cards-list-button"></div>', doc);
    buttonWrapper.appendChild(buttonLink);
    applyLinkTarget(buttonWrapper, 'a', openInNewTab);
    inner.appendChild(buttonWrapper);
  }

  if (actionType === 'select-dropdown') {
    const buttonWrapper = createElementFromHTML('<div class="cards-list-button"></div>', doc);
    buttonWrapper.appendChild(createGlobalDropdown(dropdownLabel, dropLinksHTML, doc));
    inner.appendChild(buttonWrapper);
  }

  if (actionType === 'multiple-download' && multipleDownloadLinksHTML) {
    const temp = createElementFromHTML(`<div>${multipleDownloadLinksHTML}</div>`, doc);
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

  if (financialDateRaw) {
    const parsedDate = new Date(financialDateRaw);
    const displayDate = !Number.isNaN(parsedDate.getTime())
      ? formatDate(financialDateRaw)
      : financialDateRaw;
    inner.appendChild(
      createElementFromHTML(`<div class="cards-list-date">${displayDate}</div>`, doc),
    );
  }

  if (isCardClickable && cardLinkHref) {
    const wrapper = createElementFromHTML('<a class="cards-list-item-link"></a>', doc);
    if (cardLinkTitle) wrapper.setAttribute('title', cardLinkTitle);
    wrapper.target = openInNewTab ? '_blank' : '_self';
    if (openInNewTab) wrapper.setAttribute('rel', 'noopener noreferrer');
    if (enableOverlayModal && fragmentPath) {
      wrapper.setAttribute('data-modal', fragmentPath);
    } else {
      wrapper.setAttribute('href', cardLinkHref);
    }
    wrapper.appendChild(inner);
    card.appendChild(wrapper);
  } else {
    card.appendChild(inner);
  }

  fieldDiv.innerHTML = '';
  fieldDiv.appendChild(card);
  return fieldDiv;
}

import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { readBlockConfig } from '../../scripts/aem.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import {
  createModalShell,
  showModal,
  hideModal,
  setupModalHandlers,
} from '../../scripts/utils/modal.js';
import { handleMobileAppView } from '../../scripts/utils/card-helpers.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };

function getPicture(cell) {
  return cell?.querySelector('picture') || null;
}

function isRegisterEnabled(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'Y' || normalized === 'D';
}

function getRegisterCtaLabel(isRegister, data) {
  if (!isRegisterEnabled(isRegister)) return '';
  return data?.registerCtaLabel || '';
}

function formatPromoDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function getRegisterCtaUrl(isRegister, registerCtaUrl, data) {
  if (!isRegisterEnabled(isRegister) || !registerCtaUrl) return '';

  const tokenMap = {
    'PROMO-ID': data?.id || '',
    'PROMO-TITLE': (data?.title || '').replace(/<[^>]*>/g, '').trim(),
    'PROMO-START-DATE': formatPromoDate(data?.promotionStartDate),
    'PROMO-END-DATE': formatPromoDate(data?.promotionEndDate),
    'PROMO-FLAG': isRegister,
  };

  return registerCtaUrl.replace(
    /\{\{\s*([\w-]+)\s*\}\}/g,
    (_, key) => encodeURIComponent(tokenMap[key.trim()] ?? '')
      .replace(/%[0-9A-F]{2}/g, (hex) => hex.toLowerCase()),
  );
}

function readBlockData(block) {
  const firstRow = block.querySelector(':scope > div');
  if (!firstRow) return null;

  if (firstRow.children.length >= 2) {
    const config = readBlockConfig(block);
    const imageRow = [...block.querySelectorAll(':scope > div')].find((row) => {
      const key = row.children[0]?.textContent?.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || '';
      return key === 'detailimageurl';
    });
    return {
      id: config.promoid || '',
      title: config.title || '',
      detailImage: getPicture(imageRow?.children[1]),
      detailDescription: config.detaildescription || '',
      promotionStartDate: config.promotionstartdate || '',
      promotionEndDate: config.promotionenddate || '',
      responsibleLendingDisclaimerEnabled: config.responsiblelendingdisclaimerenabled || '',
      responsibleLendingDisclaimerText: config.responsiblelendingdisclaimertext || '',
      isRegister: config.isregister || '',
      registerCtaLabel: config.registerctalabel || '',
    };
  }

  const rows = [...block.querySelectorAll(':scope > div')];
  const txt = (i) => rows[i]?.children[0]?.textContent?.trim() || '';
  const innerHtml = (i) => rows[i]?.children[0]?.innerHTML?.trim() || '';
  const PROMO_TYPES = ['credit-card', 'bangkok-bank-m'];
  const promoType = txt(0).toLowerCase();
  const o = PROMO_TYPES.includes(promoType) ? 1 : 0;
  const isBBM = promoType === 'bangkok-bank-m';

  const titleHeading = rows[o + 1]?.querySelector('h1,h2,h3,h4,h5,h6');

  const len = rows.length;
  const hasRldEnabledField = len >= o + (isBBM ? 21 : 22);

  const rldEnabled = hasRldEnabledField ? txt(len - 4) : '';
  const rldTextRaw = innerHtml(len - 3);
  const rldEnabledIsTrue = rldEnabled.toLowerCase() === 'true';
  const rldText = hasRldEnabledField && !rldEnabledIsTrue ? '' : rldTextRaw;
  const rldEnabledOut = hasRldEnabledField ? rldEnabled : (rldText && 'true') || '';

  return {
    id: txt(o),
    title: titleHeading?.innerHTML?.trim() || txt(o + 1),
    detailImage: getPicture(rows[o + 3]),
    detailDescription: innerHtml(o + 5),
    promotionStartDate: txt(o + 11),
    promotionEndDate: txt(o + 12),
    responsibleLendingDisclaimerEnabled: rldEnabledOut,
    responsibleLendingDisclaimerText: rldText,
    isRegister: isBBM ? txt(len - 2) : '',
    registerCtaLabel: isBBM ? txt(len - 1) : '',
  };
}

function buildDisclaimerHtml(enabled, text) {
  if (String(enabled || '').trim().toLowerCase() !== 'true' || !text) return '';
  return `<div class="promo-detail-disclaimer pad-top-30">${text}</div>`;
}

function buildRegisterCtaHtml(label, url) {
  if (!label || !url) return '';
  return `
    <div class="promo-detail-cta button-container">
        <a href="${url}" class="button-m primary promo-detail-register-btn">${label}</a>
    </div>`;
}

function bindImageModal(container) {
  const imageLink = container.querySelector('.promo-detail-image-link');
  const picture = imageLink?.querySelector('picture');
  if (!imageLink || !picture) return;

  imageLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const doc = container.ownerDocument;

    if (doc.body.classList.contains('modal-open')) return;

    const wrapper = doc.createElement('div');
    wrapper.className = 'custom-modal';
    wrapper.setAttribute('aria-hidden', 'true');

    const backdrop = doc.createElement('div');
    backdrop.className = 'modal-overlay';

    const { overlay: content, dialog: body, closeBtn } = createModalShell({
      overlayClass: 'modal-content',
      dialogClass: 'modal-body promo-detail-image-modal',
      closeBtnClass: 'modal-close',
      closeBtnAriaLabel: 'Close modal',
    });
    content.insertBefore(closeBtn, body);

    let closeModal;

    const handleEscape = (evt) => {
      if (evt.key === 'Escape' && closeModal) closeModal();
    };

    closeModal = () => {
      doc.removeEventListener('keydown', handleEscape);
      wrapper.setAttribute('aria-hidden', 'true');
      hideModal(wrapper, 'active', () => doc.body.classList.remove('modal-open'));
    };

    closeBtn.addEventListener('click', closeModal);
    setupModalHandlers(wrapper, content, closeModal, { escapeKey: false, clickOutside: true });
    doc.addEventListener('keydown', handleEscape);
    wrapper.append(backdrop, content);

    const modalContent = doc.createElement('div');
    modalContent.className = 'promo-detail-image-modal-content';
    modalContent.appendChild(picture.cloneNode(true));

    body.replaceChildren(modalContent);
    doc.body.appendChild(wrapper);

    wrapper.setAttribute('aria-hidden', 'false');
    doc.body.classList.add('modal-open');
    showModal(wrapper, 'active');
  });
}

function renderDetails(container, data, locale, viewFull, registerCtaUrl) {
  const title = data?.title
    ? `<h2 class="promo-detail-title">${data.title}</h2>`
    : '';
  const picture = data?.detailImage;
  const description = data?.detailDescription || '';
  const disclaimerEnabled = data?.responsibleLendingDisclaimerEnabled;
  const disclaimerText = data?.responsibleLendingDisclaimerText || '';
  const isRegister = data?.isRegister || '';
  const ctaLabel = getRegisterCtaLabel(isRegister, data);
  const ctaUrl = getRegisterCtaUrl(isRegister, registerCtaUrl, data);

  const rowClass = picture ? 'promo-detail-row' : 'promo-detail-row promo-detail-row-no-image';
  const imageColHtml = picture ? `
          <div class="promo-detail-image">
            <a class="promo-detail-image-link" href="#" title="${viewFull}"></a>
          </div>` : '';

  container.innerHTML = `
    <div class="promo-detail-inner">
      <div class="promo-detail-center">
        <div class="promo-detail-title-wrap">
          ${title}
        </div>
        <div class="${rowClass}">
          ${imageColHtml}
          <div class="promo-detail-content">
            <div class="promo-detail-description">${description}</div>
          </div>
        </div>
      </div>
    </div>`;

  const disclaimerHtml = buildDisclaimerHtml(disclaimerEnabled, disclaimerText);
  const contentEl = container.querySelector('.promo-detail-content');
  if (disclaimerHtml) {
    contentEl?.insertAdjacentHTML('beforeend', disclaimerHtml);
  }
  contentEl?.insertAdjacentHTML('beforeend', buildRegisterCtaHtml(ctaLabel, ctaUrl));

  if (picture) {
    container.querySelector('.promo-detail-image-link')?.append(picture);
    bindImageModal(container);
  }
}

export default async function decorate(block) {
  const searchParams = new URLSearchParams(window.location.search);
  handleMobileAppView(searchParams);

  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-GB';

  const data = readBlockData(block);
  if (!isAuthoringInstance(block)) block.innerHTML = '';

  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const clickToViewFull = placeholders.promoClickToViewFull || '';
  const registerCtaUrl = (configs || {}).bbmIsRegister || '';

  if (isAuthoringInstance(block)) {
    if (!data || !Object.values(data).some(Boolean)) return;

    const originalChildren = [...block.children];
    block.classList.add('has-preview');
    let previewContainer = block.querySelector('.promo-detail-preview');
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.className = 'promo-detail-preview';
      block.appendChild(previewContainer);
    }

    renderDetails(previewContainer, data, locale, clickToViewFull, registerCtaUrl);

    const hidden = document.createElement('div');
    hidden.style.display = 'none';
    originalChildren.forEach((child) => hidden.appendChild(child));
    block.appendChild(hidden);
    return;
  }

  if (!data || !Object.values(data).some(Boolean)) {
    const errorMsg = placeholders.promoNoResults || 'No promotion details found.';
    block.innerHTML = `<p class="promo-detail-error">${errorMsg}</p>`;
    return;
  }

  renderDetails(block, data, locale, clickToViewFull, registerCtaUrl);
}

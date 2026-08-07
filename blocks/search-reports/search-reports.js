import { getLang, moveInstrumentation } from '../../scripts/scripts.js';
import { decorateIcons } from '../../scripts/aem.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import createTaggedElement from '../../scripts/utils/dom.js';
import {
  createModalHeader, showModal, hideModal, setupModalHandlers,
} from '../../scripts/utils/modal.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(element) {
  return [...element.querySelectorAll(FOCUSABLE_SELECTOR)].filter((n) => !n.hasAttribute('disabled'));
}

function trapFocus(event, overlay) {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(overlay);
  if (!focusable.length) { event.preventDefault(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

let lastTrigger = null;

function openSearchModal(overlay, trigger) {
  lastTrigger = trigger || document.activeElement;
  document.body.classList.add('search-reports-modal-open');
  showModal(overlay, 'search-reports-modal-visible');
  requestAnimationFrame(() => {
    const closeBtn = overlay.querySelector('.sr-close-btn');
    (closeBtn || overlay).focus();
  });
}

function closeSearchModal(overlay) {
  document.body.classList.remove('search-reports-modal-open');
  hideModal(overlay, 'search-reports-modal-visible', () => {
    if (lastTrigger?.focus) lastTrigger.focus();
  });
}

function buildDropdown(placeholder, onChange) {
  const wrapper = createTaggedElement('div', { className: 'sr-dropdown' });
  const selected = createTaggedElement('div', {
    className: 'sr-dropdown-selected',
    attrs: {
      tabindex: '0', role: 'combobox', 'aria-expanded': 'false', 'aria-haspopup': 'listbox',
    },
  });
  const selectedText = createTaggedElement('span', { className: 'sr-dropdown-text', text: placeholder });
  const chevron = createTaggedElement('span', { className: 'sr-dropdown-chevron', attrs: { 'aria-hidden': 'true' } });
  selected.append(selectedText, chevron);

  const list = createTaggedElement('ul', { className: 'sr-dropdown-list', attrs: { role: 'listbox' } });
  wrapper.append(selected, list);

  let currentValue = '';

  function toggle(open) {
    wrapper.classList.toggle('sr-dropdown-open', open);
    selected.setAttribute('aria-expanded', String(open));
  }

  function populateOptions(options) {
    list.innerHTML = '';
    const placeholderItem = createTaggedElement('li', {
      className: 'sr-dropdown-option sr-dropdown-placeholder',
      text: placeholder,
      attrs: { role: 'option', 'aria-selected': 'true', 'data-value': '' },
    });
    list.append(placeholderItem);
    options.forEach(({ label, value }) => {
      const item = createTaggedElement('li', {
        className: 'sr-dropdown-option',
        text: label,
        attrs: { role: 'option', 'aria-selected': 'false', 'data-value': value },
      });
      list.append(item);
    });
  }

  selected.addEventListener('click', () => toggle(!wrapper.classList.contains('sr-dropdown-open')));
  selected.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(!wrapper.classList.contains('sr-dropdown-open')); }
    if (e.key === 'Escape') toggle(false);
  });

  list.addEventListener('click', (e) => {
    const option = e.target.closest('[data-value]');
    if (!option || option.classList.contains('sr-dropdown-placeholder')) return;
    currentValue = option.dataset.value;
    selectedText.textContent = option.textContent;
    list.querySelectorAll('[aria-selected]').forEach((o) => o.setAttribute('aria-selected', 'false'));
    option.setAttribute('aria-selected', 'true');
    toggle(false);
    if (typeof onChange === 'function') onChange(currentValue);
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) toggle(false);
  });

  return { wrapper, getValue: () => currentValue, populateOptions };
}

async function fetchSearchParams(searchParamsUrl) {
  const result = await fetchGet(searchParamsUrl);
  const parsed = typeof result === 'string' ? JSON.parse(result) : result;
  if (!parsed) throw new Error('searchparams response empty');
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

// Rows 0-3 are ctaLabel/modalTitle/modalDescription/resultsPageUrl (read in parseAuthoredMeta);
// row 4 is a structural row with no corresponding model field — skip to option rows.
const OPTION_ROWS_START = 5;

function parseAuthoredOptions(rows) {
  const typeOptions = [];
  const yearOptions = [];
  let parsingYears = false;
  rows.slice(OPTION_ROWS_START).forEach((row) => {
    const cells = [...row.children];
    if (cells.length === 1 && cells[0].textContent.trim().toLowerCase() === 'years') {
      parsingYears = true;
      return;
    }
    if (!parsingYears && cells.length >= 2) {
      typeOptions.push({ label: cells[0].textContent.trim(), value: cells[1].textContent.trim() });
    } else if (parsingYears && cells.length >= 1) {
      const y = cells[0].textContent.trim();
      yearOptions.push({ label: y, value: y });
    }
  });
  return { typeOptions, yearOptions };
}

function parseAuthoredMeta(rows, placeholders) {
  const ctaLabel = rows[0]?.firstElementChild?.textContent?.trim() || placeholders.reportsCtaLabel || 'Search for Reports';
  const modalTitle = rows[1]?.firstElementChild?.textContent?.trim() || placeholders.reportsModalTitle || 'Search Report';
  const modalDescRow = rows[2];
  const modalDesc = modalDescRow?.firstElementChild?.textContent?.trim() || '';
  const resultsPageUrl = rows[3]?.querySelector('a')?.href || window.location.pathname;
  return {
    ctaLabel, modalTitle, modalDesc, resultsPageUrl,
  };
}

// Remove orphan AEM UE node for modalDescription that appears outside the block in the DOM
function removeOrphanUeNode() {
  document.querySelectorAll('[data-aue-prop="modalDescription"],[data-aue-label="Modal Description"]').forEach((el) => {
    if (!el.closest('.search-reports')) el.remove();
  });
}

// This block manages its own self-contained modal (built and shown in decorate()/
// initFromUrlParams()). When this block is authored on a page that's opened as a
// fragment inside another block's generic modal (e.g. story-card's data-modal),
// the placeholder left behind ends up wrapped in that other, generic modal too,
// producing two overlapping modals. Watch for that and discard the generic wrapper
// since this block's own modal already provides the full experience.
function discardGenericModalWrapper(placeholder) {
  const observer = new MutationObserver(() => {
    if (!placeholder.isConnected) return;
    const genericModal = placeholder.closest('.custom-modal');
    if (genericModal) {
      genericModal.remove();
      document.body.classList.remove('modal-open');
    }
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function buildModalDom({
  lang, ctaLabel, modalTitle, modalDesc,
}) {
  const overlay = createTaggedElement('div', {
    className: 'search-reports-overlay',
    attrs: {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sr-modal-title', tabindex: '-1',
    },
  });
  const dialog = createTaggedElement('div', { className: 'sr-dialog' });

  const closeBtn = createTaggedElement('button', { className: 'sr-close-btn', attrs: { type: 'button', 'aria-label': 'Close search modal' } });
  closeBtn.innerHTML = '<span class="icon icon-close"></span>';
  decorateIcons(closeBtn);
  const header = createModalHeader(lang, closeBtn, { headerClass: 'sr-header', logoLinkClass: 'sr-logo-link' });

  const body = createTaggedElement('div', { className: 'sr-body' });
  const titleEl = createTaggedElement('h2', { className: 'sr-title', text: modalTitle, attrs: { id: 'sr-modal-title' } });
  const titleDivider = createTaggedElement('div', { className: 'sr-title-divider' });
  const descEl = createTaggedElement('div', { className: 'sr-desc' });
  descEl.innerHTML = modalDesc;

  const searchBtn = createTaggedElement('button', {
    className: 'sr-search-btn sr-search-btn-disabled',
    text: ctaLabel,
    attrs: { type: 'button' },
  });

  let getType;
  let getYear;

  function updateSearchBtn() {
    if (getType() && getYear()) {
      searchBtn.classList.remove('sr-search-btn-disabled');
    } else {
      searchBtn.classList.add('sr-search-btn-disabled');
    }
  }

  const { wrapper: typeDropdown, getValue: getTypeVal, populateOptions: populateTypes } = buildDropdown('Type of report', updateSearchBtn);
  const { wrapper: yearDropdown, getValue: getYearVal, populateOptions: populateYears } = buildDropdown('Year', updateSearchBtn);
  getType = getTypeVal;
  getYear = getYearVal;

  body.append(titleEl, titleDivider, descEl, typeDropdown, yearDropdown, searchBtn);
  dialog.append(header, body);
  overlay.append(dialog);

  return {
    overlay, dialog, closeBtn, searchBtn, getType, getYear, populateTypes, populateYears,
  };
}

function wireModalEvents({
  overlay, dialog, closeBtn, searchBtn, getType, getYear, resultsPageUrl,
}) {
  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchBtn.classList.contains('sr-search-btn-disabled')) return;
    const type = getType();
    const year = getYear();
    const params = new URLSearchParams({ type, year });
    window.location.href = `${resultsPageUrl}?${params.toString()}`;
  });

  closeBtn.addEventListener('click', () => closeSearchModal(overlay));
  setupModalHandlers(overlay, dialog, () => closeSearchModal(overlay));
  overlay.addEventListener('keydown', (e) => trapFocus(e, overlay));
}

function initFromUrlParams(overlay) {
  const initParams = new URLSearchParams(window.location.search);
  if (!initParams.get('type') || !initParams.get('year')) openSearchModal(overlay, null);

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search);
    if (!p.get('type') && !p.get('year')) openSearchModal(overlay, null);
  });
}

export default async function decorate(block) {
  const rows = [...block.children];
  const lang = getLang();

  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const searchParamsUrl = configs.reportsSearchParamsUrl || '';

  const {
    ctaLabel, modalTitle, modalDesc, resultsPageUrl,
  } = parseAuthoredMeta(rows, placeholders);
  removeOrphanUeNode();
  const { typeOptions, yearOptions } = parseAuthoredOptions(rows);

  // Replace block with a placeholder in <main> and move block-level instrumentation to it
  const placeholder = block.ownerDocument.createElement('div');
  placeholder.className = 'search-reports-placeholder';
  moveInstrumentation(block, placeholder);
  block.replaceWith(placeholder);

  const {
    overlay, dialog, closeBtn, searchBtn, getType, getYear, populateTypes, populateYears,
  } = buildModalDom({
    lang, ctaLabel, modalTitle, modalDesc,
  });

  wireModalEvents({
    overlay, dialog, closeBtn, searchBtn, getType, getYear, resultsPageUrl,
  });

  // Populate dropdowns from API, fallback to authored rows on failure
  fetchSearchParams(searchParamsUrl).then((data) => {
    populateTypes(data.reportTypes?.length ? data.reportTypes : typeOptions);
    populateYears((data.years || []).map((y) => ({ label: y, value: y })));
  }).catch(() => {
    populateTypes(typeOptions);
    populateYears(yearOptions);
  });

  initFromUrlParams(overlay);
  discardGenericModalWrapper(placeholder);
}

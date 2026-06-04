import { getLang } from '../../scripts/scripts.js';
import { decorateIcons } from '../../scripts/aem.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function el(tag, { className, text, attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  return node;
}

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

const overlayTriggerMap = new WeakMap();

function openModal(overlay, trigger) {
  if (!overlay.isConnected) document.body.appendChild(overlay);
  overlayTriggerMap.set(overlay, trigger || document.activeElement);
  document.body.classList.add('search-reports-modal-open');
  requestAnimationFrame(() => {
    overlay.classList.add('search-reports-modal-visible');
    const focusable = getFocusableElements(overlay);
    (focusable[0] || overlay).focus();
  });
}

function closeModal(overlay) {
  const restoreTarget = overlayTriggerMap.get(overlay);
  document.body.classList.remove('search-reports-modal-open');
  overlay.classList.remove('search-reports-modal-visible');
  const finishClose = () => {
    overlay.remove();
    if (restoreTarget && typeof restoreTarget.focus === 'function') restoreTarget.focus();
  };
  overlay.addEventListener('transitionend', finishClose, { once: true });
  setTimeout(finishClose, 300);
}

function buildDropdown(placeholder, onChange) {
  const wrapper = el('div', { className: 'sr-dropdown' });
  const selected = el('div', {
    className: 'sr-dropdown-selected',
    attrs: {
      tabindex: '0', role: 'combobox', 'aria-expanded': 'false', 'aria-haspopup': 'listbox',
    },
  });
  const selectedText = el('span', { className: 'sr-dropdown-text', text: placeholder });
  const chevron = el('span', { className: 'sr-dropdown-chevron', attrs: { 'aria-hidden': 'true' } });
  selected.append(selectedText, chevron);

  const list = el('ul', { className: 'sr-dropdown-list', attrs: { role: 'listbox' } });
  wrapper.append(selected, list);

  let currentValue = '';

  function toggle(open) {
    wrapper.classList.toggle('sr-dropdown-open', open);
    selected.setAttribute('aria-expanded', String(open));
  }

  function populateOptions(options) {
    list.innerHTML = '';
    const placeholderItem = el('li', {
      className: 'sr-dropdown-option sr-dropdown-placeholder',
      text: placeholder,
      attrs: { role: 'option', 'aria-selected': 'true', 'data-value': '' },
    });
    list.append(placeholderItem);
    options.forEach(({ label, value }) => {
      const item = el('li', {
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

function parseAuthoredOptions(rows) {
  const typeOptions = [];
  const yearOptions = [];
  let parsingYears = false;
  rows.slice(4).forEach((row) => {
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

export default async function decorate(block) {
  const rows = [...block.children];
  const lang = getLang();

  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);
  const searchParamsUrl = configs.reportsSearchParamsUrl || '';

  const ctaLabel = placeholders.reportsCtaLabel || 'Search for Reports';
  const modalTitle = placeholders.reportsModalTitle || 'Search Report';
  const modalDesc = rows[2]?.firstElementChild?.innerHTML?.trim() || '';

  const { typeOptions, yearOptions } = parseAuthoredOptions(rows);

  block.innerHTML = '';

  // Build modal overlay
  const overlay = el('div', {
    className: 'search-reports-overlay',
    attrs: {
      role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sr-modal-title', tabindex: '-1',
    },
  });
  const dialog = el('div', { className: 'sr-dialog' });

  // Header
  const header = el('div', { className: 'sr-header' });
  const logoLink = el('a', { className: 'sr-logo-link', attrs: { href: `/${lang}`, 'aria-label': 'Bangkok Bank Home' } });
  const logoImg = el('img', {
    attrs: {
      src: '/icons/logo.svg', alt: 'Bangkok Bank', width: '120', height: '40', onerror: "this.style.display='none'",
    },
  });
  logoLink.append(logoImg);
  const closeBtn = el('button', { className: 'sr-close-btn', attrs: { type: 'button', 'aria-label': 'Close search modal' } });
  closeBtn.innerHTML = '<span class="icon icon-close"></span>';
  decorateIcons(closeBtn);
  header.append(logoLink, closeBtn);

  // Body
  const body = el('div', { className: 'sr-body' });
  const titleEl = el('h2', { className: 'sr-title', text: modalTitle, attrs: { id: 'sr-modal-title' } });
  const titleDivider = el('div', { className: 'sr-title-divider' });
  const descEl = el('div', { className: 'sr-desc' });
  descEl.innerHTML = modalDesc;

  const searchBtn = el('button', {
    className: 'sr-search-btn sr-search-btn-disabled',
    text: ctaLabel === 'Search for Reports' ? 'Search' : ctaLabel,
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

  // Populate dropdowns from API, fallback to authored rows on failure
  fetchSearchParams(searchParamsUrl).then((data) => {
    populateTypes(data.reportTypes?.length ? data.reportTypes : typeOptions);
    populateYears((data.years || []).map((y) => ({ label: y, value: y })));
  }).catch(() => {
    populateTypes(typeOptions);
    populateYears(yearOptions);
  });

  searchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchBtn.classList.contains('sr-search-btn-disabled')) return;
    const type = getType();
    const year = getYear();
    const params = new URLSearchParams({ type, year });
    window.history.pushState({}, '', `?${params.toString()}`);
    window.dispatchEvent(new CustomEvent('search-reports:submit', { detail: { type, year } }));
    closeModal(overlay);
  });

  body.append(titleEl, titleDivider, descEl, typeDropdown, yearDropdown, searchBtn);
  dialog.append(header, body);
  overlay.append(dialog);

  closeBtn.addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeModal(overlay); return; }
    trapFocus(e, overlay);
  });

  const initParams = new URLSearchParams(window.location.search);
  if (!initParams.get('type') || !initParams.get('year')) openModal(overlay, null);
  window.__previewReopenModal = () => openModal(overlay, null);

  window.addEventListener('popstate', () => {
    const p = new URLSearchParams(window.location.search);
    if (!p.get('type') && !p.get('year')) openModal(overlay, null);
  });
}

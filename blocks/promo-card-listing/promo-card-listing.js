import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { readBlockConfig, toCamelCase } from '../../scripts/aem.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import { activateTab } from '../tabs/helpers/tabs-utils.js';
import {
  buildCardHtml, buildPaginationHtml, sortCards, bindPaginationClick,
} from '../../scripts/utils/card-helpers.js';
import { handleMobileAppView } from '../promotional-details/promotional-details.js';

const fetchCache = {};

const LOCALE_MAP = { th: 'th-TH', en: 'en-GB' };
const LOGO_ICONS = {
  visa: '/icons/visa-new.svg',
  mastercard: '/icons/mastercard-new.svg',
  amex: '/icons/amex-new.svg',
  unionpay: '/icons/upi-new.svg',
};

function getPromoListingConfig(block) {
  const firstRow = block.querySelector(':scope > div');
  const isKeyValueRows = firstRow && firstRow.children.length >= 2;

  if (isKeyValueRows) {
    const config = readBlockConfig(block);
    const promotionType = (config['promotion-type'] || config.promotiontype || '').trim();
    return { promotionType };
  }

  const promotionType = block.children[0]?.textContent?.trim() || '';
  return { promotionType };
}

function resolvePromotionType(block) {
  const { promotionType } = getPromoListingConfig(block);
  if (promotionType) return promotionType;
  const datasetType = block.dataset.promotionType?.trim();
  if (datasetType) return datasetType;
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/promotionsmb')) return 'bangkok-bank-m';
  if (path.includes('/credit-cards-promotions')) return 'credit-card';
  return '';
}

function buildPromotionsUrl(baseUrl, lang) {
  if (!baseUrl) return '';
  let localizedBase = baseUrl;
  if (lang !== 'en') {
    if (baseUrl.startsWith('/en/')) {
      localizedBase = baseUrl.replace(/^\/en\//, `/${lang}/`);
    } else if (baseUrl.startsWith('/content/bangkokbank/en/')) {
      localizedBase = baseUrl.replace(
        /^\/content\/bangkokbank\/en\//,
        `/content/bangkokbank/${lang}/`,
      );
    } else if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
      try {
        const url = new URL(baseUrl);
        if (url.pathname.startsWith('/en/')) {
          url.pathname = url.pathname.replace(/^\/en\//, `/${lang}/`);
        } else if (url.pathname.startsWith('/content/bangkokbank/en/')) {
          url.pathname = url.pathname.replace(
            /^\/content\/bangkokbank\/en\//,
            `/content/bangkokbank/${lang}/`,
          );
        }
        localizedBase = url.toString();
      } catch (e) {
        // ignore
      }
    }
  }
  const suffix = lang !== 'en' ? `.${lang}.json` : '.json';
  return localizedBase.replace(/\.json$/, suffix);
}

function normalizeQueryLang(value) {
  const raw = (value || '').toLowerCase();
  if (raw.startsWith('th')) return 'th';
  if (raw.startsWith('en')) return 'en';
  return '';
}

const CARD_TYPE_NORMALIZE = {
  วีซ่า: 'visa',
  มาสเตอร์การ์ด: 'mastercard',
  แอมเอ็กซ์: 'amex',
  ยูเนี่ยนเพย์: 'unionpay',
};

export async function fetchJson(url) {
  if (!url) return null;
  if (!fetchCache[url]) {
    fetchCache[url] = fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok && r.status !== 204 ? r.json() : null))
      .catch(() => null);
  }
  return fetchCache[url];
}

async function fetchPromotions(url) {
  if (!url) return null;
  return fetchJson(url);
}

function resolveCardTypeFromRef(mapping, cardRef) {
  if (!mapping || !cardRef) return '';
  if (typeof mapping === 'string') return '';
  if (mapping[cardRef]) return mapping[cardRef];
  if (mapping.cardRefs?.[cardRef]) return mapping.cardRefs[cardRef];
  if (Array.isArray(mapping.data)) {
    const match = mapping.data.find((item) => {
      const key = item.key || item.Key || item.cardRef || item.card_ref;
      return String(key) === String(cardRef);
    });
    return match?.value || match?.Value || match?.cardType || match?.card_type || '';
  }
  return '';
}

function filterByPromotionType(cards, promotionType) {
  if (!promotionType || promotionType === 'credit-card') return cards;
  const normalized = promotionType.toLowerCase();
  const filtered = cards.filter((card) => {
    const rawType = card.promotionType || card.promotiontype || '';
    return String(rawType).toLowerCase() === normalized;
  });
  return filtered.length ? filtered : cards;
}

function getTabsContainer(block) {
  const section = block.closest('.section');
  return section?.querySelector('.tabs') || block.closest('.tabs') || null;
}

function applyCategoryTabs(tabsContainer, categories) {
  if (!tabsContainer || !categories?.length) return;
  const categorySet = new Set(
    categories.map((c) => (c.label || '').trim().toLowerCase()).filter(Boolean),
  );
  if (!categorySet.size) return;

  const tabButtons = [...tabsContainer.querySelectorAll('.tabs-nav button')];
  const dropdown = tabsContainer.querySelector('.tabs-dropdown select');
  let matchCount = 0;

  tabButtons.forEach((btn, index) => {
    const label = btn.textContent.trim().toLowerCase();
    const isMatch = categorySet.has(label);
    const panelId = btn.getAttribute('aria-controls');
    const panel = panelId ? tabsContainer.querySelector(`#${panelId}`) : null;
    if (isMatch) matchCount += 1;
    btn.hidden = !isMatch;
    btn.setAttribute('aria-hidden', isMatch ? 'false' : 'true');
    if (panel) panel.hidden = !isMatch;
    if (dropdown) {
      const option = dropdown.querySelector(`option[value="${index}"]`);
      if (option) option.hidden = !isMatch;
    }
  });

  if (!matchCount) {
    tabButtons.forEach((btn, index) => {
      const panelId = btn.getAttribute('aria-controls');
      const panel = panelId ? tabsContainer.querySelector(`#${panelId}`) : null;
      btn.hidden = false;
      btn.setAttribute('aria-hidden', 'false');
      if (panel) panel.hidden = false;
      if (dropdown) {
        const option = dropdown.querySelector(`option[value="${index}"]`);
        if (option) option.hidden = false;
      }
    });
    return;
  }

  const activeIndex = tabButtons.findIndex((btn) => btn.classList.contains('active'));
  if (activeIndex === -1 || tabButtons[activeIndex].hidden) {
    const firstVisibleIndex = tabButtons.findIndex((btn) => !btn.hidden);
    if (firstVisibleIndex >= 0) activateTab(tabsContainer, firstVisibleIndex);
  }
}

function formatDate(dateStr, locale = 'en-GB') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function buildDateLine(card, locale) {
  const start = formatDate(card.promotionStartDate, locale);
  const end = formatDate(card.promotionEndDate, locale);
  const label = card.dateValidityLabel || 'until';
  if (start && end) return `${start} ${label} ${end}`;
  if (end) return `${label} ${end}`;
  return '';
}

function toStringValue(item) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') return item.value || item.label || item.name || '';
  return '';
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(toStringValue).filter(Boolean);
  if (value == null) return [];
  return [toStringValue(value)].filter(Boolean);
}

function buildLogosHtml(logos) {
  if (!logos?.length) return '';
  const imgs = logos
    .map((key) => {
      const src = LOGO_ICONS[key];
      return src ? `<img src="${src}" alt="${key}" class="promo-selector-logo" loading="lazy">` : '';
    })
    .join('');
  return `<div class="promo-selector-logos">${imgs}</div>`;
}

export function buildCardOptions(card) {
  const locale = LOCALE_MAP[getLang()] || 'en-GB';
  return {
    dateLine: buildDateLine(card, locale),
    logoHtml: buildLogosHtml(
      (card.cardTypes || []).map((t) => CARD_TYPE_NORMALIZE[t] || t.toLowerCase()),
    ),
  };
}

function buildSubOptions(items, defaultLabel) {
  const defaultOption = defaultLabel
    ? `<li class="promo-selector-option" data-value="" role="option">${defaultLabel}</li>`
    : '';
  return defaultOption.concat(items
    .map((s) => {
      const value = toStringValue(s);
      return `<li class="promo-selector-option" data-value="${value}" role="option">${value}</li>`;
    })
    .join(''));
}

function isTruthyFlag(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true'
    || normalized === 'yes'
    || normalized === 'y'
    || normalized === '1';
}

function filterCards(allCards, filters, page, pageSize, topPromotionOnly) {
  const {
    category, subcategory, cardType, area,
  } = filters;
  const today = new Date();

  const matched = allCards.filter((card) => {
    if (
      !topPromotionOnly
      && category
      && card.category?.toLowerCase() !== category.toLowerCase()
    ) return false;
    if (topPromotionOnly && !isTruthyFlag(card.topPromotion)) return false;
    if (card.promotionEndDate && new Date(card.promotionEndDate) < today) return false;
    if (subcategory && card.subcategory !== subcategory) return false;
    const cardTypesLower = normalizeList(card.cardTypes).map((t) => t.toLowerCase());
    if (cardType && !cardTypesLower.includes(cardType.toLowerCase())) return false;
    if (area) {
      const cardAreas = normalizeList(card.area);
      const areaMatch = cardAreas.some((a) => a.toLowerCase() === area.toLowerCase());
      const allMatch = cardAreas.some((a) => a.toLowerCase() === 'all');
      if (!allMatch && !areaMatch) return false;
    }
    return true;
  });

  const sorted = sortCards(matched);
  const total = sorted.length;
  const start = (page - 1) * pageSize;
  return { cards: sorted.slice(start, start + pageSize), total };
}

function setupPanel(
  panel,
  allCards,
  category,
  subcategories,
  cardTypes,
  areas,
  pageSize,
  placeholders,
  options = {},
) {
  const path = window.location.pathname.toLowerCase();
  const isBbmPath = path.includes('/promotionsmb');
  const searchParams = new URLSearchParams(window.location.search);
  const queryLang = normalizeQueryLang(searchParams.get('sc_lang'));

  const {
    disableFilters = false,
    forcedCardType = '',
    hidePagination = false,
  } = options;
  const labelCategory = placeholders.promoFilterCategory || 'Category';
  const labelCardType = placeholders.promoFilterCardType || 'Card Type';
  const labelArea = placeholders.promoFilterArea || 'Area';
  const labelReset = placeholders.promoReset || 'Reset';
  const labelSearch = placeholders.promoSearch || 'Search';
  const subDisabled = !subcategories.length;

  if (disableFilters) {
    panel.innerHTML = `
      <div class="promo-selector-content pad-top-30 pad-bot-30">
        <div class="promo-selector-grid"></div>
        <div class="promo-selector-pagination"></div>
      </div>`;
  } else {
    panel.innerHTML = `
      <div class="promo-selector-filters">
        <div class="promo-selector-filter${subDisabled ? ' is-disabled' : ''}" data-filter="subcategory">
          <button class="promo-selector-filter-btn"${subDisabled ? ' disabled' : ''} aria-expanded="false" aria-haspopup="listbox">
            <span class="promo-selector-filter-label">${labelCategory}</span>
            <span class="icon-dropdown promo-selector-filter-arrow"></span>
          </button>
          <ul class="promo-selector-dropdown" role="listbox">
            ${buildSubOptions(subcategories, labelCategory)}
          </ul>
        </div>
        <div class="promo-selector-filter" data-filter="cardType">
          <button class="promo-selector-filter-btn" aria-expanded="false" aria-haspopup="listbox">
            <span class="promo-selector-filter-label">${labelCardType}</span>
            <span class="icon-dropdown promo-selector-filter-arrow"></span>
          </button>
          <ul class="promo-selector-dropdown" role="listbox">
            ${buildSubOptions(cardTypes, labelCardType)}
          </ul>
        </div>
        <div class="promo-selector-filter" data-filter="area">
          <button class="promo-selector-filter-btn" aria-expanded="false" aria-haspopup="listbox">
            <span class="promo-selector-filter-label">${labelArea}</span>
            <span class="icon-dropdown promo-selector-filter-arrow"></span>
          </button>
          <ul class="promo-selector-dropdown" role="listbox">
            ${buildSubOptions(areas, labelArea)}
          </ul>
        </div>
        <div class="promo-selector-filter-actions">
          <div class="promo-selector-filter-action btn-reset"><button class="promo-selector-btn-reset button secondary" type="button">${labelReset}</button></div>
          <div class="promo-selector-filter-action btn-search"><button class="promo-selector-btn-search button primary" type="button">${labelSearch}</button></div>
        </div>
      </div>
      <div class="promo-selector-content pad-top-30 pad-bot-30">
        <div class="promo-selector-grid"></div>
        <div class="promo-selector-pagination"></div>
      </div>`;
  }

  const gridEl = panel.querySelector('.promo-selector-grid');
  const paginationEl = panel.querySelector('.promo-selector-pagination');

  const state = {
    subcategory: '', cardType: '', area: '', page: 1,
  };

  function render() {
    const isHighlightTab = /promotion\s*highlight|highlights|higlights/i.test(category);
    const activeCardType = forcedCardType || state.cardType;
    const { cards, total } = filterCards(allCards, {
      category,
      subcategory: state.subcategory,
      cardType: activeCardType,
      area: state.area,
    }, state.page, pageSize, isHighlightTab);

    gridEl.innerHTML = cards.length
      ? cards.map((c) => {
        let cardData = c;
        if (isBbmPath && queryLang && c.ctaLink) {
          try {
            const isInternal = c.ctaLink.startsWith('/')
              || c.ctaLink.startsWith(window.location.origin);
            const url = new URL(c.ctaLink, window.location.origin);
            url.searchParams.set('sc_lang', queryLang);
            const ctaPath = url.pathname + url.search + url.hash;
            cardData = { ...c, ctaLink: isInternal ? ctaPath : url.toString() };
          } catch {
            const separator = c.ctaLink.includes('?') ? '&' : '?';
            cardData = { ...c, ctaLink: `${c.ctaLink}${separator}sc_lang=${queryLang}` };
          }
        }
        return buildCardHtml(cardData, category, placeholders, buildCardOptions(cardData));
      }).join('')
      : `<p class="promo-selector-empty">${placeholders.promoNoResults || 'No results found.'}</p>`;

    paginationEl.innerHTML = hidePagination
      ? ''
      : buildPaginationHtml(state.page, Math.ceil(total / pageSize));
  }

  // Lazy render — only when panel becomes visible (inactive tabs are hidden = not intersecting)
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      observer.disconnect();
      render();
    }
  }, { rootMargin: '100px' });
  observer.observe(panel);

  // Dropdown open/close
  if (disableFilters) return;

  panel.querySelectorAll('.promo-selector-filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const filter = btn.closest('.promo-selector-filter');
      const isOpen = filter.classList.contains('is-open');
      panel.querySelectorAll('.promo-selector-filter').forEach((f) => {
        f.classList.remove('is-open');
        f.querySelector('.promo-selector-filter-btn')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen && !btn.disabled) {
        filter.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  const isDesktop = () => window.matchMedia('(width > 64rem)').matches;

  function makeSingleSelect(filterAttr, stateKey, defaultLabel) {
    panel.querySelectorAll(`[data-filter="${filterAttr}"] .promo-selector-option`).forEach((opt) => {
      opt.addEventListener('click', () => {
        const isActive = opt.classList.contains('is-active');
        panel.querySelectorAll(`[data-filter="${filterAttr}"] .promo-selector-option`)
          .forEach((o) => o.classList.remove('is-active'));
        const labelEl = panel.querySelector(
          `[data-filter="${filterAttr}"] .promo-selector-filter-label`,
        );
        if (isActive) {
          state[stateKey] = '';
          labelEl.textContent = defaultLabel;
        } else {
          opt.classList.add('is-active');
          state[stateKey] = opt.dataset.value;
          labelEl.textContent = opt.dataset.value;
        }
        panel.querySelector(`[data-filter="${filterAttr}"]`).classList.remove('is-open');
        state.page = 1;
        if (isDesktop()) render();
      });
    });
  }

  makeSingleSelect('subcategory', 'subcategory', labelCategory);
  makeSingleSelect('cardType', 'cardType', labelCardType);
  makeSingleSelect('area', 'area', labelArea);

  function resetFilters() {
    state.subcategory = '';
    state.cardType = '';
    state.area = '';
    state.page = 1;
    panel.querySelectorAll('.promo-selector-option').forEach((o) => o.classList.remove('is-active'));
    panel.querySelector('[data-filter="subcategory"] .promo-selector-filter-label').textContent = labelCategory;
    panel.querySelector('[data-filter="cardType"] .promo-selector-filter-label').textContent = labelCardType;
    panel.querySelector('[data-filter="area"] .promo-selector-filter-label').textContent = labelArea;
    render();
  }

  panel.querySelector('.promo-selector-btn-reset')?.addEventListener('click', resetFilters);
  panel.querySelector('.promo-selector-btn-search')?.addEventListener('click', () => {
    state.page = 1;
    render();
  });

  bindPaginationClick(paginationEl, state, render, gridEl);
}

export default async function decorate(block) {
  const searchParams = new URLSearchParams(window.location.search);
  handleMobileAppView(searchParams);

  const promotionType = resolvePromotionType(block);
  const docLang = getLang();

  const path = window.location.pathname.toLowerCase();
  const isBbmPath = path.includes('/promotionsmb');
  const isCreditCardPath = path.includes('/credit-cards-promotions');
  const isBbm = isBbmPath || (!isCreditCardPath && promotionType === 'bangkok-bank-m');
  const queryLang = normalizeQueryLang(searchParams.get('sc_lang'));
  const lang = isBbmPath && queryLang ? queryLang : docLang;

  const configs = await fetchConfigs();
  const effectiveConfigs = configs || {};
  if (!configs || !configs.promotionalCardSelector || lang !== 'en') {
    try {
      const resp = await fetch(`/${lang}/config.json`);
      if (resp.ok) {
        const json = await resp.json();
        const targetConfigs = effectiveConfigs;
        json.data
          ?.filter((config) => config.Key)
          .forEach((config) => {
            targetConfigs[toCamelCase(config.Key)] = config.Value;
          });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to fetch local config fallback:', e);
    }
  }
  const creditBaseUrl = effectiveConfigs.promotionalCardSelector || '';
  const bbmBaseUrl = effectiveConfigs.promotionalCardSelectorBbm || '';
  const rawPageSize = parseInt(effectiveConfigs.promotionalItemsPerPage, 10);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 12;

  const creditUrl = buildPromotionsUrl(creditBaseUrl, lang);
  const bbmUrl = buildPromotionsUrl(bbmBaseUrl, lang);

  // Fetch data for the active page only
  const dataUrl = isBbm ? bbmUrl : creditUrl;
  const [activeData, cardRefConfig, placeholders] = await Promise.all([
    fetchPromotions(dataUrl),
    fetchJson(effectiveConfigs.bbmCardRef || ''),
    fetchPlaceholders(),
  ]);
  const activeCards = filterByPromotionType(activeData?.cards || [], promotionType);
  const activeCardTypes = activeData?.cardTypes || [];
  const activeAreas = activeData?.areas || [];
  const isBbmPage = isBbm;
  const cardRef = isBbmPage ? searchParams.get('card_ref') : '';
  const forcedCardType = resolveCardTypeFromRef(cardRefConfig, cardRef);
  const disableFilters = Boolean(forcedCardType);
  const activeCategories = activeData?.categories || [];

  if (isAuthoringInstance(block)) {
    block.hidden = false;
    let previewPanel = block.parentElement?.querySelector('[data-preview-for="promo-card-listing"]');
    if (!previewPanel) {
      previewPanel = document.createElement('div');
      previewPanel.className = 'promo-card-listing-preview';
      previewPanel.dataset.previewFor = 'promo-card-listing';
      block.insertAdjacentElement('afterend', previewPanel);
    }
    const firstCategory = activeCategories[0]?.label || '';
    const firstSubcategories = activeCategories[0]?.subcategories || [];
    previewPanel.innerHTML = '';
    setupPanel(
      previewPanel,
      activeCards,
      firstCategory,
      firstSubcategories,
      activeCardTypes,
      activeAreas,
      pageSize,
      placeholders,
      {
        disableFilters: disableFilters && isBbm,
        forcedCardType: isBbm ? forcedCardType : '',
        hidePagination: disableFilters && isBbm,
      },
    );
    return;
  }

  const tabsContainer = getTabsContainer(block);
  applyCategoryTabs(tabsContainer, activeCategories);

  // Issue 1 Fix: mark the parent section so CSS fade selectors scope correctly,
  // then wire scroll events to toggle gradient-fade state classes on the nav wrapper.
  const promoSection = block.closest('.section');
  if (promoSection) promoSection.classList.add('promo-card-listing-section');

  if (tabsContainer) {
    const tabsNav = tabsContainer.querySelector('.tabs-nav');
    const navWrapper = tabsContainer.querySelector('.tabs-nav-wrapper');
    if (tabsNav && navWrapper) {
      const updateScrollFade = () => {
        const { scrollLeft, scrollWidth, clientWidth } = tabsNav;
        navWrapper.classList.toggle('is-scroll-start', scrollLeft > 2);
        navWrapper.classList.toggle('is-scroll-end', scrollLeft + clientWidth >= scrollWidth - 2);
      };
      tabsNav.addEventListener('scroll', updateScrollFade, { passive: true });
      // Run once after first render so the initial state is set correctly
      requestAnimationFrame(updateScrollFade);
    }
  }

  // Find tab panels created by tabs.js from the empty tab sections
  const tabPanels = tabsContainer
    ? [...tabsContainer.querySelectorAll('.tabs-content .tab-panel')]
    : [...document.querySelectorAll('[role="tabpanel"]')];

  tabPanels.forEach((panel) => {
    const tabBtnId = panel.getAttribute('aria-labelledby');
    if (panel.hidden) return;
    const tabBtn = tabBtnId
      ? (tabsContainer?.querySelector(`#${tabBtnId}`) || document.getElementById(tabBtnId))
      : null;
    const tabText = tabBtn?.textContent?.trim() || '';

    const dataSet = activeData;
    const dataCards = activeCards;
    const dataCategories = dataSet?.categories || [];
    const dataCardTypes = activeCardTypes;
    const dataAreas = activeAreas;
    const catMeta = dataCategories.find((c) => c.label.toLowerCase() === tabText.toLowerCase())
      || {};
    const category = catMeta.label || tabText;
    const subcategories = catMeta.subcategories || [];

    setupPanel(
      panel,
      dataCards,
      category,
      subcategories,
      dataCardTypes,
      dataAreas,
      pageSize,
      placeholders,
      {
        disableFilters: disableFilters && isBbm,
        forcedCardType: isBbm ? forcedCardType : '',
        hidePagination: disableFilters && isBbm,
      },
    );
  });

  // Close all dropdowns on outside click (single listener for all panels)
  document.addEventListener('click', () => {
    document.querySelectorAll('.promo-selector-filter.is-open').forEach((f) => {
      f.classList.remove('is-open');
      f.querySelector('.promo-selector-filter-btn')?.setAttribute('aria-expanded', 'false');
    });
  });

  // Block is just a data-source config — hide it from view
  block.hidden = true;
}

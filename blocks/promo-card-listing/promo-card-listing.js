import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { readBlockConfig, toCamelCase } from '../../scripts/aem.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';
import { activateTab } from '../tabs/helpers/tabs-utils.js';
import {
  bindPaginationClick,
  buildCardHtml,
  buildCardOptions,
  buildPaginationHtml,
  getPromotionDataUrl,
  fetchJson,
  getPromotionPathFlags,
  handleMobileAppView,
  mergeLocalConfig,
  normalizePromotionType,
  normalizeQueryLang,
  getPromotionApiConfig,
  getPromotionLanguage,
  sortCards,
} from '../../scripts/utils/card-helpers.js';

// --- Autoscroll to the category subnav (any promotions listing in tabs) -----
// Breathing room (px) left between the fixed header and the subnav after
// scrolling. One value for every viewport — the header height is measured
// separately at scroll time. Increase for more space above the subnav.
const SUBNAV_GAP = 68;

// id put on the subnav (tabs) element so the scroll can target it by id.
const SUBNAV_ID = 'promo-subnav';

// Smoothly scroll the window to targetY over `duration` ms with an ease-in-out
// curve (slow start, fast middle, slow end).
function swingScrollTo(targetY, duration = 600) {
  const startY = window.scrollY;
  const diff = targetY - startY;
  if (Math.abs(diff) < 1) return;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    window.scrollTo(0, Math.round(startY + diff * (0.5 - Math.cos(p * Math.PI) / 2)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Scroll the subnav (looked up by id) to just below the fixed header, keeping
// the header visible. The header loads async and pins only in reaction to a
// scroll event, so: wait for its bar to exist, jump past its pin threshold
// (locks it, no flicker), force its classes, then measure the subnav's live
// position and smooth-scroll so it lands SUBNAV_GAP px below the header.
// Bounded ~3s; skips if the header or subnav never appear.
function scrollToSubnav(subnavId) {
  const deadline = Date.now() + 3000;
  const run = () => {
    const subnav = document.getElementById(subnavId);
    const header = document.querySelector('.header');
    const desktop = window.matchMedia('(min-width: 1025px)').matches;
    const bar = header && (desktop
      ? header.querySelector('.main-nav-desktop')
      : header.querySelector('.mobile-top-bar'));
    if (!subnav || !bar) {
      if (Date.now() < deadline) requestAnimationFrame(run);
      return;
    }
    const topNav = header.querySelector('.top-nav');
    const threshold = desktop && topNav
      ? Math.ceil(topNav.getBoundingClientRect().height) + 1
      : 1;
    window.scrollTo({ top: threshold, behavior: 'auto' });
    if (desktop) topNav?.classList.add('is-hidden');
    bar.classList.add('is-scrolled');
    const headerHeight = bar.getBoundingClientRect().height;
    const target = subnav.getBoundingClientRect().top + window.scrollY - headerHeight - SUBNAV_GAP;
    swingScrollTo(Math.max(0, target));
  };
  run();
}

const TOP_PROMO_KEYS = ['topPromotions', 'highlights', 'highlight', 'featured', ''];

function isTopPromotionsLabel(value) {
  const key = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  return TOP_PROMO_KEYS.some((k) => k.toLowerCase() === key);
}

function extractListingConfig(block) {
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

async function fetchPromotionalData(url) {
  return fetchJson(url);
}

function getCardTypeFromRef(mapping, cardRef) {
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
    if (topPromotionOnly && !isTruthyFlag(card.topPromotion)) return false;
    if (!topPromotionOnly && category) {
      const cardCats = normalizeList(card.category).map((c) => c.toLowerCase());
      if (!cardCats.includes(category.toLowerCase())) return false;
    }
    if (card.promotionEndDate && new Date(card.promotionEndDate) < today) return false;
    if (subcategory) {
      const cardSubCats = normalizeList(card.subcategory).map((c) => c.toLowerCase());
      if (!cardSubCats.includes(subcategory.toLowerCase())) return false;
    }
    if (cardType) {
      const cardTypesLower = normalizeList(card.cardTypes).map((t) => t.toLowerCase());
      if (!cardTypesLower.includes(cardType.toLowerCase())) return false;
    }
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
  const searchParams = new URLSearchParams(window.location.search);
  const queryLang = normalizeQueryLang(searchParams.get('sc_lang'));

  const {
    disableFilters = false,
    forcedCardType = '',
    hidePagination = false,
    isBbm: isBbmPanel = false,
    isHighlightsPanel = false,
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
        <div class="promo-selector-grid${isBbmPanel ? ' is-bbm-grid' : ''}"></div>
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
        <div class="promo-selector-grid${isBbmPanel ? ' is-bbm-grid' : ''}"></div>
        <div class="promo-selector-pagination"></div>
      </div>`;
  }

  const gridEl = panel.querySelector('.promo-selector-grid');
  const paginationEl = panel.querySelector('.promo-selector-pagination');

  const state = {
    subcategory: '', cardType: '', area: '', page: 1,
  };

  function render() {
    const activeCardType = forcedCardType || state.cardType;
    const { cards, total } = filterCards(allCards, {
      category,
      subcategory: state.subcategory,
      cardType: activeCardType,
      area: state.area,
    }, state.page, pageSize, isHighlightsPanel);

    gridEl.innerHTML = cards.length
      ? cards.map((c) => {
        let cardData = c;
        if (isBbmPanel && queryLang && c.ctaLink) {
          try {
            const url = new URL(c.ctaLink, window.location.origin);
            url.searchParams.set('sc_lang', queryLang);
            const isInternal = url.origin === window.location.origin;
            const ctaPath = url.pathname + url.search + url.hash;
            cardData = { ...c, ctaLink: isInternal ? ctaPath : url.toString() };
          } catch {
            // Keep original ctaLink if URL parsing fails completely
          }
        }
        const cardOptions = buildCardOptions(cardData);
        cardOptions.baseUrl = options.baseUrl;
        if (isBbmPanel) cardOptions.logoHtml = '';
        return buildCardHtml(cardData, category, placeholders, cardOptions);
      }).join('')
      : `<p class="promo-selector-empty">${placeholders.promoNoResults || 'No results found.'}</p>`;

    paginationEl.innerHTML = hidePagination
      ? ''
      : buildPaginationHtml(state.page, Math.ceil(total / pageSize));
  }

  if (options.immediate) {
    render();
  } else {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        observer.disconnect();
        render();
      }
    }, { rootMargin: '100px' });
    observer.observe(panel);
  }

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

  const { pathname } = window.location;
  const { isBbmPath, isCreditCardPath } = getPromotionPathFlags(pathname);

  const docLang = getLang();
  const queryLang = normalizeQueryLang(searchParams.get('sc_lang'));
  const { promotionType: blockPromoType } = extractListingConfig(block);
  const datasetType = block.dataset.promotionType?.trim();
  const configuredPromoType = blockPromoType || datasetType;
  const isBbmPreConfig = isBbmPath
    || (!isCreditCardPath && normalizePromotionType(configuredPromoType) === 'bangkok-bank-m');
  const lang = getPromotionLanguage(docLang, queryLang, isBbmPreConfig);

  const configs = await fetchConfigs();
  const effectiveConfigs = configs || {};
  if (!configs || !configs.promotionalCardSelector || lang !== 'en') {
    await mergeLocalConfig(pathname, lang, effectiveConfigs, toCamelCase);
  }
  const creditBaseUrl = effectiveConfigs.promotionalCardSelector || '';
  const bbmBaseUrl = effectiveConfigs.promotionalCardSelectorBbm || '';

  const promotionApi = getPromotionApiConfig({
    pathname,
    configuredPromoType,
    bbmBaseUrl,
    creditBaseUrl,
  });
  const { isBbm, promotionType } = promotionApi;

  const rawPageSize = parseInt(effectiveConfigs.promotionalItemsPerPage, 10);
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 12;

  const promotionsUrl = getPromotionDataUrl(promotionApi.baseUrl, lang);
  const [activeData, cardRefConfig, placeholders] = await Promise.all([
    fetchPromotionalData(promotionsUrl),
    fetchJson(effectiveConfigs.bbmCardRef || ''),
    fetchPlaceholders(),
  ]);
  const activeCards = filterByPromotionType(activeData?.cards || [], promotionType);
  const topPromoCards = activeCards.filter((card) => isTruthyFlag(card.topPromotion));
  const activeCardTypes = activeData?.cardTypes || [];
  const activeAreas = activeData?.areas || [];
  const isBbmPage = isBbm;
  const cardRef = isBbmPage ? searchParams.get('card_ref') : '';
  const forcedCardType = getCardTypeFromRef(cardRefConfig, cardRef);
  const disableFilters = Boolean(forcedCardType);
  const activeCategories = activeData?.categories || [];

  if (isAuthoringInstance(block)) {
    block.querySelectorAll(':scope > div').forEach((row) => {
      const key = row.children[0]?.textContent?.trim().toLowerCase().replace(/-/g, '');
      if (key === 'promotiontype') {
        row.dataset.configRow = '';
      }
    });
    block.classList.add('has-preview');
    let previewPanel = block.querySelector('.promo-card-listing-preview');
    if (!previewPanel) {
      previewPanel = document.createElement('div');
      previewPanel.className = 'promo-card-listing-preview';
      block.appendChild(previewPanel);
    }
    const firstCategory = activeCategories[0]?.label || '';
    const firstSubcategories = activeCategories[0]?.subcategories || [];
    const isHighlightsPanel = isBbm && isTopPromotionsLabel(firstCategory);
    previewPanel.innerHTML = '';
    setupPanel(
      previewPanel,
      isHighlightsPanel ? topPromoCards : activeCards,
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
        isBbm,
        isHighlightsPanel,
        immediate: true,
        baseUrl: promotionApi?.baseUrl,
      },
    );
    return;
  }

  const tabsContainer = getTabsContainer(block);
  applyCategoryTabs(tabsContainer, activeCategories);

  const promoSection = block.closest('.section');
  if (promoSection) promoSection.classList.add('promo-card-listing-section');

  // Autoscroll on any promotions listing rendered in tabs. The listing lives in
  // a .section.tabs-container — that section is the subnav we scroll to.
  // Structural (no config gate); skipped when the URL targets an in-page anchor.
  const tabsSection = block.closest('.section.tabs-container')
    || document.querySelector('.section.tabs-container');
  const autoScroll = !window.location.hash && !!tabsSection;

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
      requestAnimationFrame(updateScrollFade);
    }
  }

  const tabPanels = tabsContainer
    ? [...tabsContainer.querySelectorAll('.tabs-content .tab-panel')]
    : [...document.querySelectorAll('[role="tabpanel"]')];

  tabPanels.forEach((panel, index) => {
    const tabBtnId = panel.getAttribute('aria-labelledby');
    if (panel.hidden) return;
    const tabBtn = tabBtnId
      ? (tabsContainer?.querySelector(`#${tabBtnId}`) || document.getElementById(tabBtnId))
      : null;
    const tabText = tabBtn?.textContent?.trim() || '';

    const dataSet = activeData;
    const dataCategories = dataSet?.categories || [];
    const dataCardTypes = activeCardTypes;
    const dataAreas = activeAreas;
    const catMeta = dataCategories.find((c) => c.label.toLowerCase() === tabText.toLowerCase())
      || {};
    const category = catMeta.label || tabText;
    const subcategories = catMeta.subcategories || [];

    const isHighlightsPanel = isBbm && (index === 0 || isTopPromotionsLabel(tabText));

    setupPanel(
      panel,
      isHighlightsPanel ? topPromoCards : activeCards,
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
        isBbm,
        isHighlightsPanel,
        // Autoscroll pages: render the active panel now so the page reaches its
        // full height before we scroll (otherwise a short doc clamps the scroll).
        immediate: autoScroll,
        baseUrl: promotionApi?.baseUrl,
      },
    );
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.promo-selector-filter.is-open').forEach((f) => {
      f.classList.remove('is-open');
      f.querySelector('.promo-selector-filter-btn')?.setAttribute('aria-expanded', 'false');
    });
  });

  // Autoscroll to the subnav (keeps the header visible). One-shot so multiple
  // blocks don't compete; runs on load if the document isn't ready yet.
  if (autoScroll && !document.documentElement.dataset.promoAutoscrolled) {
    document.documentElement.dataset.promoAutoscrolled = '1';
    // Tag the tabs section with a stable id, then scroll to that id.
    if (!tabsSection.id) tabsSection.id = SUBNAV_ID;
    const run = () => scrollToSubnav(tabsSection.id);
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  block.hidden = true;
}

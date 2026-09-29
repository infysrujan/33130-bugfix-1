import { loadCSS } from '../../scripts/aem.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const TABLET_MIN = getComputedStyle(document.documentElement).getPropertyValue('--bbl-breakpoint-tablet-min').trim();

const INITIAL_VISIBLE = 6;
const DESKTOP_BREAKPOINT = `(width > ${TABLET_MIN})`;
const MAX_FILTERED = 5;
const MAX_COMPARE = 3;
const MOBILE_BREAKPOINT = `(width < ${TABLET_MIN})`;
// Map UI benefit/lifestyle labels (EN and TH, as authored in the credit-card-selector
// block) to the filtering-matrix sheet's canonical English values. The sheet only has
// one (English) Benefit/Lifestyles column per row, so non-English UI copy must be
// aliased here or it will never match — see credit-card-selector.js buildFilterState.
const BENEFIT_ALIASES = {
  rewards: 'point',
  เครดิตเงินคืน: 'cash back',
  คะแนนสะสม: 'point',
};
const LIFESTYLE_ALIASES = {
  ใช้จ่ายทั่วไป: 'everyday',
  รักสุขภาพ: 'healthcare',
  ชอบเที่ยว: 'travel',
  ทำบุญ: 'donation',
  รถยนต์: 'automotive',
  ช้อปปิ้ง: 'shopping',
};

// ── String / data utilities ────────────────────────────────────────────────────

function norm(str) {
  return (str || '').toString().replace(/\u200B/g, '').toLowerCase().trim();
}

function parseIncomeValue(str) {
  if (!str) return 0;
  const match = str.toString().replace(/\u200B/g, '').match(/[\d,]+/);
  if (!match) return 0;
  return parseInt(match[0].replace(/,/g, ''), 10) || 0;
}

/** Strip zero-width spaces from keys and normalize whitespace in values. */
function normalizeRow(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    const key = k.replace(/\u200B/g, '').trim();
    out[key] = typeof v === 'string'
      ? v.replace(/\u200B/g, '').replace(/\s+/g, ' ').trim()
      : v;
  });
  return out;
}

/** Return the first non-empty value among the given keys on a card object. */
function getCardField(card, ...keys) {
  const key = keys.find((k) => card[k] !== null && card[k] !== undefined && card[k] !== '');
  return key !== undefined ? card[key] : '';
}

function resolveImageUrl(card) {
  const raw = card.imageUrl || card.image || '';
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // eslint-disable-next-line no-underscore-dangle
  return raw._publishUrl || raw._authorUrl || '';
}

function normalizeBenefit(str) {
  const n = norm(str);
  return BENEFIT_ALIASES[n] || n;
}

function normalizeLifestyle(str) {
  const n = norm(str);
  return LIFESTYLE_ALIASES[n] || n;
}

/**
 * Sort the initial (unfiltered) card list to match the row order the cards are authored
 * in the filtering-matrix sheet (top-to-bottom, drag-reorderable there) — not the
 * Sourcing/Initial Ordering column values, since those can change independently of the
 * author's intended display order.
 */
function sortBySheetOrder(rawCards, sheetCards, lang) {
  const productNameKey = lang === 'th' ? 'Product Name (TH)' : 'Product Name (EN)';
  const cardNameKeys = lang === 'th'
    ? ['nameTH', 'Product Name (TH)', 'cardNameTH', 'name']
    : ['nameEN', 'Product Name (EN)', 'name', 'cardName'];

  const orderMap = {};
  sheetCards.forEach((row, index) => {
    const name = norm(row[productNameKey] || '');
    if (name && !(name in orderMap)) orderMap[name] = index;
  });

  return [...rawCards].sort((a, b) => {
    const nameA = norm(getCardField(a, ...cardNameKeys));
    const nameB = norm(getCardField(b, ...cardNameKeys));
    const orderA = orderMap[nameA] ?? Number.MAX_SAFE_INTEGER;
    const orderB = orderMap[nameB] ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function loadCardData() {
  try {
    const configs = await fetchConfigs();
    const baseUrl = configs.creditCardSelectorSuggesterData;
    if (!baseUrl) return [];
    const lang = getLang();
    const url = baseUrl.replace(/;language=[^;?&]*/i, `;language=${lang}`);
    const cacheKey = `bbl-credit-cards-${lang}`;
    if (!window[cacheKey]) {
      window[cacheKey] = fetchGet(url, { throwOnError: false })
        .then((json) => json?.data?.creditCardsList?.items || json?.data || json?.items || [])
        .catch(() => []);
    }
    return window[cacheKey];
  } catch {
    return [];
  }
}

async function loadSheetData() {
  try {
    const configs = await fetchConfigs();
    const url = configs.creditCardSelectorFilteringMatrixUrl;
    if (!url) return [];
    const json = await fetchGet(url, { throwOnError: false });
    const rows = (json?.data || []).map(normalizeRow);
    return rows;
  } catch {
    return [];
  }
}

// ── Filtering ──────────────────────────────────────────────────────────────────

function matchesFilter(row, { userIncome, userBenefit, userLifestyles }) {
  if (userIncome > 0) {
    const cardIncome = parseIncomeValue(row.Income || '');
    if (cardIncome !== userIncome) return false;
  }

  if (userBenefit) {
    const cardBenefit = normalizeBenefit(row.Benefit || '');
    if (cardBenefit && cardBenefit !== userBenefit) return false;
  }

  if (userLifestyles.length > 0) {
    const cardLifestyles = (row.Lifestyles || '').split(/[,;|]/).map(norm).filter(Boolean);
    const hasMatch = userLifestyles.some(
      (sel) => cardLifestyles.some((cl) => cl.includes(sel) || sel.includes(cl)),
    );
    if (!hasMatch) return false;
  }

  return true;
}

function filterSheetCards(sheetCards, { income, benefit, lifestyles } = {}) {
  const criteria = {
    userIncome: parseIncomeValue(income),
    userBenefit: normalizeBenefit(benefit),
    userLifestyles: (lifestyles || []).map(normalizeLifestyle).filter(Boolean),
  };
  return sheetCards.filter((row) => matchesFilter(row, criteria));
}

/**
 * Apply a filter state to allCards: match sheet rows → fetch helper cards by name
 * → sort by Sourcing → cap at MAX_FILTERED.
 */
async function resolveFilteredCards(sheetCards, filterState) {
  const lang = getLang();
  const productNameKey = lang === 'th' ? 'Product Name (TH)' : 'Product Name (EN)';
  const cardNameKeys = lang === 'th'
    ? ['nameTH', 'Product Name (TH)', 'cardNameTH', 'name']
    : ['nameEN', 'Product Name (EN)', 'name', 'cardName'];

  const matchingRows = filterSheetCards(sheetCards, filterState);
  const matchingNames = new Set();
  const sourcingMap = {};

  matchingRows.forEach((row) => {
    const name = norm(row[productNameKey] || '');
    if (name) {
      matchingNames.add(name);
      sourcingMap[name] = parseInt(row.Sourcing || 9999, 10);
    }
  });

  if (!matchingNames.size) return [];

  const rawCards = await loadCardData();

  const getCardNames = (card) => cardNameKeys
    .map((key) => norm(getCardField(card, key)))
    .filter(Boolean);

  const filtered = rawCards
    .filter((card) => {
      const cardNames = getCardNames(card);
      return cardNames.some((name) => matchingNames.has(name));
    })
    .sort((a, b) => {
      const namesA = getCardNames(a);
      const namesB = getCardNames(b);

      const sourceA = Math.min(...namesA.map((name) => sourcingMap[name] ?? 9999), 9999);
      const sourceB = Math.min(...namesB.map((name) => sourcingMap[name] ?? 9999), 9999);

      return sourceA - sourceB;
    })
    .slice(0, MAX_FILTERED);

  return filtered;
}

// ── card-list block DOM builder ────────────────────────────────────────────────

/**
 * Build the card list HTML directly, producing the same class structure
 * as card-list.js so that card-list.css applies without running card-list.js.
 */
function buildCardBlock(cards, doc, lang, labels) {
  const block = doc.createElement('div');
  // 'credit-card' is the EDS variation class — sits alongside 'card-list block'
  block.className = 'card-list credit-card block';
  block.dataset.blockName = 'card-list';

  const list = doc.createElement('div');
  list.className = 'cards-list scrollable center cards-3';

  cards.forEach((card) => {
    const nameEN = getCardField(card, 'nameEN', 'Product Name (EN)', 'name', 'cardName');
    const nameTH = getCardField(card, 'nameTH', 'Product Name (TH)', 'cardNameTH');
    const description = getCardField(card, 'cardDescription', 'description');
    const imgSrc = resolveImageUrl(card);
    const { cardPageUrl } = card;
    // eslint-disable-next-line no-underscore-dangle
    let learnHref = (cardPageUrl && (cardPageUrl._publishUrl || cardPageUrl._authorUrl || cardPageUrl._path)) || '';
    // Remove "/content/bangkokbank" from the start of learnHref, if present
    if (learnHref.startsWith('/content/bangkokbank')) {
      learnHref = learnHref.replace(/^\/content\/bangkokbank/, '');
    }
    const isTH = lang === 'th';
    const primaryName = isTH && nameTH ? nameTH : nameEN;
    const secondaryName = isTH && nameTH ? nameEN : nameTH;

    const cardEl = doc.createElement('div');
    cardEl.className = 'cards-list-item';

    const inner = doc.createElement('div');
    inner.className = 'cards-list-inner';

    // Image
    if (imgSrc) {
      const imageWrapper = doc.createElement('div');
      imageWrapper.className = 'cards-list-image cards-list-image-x-small';
      const img = doc.createElement('img');
      img.src = imgSrc;
      img.alt = primaryName;
      img.loading = 'lazy';
      imageWrapper.appendChild(img);
      inner.appendChild(imageWrapper);
    }

    // Content
    const content = doc.createElement('div');
    content.className = 'cards-list-content';

    // Secondary name (sub-label above title)
    if (secondaryName) {
      const sub = doc.createElement('p');
      sub.className = 'ccs-name-th';
      sub.textContent = secondaryName;
      content.appendChild(sub);
    }

    // Title
    const titleEl = doc.createElement('div');
    titleEl.className = 'cards-list-title has-title-underline';
    const h3 = doc.createElement('h3');
    h3.textContent = primaryName;
    h3.dataset.cardId = card.cardId || card.id || '';
    titleEl.appendChild(h3);
    content.appendChild(titleEl);

    // Description
    if (description && typeof description === 'string') {
      titleEl.classList.add('has-description');
      const descEl = doc.createElement('div');
      descEl.className = 'cards-list-description';
      const p = doc.createElement('p');
      p.textContent = description;
      descEl.appendChild(p);
      content.appendChild(descEl);
    }

    inner.appendChild(content);

    // Button — Learn more link
    const buttonWrapper = doc.createElement('div');
    buttonWrapper.className = 'cards-list-button';
    const link = doc.createElement('a');
    link.className = 'button-m primary';
    link.href = learnHref;
    link.textContent = labels.learnMore;
    buttonWrapper.appendChild(link);
    inner.appendChild(buttonWrapper);

    cardEl.appendChild(inner);
    list.appendChild(cardEl);
  });

  block.appendChild(list);
  return block;
}

function addCompareButtons(blockEl, doc, labels) {
  blockEl.querySelectorAll('.cards-list-button').forEach((wrapper) => {
    const item = wrapper.closest('.cards-list-item');
    const btn = doc.createElement('button');
    // btn.href = '#';
    btn.classList.add('ccs-compare-btn');
    btn.classList.add('button-m');
    btn.classList.add('secondary');
    btn.textContent = labels.compare;
    const h3 = item?.querySelector('h3');
    btn.dataset.cardName = h3?.textContent?.trim() ?? '';
    btn.dataset.cardId = h3?.dataset?.cardId ?? '';
    btn.dataset.cardImage = item?.querySelector('img')?.src ?? '';
    wrapper.appendChild(btn);
  });
}

// ── Results block DOM ──────────────────────────────────────────────────────────

/** Build the results markup directly into this block's own root element. */
function populateResultsBlock(block, disclaimerHtml) {
  block.classList.add('ccs-results');

  const cardListContainer = document.createElement('div');
  cardListContainer.className = 'ccs-card-list-container ccs-built';
  block.appendChild(cardListContainer);

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'ccs-results-toggle ccs-built';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'ccs-results-toggle-btn';
  toggleWrap.appendChild(toggleBtn);
  block.appendChild(toggleWrap);

  if (disclaimerHtml) {
    const disclaimer = document.createElement('div');
    disclaimer.className = 'ccs-results-disclaimer ccs-built';
    disclaimer.innerHTML = disclaimerHtml;
    block.appendChild(disclaimer);
  }

  return { cardListContainer, toggleWrap, toggleBtn };
}

// ── Mobile carousel: dots + seamless loop ─────────────────────────────────────

function initMobileCarousel(cardsList, blockEl, cardListContainer, doc, labels) {
  const dotsEl = doc.createElement('div');
  dotsEl.className = 'ccs-scroll-dots';
  cardListContainer.appendChild(dotsEl);

  const getRealItems = () => [
    ...blockEl.querySelectorAll('.cards-list-item:not(.ccs-hidden):not([data-ccs-clone])'),
  ];
  const realItems = getRealItems();
  let dots = [];

  const centerLeft = (item) => item.getBoundingClientRect().left
      - cardsList.getBoundingClientRect().left
      + cardsList.scrollLeft;

  const scrollToItem = (item) => {
    const offset = centerLeft(item) - (cardsList.clientWidth - item.offsetWidth) / 2;
    cardsList.scrollTo({ left: offset, behavior: 'smooth' });
  };

  const closestItem = (items, centered) => {
    const listRect = cardsList.getBoundingClientRect();
    const target = centered ? listRect.left + cardsList.clientWidth / 2 : listRect.left;
    return items.reduce((closest, item) => {
      const rect = item.getBoundingClientRect();
      const position = centered ? rect.left + rect.width / 2 : rect.left;
      const distance = Math.abs(position - target);
      return !closest || distance < closest.distance ? { item, distance } : closest;
    }, null)?.item;
  };

  const buildDots = () => {
    const items = getRealItems();
    dots = items.length > 1 ? items.map((item, i) => {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'ccs-scroll-dot';
      dot.classList.toggle('is-active', i === 0);
      dot.setAttribute('aria-label', `${labels.goToCard} ${i + 1}`);
      dot.addEventListener('click', () => scrollToItem(item));
      return dot;
    }) : [];
    dotsEl.replaceChildren(...dots);
  };

  buildDots();

  // Seamless loop — clones only on mobile so they don't pollute the desktop grid
  const shouldLoop = realItems.length > 1 && window.matchMedia(MOBILE_BREAKPOINT).matches;
  let wrapTimer = null;
  let wrapIfClone = () => {};
  let loopItems = [];

  if (shouldLoop) {
    const makeClone = (index) => {
      const clone = realItems[index].cloneNode(true);
      clone.dataset.ccsClone = 'true';
      clone.dataset.ccsCloneOf = String(index);
      clone.setAttribute('aria-hidden', 'true');
      return clone;
    };

    // Extra runway keeps centered snapping reachable at both scroll boundaries.
    if (realItems.length > 2) cardsList.prepend(makeClone(realItems.length - 2));
    cardsList.prepend(makeClone(realItems.length - 1));
    cardsList.append(makeClone(0));
    if (realItems.length > 2) cardsList.append(makeClone(1));

    const centerFirst = () => {
      if (!cardsList.clientWidth) return false;
      const first = realItems[0];
      cardsList.style.scrollSnapType = 'none';
      cardsList.scrollLeft = centerLeft(first) - (cardsList.clientWidth - first.offsetWidth) / 2;
      requestAnimationFrame(() => cardsList.style.removeProperty('scroll-snap-type'));
      return true;
    };

    // The block can be decorated while its section is hidden, so wait for a measurable track.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (centerFirst()) return;
      const resizeObserver = new ResizeObserver(() => centerFirst() && resizeObserver.disconnect());
      resizeObserver.observe(cardsList);
    }));

    loopItems = [...cardsList.querySelectorAll('.cards-list-item:not(.ccs-hidden)')];

    // Recenter on the real card after a scroll settles on either boundary clone.
    wrapIfClone = () => {
      const snapped = closestItem(loopItems, true);
      const real = snapped?.dataset.ccsClone && realItems[Number(snapped.dataset.ccsCloneOf)];
      if (!real) return;
      cardsList.style.scrollSnapType = 'none';
      cardsList.scrollLeft += real.getBoundingClientRect().left
        - snapped.getBoundingClientRect().left;
      requestAnimationFrame(() => cardsList.style.removeProperty('scroll-snap-type'));
    };

    cardsList.addEventListener('scrollend', wrapIfClone);
  }

  cardsList.addEventListener('scroll', () => {
    if (!dots.length) return;
    const items = shouldLoop ? loopItems : getRealItems();
    const snapped = closestItem(items, shouldLoop);
    const activeIndex = Number(
      snapped?.dataset.ccsCloneOf ?? (shouldLoop ? realItems : items).indexOf(snapped),
    );
    dots.forEach((dot, index) => dot.classList.toggle('is-active', index === activeIndex));
    if (!shouldLoop) return;
    clearTimeout(wrapTimer);
    wrapTimer = setTimeout(wrapIfClone, 180);
  }, { passive: true });

  return buildDots;
}

// ── Row-peek helpers ───────────────────────────────────────────────────────────

// Clip the container so row 2 (cards 4–6) shows at 50% height on desktop.
// Uses getBoundingClientRect so the measurement is accurate after any scroll.
function setPeek(container) {
  if (!window.matchMedia(DESKTOP_BREAKPOINT).matches) return;
  const items = [...container.querySelectorAll(
    '.cards-list-item:not(.ccs-hidden):not([data-ccs-clone])',
  )];
  if (items.length < 4) return;
  const containerTop = container.getBoundingClientRect().top;
  const row2Item = items[3];
  // Clip at the top of the button area — the 8rem gradient fades the description text out
  const btnEl = row2Item.querySelector('.cards-list-button');
  const anchorEl = btnEl || row2Item.querySelector('.cards-list-description') || row2Item;
  const anchorRect = anchorEl.getBoundingClientRect();
  const peekHeight = Math.round(anchorRect.top - containerTop);
  const el = container;
  el.style.maxHeight = `${peekHeight}px`;
  el.classList.add('ccs-peek');
}

function removePeek(container) {
  const el = container;
  el.style.maxHeight = '';
  el.classList.remove('ccs-peek');
}

/**
 * EDS decorate entry point.
 *
 * Block row mapping (matches _credit-card-results.json model):
 *   Row 0  disclaimerText — richtext
 *
 * Renders independently of the Credit Card Selector block — the two only
 * communicate via document-level custom events (credit-card-filter-applied /
 * credit-card-filter-reset / credit-card-compare-updated), so this block can be
 * placed anywhere on the page relative to the selector.
 */
export default async function decorate(block) {
  // UE re-calls decorate when the block is edited — remove any previously built
  // results markup (marked ccs-built) so re-decoration doesn't duplicate content.
  // Matching on ccs-built rather than "not yet a source row" is required: on the
  // very first decorate() call the authored row hasn't been marked as a source
  // row yet, so the inverse check would delete it before its content is read.
  [...block.children].forEach((el) => {
    if (el.classList.contains('ccs-built')) el.remove();
  });
  block.classList.remove('ccs-results');

  const rows = [...block.children];
  const readRowHtml = (row) => row?.children[1]?.innerHTML?.trim()
    ?? row?.querySelector('p')?.outerHTML
    ?? '';
  const disclaimerHtml = readRowHtml(rows[0]);

  // Hide the authored source row via CSS class instead of removing it, so
  // Universal Editor instrumentation on it survives re-decoration.
  rows.forEach((row) => { row.classList.add('ccs-source-row'); });

  const doc = block.ownerDocument;
  const lang = getLang();

  await loadCSS(`${window.hlx.codeBasePath}/blocks/card-list/card-list.css`);

  const ph = await fetchPlaceholders();
  const isTH = lang === 'th';
  const labels = {
    noResultsFound: ph.cardNoResultsFound || (isTH ? 'ไม่พบผลลัพธ์' : 'No Results Found'),
    cardResultTitle: ph.cardResultTitle || 'These cards might suit your needs',
    seeLess: ph.cardSeeLess || (isTH ? 'ดูน้อยลง' : 'See less'),
    seeMore: ph.cardSeeMore || (isTH ? 'ดูเพิ่มเติม' : 'See more'),
    learnMore: ph.cardLearnMore || (isTH ? 'เรียนรู้เพิ่มเติม' : 'Learn more'),
    compare: ph.cardCompare || (isTH ? 'เปรียบเทียบ' : 'Compare'),
    remove: ph.cardRemove || (isTH ? 'ลบออก' : 'Remove'),
    goToCard: ph.cardGoToCard || (isTH ? 'ไปที่การ์ด' : 'Go to card'),
  };

  // Fetch both data sources in parallel for initial render
  const [sheetCards, rawCards] = await Promise.all([loadSheetData(), loadCardData()]);
  // used for initial (unfiltered) display
  const allCards = sortBySheetOrder(rawCards, sheetCards, lang);

  const {
    cardListContainer, toggleWrap, toggleBtn,
  } = populateResultsBlock(block, disclaimerHtml);

  // ── State ──────────────────────────────────────────────────────────────────
  let isExpanded = false;
  let activeCards = null; // null = full unfiltered list; Array = filtered result
  let currentBuildDots = null;

  // ── Results title: default (authored) copy vs. filtered copy ────────────────
  const resultsContainer = block.closest('.credit-card-results-container');
  const titleEl = resultsContainer?.querySelector('h2');
  const defaultTitleHtml = titleEl ? titleEl.textContent : '';

  function updateTitle() {
    if (!titleEl) return;
    if (activeCards !== null) {
      // A filter is applied — swap in the "suggested cards" title
      titleEl.textContent = labels.cardResultTitle;
    } else {
      // No filter — restore the original authored heading
      titleEl.textContent = defaultTitleHtml;
    }
  }

  // ── Restore compare button states after re-render ──────────────────────────
  function restoreCompareState(container) {
    const selected = window.ccsSelectedCards || [];
    container.querySelectorAll('.ccs-compare-btn').forEach((btn) => {
      const isSelected = selected.some((c) => c.name === btn.dataset.cardName);
      btn.classList.toggle('is-comparing', isSelected);
      btn.classList.toggle('disabled', isSelected);
      btn.textContent = labels.compare;
    });
  }

  function renderCards(cards) {
    cardListContainer.innerHTML = '';
    currentBuildDots = null;

    if (!cards || cards.length === 0) {
      const msg = doc.createElement('p');
      msg.className = 'ccs-no-results';
      msg.textContent = labels.noResultsFound;
      cardListContainer.appendChild(msg);
      return;
    }

    const blockEl = buildCardBlock(cards, doc, lang, labels);
    cardListContainer.appendChild(blockEl);
    addCompareButtons(blockEl, doc, labels);
    restoreCompareState(cardListContainer);

    const cardsList = blockEl.querySelector('.cards-list.scrollable');
    // On mobile, the carousel already exposes every card via swipe, so the
    // initial-visible cap (and the "See more" toggle it drives) is redundant.
    const isMobileCarousel = !!cardsList && window.matchMedia(MOBILE_BREAKPOINT).matches;

    if (activeCards === null && !isExpanded && !isMobileCarousel) {
      [...blockEl.querySelectorAll('.cards-list-item')].forEach((item, i) => {
        if (i >= INITIAL_VISIBLE) item.classList.add('ccs-hidden');
      });
      // Defer peek measurement until after the browser has laid out the new cards
      requestAnimationFrame(() => setPeek(cardListContainer));
    } else {
      removePeek(cardListContainer);
    }

    if (cardsList) {
      currentBuildDots = initMobileCarousel(cardsList, blockEl, cardListContainer, doc, labels);
    }
  }

  function refreshToggle() {
    const isMobileCarousel = window.matchMedia(MOBILE_BREAKPOINT).matches
      && !!cardListContainer.querySelector('.cards-list.scrollable');
    const canToggle = activeCards === null
      && allCards.length > INITIAL_VISIBLE
      && !isMobileCarousel;
    toggleWrap.style.display = canToggle ? 'flex' : 'none';

    toggleBtn.innerHTML = '';
    const label = doc.createElement('span');
    label.textContent = isExpanded ? labels.seeLess : labels.seeMore;
    const icon = doc.createElement('span');
    icon.className = 'icon-dropdown';
    icon.setAttribute('aria-hidden', 'true');
    toggleBtn.appendChild(label);
    toggleBtn.appendChild(icon);
    toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  }

  function render() {
    renderCards(activeCards !== null ? activeCards : allCards);
    refreshToggle();
    updateTitle();
  }

  render();

  // ── Re-render on breakpoint crossing (mobile carousel vs. grid) ─────────────
  window.matchMedia(MOBILE_BREAKPOINT).addEventListener('change', () => render());

  // ── See more / See less ────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    const prevTop = toggleBtn.getBoundingClientRect().top;
    isExpanded = !isExpanded;
    [...cardListContainer.querySelectorAll('.cards-list-item')].forEach((item, i) => {
      if (i >= INITIAL_VISIBLE) item.classList.toggle('ccs-hidden', !isExpanded);
    });
    if (isExpanded) {
      removePeek(cardListContainer);
    } else {
      setPeek(cardListContainer);
    }
    refreshToggle();
    if (currentBuildDots) currentBuildDots();
    if (!isExpanded) {
      const newTop = toggleBtn.getBoundingClientRect().top;
      window.scrollBy(0, newTop - prevTop);
    }
  });

  // ── Filter applied ─────────────────────────────────────────────────────────
  doc.addEventListener('credit-card-filter-applied', async (e) => {
    activeCards = await resolveFilteredCards(sheetCards, e.detail || {});
    isExpanded = false;
    render();
    block.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ── Filter reset ───────────────────────────────────────────────────────────
  doc.addEventListener('credit-card-filter-reset', () => {
    activeCards = null;
    isExpanded = false;
    render();
  });

  // ── Compare toggle ─────────────────────────────────────────────────────────
  block.addEventListener('click', (e) => {
    const btn = e.target.closest('.ccs-compare-btn');
    if (!btn) return;
    e.preventDefault();

    window.ccsSelectedCards = window.ccsSelectedCards || [];
    const { cardName, cardImage, cardId } = btn.dataset;
    // If already in the comparator, do nothing — removal is only via the X icon in the bar
    if (btn.classList.contains('is-comparing')) return;

    if (window.ccsSelectedCards.length >= MAX_COMPARE) {
      document.dispatchEvent(new CustomEvent('credit-card-compare-limit-reached'));
      return;
    }
    window.ccsSelectedCards.push({ id: cardId, name: cardName, image: cardImage });

    restoreCompareState(cardListContainer);

    document.dispatchEvent(new CustomEvent('credit-card-compare-updated', {
      detail: { cards: window.ccsSelectedCards },
    }));
  });

  // ── Sync button states when comparator bar removes a card ──────────────────
  doc.addEventListener('credit-card-compare-updated', () => {
    restoreCompareState(cardListContainer);
  });
}

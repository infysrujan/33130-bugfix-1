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
const BENEFIT_ALIASES = { rewards: 'point' };

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

function sortBySourcing(cards) {
  return [...cards].sort((a, b) => {
    const an = parseInt(getCardField(a, 'Sourcing', 'sourcingNumber', 'Sourcing Number', 'order') || 9999, 10);
    const bn = parseInt(getCardField(b, 'Sourcing', 'sourcingNumber', 'Sourcing Number', 'order') || 9999, 10);
    return an - bn;
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
    userLifestyles: (lifestyles || []).map(norm).filter(Boolean),
  };
  return sheetCards.filter((row) => matchesFilter(row, criteria));
}

/**
 * Apply a filter state to allCards: match sheet rows → fetch helper cards by name
 * → sort by Sourcing → cap at MAX_FILTERED.
 */
async function resolveFilteredCards(sheetCards, filterState) {
  const matchingRows = filterSheetCards(sheetCards, filterState);
  const matchingNames = matchingRows.map((row) => norm(row['Product Name (EN)'] || ''));

  if (!matchingNames.length) return [];

  const sourcingMap = {};
  matchingRows.forEach((row) => {
    const name = norm(row['Product Name (EN)'] || '');
    if (name) sourcingMap[name] = parseInt(row.Sourcing || 9999, 10);
  });

  // Second fetch — request only the matched cards by name
  const rawCards = await loadCardData();

  const filtered = rawCards
    .filter((card) => {
      const name = norm(getCardField(card, 'nameEN', 'Product Name (EN)', 'name', 'cardName'));
      return matchingNames.includes(name);
    })
    .sort((a, b) => {
      const nameA = norm(getCardField(a, 'nameEN', 'Product Name (EN)', 'name', 'cardName'));
      const nameB = norm(getCardField(b, 'nameEN', 'Product Name (EN)', 'name', 'cardName'));
      return (sourcingMap[nameA] ?? 9999) - (sourcingMap[nameB] ?? 9999);
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
    btn.classList.add('buttom-m');
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

  const scrollToItem = (item) => {
    const offset = item.getBoundingClientRect().left
      - cardsList.getBoundingClientRect().left
      + cardsList.scrollLeft;
    cardsList.scrollTo({ left: offset, behavior: 'smooth' });
  };

  const buildDots = () => {
    dotsEl.innerHTML = '';
    const items = getRealItems();
    if (items.length <= 1) return; // no dots needed for a single card
    items.forEach((item, i) => {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'ccs-scroll-dot';
      if (i === 0) dot.classList.add('is-active');
      dot.setAttribute('aria-label', `${labels.goToCard} ${i + 1}`);
      dot.addEventListener('click', () => scrollToItem(item));
      dotsEl.appendChild(dot);
    });
  };

  buildDots();

  // Sync active dot with scroll position
  cardsList.addEventListener('scroll', () => {
    const dots = [...dotsEl.querySelectorAll('.ccs-scroll-dot')];
    const realItems = getRealItems();
    if (!realItems.length || !dots.length) return;
    const containerLeft = cardsList.getBoundingClientRect().left;
    let activeIndex = 0;
    let minDistance = Infinity;
    realItems.forEach((item, i) => {
      const dist = Math.abs(item.getBoundingClientRect().left - containerLeft);
      if (dist < minDistance) { minDistance = dist; activeIndex = i; }
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeIndex));
  }, { passive: true });

  // Seamless loop — clones only on mobile so they don't pollute the desktop grid
  const realItems = getRealItems();
  if (realItems.length > 1 && window.matchMedia(MOBILE_BREAKPOINT).matches) {
    const firstClone = realItems[0].cloneNode(true);
    const lastClone = realItems[realItems.length - 1].cloneNode(true);
    [firstClone, lastClone].forEach((c) => {
      c.dataset.ccsClone = 'true';
      c.setAttribute('aria-hidden', 'true');
    });
    cardsList.appendChild(firstClone); // clone of first → at end
    cardsList.insertBefore(lastClone, realItems[0]); // clone of last  → at start

    // Skip the prepended last-clone on load (instant, no animation)
    requestAnimationFrame(() => {
      cardsList.scrollLeft = realItems[0].offsetLeft;
    });

    // After scroll snaps to a clone, instantly reposition to its real counterpart
    let wrapTimer = null;
    cardsList.addEventListener('scroll', () => {
      clearTimeout(wrapTimer);
      wrapTimer = setTimeout(() => {
        const allItems = [...cardsList.querySelectorAll('.cards-list-item')];
        const containerLeft = cardsList.getBoundingClientRect().left;
        let snapIdx = 0;
        let minDist = Infinity;
        allItems.forEach((item, i) => {
          const dist = Math.abs(item.getBoundingClientRect().left - containerLeft);
          if (dist < minDist) { minDist = dist; snapIdx = i; }
        });
        const snapped = allItems[snapIdx];
        if (!snapped || !snapped.dataset.ccsClone) return;
        const real = snapped === lastClone ? realItems[realItems.length - 1] : realItems[0];
        // Instant reposition — no animation so the user doesn't see the jump
        cardsList.scrollLeft += real.getBoundingClientRect().left
          - snapped.getBoundingClientRect().left;
      }, 100);
    }, { passive: true });
  }

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
  const allCards = sortBySourcing(rawCards); // used for initial (unfiltered) display

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
    isExpanded = !isExpanded;
    [...cardListContainer.querySelectorAll('.cards-list-item')].forEach((item, i) => {
      if (i >= INITIAL_VISIBLE) item.classList.toggle('ccs-hidden', !isExpanded);
    });
    if (isExpanded) {
      removePeek(cardListContainer);
    } else {
      requestAnimationFrame(() => setPeek(cardListContainer));
    }
    refreshToggle();
    if (currentBuildDots) currentBuildDots();
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

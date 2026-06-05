import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

const TABLET_MIN = getComputedStyle(document.documentElement)
  .getPropertyValue('--bbl-breakpoint-tablet-min')
  .trim();

// ── Utilities ──────────────────────────────────────────────────────────────────

function norm(str) {
  return (str || '').toString()
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function plaintext(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.plaintext || field.html || '';
}

function resolveImageUrl(card) {
  const raw = card.FundImage || card.imageUrl || card.image || card.fundImage || '';
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // eslint-disable-next-line no-underscore-dangle
  return raw._publishUrl || raw._authorUrl || '';
}

function resolveCardPageUrl(card) {
  // eslint-disable-next-line no-underscore-dangle
  const raw = card._path || card.readMoreUrl || card.cardPageUrl || card.detailUrl || card.pageUrl || '';
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  // eslint-disable-next-line no-underscore-dangle
  return raw._publishUrl || raw._authorUrl || raw._path || '';
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function loadAllCards() {
  try {
    const configs = await fetchConfigs();
    const url = configs.mfFundsDataUrl;
    // eslint-disable-next-line no-console
    console.log('[mf-comparator-results] loadAllCards url:', url);
    if (!url) throw new Error('no url');
    const json = await fetchGet(url);
    const items = json.data?.mutualFundsList?.items
      || json.data?.fundsList?.items
      || json.data
      || json.items
      || [];
    if (items.length) return items;
    throw new Error('empty');
  } catch {
    return [];
  }
}

function normalizeRow(row) {
  const out = {};
  Object.entries(row).forEach(([k, v]) => {
    const key = k.replace(/\u200B/g, '').trim();
    out[key] = typeof v === 'string' ? v.replace(/\u200B/g, '').trim() : v;
  });
  return out;
}

/** Build name→sourcing-priority map from the MF filtering matrix sheet */
async function loadSourcingOrder() {
  try {
    const configs = await fetchConfigs();
    const url = configs.mfFilteringMatrixUrl;
    if (!url) return null;
    const json = await fetchGet(url, { throwOnError: false });
    if (!json) return null;
    const lang = getLang();
    const nameKey = lang === 'th' ? 'Fund Name (TH)' : 'Fund Name';
    const map = {};
    (json.data || []).map(normalizeRow).forEach((row, i) => {
      const key = norm(row[nameKey] || row['Fund Name'] || '');
      // Use the row index as sourcing order if no explicit sourcing column
      if (key) map[key] = parseInt(row.Sourcing || row.Order || i, 10);
    });
    return map;
  } catch {
    return null;
  }
}

function getCardName(card) {
  return card.name || card.title || card.FundName || card.fundName || '';
}

function filterAndSortCards(allCards, selectedNames, sourcingMap) {
  const normalizedNames = selectedNames.map(norm);

  const matched = allCards.filter((card) => {
    const cardName = norm(getCardName(card));
    return normalizedNames.some((n) => cardName.includes(n) || n.includes(cardName));
  });

  if (!sourcingMap || Object.keys(sourcingMap).length === 0) {
    return normalizedNames
      .map((n) => matched.find((c) => {
        const cardName = norm(getCardName(c));
        return cardName.includes(n) || n.includes(cardName);
      }))
      .filter(Boolean);
  }

  return matched.sort((a, b) => {
    const sA = sourcingMap[norm(getCardName(a))] ?? 9999;
    const sB = sourcingMap[norm(getCardName(b))] ?? 9999;
    return sA - sB;
  });
}

// ── DOM builders ───────────────────────────────────────────────────────────────

/**
 * Build a single MF comparison card column.
 * Structure: .mfcr-card > .mfcr-inner > .mfcr-thumb
 *                        > .mfcr-caption > h3 + .compare-info + .mfcr-logo
 *                        > a.mfcr-read-more
 */
function buildCompareCard(card, doc, labels) {
  const name = card.name || card.title || card.FundName || card.fundName || '';
  const imgSrc = resolveImageUrl(card);
  const readMoreHref = resolveCardPageUrl(card);

  const getField = (...keys) => {
    for (let i = 0; i < keys.length; i += 1) {
      const val = card[keys[i]];
      if (val !== undefined && val !== null && val !== '') return val;
    }
    return '';
  };

  const tagToLabel = (tag) => {
    const slug = tag.split('/').pop() || tag.split(':').pop() || tag;
    return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const riskRaw = getField('RiskLevel', 'riskLevel');
  const riskLabel = riskRaw ? riskRaw.replace(/^level-/i, 'Level ') : '';

  const fundTypeRaw = getField('FundType', 'fundType', 'type');
  let fundTypeLabel = '';
  let fundTypeIsHtml = false;
  if (Array.isArray(fundTypeRaw) && fundTypeRaw.length) {
    fundTypeLabel = fundTypeRaw.map(tagToLabel).join(', ');
  } else if (fundTypeRaw && typeof fundTypeRaw === 'object' && fundTypeRaw.html) {
    fundTypeLabel = fundTypeRaw.html;
    fundTypeIsHtml = true;
  } else if (typeof fundTypeRaw === 'string') {
    fundTypeLabel = fundTypeRaw;
  }

  const investmentPolicy = plaintext(getField('InvestmentPolicy', 'investmentPolicy'));
  const masterFund = getField('MasterFund', 'masterFund');
  const dividendPolicy = getField('DividendPaymentPolicy', 'dividendPaymentPolicy');
  const managementCompany = getField('ManagementCompany', 'managementCompany');

  const col = doc.createElement('div');
  col.className = 'mfcr-card';

  // Image thumbnail (background-image + hidden print img)
  const inner = doc.createElement('div');
  inner.className = 'mfcr-inner';
  const thumb = doc.createElement('div');
  thumb.className = 'mfcr-thumb';
  if (imgSrc) {
    thumb.style.backgroundImage = `url("${imgSrc}")`;
    const img = doc.createElement('img');
    img.src = imgSrc;
    img.alt = name;
    img.loading = 'lazy';
    img.className = 'mfcr-img-print';
    thumb.appendChild(img);
  }
  inner.appendChild(thumb);
  col.appendChild(inner);

  // Caption
  const caption = doc.createElement('div');
  caption.className = 'mfcr-caption';

  const nameEl = doc.createElement('h3');
  nameEl.className = 'mfcr-card-name';
  nameEl.textContent = name;
  caption.appendChild(nameEl);

  // Detail rows (dl/dt/dd)
  const compareInfo = doc.createElement('div');
  compareInfo.className = 'compare-info';

  const fields = [
    { key: 'riskLevel', label: labels.riskLevel, value: riskLabel },
    {
      key: 'fundType', label: labels.fundType, value: fundTypeLabel, isHtml: fundTypeIsHtml,
    },
    { key: 'investmentPolicy', label: labels.investmentPolicy, value: investmentPolicy },
    { key: 'masterFund', label: labels.masterFund, value: masterFund },
    { key: 'dividendPolicy', label: labels.dividendPolicy, value: dividendPolicy },
    { key: 'managementCompany', label: labels.managementCompany, value: managementCompany },
  ];

  fields.forEach(({
    key, label, value, isHtml,
  }) => {
    if (!value) return;
    const dl = doc.createElement('dl');
    dl.dataset.field = key;
    const dt = doc.createElement('dt');
    dt.className = 'mfcr-label';
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.className = 'mfcr-value';
    if (isHtml) {
      dd.innerHTML = value;
    } else {
      dd.textContent = value;
    }
    dl.appendChild(dt);
    dl.appendChild(dd);
    compareInfo.appendChild(dl);
  });

  caption.appendChild(compareInfo);

  col.appendChild(caption);

  // Read more link
  const readMoreLink = doc.createElement('a');
  readMoreLink.href = readMoreHref || '#';
  readMoreLink.className = 'mfcr-read-more';
  readMoreLink.textContent = labels.readMore;
  col.appendChild(readMoreLink);

  return col;
}

// ── Mobile carousel dots ───────────────────────────────────────────────────────

function initMobileCarousel(grid, doc) {
  const dotsEl = doc.createElement('div');
  dotsEl.className = 'mfcr-scroll-dots';
  grid.parentElement?.appendChild(dotsEl);

  const getItems = () => [...grid.querySelectorAll('.mfcr-card')];

  const scrollToItem = (item) => {
    const offset = item.getBoundingClientRect().left
      - grid.getBoundingClientRect().left
      + grid.scrollLeft;
    grid.scrollTo({ left: offset, behavior: 'smooth' });
  };

  const buildDots = () => {
    dotsEl.innerHTML = '';
    const items = getItems();
    if (items.length <= 1) return;
    items.forEach((item, i) => {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = `mfcr-scroll-dot${i === 0 ? ' is-active' : ''}`;
      dot.setAttribute('aria-label', `Card ${i + 1}`);
      dot.addEventListener('click', () => scrollToItem(item));
      dotsEl.appendChild(dot);
    });
  };

  grid.addEventListener('scroll', () => {
    const dots = [...dotsEl.querySelectorAll('.mfcr-scroll-dot')];
    const items = getItems();
    if (!items.length || !dots.length) return;
    const containerLeft = grid.getBoundingClientRect().left;
    let activeIndex = 0;
    let minDistance = Infinity;
    items.forEach((item, i) => {
      const dist = Math.abs(item.getBoundingClientRect().left - containerLeft);
      if (dist < minDistance) { minDistance = dist; activeIndex = i; }
    });
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeIndex));
  }, { passive: true });

  return buildDots;
}

// ── Row height equalizer ───────────────────────────────────────────────────────

function equalizeRowHeights(grid) {
  if (!window.matchMedia(`(width > ${TABLET_MIN})`).matches) return;

  const cards = [...grid.querySelectorAll('.mfcr-card')];
  if (cards.length < 2) return;
  if (grid.getBoundingClientRect().width === 0) return;

  // Reset all heights before measuring
  cards.forEach((card) => {
    // eslint-disable-next-line no-param-reassign
    card.style.height = '';
    card.querySelectorAll('.mfcr-card-name, dl').forEach((el) => {
      // eslint-disable-next-line no-param-reassign
      el.style.height = '';
    });
  });

  // Equalize card name heights
  const nameEls = cards.map((c) => c.querySelector('.mfcr-card-name')).filter(Boolean);
  const maxNameH = Math.max(...nameEls.map((el) => el.offsetHeight));
  nameEls.forEach((el) => { el.style.height = `${maxNameH}px`; }); // eslint-disable-line no-param-reassign

  // Equalize dl rows by field key
  ['riskLevel', 'fundType', 'investmentPolicy', 'masterFund', 'dividendPolicy', 'managementCompany'].forEach((key) => {
    const dls = cards.map((c) => c.querySelector(`dl[data-field="${key}"]`)).filter(Boolean);
    if (dls.length < 2) return;
    const maxH = Math.max(...dls.map((dl) => dl.offsetHeight));
    dls.forEach((dl) => { dl.style.height = `${maxH}px`; }); // eslint-disable-line no-param-reassign
  });

  // Equalize total card height so read-more links align at the bottom
  const maxCardH = Math.max(...cards.map((c) => c.offsetHeight));
  cards.forEach((c) => { c.style.height = `${maxCardH}px`; }); // eslint-disable-line no-param-reassign
}

// ── Cookie / sessionStorage reader ────────────────────────────────────────────

function getCardsFromStorage() {
  try {
    const stored = sessionStorage.getItem('mfs-compare-cards');
    if (stored) {
      const cards = JSON.parse(stored);
      if (Array.isArray(cards) && cards.length) return cards;
    }
  } catch { /* ignore */ }

  // Cookie fallback keyed by URL param
  const cookieName = new URLSearchParams(window.location.search).get('mf-compare');
  if (!cookieName) return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${cookieName}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.split('=').slice(1).join('='));
    const items = JSON.parse(value);
    return items.map(({ id, title, photo }) => ({ name: title || id, image: photo }));
  } catch {
    return null;
  }
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderComparison(container, cards, allCards, sourcingMap, labels, doc) {
  container.innerHTML = '';

  if (!cards || cards.length === 0) {
    const msg = doc.createElement('p');
    msg.className = 'mfcr-no-results';
    msg.textContent = labels.noResults;
    container.appendChild(msg);
    return;
  }

  const selectedNames = cards.map((c) => c.name);
  const sorted = filterAndSortCards(allCards, selectedNames, sourcingMap);

  const displayCards = sorted.length > 0
    ? sorted
    : cards.map(({ name, image }) => ({ name, image }));

  displayCards.forEach((card) => {
    container.appendChild(buildCompareCard(card, doc, labels));
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Block row mapping (matches _mf-comparator-results.json model):
 *   Row 0: notes (richtext — notes text displayed below the comparison grid)
 */
export default async function decorate(block) {
  const doc = block.ownerDocument;
  const ph = await fetchPlaceholders();
  const labels = {
    readMore: ph.mfReadMoreText || 'Read More',
    riskLevel: ph.mfCompareRiskLevel || 'Risk Level',
    fundType: ph.mfCompareFundType || 'Fund Type',
    investmentPolicy: ph.mfCompareInvestmentPolicy || 'Investment Policy',
    masterFund: ph.mfCompareMasterFund || 'Master Fund',
    dividendPolicy: ph.mfCompareDividendPolicy || 'Dividend Payment Policy',
    managementCompany: ph.mfCompareManagementCompany || 'Management Company',
    noResults: ph.mfNoResultsText || 'No results found',
  };

  const notesRow = block.children[0];

  const innerContainer = doc.createElement('div');
  innerContainer.className = 'inner-container';
  block.appendChild(innerContainer);

  // Notes appear below the comparison grid
  if (notesRow) {
    notesRow.classList.add('mfcr-notes');
    block.appendChild(notesRow);
  }

  const container = doc.createElement('div');
  container.className = 'mfcr-grid';
  innerContainer.appendChild(container);

  const buildDots = initMobileCarousel(container, doc);

  // ── Height equalization with visibility observer ───────────────────────────
  const doAlign = () => {
    const measure = () => requestAnimationFrame(() => equalizeRowHeights(container));
    const runAlign = () => {
      doc.fonts.ready.then(measure);
      doc.fonts.addEventListener('loadingdone', measure, { once: true });
    };

    if (container.getBoundingClientRect().width > 0) {
      runAlign();
      return;
    }

    const section = block.closest('.section');
    const mo = new MutationObserver(() => {
      if (container.getBoundingClientRect().width > 0) {
        mo.disconnect();
        runAlign();
      }
    });
    if (section) mo.observe(section, { attributes: true, attributeFilter: ['style', 'class'] });
    mo.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  };

  // ── Load data ──────────────────────────────────────────────────────────────
  const [allCards, sourcingMap] = await Promise.all([loadAllCards(), loadSourcingOrder()]);

  function renderAndAlign(cards) {
    renderComparison(container, cards, allCards, sourcingMap, labels, doc);
    buildDots();
    doAlign();
  }

  // Restore from sessionStorage/cookie on page load
  const storedCards = getCardsFromStorage();
  if (storedCards) renderAndAlign(storedCards);

  // Inline mode: render when comparator bar fires compare event
  doc.addEventListener('mf-compare-show', (e) => renderAndAlign(e.detail?.cards));

  // Re-equalize on resize (debounced)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => equalizeRowHeights(container), 150);
  });
}

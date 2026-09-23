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
  return card.mfPageUrl?._path || '#';
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function loadAllCards() {
  try {
    const configs = await fetchConfigs();
    const baseUrl = configs.mfFundsDataUrl;
    if (!baseUrl) throw new Error('no url');
    const url = baseUrl.replace(/;language=[^;?&]*/i, `;language=${getLang()}`);
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

function filterAndSortCards(allCards, selectedIDs, selectedNames, sourcingMap) {
  const normalizedNames = selectedNames.map(norm);
  const matched = allCards.filter((card) => selectedIDs.includes(card.ProductID));

  if (!sourcingMap || Object.keys(sourcingMap).length === 0) {
    return normalizedNames
      .map((n) => matched.find((c) => {
        const cardName = norm(getCardName(c));
        const found = cardName === n;
        return found;
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
  let readMoreHref = resolveCardPageUrl(card);
  // Remove "/content/bangkokbank" from the start of readMoreHref, if present
  if (readMoreHref.startsWith('/content/bangkokbank')) {
    readMoreHref = readMoreHref.replace(/^\/content\/bangkokbank/, '');
  }

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

  const riskRaw = getField('RiskLevel', 'riskLevel', 'type');
  let riskLabel = '';
  let riskIsHtml = false;
  if (riskRaw && typeof riskRaw === 'object' && riskRaw.html) {
    riskLabel = riskRaw.html;
    riskIsHtml = true;
  }

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
    {
      key: 'riskLevel', label: labels.riskLevel, value: riskLabel, isHtml: riskIsHtml,
    },
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
    const dl = doc.createElement('dl');
    dl.dataset.field = key;
    const dt = doc.createElement('dt');
    dt.className = 'mfcr-label';
    dt.textContent = label;
    const dd = doc.createElement('dd');
    dd.className = 'mfcr-value';
    if (value) {
      if (isHtml) {
        dd.innerHTML = value;
      } else {
        dd.textContent = value;
      }
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

  const getItems = () => [...grid.querySelectorAll('.mfcr-card:not(.mfcr-card-clone)')];

  const scrollToItem = (item, instant = false) => {
    const itemOffset = item.getBoundingClientRect().left
      - grid.getBoundingClientRect().left
      + grid.scrollLeft;
    const left = itemOffset - (grid.clientWidth - item.clientWidth) / 2;
    if (instant) {
      grid.scrollLeft = left;
    } else {
      grid.scrollTo({ left, behavior: 'smooth' });
    }
  };

  const findNearest = () => {
    const allItems = [...grid.querySelectorAll('.mfcr-card')];
    const containerCenter = grid.getBoundingClientRect().left + grid.clientWidth / 2;
    let nearest = null;
    let minDistance = Infinity;
    allItems.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const dist = Math.abs((rect.left + rect.width / 2) - containerCenter);
      if (dist < minDistance) { minDistance = dist; nearest = item; }
    });
    return nearest;
  };

  const setupLoopClones = (items) => {
    grid.querySelectorAll('.mfcr-card-clone').forEach((el) => el.remove());
    if (items.length < 2) return;

    const makeClone = (item, realIndex) => {
      const clone = item.cloneNode(true);
      clone.classList.add('mfcr-card-clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('a, button').forEach((el) => { el.tabIndex = -1; });
      clone.dataset.cloneIndex = realIndex;
      return clone;
    };

    grid.insertBefore(makeClone(items[items.length - 1], items.length - 1), items[0]);
    grid.appendChild(makeClone(items[0], 0));
  };

  const centerWhenReady = (item) => {
    const attempt = () => {
      if (grid.clientWidth > 0) {
        scrollToItem(item, true);
      } else {
        requestAnimationFrame(attempt);
      }
    };
    requestAnimationFrame(attempt);
  };

  const buildDots = () => {
    dotsEl.innerHTML = '';
    const items = getItems();
    setupLoopClones(items);
    if (items.length <= 1) return;

    centerWhenReady(items[0]);

    items.forEach((item, i) => {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = `mfcr-scroll-dot${i === 0 ? ' is-active' : ''}`;
      dot.setAttribute('aria-label', `Card ${i + 1}`);
      dot.addEventListener('click', () => scrollToItem(item));
      dotsEl.appendChild(dot);
    });
  };

  let scrollEndTimer;
  grid.addEventListener('scroll', () => {
    const dots = [...dotsEl.querySelectorAll('.mfcr-scroll-dot')];
    const items = getItems();
    if (!items.length || !dots.length) return;

    const nearest = findNearest();
    const activeIndex = nearest?.dataset.cloneIndex !== undefined
      ? Number(nearest.dataset.cloneIndex)
      : items.indexOf(nearest);
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeIndex));

    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      const settled = findNearest();
      if (settled?.dataset.cloneIndex !== undefined) {
        const target = items[Number(settled.dataset.cloneIndex)];
        if (target) scrollToItem(target, true);
      }
    }, 120);
  }, { passive: true });

  return buildDots;
}

// ── Row height equalizer ───────────────────────────────────────────────────────

function equalizeRowHeights(grid) {
  if (!window.matchMedia(`(width > ${TABLET_MIN})`).matches) return;

  const cards = [...grid.querySelectorAll('.mfcr-card:not(.mfcr-card-clone)')];
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
    container.classList.remove('single-card', 'two-cards');
    return;
  }

  const selectedNames = cards.map((c) => c.name);
  const selectedIDs = cards.map((c) => c.id);
  const sorted = filterAndSortCards(allCards, selectedIDs, selectedNames, sourcingMap);

  const displayCards = sorted.length > 0
    ? sorted
    : cards.map(({ name, image }) => ({ name, image }));

  container.classList.toggle('single-card', displayCards.length === 1);
  container.classList.toggle('two-cards', displayCards.length === 2);

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

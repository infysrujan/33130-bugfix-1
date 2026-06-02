import { loadCSS } from '../../scripts/aem.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { openModal } from '../../scripts/modal.js';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Cookie name shared with mf-questionnaire block */
const COOKIE_NAME = 'mfSurveyAnswers';

function getSurveyAnswers() {
  try {
    const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`));
    return match ? JSON.parse(decodeURIComponent(match.split('=')[1])) : {};
  } catch { return {}; }
}

function clearSurveyAnswers() {
  document.cookie = `${COOKIE_NAME}=;path=/;max-age=0;SameSite=Lax`;
}

const MAX_COMPARE = 3;
const INITIAL_VISIBLE = 6;
const TABLET_MIN = '47.5rem';
const DESKTOP_BREAKPOINT = `(width > ${TABLET_MIN})`;

// ── Utilities ──────────────────────────────────────────────────────────────────

function norm(str) {
  return (str || '').toString().replace(/\u200B/g, '').toLowerCase().trim();
}

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

// ── Row-reading helpers ────────────────────────────────────────────────────────

function readText(row) {
  return row?.children[1]?.querySelector('p')?.textContent?.trim()
    ?? row?.children[1]?.textContent?.trim()
    ?? row?.querySelector('p')?.textContent?.trim()
    ?? '';
}

function readHtml(row) {
  return row?.children[1]?.innerHTML?.trim()
    ?? row?.querySelector('p')?.outerHTML
    ?? '';
}

function readUrl(row) {
  const anchor = row?.querySelector('a');
  if (anchor) return anchor.href;
  return readText(row);
}

// ── Data fetching ──────────────────────────────────────────────────────────────

/**
 * Fetch the MF filtering matrix sheet.
 * Config key: mf-suggestor-data (→ mfSuggestorData after toCamelCase)
 * Expected columns: Fund Name | Fund Risk Level | Fund Has Exchange Rate Risk
 */
async function loadMatrix() {
  try {
    const configs = await fetchConfigs();
    const url = configs.mfSuggestorData;
    // eslint-disable-next-line no-console
    console.log('[mf-results] loadMatrix url:', url);
    if (!url) return [];
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    return (json.data || []).map(normalizeRow);
  } catch {
    return [];
  }
}

/**
 * Fetch the MF fund card data from the GraphQL persisted query.
 * Config key (config.json): mf-funds-data-url  →  mfFundsDataUrl
 * Response shape: { data: { mutualFundsList: { items: [...] } } }
 */
async function loadFundsData() {
  try {
    const configs = await fetchConfigs();
    const url = configs.mfFundsDataUrl;
    // eslint-disable-next-line no-console
    console.log('[mf-results] loadFundsData url:', url);
    if (!url) return [];
    const resp = await fetch(url);
    if (resp.ok) {
      const json = await resp.json();
      const items = json.data?.mutualFundsList?.items || [];
      if (items.length) return items;
    }
  } catch {
    return [];
  }
  return [];
}

// ── Matrix filtering ───────────────────────────────────────────────────────────

/**
 * Maps session risk value → numeric risk level range used in the matrix.
 *
 * Session values (from mf-questionnaire screen 1):
 *   "low" | "medium-to-low" | "medium-to-high" | "high" | "very-high"
 *
 * Matrix column "Fund Risk Level" values: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 8+
 *   Low           = Level 1
 *   Medium to Low = Level 2–4
 *   Medium to High= Level 5
 *   High          = Level 6–7
 *   Very High     = Level 8 and 8+
 */
const RISK_NUMERIC_RANGES = {
  low: [1],
  'medium-to-low': [2, 3, 4],
  'medium-to-high': [5],
  high: [6, 7],
  'very-high': [8],
};

/**
 * Screen 1 — Risk Level filter.
 * Matrix column "Fund Risk Level" holds a numeric value (1–8 or "8+").
 */
function matchesRiskLevel(row, riskLevel) {
  if (!riskLevel) return true;
  const allowedLevels = RISK_NUMERIC_RANGES[norm(riskLevel)];
  if (!allowedLevels) return true;
  const rawRisk = norm(row['Fund Risk Level'] || '');
  if (!rawRisk) return true;
  // "8+" counts as Very High (8)
  const numericValue = rawRisk === '8+' ? 8 : parseInt(rawRisk, 10);
  return allowedLevels.includes(numericValue);
}

/**
 * Screen 2 — FX Risk filter.
 * Column: "Fund Has Exchange Rate Risk" — values: "Y" or "N"
 * Session: "yes" or "no"
 */
function matchesFxRisk(row, fxRisk) {
  if (!fxRisk) return true;
  const rowFx = norm(row['Fund Has Exchange Rate Risk'] || '');
  if (!rowFx) return true; // blank cell = no filter
  const rowHasFx = rowFx === 'y' || rowFx === 'yes';
  const userWantsFx = norm(fxRisk) === 'yes';
  return rowHasFx === userWantsFx;
}

/**
 * Screen 3 — Tax Benefit filter (RMF/SSF/Thai ESG/Thai ESGX).
 * Column: "Is an RMF/SSF/Thai ESG/Thai ESGX Fund" — values: "Y" or "N"
 * Session: "yes" or "no"
 */
function matchesTaxBenefit(row, taxBenefit) {
  if (!taxBenefit) return true;
  const rawTax = row['Is an RMF/SSF/Thai ESG/Thai ESGX Fund'] || '';
  const rowTax = norm(rawTax);
  if (!rowTax) return true; // blank cell = no filter
  const rowHasTax = rowTax === 'y' || rowTax === 'yes';
  const userWantsTax = norm(taxBenefit) === 'yes';
  return rowHasTax === userWantsTax;
}

/**
 * AND-logic: matrix row must pass all three filters.
 */
function matchesRow(row, { riskLevel, fxRisk, taxBenefit }) {
  return matchesRiskLevel(row, riskLevel)
    && matchesFxRisk(row, fxRisk)
    && matchesTaxBenefit(row, taxBenefit);
}

/**
 * Extract the fund names from matrix rows matched by the filters.
 */
function getMatchedFundNames(matrix, answers) {
  return matrix
    .filter((row) => matchesRow(row, answers))
    .map((row) => norm(row['Fund Name'] || ''))
    .filter(Boolean);
}

/**
 * Filter the GraphQL fund items to only those whose FundName appears in the
 * matched matrix names.
 */
function filterFundsByMatrix(funds, matchedNames) {
  if (!matchedNames.length) return [];
  return funds.filter((fund) => {
    const name = norm(fund.FundName || '');
    return matchedNames.some((n) => name === n || name.includes(n) || n.includes(name));
  });
}

// ── Peek helpers ───────────────────────────────────────────────────────────────

function setPeek(container) {
  if (!window.matchMedia(DESKTOP_BREAKPOINT).matches) return;
  const items = [...container.querySelectorAll('.cards-list-item:not(.mfr-hidden)')];
  if (items.length < 4) return;
  const containerTop = container.getBoundingClientRect().top;
  const anchorEl = items[3].querySelector('.cards-list-button')
    || items[3].querySelector('.cards-list-description')
    || items[3];
  const peekHeight = Math.round(anchorEl.getBoundingClientRect().top - containerTop);
  container.style.maxHeight = `${peekHeight}px`;
  container.classList.add('mfr-peek');
}

function removePeek(container) {
  container.style.maxHeight = '';
  container.classList.remove('mfr-peek');
}

// ── Fund card DOM builder ──────────────────────────────────────────────────────

/**
 * Build the fund card list HTML directly, producing the same class structure
 * as card-list.js so that card-list.css applies without running card-list.js.
 */
function buildCardBlock(funds, doc, labels) {
  const block = doc.createElement('div');
  block.className = 'card-list mf-results block';
  block.dataset.blockName = 'card-list';

  // eslint-disable-next-line no-underscore-dangle
  const getImgUrl = (val) => val?._publishUrl || (typeof val === 'string' ? val : '');

  const list = doc.createElement('div');
  list.className = 'cards-list scrollable center cards-3';

  funds.forEach((fund) => {
    const name = fund.FundName || '';
    // eslint-disable-next-line no-underscore-dangle
    const readMoreUrl = fund._path || '';
    const productId = fund.ProductID || name;
    const compareEnabled = fund.CompareButton === 'true';

    const fundImageSrc = getImgUrl(fund.FundImage);
    const logoSrc = getImgUrl(fund.LogoImage) || getImgUrl(fund.ManagementCompanyLogo);
    const imgSrc = fundImageSrc || logoSrc;

    const card = doc.createElement('div');
    card.className = 'cards-list-item';

    const inner = doc.createElement('div');
    inner.className = 'cards-list-inner';

    // Image
    if (imgSrc) {
      const imageWrapper = doc.createElement('div');
      imageWrapper.className = 'cards-list-image cards-list-image-default';
      const img = doc.createElement('img');
      img.src = imgSrc;
      img.alt = name;
      img.loading = 'lazy';
      imageWrapper.appendChild(img);
      inner.appendChild(imageWrapper);
    }

    // Content
    const content = doc.createElement('div');
    content.className = 'cards-list-content';

    // Title (with underline — mirrors enableTitleUnderline: true)
    const titleEl = doc.createElement('div');
    titleEl.className = 'cards-list-title has-title-underline';
    const h3 = doc.createElement('h3');
    h3.textContent = name;
    h3.dataset.cardId = productId;
    h3.dataset.compareEnabled = compareEnabled ? 'true' : 'false';
    titleEl.appendChild(h3);
    content.appendChild(titleEl);

    // Description
    if (fund.FundDescription) {
      titleEl.classList.add('has-description');
      const descEl = doc.createElement('div');
      descEl.className = 'cards-list-description';
      const p = doc.createElement('p');
      p.textContent = fund.FundDescription;
      descEl.appendChild(p);
      content.appendChild(descEl);
    }

    // Remark (logo)
    if (logoSrc) {
      const remarkEl = doc.createElement('div');
      remarkEl.className = 'cards-list-remark';
      const logoImg = doc.createElement('img');
      logoImg.src = logoSrc;
      logoImg.alt = name;
      logoImg.loading = 'lazy';
      logoImg.className = 'mfr-logo';
      remarkEl.appendChild(logoImg);
      content.appendChild(remarkEl);
    }

    inner.appendChild(content);

    // Button
    const buttonWrapper = doc.createElement('div');
    buttonWrapper.className = 'cards-list-button';
    const link = doc.createElement('a');
    link.href = readMoreUrl || '#';
    link.textContent = labels.readMore;
    buttonWrapper.appendChild(link);
    inner.appendChild(buttonWrapper);

    card.appendChild(inner);
    list.appendChild(card);
  });

  block.appendChild(list);
  return block;
}

/**
 * Inject a Compare button into each card's button wrapper,
 * matching the credit-card-results pattern.
 */
function addCompareButtons(blockEl, doc, labels) {
  blockEl.querySelectorAll('.cards-list-button').forEach((wrapper) => {
    const item = wrapper.closest('.cards-list-item');
    const h3 = item?.querySelector('h3');
    if (h3?.dataset?.compareEnabled === 'false') return;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'mfr-compare-btn';
    btn.textContent = labels.compare;
    btn.dataset.cardName = h3?.textContent?.trim() ?? '';
    btn.dataset.cardId = h3?.dataset?.cardId ?? '';
    btn.dataset.cardImage = item?.querySelector('img')?.src ?? '';
    wrapper.appendChild(btn);
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Block row mapping (matches _mf-results.json model):
 *   Row 0  viewAllLabel    – "View All Categories"
 *   Row 1  viewAllUrl      – aem-content: link to MF listing page
 *   Row 2  startOverLabel  – "Start Over"
 *   Row 3  startOverUrl    – aem-content: MF listing page (fallback redirect target)
 *   Row 4  disclaimer      – Richtext: disclaimer text shown at bottom
 */
export default async function decorate(block) {
  const doc = block.ownerDocument;
  const rows = [...block.children];

  // Read config
  const cfg = {
    viewAllLabel: readText(rows[0]),
    viewAllUrl: readUrl(rows[1]),
    startOverLabel: readText(rows[2]),
    startOverUrl: readUrl(rows[3]),
    disclaimer: readHtml(rows[4]),
  };

  // Hide source rows visually; they stay in the DOM so UE can find
  // the field instrumentation (data-aue-prop) nested under the block resource.
  rows.forEach((row) => row.classList.add('mfr-source-row'));

  // Load card-list styles so cards render identically to credit card results
  await loadCSS(`${window.hlx.codeBasePath}/blocks/card-list/card-list.css`);

  const ph = await fetchPlaceholders();
  const labels = {
    readMore: ph.mfReadMoreText || 'Read more',
    compare: ph.mfCompareText || 'Compare',
    noResults: ph.mfNoResultsText || 'No results found',
    seeLess: ph.mfSeeLessText || 'See less',
    seeMore: ph.mfSeeMoreText || 'See more',
  };

  // ── Build page structure ───────────────────────────────────────────────────
  const wrapper = doc.createElement('div');
  wrapper.className = 'mfr-wrapper';

  // Card list container (filled asynchronously after data loads)
  const cardListContainer = doc.createElement('div');
  cardListContainer.className = 'mfr-card-list-container';
  wrapper.appendChild(cardListContainer);

  // See more / See less toggle
  const toggleWrap = doc.createElement('div');
  toggleWrap.className = 'mfr-results-toggle';
  toggleWrap.style.display = 'none';
  const toggleBtn = doc.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'mfr-results-toggle-btn';
  toggleWrap.appendChild(toggleBtn);
  wrapper.appendChild(toggleWrap);

  // Footer CTAs: View All Categories + Start Over
  const footer = doc.createElement('div');
  footer.className = 'mfr-footer';

  if (cfg.viewAllLabel) {
    const viewAllBtn = doc.createElement('a');
    viewAllBtn.href = cfg.viewAllUrl || '#';
    viewAllBtn.className = 'mfr-cta mfr-cta--secondary';
    viewAllBtn.textContent = cfg.viewAllLabel;
    footer.appendChild(viewAllBtn);
  }

  if (cfg.startOverLabel) {
    const startOverBtn = doc.createElement('button');
    startOverBtn.type = 'button';
    startOverBtn.className = 'mfr-cta mfr-cta--secondary';
    startOverBtn.textContent = cfg.startOverLabel;

    startOverBtn.addEventListener('click', () => {
      // Clear questionnaire answers cookie
      clearSurveyAnswers();
      window.mfsSelectedCards = [];

      // If questionnaire block is already on this page, show it directly
      if (typeof window.mfQuestionnaire?.show === 'function') {
        window.mfQuestionnaire.show();
        return;
      }

      // Open the questionnaire modal fragment directly — avoids page navigation.
      // cfg.startOverUrl is an absolute URL (anchor.href); extract pathname for loadFragment.
      if (cfg.startOverUrl) {
        try {
          const fragmentPath = new URL(cfg.startOverUrl).pathname;
          openModal(doc, fragmentPath);
        } catch {
          openModal(doc, cfg.startOverUrl);
        }
      }
    });

    footer.appendChild(startOverBtn);
  }

  wrapper.appendChild(footer);

  // Disclaimer
  if (cfg.disclaimer) {
    const disclaimerEl = doc.createElement('div');
    disclaimerEl.className = 'mfr-disclaimer';
    disclaimerEl.innerHTML = cfg.disclaimer;
    wrapper.appendChild(disclaimerEl);
  }

  block.appendChild(wrapper);

  // ── Read questionnaire answers from cookie ────────────────────────────────
  const stored = getSurveyAnswers();
  const answers = {
    riskLevel: stored.riskLevel || '',
    fxRisk: stored.fxRisk || '',
    taxBenefit: stored.taxBenefit || '',
  };

  // ── Fetch matrix + fund data in parallel ──────────────────────────────────
  const [matrix, allFunds] = await Promise.all([loadMatrix(), loadFundsData()]);

  // ── State ──────────────────────────────────────────────────────────────────
  let isExpanded = false;
  let lastRenderedTotal = 0;

  // ── Compare state helpers ──────────────────────────────────────────────────
  function restoreCompareState() {
    const selected = window.mfsSelectedCards || [];
    cardListContainer.querySelectorAll('.mfr-compare-btn').forEach((btn) => {
      btn.classList.toggle('is-comparing', selected.some((c) => c.name === btn.dataset.cardName));
    });
  }

  // ── Toggle label refresh ───────────────────────────────────────────────────
  function refreshToggle(total) {
    const canToggle = total > INITIAL_VISIBLE;
    toggleWrap.style.display = canToggle ? 'flex' : 'none';
    toggleBtn.innerHTML = '';
    const labelEl = doc.createElement('span');
    labelEl.textContent = isExpanded ? labels.seeLess : labels.seeMore;
    const iconEl = doc.createElement('span');
    iconEl.className = 'icon-dropdown';
    iconEl.setAttribute('aria-hidden', 'true');
    toggleBtn.appendChild(labelEl);
    toggleBtn.appendChild(iconEl);
    toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  }

  // ── Render fund cards ──────────────────────────────────────────────────────
  function renderCards(funds) {
    cardListContainer.innerHTML = '';
    lastRenderedTotal = funds ? funds.length : 0;

    if (!funds || funds.length === 0) {
      const msg = doc.createElement('p');
      msg.className = 'mfr-no-results';
      msg.textContent = labels.noResults;
      cardListContainer.appendChild(msg);
      refreshToggle(0);
      return;
    }

    const blockEl = buildCardBlock(funds, doc, labels);
    cardListContainer.appendChild(blockEl);
    addCompareButtons(blockEl, doc, labels);
    restoreCompareState();

    if (!isExpanded && funds.length > INITIAL_VISIBLE) {
      [...blockEl.querySelectorAll('.cards-list-item')].forEach((item, i) => {
        if (i >= INITIAL_VISIBLE) item.classList.add('mfr-hidden');
      });
      requestAnimationFrame(() => setPeek(cardListContainer));
    }

    refreshToggle(funds.length);

    // ── Mobile scroll dots ─────────────────────────────────────────────────
    const cardsList = blockEl.querySelector('.cards-list');
    if (cardsList) {
      const dotsEl = doc.createElement('div');
      dotsEl.className = 'mfr-scroll-dots';
      cardListContainer.appendChild(dotsEl);

      const buildDots = () => {
        dotsEl.innerHTML = '';
        const items = [...blockEl.querySelectorAll('.cards-list-item:not(.mfr-hidden)')];
        if (items.length <= 1) return;
        items.forEach((item, i) => {
          const dot = doc.createElement('button');
          dot.type = 'button';
          dot.className = `mfr-scroll-dot${i === 0 ? ' is-active' : ''}`;
          dot.setAttribute('aria-label', `Go to card ${i + 1}`);
          dot.addEventListener('click', () => {
            const offset = item.getBoundingClientRect().left
              - cardsList.getBoundingClientRect().left
              + cardsList.scrollLeft;
            cardsList.scrollTo({ left: offset, behavior: 'smooth' });
          });
          dotsEl.appendChild(dot);
        });
      };

      buildDots();

      cardsList.addEventListener('scroll', () => {
        const dots = [...dotsEl.querySelectorAll('.mfr-scroll-dot')];
        const items = [...blockEl.querySelectorAll('.cards-list-item:not(.mfr-hidden)')];
        if (!items.length || !dots.length) return;
        const containerLeft = cardsList.getBoundingClientRect().left;
        let activeIndex = 0;
        let minDist = Infinity;
        items.forEach((item, i) => {
          const dist = Math.abs(item.getBoundingClientRect().left - containerLeft);
          if (dist < minDist) { minDist = dist; activeIndex = i; }
        });
        dots.forEach((dot, i) => dot.classList.toggle('is-active', i === activeIndex));
      }, { passive: true });
    }
  }

  // ── Apply filter and render ────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log('[mf-results] answers:', answers, '| matrix rows:', matrix.length, '| funds:', allFunds.length);
  // eslint-disable-next-line no-console
  if (matrix.length) console.log('[mf-results] matrix sample row:', matrix[0]);
  const hasAnswers = answers.riskLevel || answers.fxRisk || answers.taxBenefit;
  if (!hasAnswers) {
    renderCards([]);
  } else {
    const matchedNames = getMatchedFundNames(matrix, answers);
    const filteredFunds = filterFundsByMatrix(allFunds, matchedNames);
    // eslint-disable-next-line no-console
    console.log('[mf-results] matchedNames:', matchedNames.length, matchedNames, '| filteredFunds:', filteredFunds.length, '| fund names:', filteredFunds.map((f) => f.FundName));
    renderCards(filteredFunds);
  }

  // ── See more / See less ────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    isExpanded = !isExpanded;
    [...cardListContainer.querySelectorAll('.cards-list-item')].forEach((item, i) => {
      if (i >= INITIAL_VISIBLE) item.classList.toggle('mfr-hidden', !isExpanded);
    });
    if (isExpanded) {
      removePeek(cardListContainer);
    } else {
      requestAnimationFrame(() => setPeek(cardListContainer));
    }
    refreshToggle(lastRenderedTotal);
  });

  // ── Compare button click handling ──────────────────────────────────────────
  cardListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.mfr-compare-btn');
    if (!btn) return;

    window.mfsSelectedCards = window.mfsSelectedCards || [];
    const { cardName, cardId, cardImage } = btn.dataset;

    if (btn.classList.contains('is-comparing')) return;

    if (window.mfsSelectedCards.length >= MAX_COMPARE) {
      doc.dispatchEvent(new CustomEvent('mf-compare-limit-reached'));
      return;
    }

    window.mfsSelectedCards.push({ id: cardId, name: cardName, image: cardImage });
    restoreCompareState();
    doc.dispatchEvent(new CustomEvent('mf-compare-updated', {
      detail: { cards: window.mfsSelectedCards },
    }));
  });

  // Sync compare button visual states when bar removes a card
  doc.addEventListener('mf-compare-updated', restoreCompareState);
}

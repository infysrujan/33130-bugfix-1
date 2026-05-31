import { loadCSS } from '../../scripts/aem.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { moveInstrumentation } from '../../scripts/scripts.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_COMPARE = 3;

// ── Helpers ────────────────────────────────────────────────────────────────────

function norm(str) {
  return (str || '').toString().toLowerCase().trim().replace(/\s+/g, '-');
}

/**
 * Extract the last URL path segment and normalise it as a category slug.
 * e.g. /en/mutual-funds/fixed-income-funds  →  "fixed-income-funds"
 */
function extractCategoryFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return norm(segments[segments.length - 1] || '');
}

/**
 * Extract the category slug from an AEM tag value.
 * AEM tags arrive as e.g. "bangkokbank:mutual-funds/fixed-income-funds"
 * We take the last segment after splitting on "/" or ":".
 */
function extractCategoryFromTag(tagValue) {
  if (!tagValue) return '';
  const parts = tagValue.split(/[/:]/);
  return norm(parts[parts.length - 1] || '');
}

/**
 * Loose category match that handles plural/singular differences.
 * e.g. page slug "fixed-income-funds" matches FundCategory "fixed-income-fund"
 */
function matchesCategory(fundCategory, pageCategory) {
  const fc = norm(fundCategory);
  const pc = norm(pageCategory);
  return fc === pc || pc.includes(fc) || fc.includes(pc);
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function loadFundsData() {
  try {
    const configs = await fetchConfigs();
    const url = configs.mfFundsDataUrl;
    // eslint-disable-next-line no-console
    console.log('[mfCardListCarousel] loadFundsData url:', url);
    if (!url) {
      // eslint-disable-next-line no-console
      console.warn('[mfCardListCarousel] mfFundsDataUrl is missing from config');
      return [];
    }
    const resp = await fetch(url);
    if (resp.ok) {
      const json = await resp.json();
      const items = json.data?.mutualFundsList?.items || [];
      // eslint-disable-next-line no-console
      console.log('[mfCardListCarousel] raw fund items count:', items.length, '| sample:', items[0]);
      return items;
    }
    // eslint-disable-next-line no-console
    console.warn('[mfCardListCarousel] fetch failed, status:', resp.status);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mfCardListCarousel] loadFundsData error:', err);

    return [];
  }
  return [];
}

// ── Card block builder ─────────────────────────────────────────────────────────

/**
 * Build the fund card list HTML directly, producing the same class structure
 * as card-list.js so that card-list.css applies without running card-list.js.
 */
function buildFundCardsBlock(funds, doc, readMoreLabel) {
  const block = doc.createElement('div');
  block.className = 'card-list mf-card-list block';
  block.dataset.blockName = 'card-list';

  // eslint-disable-next-line no-underscore-dangle
  const getImgUrl = (val) => val?._publishUrl || (typeof val === 'string' ? val : '');

  const list = doc.createElement('div');
  list.className = 'cards-list scrollable center cards-3';

  funds.forEach((fund) => {
    const name = fund.FundName || '';
    // eslint-disable-next-line no-underscore-dangle
    const readMoreUrl = fund._path || '#';
    const productId = fund.ProductID || name;
    const compareEnabled = fund.CompareButton === 'true';

    const fundImgSrc = getImgUrl(fund.FundImage);
    const logoSrc = getImgUrl(fund.LogoImage) || getImgUrl(fund.ManagementCompanyLogo);
    const imgSrc = fundImgSrc || logoSrc;

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

    // Title
    const titleEl = doc.createElement('div');
    titleEl.className = 'cards-list-title';
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
      const logo = doc.createElement('img');
      logo.src = logoSrc;
      logo.alt = name;
      logo.loading = 'lazy';
      logo.className = 'mfr-logo';
      remarkEl.appendChild(logo);
      content.appendChild(remarkEl);
    }

    inner.appendChild(content);

    // Button
    const buttonWrapper = doc.createElement('div');
    buttonWrapper.className = 'cards-list-button';
    const link = doc.createElement('a');
    link.href = readMoreUrl;
    link.textContent = readMoreLabel;
    buttonWrapper.appendChild(link);
    inner.appendChild(buttonWrapper);

    card.appendChild(inner);
    list.appendChild(card);
  });

  block.appendChild(list);
  return block;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Build a carousel slide that shows mutual fund cards filtered by the
 * current page's URL category slug.
 *
 * Used by carousel-dotted.js when slideType === 'mfCardListCarousel'.
 */
export default async function buildMfFundCardsSlide(row, index) {
  const doc = row.ownerDocument;

  const slide = doc.createElement('div');
  slide.className = 'carousel-dotted-item mf-fund-cards-item';
  slide.dataset.index = index;
  moveInstrumentation(row, slide);

  const cells = [...row.children];
  // cells[15] = mfCardListDescription (richtext), cells[16] = cardTypes (aem-tag)
  const descriptionHTML = cells[15]?.innerHTML?.trim() || '';
  const cardTypesRaw = cells[16]?.textContent?.trim() || '';
  const tagCategory = extractCategoryFromTag(cardTypesRaw);
  const pageCategory = tagCategory || extractCategoryFromPath(window.location.pathname);

  // Load card-list base styles + this slide's own styles
  await Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/blocks/card-list/card-list.css`),
    loadCSS(`${window.hlx.codeBasePath}/blocks/carousel-dotted/mf-fund-cards-slide.css`),
  ]);

  const [allFunds, ph] = await Promise.all([loadFundsData(), fetchPlaceholders()]);

  const readMoreLabel = ph.mfReadMoreText || 'Read more';
  const compareLabel = ph.mfCompareText || 'Compare';
  const noResultsLabel = ph.mfNoResultsText || 'No results found';

  const filteredFunds = allFunds.filter(
    (fund) => matchesCategory(fund.FundCategory || '', pageCategory),
  );

  // eslint-disable-next-line no-console
  console.log('[mfCardListCarousel] pageCategory:', pageCategory, '| tagCategory:', tagCategory, '| total funds:', allFunds.length, '| matched funds:', filteredFunds.length);
  // eslint-disable-next-line no-console
  console.log('[mfCardListCarousel] fund categories in data:', [...new Set(allFunds.map((f) => f.FundCategory))]);
  // eslint-disable-next-line no-console
  if (filteredFunds.length) console.log('[mfCardListCarousel] matched fund names:', filteredFunds.map((f) => f.FundName));

  if (!filteredFunds.length) {
    slide.classList.add('has-no-results');
    const msg = doc.createElement('p');
    msg.className = 'mfr-no-results';
    msg.textContent = noResultsLabel;
    slide.appendChild(msg);
    if (descriptionHTML) {
      const carouselBlock = row.parentElement;
      if (carouselBlock && !carouselBlock.nextElementSibling?.classList.contains('mf-fund-cards-description')) {
        const descEl = doc.createElement('div');
        descEl.className = 'mf-fund-cards-description';
        descEl.innerHTML = descriptionHTML;
        carouselBlock.insertAdjacentElement('afterend', descEl);
      }
    }
    return slide;
  }

  const blockEl = buildFundCardsBlock(filteredFunds, doc, readMoreLabel);
  slide.appendChild(blockEl);

  // Inject compare buttons (mirrors addCompareButtons in mf-results.js)
  blockEl.querySelectorAll('.cards-list-button').forEach((wrapper) => {
    const item = wrapper.closest('.cards-list-item');
    const h3 = item?.querySelector('h3');
    if (h3?.dataset?.compareEnabled === 'false') return;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'mfr-compare-btn';
    btn.textContent = compareLabel;
    btn.dataset.cardName = h3?.textContent?.trim() ?? '';
    btn.dataset.cardId = h3?.dataset?.cardId ?? '';
    btn.dataset.cardImage = item?.querySelector('img')?.src ?? '';
    wrapper.appendChild(btn);
  });

  // Sync compare button visual states with window.mfsSelectedCards
  function restoreCompareState() {
    const selected = window.mfsSelectedCards || [];
    blockEl.querySelectorAll('.mfr-compare-btn').forEach((btn) => {
      btn.classList.toggle('is-comparing', selected.some((c) => c.name === btn.dataset.cardName));
    });
  }

  // Handle compare button clicks — same contract as mf-results.js
  blockEl.addEventListener('click', (e) => {
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

  // Sync visual state when mf-comparator bar removes a card
  doc.addEventListener('mf-compare-updated', restoreCompareState);

  // Restore any pre-existing selection (e.g. page reload with sessionStorage)
  restoreCompareState();

  // Render description below the entire carousel block (not inside the slide)
  if (descriptionHTML) {
    const carouselBlock = row.parentElement;
    if (carouselBlock && !carouselBlock.nextElementSibling?.classList.contains('mf-fund-cards-description')) {
      const descEl = doc.createElement('div');
      descEl.className = 'mf-fund-cards-description';
      descEl.innerHTML = descriptionHTML;
      carouselBlock.insertAdjacentElement('afterend', descEl);
    }
  }

  return slide;
}

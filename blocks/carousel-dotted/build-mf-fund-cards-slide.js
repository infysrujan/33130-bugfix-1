import { loadCSS } from '../../scripts/aem.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { moveInstrumentation, getLang } from '../../scripts/scripts.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import { loadCarouselListingOrder, filterFundsInSheet, sortFundsBySheetOrder } from '../../scripts/utils/mf-fund-sort.js';
import { isAuthoringInstance } from '../../scripts/bbl-decorators.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_COMPARE = 3;

// ── Helpers ────────────────────────────────────────────────────────────────────

function norm(str) {
  return (str || '').toString().toLowerCase().trim().replace(/\s+/g, '-');
}

// Extract & normalize the last URL path segment as a category slug.
function extractCategoryFromPath(pathname) {
  const segments = pathname.split('/').filter(Boolean);
  return norm(segments[segments.length - 1] || '');
}

// Extract the category slug from an AEM tag value (last segment after "/" or ":").
function extractCategoryFromTag(tagValue) {
  if (!tagValue) return '';
  const parts = tagValue.split(/[/:]/);
  return norm(parts[parts.length - 1] || '');
}

// FundCategory is normally an array of full AEM tag paths, but a multi-value
// tag field can also come back as a single delimited string (comma/semicolon/
// pipe/newline-separated) — split those too so each individual tag gets its
// own slug instead of one slug being extracted from the whole joined string.
function fundCategorySlugs(fundCategory) {
  const tags = Array.isArray(fundCategory) ? fundCategory : [fundCategory];
  return tags
    .flatMap((tag) => (typeof tag === 'string' ? tag.split(/[,;|\n]+/) : [tag]))
    .map((tag) => extractCategoryFromTag(tag))
    .filter(Boolean);
}

// Exact slug match only (plural/singular tolerant) — no substring matching, no blank matches.
function matchesCategory(fundCategory, pageCategory) {
  const pc = norm(pageCategory);
  if (!pc) return false;
  return fundCategorySlugs(fundCategory)
    .some((fc) => fc === pc || fc.replace(/s$/, '') === pc.replace(/s$/, ''));
}

// ── Data fetching ──────────────────────────────────────────────────────────────

async function loadFundsData() {
  try {
    const configs = await fetchConfigs();
    const baseUrl = configs.mfFundsDataUrl;
    if (!baseUrl) {
      // eslint-disable-next-line no-console
      console.warn('[mfCardListCarousel] mfFundsDataUrl is missing from config');
      return [];
    }
    const url = baseUrl.replace(/;language=[^;?&]*/i, `;language=${getLang()}`);
    const json = await fetchGet(url, { throwOnError: false });
    if (json) {
      const items = json.data?.mutualFundsList?.items || [];
      // eslint-disable-next-line no-console
      console.log('[mfCardListCarousel] raw fund items count:', items.length, '| sample:', items[0]);
      return items;
    }
    // eslint-disable-next-line no-console
    console.warn('[mfCardListCarousel] fetch failed');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mfCardListCarousel] loadFundsData error:', err);

    return [];
  }
  return [];
}

// ── Card block builder ─────────────────────────────────────────────────────────

// Builds fund cards with card-list.js's class structure so card-list.css applies.
function buildFundCardsBlock(funds, doc, readMoreLabel, cardsPerSlide = 3) {
  const block = doc.createElement('div');
  block.className = 'card-list mf-card-list block';
  block.dataset.blockName = 'card-list';

  // eslint-disable-next-line no-underscore-dangle
  const getImgUrl = (val) => val?._publishUrl || (typeof val === 'string' ? val : '');

  const list = doc.createElement('div');
  list.className = `cards-list scrollable center cards-${cardsPerSlide}${funds.length === 1 ? ' single-card' : ''}`;

  funds.forEach((fund) => {
    const name = fund.FundName || '';
    // eslint-disable-next-line no-underscore-dangle
    let readMoreUrl = fund.mfPageUrl?._path || '#';
    // Remove "/content/bangkokbank" from the start of readMoreUrl, if present
    if (readMoreUrl.startsWith('/content/bangkokbank')) {
      readMoreUrl = readMoreUrl.replace(/^\/content\/bangkokbank/, '');
    }
    const productId = fund.ProductID || name;
    const compareEnabled = fund.CompareButton === 'true';

    const fundImgSrc = getImgUrl(fund.FundImage);
    const logoSrc = getImgUrl(fund.LogoImage) || getImgUrl(fund.ManagementCompanyLogo);
    const imgSrc = fundImgSrc;

    // eslint-disable-next-line no-console
    console.log(`[mfFundCards] fund="${name}" | FundImage raw:`, fund.FundImage, '| LogoImage raw:', fund.LogoImage, '| ManagementCompanyLogo raw:', fund.ManagementCompanyLogo, '| resolved fundImgSrc:', fundImgSrc, '| resolved logoSrc:', logoSrc);

    const card = doc.createElement('div');
    card.className = 'cards-list-item';

    const inner = doc.createElement('div');
    inner.className = 'cards-list-inner';

    // Image
    if (imgSrc) {
      const imageWrapper = doc.createElement('div');
      imageWrapper.className = 'cards-list-image cards-list-image-full';
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
    link.className = 'button-m primary';
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
  const carouselBlock = row.parentElement;

  // The fund data fetch below can take a moment, and carousel-dotted.js only swaps the
  // raw authored rows for the built slides once every slide promise resolves — until
  // then those rows (config fields, slide type, etc.) would otherwise flash on screen.
  if (carouselBlock && !isAuthoringInstance(carouselBlock) && !carouselBlock.dataset.mfFundCardsRowsHidden) {
    carouselBlock.dataset.mfFundCardsRowsHidden = 'true';
    [...carouselBlock.children].forEach((child) => { child.style.visibility = 'hidden'; });
  }

  const cells = [...row.children];
  // cells[17] = mfCardListDescription (richtext), cells[18] = cardTypes (aem-tag)
  const descriptionHTML = cells[17]?.innerHTML?.trim() || '';
  const cardTypesRaw = cells[18]?.textContent?.trim() || '';
  const tagCategory = extractCategoryFromTag(cardTypesRaw);
  const pageCategory = tagCategory || extractCategoryFromPath(window.location.pathname);

  // Load card-list base styles + this slide's own styles
  await Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/blocks/card-list/card-list.css`),
    loadCSS(`${window.hlx.codeBasePath}/blocks/carousel-dotted/mf-fund-cards-slide.css`),
  ]);

  const [allFunds, listingOrder, ph] = await Promise.all([
    loadFundsData(),
    loadCarouselListingOrder(),
    fetchPlaceholders(),
  ]);

  const readMoreLabel = ph.mfReadMoreText || 'Read more';
  const compareLabel = ph.mfCompareText || 'Compare';
  const noResultsLabel = ph.mfNoResultsText || 'No results found';

  const filteredFunds = sortFundsBySheetOrder(
    filterFundsInSheet(
      allFunds.filter((fund) => matchesCategory(fund.FundCategory || '', pageCategory)),
      listingOrder,
    ),
    listingOrder,
  );

  // eslint-disable-next-line no-console
  console.log('[mfCardListCarousel] pageCategory:', pageCategory, '| tagCategory:', tagCategory, '| total funds:', allFunds.length, '| matched funds:', filteredFunds.length);
  // eslint-disable-next-line no-console
  console.log('[mfCardListCarousel] fund categories in data:', [...new Set(allFunds.map((f) => f.FundCategory))]);
  // eslint-disable-next-line no-console
  if (filteredFunds.length) console.log('[mfCardListCarousel] matched fund names:', filteredFunds.map((f) => f.FundName));

  // ── No results ───────────────────────────────────────────────────────────────
  if (!filteredFunds.length) {
    const slide = doc.createElement('div');
    slide.className = 'carousel-dotted-item mf-fund-cards-item';
    slide.dataset.index = index;
    moveInstrumentation(row, slide);
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

  const tabletMinBp = getComputedStyle(document.documentElement).getPropertyValue('--bbl-breakpoint-tablet-min').trim() || '47.5rem';
  const isMobile = window.matchMedia(`(max-width: ${tabletMinBp})`).matches;
  const cardsPerSlide = isMobile ? 1 : 3;

  // ── Split funds into pages — 1 per slide on mobile, 3 per slide on desktop ────
  const pages = [];
  for (let i = 0; i < filteredFunds.length; i += cardsPerSlide) {
    const chunk = filteredFunds.slice(i, i + cardsPerSlide);
    if (chunk.length < cardsPerSlide && cardsPerSlide > 1) {
      pages.push(filteredFunds.slice(-cardsPerSlide));
      break;
    }
    pages.push(chunk);
  }

  const slides = pages.map((pageFunds, pageIndex) => {
    const slide = doc.createElement('div');
    slide.className = 'carousel-dotted-item mf-fund-cards-item';
    // Only move instrumentation onto the first slide
    if (pageIndex === 0) moveInstrumentation(row, slide);

    const blockEl = buildFundCardsBlock(pageFunds, doc, readMoreLabel, cardsPerSlide);
    slide.appendChild(blockEl);

    // Inject compare buttons
    blockEl.querySelectorAll('.cards-list-button').forEach((wrapper) => {
      const item = wrapper.closest('.cards-list-item');
      const h3 = item?.querySelector('h3');
      if (h3?.dataset?.compareEnabled === 'false') return;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'button-m secondary mfr-compare-btn';
      btn.textContent = compareLabel;
      btn.dataset.cardName = h3?.textContent?.trim() ?? '';
      btn.dataset.cardId = h3?.dataset?.cardId ?? '';
      btn.dataset.cardImage = item?.querySelector('img')?.src ?? '';
      wrapper.appendChild(btn);
    });

    return slide;
  });

  // ── Shared compare state (spans all slides) ──────────────────────────────────
  function restoreCompareState() {
    const selected = window.mfsSelectedCards || [];
    slides.forEach((s) => {
      s.querySelectorAll('.mfr-compare-btn').forEach((btn) => {
        btn.classList.toggle('is-comparing', selected.some((c) => c.name === btn.dataset.cardName));
      });
    });
  }

  slides.forEach((slide) => {
    slide.addEventListener('click', (e) => {
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
  });

  doc.addEventListener('mf-compare-updated', restoreCompareState);
  restoreCompareState();

  // ── Description below carousel (rendered once, from first page) ───────────────
  if (descriptionHTML) {
    const carouselBlock = row.parentElement;
    if (carouselBlock && !carouselBlock.nextElementSibling?.classList.contains('mf-fund-cards-description')) {
      const descEl = doc.createElement('div');
      descEl.className = 'mf-fund-cards-description';
      descEl.innerHTML = descriptionHTML;
      carouselBlock.insertAdjacentElement('afterend', descEl);
    }
  }

  // ── Equalize card height across all pages ────────────────────────────────
  // align-items: stretch (mf-fund-cards-slide.css) only equalizes the 3 cards
  // within a single page — different pages can still have very different
  // natural heights (varying description lengths), so the carousel visibly
  // resized when switching dots. This measures every page's cards (forcing
  // hidden pages visible just long enough to lay them out) and pins every
  // card on every page to the single tallest height found, so switching
  // dots never changes the carousel's height even when a page's content
  // is shorter.
  function waitForImage(img) {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  function getTrackSlides() {
    const container = slides[0]?.parentElement;
    return container ? Array.from(container.querySelectorAll('.mf-fund-cards-item')) : slides;
  }

  async function equalizeCardHeights() {
    const activeSlides = getTrackSlides();

    function measureAndApply() {
      let max = 0;
      activeSlides.forEach((sl) => { sl.style.display = 'flex'; });
      try {
        activeSlides.forEach((sl) => {
          sl.querySelectorAll('.cards-list-item').forEach((item) => {
            item.style.removeProperty('min-height');
            max = Math.max(max, item.getBoundingClientRect().height);
          });
        });
      } finally {
        activeSlides.forEach((sl) => { sl.style.removeProperty('display'); });
      }
      if (max > 0) {
        activeSlides.forEach((sl) => {
          sl.querySelectorAll('.cards-list-item').forEach((item) => {
            item.style.minHeight = `${max}px`;
          });
        });
      }
    }

    measureAndApply();
    activeSlides.forEach((sl) => { sl.style.display = 'flex'; });
    const imgs = activeSlides.flatMap((sl) => [...sl.querySelectorAll('img')]);
    try {
      await Promise.all(imgs.map(waitForImage));
      measureAndApply();
    } finally {
      activeSlides.forEach((sl) => { sl.style.removeProperty('display'); });
    }
  }

  // Measuring too early can freeze cards at a height based on fallback-font
  // metrics (smaller than the real web font), leaving some cards visibly
  // short once the real font swaps in. Wait for fonts to finish loading —
  // this doesn't block returning `slides` below, since the carousel should
  // still appear immediately; the height pass just runs slightly later.
  // A second pass on window 'load' catches any other late layout shifts.
  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    requestAnimationFrame(() => equalizeCardHeights());
  });
  window.addEventListener('load', () => requestAnimationFrame(() => equalizeCardHeights()));

  // Keep the tallest-card rule true going forward, not just at load: watch
  // each card's actual content (title/description/logo) — not the card box
  // itself, which would create a feedback loop since that's the element we
  // set min-height on — and re-run the equalization whenever any of it
  // changes size, for any reason (longer text, more pages, a window resize
  // that reflows text to more/fewer lines, etc.). Debounced so a burst of
  // resize events (e.g. dragging the window) only triggers one re-run.
  if (typeof ResizeObserver !== 'undefined') {
    let debounceTimer = null;
    const scheduleReequalize = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => equalizeCardHeights(), 100);
    };

    const contentObserver = new ResizeObserver(scheduleReequalize);
    slides.forEach((slideEl) => {
      slideEl.querySelectorAll('.cards-list-title, .cards-list-description, .cards-list-remark')
        .forEach((el) => contentObserver.observe(el));
    });
  }

  // Return array — carousel-dotted.js uses .flat() so multiple slides are handled correctly
  return slides;
}

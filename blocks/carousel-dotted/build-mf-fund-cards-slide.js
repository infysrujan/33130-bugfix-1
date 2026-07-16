import { loadCSS } from '../../scripts/aem.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { moveInstrumentation, getLang } from '../../scripts/scripts.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

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
  list.className = `cards-list scrollable center cards-3${funds.length === 1 ? ' single-card' : ''}`;

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
const CARDS_PER_SLIDE = 3;

export default async function buildMfFundCardsSlide(row, index) {
  const doc = row.ownerDocument;

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

  // ── Split funds into pages — sliding-window for incomplete last chunk ─────────
  // Mirrors card-list-carousel.js: if the last chunk is smaller than CARDS_PER_SLIDE,
  // backfill from the end so every slide shows exactly CARDS_PER_SLIDE cards.
  // e.g. 4 funds → slide 1: [0,1,2]  slide 2: [1,2,3]
  const pages = [];
  for (let i = 0; i < filteredFunds.length; i += CARDS_PER_SLIDE) {
    const chunk = filteredFunds.slice(i, i + CARDS_PER_SLIDE);
    if (chunk.length < CARDS_PER_SLIDE) {
      pages.push(filteredFunds.slice(-CARDS_PER_SLIDE));
      break;
    }
    pages.push(chunk);
  }

  const slides = pages.map((pageFunds, pageIndex) => {
    const slide = doc.createElement('div');
    slide.className = 'carousel-dotted-item mf-fund-cards-item';
    // Only move instrumentation onto the first slide
    if (pageIndex === 0) moveInstrumentation(row, slide);

    const blockEl = buildFundCardsBlock(pageFunds, doc, readMoreLabel);
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

  async function equalizeCardHeights() {
    let maxHeight = 0;

    // Force every page visible+laid out for measurement unconditionally —
    // checking getComputedStyle() to decide which pages are already hidden
    // is unreliable here, since the CSS that hides inactive pages lives in
    // a separate stylesheet (carousel-dotted-show-arrow-dots.css) whose load
    // timing relative to this code isn't guaranteed. visibility (not
    // position/display removal from flow) keeps each page in its normal
    // grid cell so its measured width — and therefore its aspect-ratio
    // image height — matches how it will actually render. This also makes
    // each page's (loading="lazy") images actually start loading, since
    // browsers don't load lazy images that are still display:none.
    slides.forEach((slideEl) => {
      slideEl.style.visibility = 'hidden';
      slideEl.style.display = 'flex';
    });

    // Wait for every fund photo AND management-company logo across every
    // page to finish loading before measuring. The logo image has no fixed
    // size in CSS, so its real height is unknown until it loads — measuring
    // before it does under-counts that card's true height, and since the
    // final min-height is a floor (not a cap), that card then grows taller
    // than its siblings later, on its own, once the logo actually loads.
    const imgs = slides.flatMap((slideEl) => [...slideEl.querySelectorAll('img')]);
    await Promise.all(imgs.map(waitForImage));

    slides.forEach((slideEl) => {
      slideEl.querySelectorAll('.cards-list-item').forEach((item) => {
        item.style.removeProperty('height');
        item.style.removeProperty('min-height');
        maxHeight = Math.max(maxHeight, item.getBoundingClientRect().height);
      });
    });

    slides.forEach((slideEl) => {
      slideEl.style.removeProperty('visibility');
      slideEl.style.removeProperty('display');
    });

    if (maxHeight > 0) {
      slides.forEach((slideEl) => {
        slideEl.querySelectorAll('.cards-list-item').forEach((item) => {
          // min-height (not height): if this measurement ever comes up short for
          // some reason, the card's own content still pushes it taller instead
          // of being clipped/overflowing past a hard height.
          item.style.minHeight = `${maxHeight}px`;
        });
      });
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

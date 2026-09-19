import { loadCSS } from '../../scripts/aem.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import {
  loadCardData, plaintext, resolveApplyUrl, resolveCardPageUrl, resolveImageUrl,
} from '../../scripts/utils/card-compare-fields.js';

const MAX_COMPARE = 3;
const ZERO_WIDTH_SPACE = String.fromCharCode(8203);

function norm(str) {
  return (str || '').toString().split(ZERO_WIDTH_SPACE).join('')
    .toLowerCase()
    .trim();
}

function getCardField(card, ...keys) {
  const key = keys.find((k) => card[k] !== null && card[k] !== undefined && card[k] !== '');
  return key !== undefined ? card[key] : '';
}

function getCardPageHref(card) {
  const href = resolveCardPageUrl(card);
  return href.startsWith('/content/bangkokbank')
    ? href.replace(/^\/content\/bangkokbank/, '')
    : href;
}

function getCardViewData(card, lang) {
  const nameEN = getCardField(card, 'nameEN', 'Product Name (EN)', 'name', 'cardName');
  const nameTH = getCardField(card, 'nameTH', 'Product Name (TH)', 'cardNameTH');
  const isTH = lang === 'th';

  return {
    primaryName: isTH && nameTH ? nameTH : nameEN,
    secondaryName: isTH && nameTH ? nameEN : nameTH,
    description: getCardField(card, 'cardDescription', 'description'),
    imageUrl: resolveImageUrl(card, 'imageUrl', 'image'),
    cardId: card.cardId || card.id || '',
    learnMoreHref: getCardPageHref(card),
    slogan: plaintext(getCardField(card, 'slogan', 'Slogan', 'cardSlogan')),
    cardBenefits: plaintext(
      getCardField(card, 'cardBenefits', 'Card Benefits', 'benefits', 'cardBenefit'),
    ),
    fees: plaintext(getCardField(card, 'fees', 'Fees', 'feeDetails', 'feesDescription')),
    webApplyEnabled: card.webApplyEnabled === true || card.webApplyEnabled === 'true',
    mobileApplyEnabled: card.mobileApplyEnabled === true || card.mobileApplyEnabled === 'true',
    webApplyUrl: resolveApplyUrl(card.webApplyUrl),
    mobileApplyUrl: resolveApplyUrl(card.mobileApplyUrl),
  };
}

/**
 * The authored category tag looks like "bangkokbank:assets/debit-cards/card-type/m-visa".
 * The single cards API takes both segments as separate params, so split them out here.
 */
function parseCardCategoryTag(tagValue) {
  const parts = norm(tagValue).split(/[/:]/).filter(Boolean);
  const typeIdx = parts.indexOf('card-type');
  const cardType = typeIdx >= 0 ? parts[typeIdx + 1] : parts[parts.length - 1];
  const cardCategory = typeIdx >= 0 ? parts[typeIdx - 1] : parts[1];
  return { cardCategory: cardCategory || '', cardType: cardType || '' };
}

function buildCardBlock(cards, doc, lang, labels) {
  const block = doc.createElement('div');
  block.className = 'card-list debit-prepaid-cards block';
  block.dataset.blockName = 'card-list';

  const viewport = doc.createElement('div');
  viewport.className = 'dp-track-viewport';

  const list = doc.createElement('div');
  list.className = 'cards-list dp-track';

  cards.forEach((card) => {
    const {
      primaryName, secondaryName, description, imageUrl, cardId, learnMoreHref,
      slogan, cardBenefits, fees, webApplyEnabled, mobileApplyEnabled,
      webApplyUrl, mobileApplyUrl,
    } = getCardViewData(card, lang);

    const cardEl = doc.createElement('div');
    cardEl.className = 'cards-list-item';
    cardEl.dataset.compareSlogan = slogan;
    cardEl.dataset.compareCardBenefits = cardBenefits;
    cardEl.dataset.compareFees = fees;
    cardEl.dataset.compareLearnHref = learnMoreHref;
    cardEl.dataset.compareWebApplyEnabled = webApplyEnabled ? 'true' : 'false';
    cardEl.dataset.compareMobileApplyEnabled = mobileApplyEnabled ? 'true' : 'false';
    cardEl.dataset.compareWebApplyUrl = webApplyUrl;
    cardEl.dataset.compareMobileApplyUrl = mobileApplyUrl;

    const inner = doc.createElement('div');
    inner.className = 'cards-list-inner';

    if (imageUrl) {
      const imageWrapper = doc.createElement('div');
      imageWrapper.className = 'cards-list-image cards-list-image-x-small';
      const img = doc.createElement('img');
      img.src = imageUrl;
      img.alt = primaryName;
      img.loading = 'lazy';
      imageWrapper.appendChild(img);
      inner.appendChild(imageWrapper);
    }

    const content = doc.createElement('div');
    content.className = 'cards-list-content';

    if (secondaryName) {
      const sub = doc.createElement('p');
      sub.className = 'dp-name-th';
      sub.textContent = secondaryName;
      content.appendChild(sub);
    }

    const titleEl = doc.createElement('div');
    titleEl.className = 'cards-list-title has-title-underline';
    const h3 = doc.createElement('h3');
    h3.textContent = primaryName;
    h3.dataset.cardId = cardId;
    titleEl.appendChild(h3);
    content.appendChild(titleEl);

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

    const buttonWrapper = doc.createElement('div');
    buttonWrapper.className = 'cards-list-button';
    const link = doc.createElement('a');
    link.className = 'button-m primary';
    link.href = learnMoreHref || '#';
    link.textContent = labels.learnMore;
    buttonWrapper.appendChild(link);
    inner.appendChild(buttonWrapper);

    cardEl.appendChild(inner);
    list.appendChild(cardEl);
  });

  viewport.appendChild(list);
  block.appendChild(viewport);
  return block;
}

function addCompareButtons(blockEl, doc, labels) {
  blockEl.querySelectorAll('.cards-list-button').forEach((wrapper) => {
    const item = wrapper.closest('.cards-list-item');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.classList.add('dp-compare-btn', 'button-m', 'secondary');
    btn.textContent = labels.compare;
    const h3 = item?.querySelector('h3');
    btn.dataset.cardName = h3?.textContent?.trim() ?? '';
    btn.dataset.cardId = h3?.dataset?.cardId ?? '';
    btn.dataset.cardImage = item?.querySelector('img')?.src ?? '';
    btn.dataset.cardSlogan = item?.dataset.compareSlogan ?? '';
    btn.dataset.cardBenefits = item?.dataset.compareCardBenefits ?? '';
    btn.dataset.cardFees = item?.dataset.compareFees ?? '';
    btn.dataset.cardLearnHref = item?.dataset.compareLearnHref ?? '';
    btn.dataset.webApplyEnabled = item?.dataset.compareWebApplyEnabled ?? 'false';
    btn.dataset.mobileApplyEnabled = item?.dataset.compareMobileApplyEnabled ?? 'false';
    btn.dataset.webApplyUrl = item?.dataset.compareWebApplyUrl ?? '';
    btn.dataset.mobileApplyUrl = item?.dataset.compareMobileApplyUrl ?? '';
    wrapper.appendChild(btn);
  });
}

function buildArrowButton(doc, direction, label) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = `dp-arrow dp-arrow-${direction}`;
  btn.setAttribute('aria-label', label);
  return btn;
}

function buildDotsEl(doc) {
  const dotsEl = doc.createElement('div');
  dotsEl.className = 'dp-scroll-dots';
  return dotsEl;
}

function waitForOwnCss(href) {
  const link = document.querySelector(`head > link[href="${href}"]`);
  if (!link || link.sheet) return Promise.resolve();
  return new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });
}
const TABLET_MIN = getComputedStyle(document.documentElement).getPropertyValue('--bbl-breakpoint-tablet-min').trim() || '47.5rem';

// Same offset formula as carousel-dotted's getCardListCarouselOffsetForSlide: center the
// active item on mobile, left-align it on desktop.
function getItemOffset(viewportEl, itemEl) {
  if (!itemEl) return 0;
  const isMobile = window.matchMedia(`(max-width: ${TABLET_MIN})`).matches;
  if (!isMobile) return Math.max(0, itemEl.offsetLeft);
  const targetOffset = itemEl.offsetLeft + (itemEl.offsetWidth / 2) - (viewportEl.offsetWidth / 2);
  return Math.max(0, targetOffset);
}

function setTrackOffset(trackEl, offsetPx) {
  trackEl.style.transform = `translate3d(${-offsetPx}px, 0px, 0px)`;
}

// Mirrors carousel-dotted's drag/swipe handling (carousel-dotted.js initializeDragSwipe):
// a single swipe past the threshold always advances/retreats by exactly one step, same as
// a single arrow click.
function attachDragSwipe(viewportEl, move, signal, threshold = 50) {
  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  let hasMoved = false;

  const handleStart = (e) => {
    if (e.target.closest('a, button')) return;
    isDragging = true;
    hasMoved = false;
    startX = e.type === 'touchstart' ? e.touches[0].pageX : (e.pageX || e.clientX);
    currentX = startX;
  };

  const handleMove = (e) => {
    if (!isDragging) return;
    currentX = e.type === 'touchmove' ? e.touches[0].pageX : (e.pageX || e.clientX);
    if (Math.abs(currentX - startX) > 5) hasMoved = true;
  };

  const handleEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    const deltaX = currentX - startX;
    if (hasMoved && Math.abs(deltaX) > threshold) {
      move(deltaX < 0 ? 1 : -1);
    }
    startX = 0;
    currentX = 0;
    hasMoved = false;
  };

  const handleCancel = () => {
    isDragging = false;
    startX = 0;
    currentX = 0;
    hasMoved = false;
  };

  viewportEl.addEventListener('mousedown', handleStart, { signal });
  viewportEl.addEventListener('mousemove', handleMove, { signal });
  viewportEl.addEventListener('mouseup', handleEnd, { signal });
  viewportEl.addEventListener('mouseleave', handleCancel, { signal });
  viewportEl.addEventListener('touchstart', handleStart, { passive: true, signal });
  viewportEl.addEventListener('touchmove', handleMove, { passive: true, signal });
  viewportEl.addEventListener('touchend', handleEnd, { signal });
  viewportEl.addEventListener('touchcancel', handleCancel, { signal });
}

function initCarousel(viewportEl, trackEl, prevBtn, nextBtn, dotsEl, labels, signal) {
  const doc = viewportEl.ownerDocument;
  const realItems = [...trackEl.querySelectorAll('.cards-list-item')];
  const count = realItems.length;
  const loopEnabled = count > 1;

  const cloneItem = (item) => {
    const clone = item.cloneNode(true);
    clone.classList.add('dp-clone');
    clone.setAttribute('aria-hidden', 'true');
    if ('inert' in clone) clone.inert = true;
    clone.querySelectorAll('a, button').forEach((el) => el.setAttribute('tabindex', '-1'));
    return clone;
  };

  const isMobile = window.matchMedia(`(max-width: ${TABLET_MIN})`).matches;
  const cardsPerStep = isMobile ? 1 : 3;
  const step = loopEnabled ? Math.min(cardsPerStep, count - 1) : 0;
  const numPages = loopEnabled ? Math.ceil(count / step) : 1;
  const pageStartIndex = (pageIdx) => (loopEnabled ? Math.min(pageIdx * step, count - step) : 0);
  let currentPage = 0;

  // Loop trick shared with carousel-dotted's arrow-track variants (updateFragmentTrack /
  // circularOrDefaultImage), generalized to a page: a clone of the last `step` items leads
  // the track and a clone of the first `step` items trails it, so a full-page wrap has real
  // card content to animate through the boundary before snapping instantly back to the
  // real page — otherwise the peeked area beyond a single clone would show empty space.
  let cloneHeadItems = [];
  let cloneTailItems = [];
  if (loopEnabled) {
    cloneHeadItems = realItems.slice(-step).map(cloneItem);
    cloneTailItems = realItems.slice(0, step).map(cloneItem);

    const headFrag = doc.createDocumentFragment();
    cloneHeadItems.forEach((clone) => headFrag.appendChild(clone));
    trackEl.insertBefore(headFrag, trackEl.firstChild);

    const tailFrag = doc.createDocumentFragment();
    cloneTailItems.forEach((clone) => tailFrag.appendChild(clone));
    trackEl.appendChild(tailFrag);
  }

  // Clones sit in the flex row even when the real cards already fit the viewport (e.g. only
  // 2 cards on a wide screen), which would make the row wider than the viewport and defeat
  // `justify-content: safe center` in the CSS (safe centering falls back to start-aligned the
  // moment the box actually overflows). Pull clones out of layout whenever they're not needed
  // so the real cards can center normally, same as the static (no-carousel) layout.
  const setClonesVisible = (visible) => {
    [...cloneHeadItems, ...cloneTailItems].forEach((clone) => {
      clone.classList.toggle('dp-clone-hidden', !visible);
    });
  };

  const updateDots = (pageIdx) => {
    [...dotsEl.querySelectorAll('.dp-scroll-dot')].forEach((dot, i) => {
      dot.classList.toggle('is-active', i === pageIdx);
    });
  };

  function goToPage(pageIdx) {
    currentPage = pageIdx;
    setTrackOffset(trackEl, getItemOffset(viewportEl, realItems[pageStartIndex(pageIdx)]));
    updateDots(pageIdx);
  }

  const buildDots = () => {
    dotsEl.innerHTML = '';
    for (let p = 0; p < numPages; p += 1) {
      const dot = doc.createElement('button');
      dot.type = 'button';
      dot.className = 'dp-scroll-dot';
      if (p === 0) dot.classList.add('is-active');
      dot.setAttribute('aria-label', `${labels.goToCard} ${p + 1}`);
      dot.addEventListener('click', () => goToPage(p), { signal });
      dotsEl.appendChild(dot);
    }
  };

  const getContentSpan = () => {
    if (!count) return 0;
    const first = realItems[0];
    const last = realItems[count - 1];
    return (last.offsetLeft + last.offsetWidth) - first.offsetLeft;
  };

  // Whether the cards actually need to scroll/page, i.e. they don't all fit in the
  // viewport at once. When they do fit, the track is left at rest (transform: none) and
  // `justify-content: safe center` in the CSS centers the row — matching the static,
  // non-carousel layout. Nav (arrows/dots) is only ever shown when this is true.
  const contentOverflows = () => loopEnabled && getContentSpan() > viewportEl.clientWidth + 1;

  const updateNavVisibility = (overflow) => {
    prevBtn.classList.toggle('is-hidden', !overflow);
    nextBtn.classList.toggle('is-hidden', !overflow);
    dotsEl.classList.toggle('is-hidden', !overflow);
    // Keep arrows enabled so they can loop, matching carousel-dotted's arrow-track variants.
    prevBtn.disabled = !loopEnabled;
    nextBtn.disabled = !loopEnabled;
  };

  function move(direction) {
    if (!contentOverflows()) return;

    const prevPage = currentPage;
    const nextPage = (((prevPage + direction) % numPages) + numPages) % numPages;
    const isLoopingForward = direction > 0 && nextPage === 0 && prevPage === numPages - 1;
    const isLoopingBackward = direction < 0 && nextPage === numPages - 1 && prevPage === 0;

    currentPage = nextPage;
    updateDots(nextPage);

    const targetIndex = pageStartIndex(nextPage);

    if (loopEnabled && (isLoopingForward || isLoopingBackward)) {
      // targetIndex lands in [0, step) when wrapping forward and [count - step, count) when
      // wrapping backward, so it maps directly onto the matching clone block below.
      const cloneEl = isLoopingForward
        ? cloneTailItems[targetIndex]
        : cloneHeadItems[targetIndex - (count - step)];
      setTrackOffset(trackEl, getItemOffset(viewportEl, cloneEl));
      setTimeout(() => {
        trackEl.style.transition = 'none';
        setTrackOffset(trackEl, getItemOffset(viewportEl, realItems[targetIndex]));
        trackEl.getBoundingClientRect();
        trackEl.style.transition = '';
      }, 600);
      return;
    }

    setTrackOffset(trackEl, getItemOffset(viewportEl, realItems[targetIndex]));
  }

  const refresh = () => {
    const overflow = contentOverflows();
    trackEl.style.transition = 'none';
    setClonesVisible(overflow);
    setTrackOffset(
      trackEl,
      overflow ? getItemOffset(viewportEl, realItems[pageStartIndex(currentPage)]) : 0,
    );
    trackEl.getBoundingClientRect();
    trackEl.style.transition = '';
    updateNavVisibility(overflow);
  };

  buildDots();
  refresh();

  prevBtn.addEventListener('click', () => move(-1), { signal });
  nextBtn.addEventListener('click', () => move(1), { signal });

  if (loopEnabled) attachDragSwipe(viewportEl, move, signal);

  let resizeScheduled = false;
  const scheduleRefresh = () => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => { resizeScheduled = false; refresh(); });
  };
  window.addEventListener('resize', scheduleRefresh, { signal });

  // The block can still measure 0-width the moment it's built — e.g. while its section is
  // hidden during lazy-load — so a single post-build refresh() can under/over-report overflow
  // and hide the arrows until an unrelated window resize forces a recheck. Watch the viewport's
  // actual rendered size and refresh whenever it changes, including whenever it first appears.
  let lastWidth = viewportEl.offsetWidth;
  const sizeObserver = new ResizeObserver(() => {
    const width = viewportEl.offsetWidth;
    if (width > 0 && width !== lastWidth) {
      lastWidth = width;
      refresh();
    }
  });
  sizeObserver.observe(viewportEl);
  signal.addEventListener('abort', () => sizeObserver.disconnect());

  return { refresh };
}

export default async function decorate(block) {
  [...block.children].forEach((el) => {
    if (el.classList.contains('dp-built')) el.remove();
  });

  if (block.dpAbortController) block.dpAbortController.abort();
  block.dpAbortController = new AbortController();
  const { signal } = block.dpAbortController;

  const rows = [...block.children];
  const readRowText = (row) => row?.children[0]?.querySelector('p')?.textContent?.trim()
    ?? row?.children[0]?.textContent?.trim()
    ?? row?.textContent?.trim()
    ?? '';

  const debitPrepaid = norm(readRowText(rows[0]));
  const { cardCategory: tagCardCategory, cardType } = parseCardCategoryTag(readRowText(rows[1]));
  const cardCategory = debitPrepaid === 'debit' || debitPrepaid === 'prepaid'
    ? `${debitPrepaid}-cards`
    : tagCardCategory;

  rows.forEach((row) => { row.classList.add('dp-source-row'); });

  block.classList.add('debit-prepaid-results');

  const doc = block.ownerDocument;
  const lang = getLang();

  const [, , ph, cards] = await Promise.all([
    loadCSS(`${window.hlx.codeBasePath}/blocks/card-list/card-list.css`),
    waitForOwnCss(`${window.hlx.codeBasePath}/blocks/debit-prepaid/debit-prepaid.css`),
    fetchPlaceholders(),
    loadCardData(cardCategory, cardType),
  ]);

  const isTH = lang === 'th';
  const labels = {
    learnMore: ph.cardLearnMore || (isTH ? 'เรียนรู้เพิ่มเติม' : 'Learn more'),
    compare: ph.cardCompare || (isTH ? 'เปรียบเทียบ' : 'Compare'),
    noResultsFound: ph.cardNoResultsFound || (isTH ? 'ไม่พบผลลัพธ์' : 'No Results Found'),
    prevCard: ph.cardPrevious || (isTH ? 'การ์ดก่อนหน้า' : 'Previous card'),
    nextCard: ph.cardNext || (isTH ? 'การ์ดถัดไป' : 'Next card'),
    goToCard: ph.cardGoToCard || (isTH ? 'ไปที่การ์ด' : 'Go to card'),
  };

  const container = doc.createElement('div');
  container.className = 'dp-card-list-container dp-built';
  block.appendChild(container);

  function restoreCompareState() {
    const selected = window.ccsSelectedCards || [];
    container.querySelectorAll('.dp-compare-btn').forEach((btn) => {
      const isSelected = selected.some((c) => c.name === btn.dataset.cardName);
      btn.classList.toggle('is-comparing', isSelected);
      btn.classList.toggle('disabled', isSelected);
    });
  }

  if (!cards.length) {
    const msg = doc.createElement('p');
    msg.className = 'dp-no-results';
    msg.textContent = labels.noResultsFound;
    container.appendChild(msg);
  } else {
    const blockEl = buildCardBlock(cards, doc, lang, labels);
    addCompareButtons(blockEl, doc, labels);

    const trackWrapper = doc.createElement('div');
    trackWrapper.className = 'dp-track-wrapper';
    const prevBtn = buildArrowButton(doc, 'prev', labels.prevCard);
    const nextBtn = buildArrowButton(doc, 'next', labels.nextCard);
    trackWrapper.appendChild(prevBtn);
    trackWrapper.appendChild(blockEl);
    trackWrapper.appendChild(nextBtn);
    container.appendChild(trackWrapper);

    const dotsEl = buildDotsEl(doc);
    container.appendChild(dotsEl);

    restoreCompareState();

    const viewport = blockEl.querySelector('.dp-track-viewport');
    const track = blockEl.querySelector('.cards-list.dp-track');
    const { refresh } = initCarousel(viewport, track, prevBtn, nextBtn, dotsEl, labels, signal);
    requestAnimationFrame(refresh);
  }

  block.addEventListener('click', (e) => {
    const btn = e.target.closest('.dp-compare-btn');
    if (!btn) return;
    e.preventDefault();

    window.ccsSelectedCards = window.ccsSelectedCards || [];
    const {
      cardName, cardImage, cardId, cardSlogan, cardBenefits, cardFees, cardLearnHref,
      webApplyEnabled, mobileApplyEnabled, webApplyUrl, mobileApplyUrl,
    } = btn.dataset;
    if (btn.classList.contains('is-comparing')) return;

    if (window.ccsSelectedCards.length >= MAX_COMPARE) {
      document.dispatchEvent(new CustomEvent('credit-card-compare-limit-reached'));
      return;
    }
    window.ccsSelectedCards.push({
      id: cardId,
      name: cardName,
      image: cardImage,
      slogan: cardSlogan,
      cardBenefits,
      fees: cardFees,
      cardPageUrl: cardLearnHref ? { _publishUrl: cardLearnHref } : undefined,
      webApplyEnabled: webApplyEnabled === 'true',
      mobileApplyEnabled: mobileApplyEnabled === 'true',
      webApplyUrl,
      mobileApplyUrl,
    });

    restoreCompareState();

    document.dispatchEvent(new CustomEvent('credit-card-compare-updated', {
      detail: { cards: window.ccsSelectedCards },
    }));
  }, { signal });

  doc.addEventListener('credit-card-compare-updated', restoreCompareState, { signal });
}

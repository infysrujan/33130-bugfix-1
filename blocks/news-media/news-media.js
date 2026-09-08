import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import {
  buildCardHtml, buildPaginationHtml, bindPaginationClick, normalizeCategory,
} from '../../scripts/utils/card-helpers.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';

const LOCALE_MAP = { th: 'th-TH', en: 'en-US' };

const fetchCache = {};

async function fetchJson(url) {
  if (!fetchCache[url]) {
    fetchCache[url] = fetchGet(url, { headers: { Accept: 'application/json' }, throwOnError: false })
      .catch(() => null);
  }
  return fetchCache[url];
}

function formatDate(dateStr, locale = 'en-US') {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

function filterAndPage(allCards, category, page, pageSize) {
  const filtered = category
    ? allCards.filter((c) => {
      const cats = Array.isArray(c.category) ? c.category : [c.category];
      return cats.map(normalizeCategory).includes(normalizeCategory(category));
    })
    : allCards;

  const sorted = [...filtered].sort((a, b) => {
    const aDate = a.publishDate ? new Date(a.publishDate).getTime() : 0;
    const bDate = b.publishDate ? new Date(b.publishDate).getTime() : 0;
    return bDate - aDate;
  });

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  return { cards: sorted.slice(start, start + pageSize), total };
}

function setupPanel(panel, allCards, category, locale, pageSize, placeholders, initialPage = 1) {
  panel.innerHTML = `
    <div class="news-media-content">
      <div class="news-media-grid"></div>
      <div class="listing-card-pagination"></div>
    </div>`;

  const gridEl = panel.querySelector('.news-media-grid');
  const paginationEl = panel.querySelector('.listing-card-pagination');
  const state = { page: initialPage };

  function render() {
    const totalPages = Math.ceil(filterAndPage(allCards, category, 1, pageSize).total / pageSize);
    if (state.page < 1) state.page = 1;
    if (totalPages && state.page > totalPages) state.page = totalPages;

    const { cards } = filterAndPage(allCards, category, state.page, pageSize);

    gridEl.innerHTML = cards.length
      ? cards.map((c) => {
        const ctaLink = c.ctaLink || '';
        const normalized = { ...c, ctaLink };
        const dateLine = formatDate(c.publishDate, locale);
        return buildCardHtml(normalized, '', {}, { dateLine });
      }).join('')
      : `<p class="listing-card-empty">${placeholders.newsMediaNoResults || 'No results found.'}</p>`;

    const carouselNavBtnsLabels = { prevBtnLabel: placeholders.carouselPrevBtnLabel || 'Previous', nextBtnLabel: placeholders.carouselNextBtnLabel || 'Next' };
    paginationEl.innerHTML = buildPaginationHtml(state.page, totalPages, carouselNavBtnsLabels);
  }
  bindPaginationClick(paginationEl, state, () => {
    render();
    const params = new URLSearchParams(window.location.search);
    params.set('page', state.page);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, gridEl);
  render();
}

async function renderNewsMedia(block) {
  const lang = getLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  const configs = await fetchConfigs();
  const baseUrl = configs?.newsMediaBaseUrl || '';
  const dataUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');
  const pageSize = parseInt(configs?.newsMediaPageSize, 10) || 20;

  const [data, placeholders] = await Promise.all([fetchJson(dataUrl), fetchPlaceholders()]);
  const allCards = data?.news || [];

  const initSearch = new URLSearchParams(window.location.search);
  const yearParam = initSearch.get('year');
  const pageParam = parseInt(initSearch.get('page'), 10) || 1;

  document.querySelector('.tabs.block')?.classList.add('news-media-tabs');

  const tabPanels = [...document.querySelectorAll('[role="tabpanel"]')];
  tabPanels.forEach((panel) => {
    const tabBtnId = panel.getAttribute('aria-labelledby');
    const tabBtn = tabBtnId ? document.getElementById(tabBtnId) : null;
    const tabTags = tabBtn?.dataset.tabCategoryTag;
    const category = tabTags;

    const isActiveTab = yearParam
      ? tabBtn?.textContent.trim() === yearParam
      : tabBtn?.getAttribute('aria-selected') === 'true';

    const initialPage = isActiveTab ? pageParam : 1;
    setupPanel(panel, allCards, category, locale, pageSize, placeholders, initialPage);
  });

  const tabBtns = [...document.querySelectorAll('.news-media-tabs .tabs-nav button')];

  if (yearParam) {
    tabBtns.find((btn) => btn.textContent.trim() === yearParam)?.click();
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const params = new URLSearchParams(window.location.search);
      params.set('year', btn.textContent.trim());
      params.delete('page');
      window.history.replaceState(null, '', `?${params.toString()}`);
    });
  });

  block.hidden = true;
}

export default function decorate(block) {
  renderNewsMedia(block);
}

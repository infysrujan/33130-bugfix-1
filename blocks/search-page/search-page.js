import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getSiteSearchResults, normalizeSearchTerm } from '../../scripts/utils/searchApi.js';

const MIN_SEARCH_LENGTH = 3;

function getLanguageFromPath() {
  const [, lang] = window.location.pathname.split('/');
  return lang || 'en';
}

function getRecentSearchesKey() {
  return `site-search-recent-${getLanguageFromPath()}`;
}

function getLastResultsKey() {
  return `site-search-last-results-${getLanguageFromPath()}`;
}

function getRecentSearches() {
  try {
    const data = JSON.parse(localStorage.getItem(getRecentSearchesKey())) || [];
    return data.map((item) => (typeof item === 'string' ? { term: item, results: [] } : item));
  } catch {
    return [];
  }
}

function saveRecentSearch(term, results) {
  const data = [{ term, results: results.slice(0, 4) }];
  localStorage.setItem(getRecentSearchesKey(), JSON.stringify(data));
}

function getLastResults() {
  try {
    return JSON.parse(sessionStorage.getItem(getLastResultsKey())) || null;
  } catch {
    return null;
  }
}

function saveLastResults(data) {
  sessionStorage.setItem(getLastResultsKey(), JSON.stringify(data));
}

function clearLastResults() {
  sessionStorage.removeItem(getLastResultsKey());
}

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function highlightTerm(text = '', term = '') {
  if (!term || !text) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${escapedTerm})`, 'gi'), '<b>$1</b>');
}

function getBlockConfig(rows) {
  const searchBackground = rows[4]?.querySelector('img');
  return {
    searchLabel: rows[0]?.textContent.trim(),
    noResultsText: rows[1]?.textContent.trim(),
    recentTitle: rows[2]?.textContent.trim(),
    learnMoreLabel: rows[3]?.textContent.trim(),
    searchImage: searchBackground?.src || '',
    searchImageAlt: searchBackground?.alt || '',
  };
}

function getSearchConfig(rows, placeholders = {}) {
  const blockConfig = getBlockConfig(rows);

  return {
    placeholder: placeholders.searchPlaceholderText,
    searchLabel: blockConfig.searchLabel,
    noResultsText: blockConfig.noResultsText,
    recentTitle: blockConfig.recentTitle,
    learnMoreLabel: blockConfig.learnMoreLabel,
    loadMoreLabel: blockConfig.learnMoreLabel,
    ariaLabel: placeholders.ariaLableSearch,
    searchImage: placeholders.imageUrl ? blockConfig.searchImage : ' ',
    searchImageAlt: placeholders.imageAltText || blockConfig.searchImageAlt,
  };
}

function buildSearchPanel(item, term = '') {
  const image = item.OGImage || '';
  const title = item.Title || item.OGTitle || '';
  const description = item.Description || item.OGDescription || '';
  const url = item.URL || item.OGURL || '#';

  return `
    <div class="search-modal-panel">
      <div class="search-modal-panel-inner">
        <a class="text-small search-modal-panel-link" href="${escapeHtml(url)}">
          ${image ? `
            <div class="search-modal-panel-thumb">
              <img class="search-modal-panel-image" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">
            </div>
          ` : ''}
          <div class="search-modal-panel-body">
            <div class="search-modal-panel-caption">
              <h3 class="search-modal-panel-title">${highlightTerm(title, term)}</h3>
              <div class="search-modal-panel-description">
                ${highlightTerm(description, term)}
              </div>
            </div>
          </div>
        </a>
      </div>
    </div>
  `;
}

function renderRecentSearches(container, recentTitle, onSearch) {
  const searches = getRecentSearches();

  if (!searches.length) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = `
    <div class="search-modal-history-section">
      <div class="search-modal-history-title">
        <h3 class="search-modal-section-title">${escapeHtml(recentTitle)}</h3>
        ${searches.map(({ term, results }) => `
          <div class="search-modal-recent-group">
            <div class="search-modal-results-grid">
              <div class="search-modal-results-list">
                ${results.length ? results.map((item) => buildSearchPanel(item, term)).join('') : `
                  <div class="search-modal-panel">
                    <a class="text-small search-modal-history-term" href="#" data-term="${escapeHtml(term)}">
                      <div class="search-modal-panel-inner">
                        <div class="search-modal-panel-body">
                          <div class="search-modal-panel-caption">
                            <h3 class="search-modal-panel-title">${escapeHtml(term)}</h3>
                          </div>
                        </div>
                      </div>
                    </a>
                  </div>
                `}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-term]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onSearch(button.dataset.term);
    });
  });
}

export default async function decorate(block) {
  const rows = [...block.children];
  const placeholders = await fetchPlaceholders();
  const config = getSearchConfig(rows, placeholders);

  block.innerHTML = `
    <div class="search-modal search-modal-active">
      <div class="search-modal-top-block search-modal-top-block-background">
       ${config.searchImage ? `<img class="search-modal-top-block-image" src="${config.searchImage}" alt="${escapeHtml(config.searchImageAlt)}" loading="lazy">` : ''}
        <div class="search-modal-search-input inner-content">
          <input type="text" class="search-modal-input" placeholder="${escapeHtml(config.placeholder)}" autocomplete="off" aria-label="${escapeHtml(config.ariaLabel)}">
          <div class="inner-content search-modal-search-button">
            <button type="button" class="button primary search-modal-submit-button" title="${escapeHtml(config.searchLabel)}">${escapeHtml(config.searchLabel)}</button>
          </div>
        </div>
      </div>
      <div class="search-modal-pre-block content">
        <div class="search-modal-container search-modal-results-section" style="display:none;">
          <div class="inner-content">
            <div class="search-modal-results-grid">
              <div class="search-modal-results-list"></div>
            </div>
          </div>
          <div class="search-modal-load-more" style="display:none;">
            <button class="search-modal-load-more-button secondary">${escapeHtml(config.loadMoreLabel)}</button>
          </div>
        </div>
        <div class="search-modal-container search-modal-message"></div>
        <div class="search-modal-container search-modal-history" style="display:none;"></div>
      </div>
    </div>
  `;

  const input = block.querySelector('.search-modal-input');
  const searchButton = block.querySelector('.search-modal-submit-button');
  const searchResult = block.querySelector('.search-modal-results-section');
  const searchHistory = block.querySelector('.search-modal-history');
  const resultsList = block.querySelector('.search-modal-results-list');
  const messageContainer = block.querySelector('.search-modal-message');
  const divLoadMore = block.querySelector('.search-modal-load-more');
  const loadMoreButton = block.querySelector('.search-modal-load-more-button');

  let currentTerm = '';
  let currentPage = 1;
  let allResults = [];
  let loading = false;

  const messagePlaceholders = {
    minSearchLength: (placeholders.minSearchLengthMessage || '').replace(/\$\{MIN_SEARCH_LENGTH\}/, MIN_SEARCH_LENGTH),
    somethingWrong: placeholders.somethingWrongMessage,
  };

  function setLoading(isLoading) {
    loading = isLoading;
    searchButton.disabled = isLoading;
    searchButton.textContent = isLoading ? 'Searching...' : config.searchLabel;
  }

  function renderResults(items, term = '') {
    resultsList.innerHTML = items.map((item) => buildSearchPanel(item, term)).join('');
  }

  function showMessage(text) {
    if (text) {
      messageContainer.innerHTML = `<div class="inner-content"><p class="search-modal-message-text">${text}</p></div>`;
      messageContainer.style.display = 'block';
    } else {
      messageContainer.innerHTML = '';
      messageContainer.style.display = 'none';
    }
  }

  function showRecentSearches(onSearch) {
    searchResult.style.display = 'none';
    divLoadMore.style.display = 'none';
    renderRecentSearches(searchHistory, config.recentTitle, onSearch);
  }

  function restoreLastResults() {
    const lastResults = getLastResults();
    if (lastResults?.term && Array.isArray(lastResults.results) && lastResults.results.length) {
      currentTerm = lastResults.term;
      currentPage = lastResults.page || 1;
      allResults = lastResults.results;
      input.value = currentTerm;
      renderResults(allResults, currentTerm);
      searchResult.style.display = 'block';
      searchHistory.style.display = 'none';
      divLoadMore.style.display = lastResults.showLoadMore ? 'block' : 'none';
      showMessage('');
      return true;
    }
    return false;
  }

  async function runSearch(term, page = 1, append = false) {
    const normalized = normalizeSearchTerm(term);

    if (normalized.length < MIN_SEARCH_LENGTH) {
      if (!normalized) {
        if (!restoreLastResults()) {
          resultsList.innerHTML = '';
          showMessage('');
          showRecentSearches((recentTerm) => {
            input.value = recentTerm;
            runSearch(recentTerm, 1, false);
          });
        }
      } else {
        resultsList.innerHTML = '';
        searchResult.style.display = 'block';
        searchHistory.style.display = 'none';
        divLoadMore.style.display = 'none';
        showMessage(messagePlaceholders.minSearchLength);
      }
      return;
    }

    setLoading(true);
    searchHistory.style.display = 'none';
    showMessage('');

    try {
      const data = await getSiteSearchResults({
        keywords: normalized,
        pageNumber: page,
        placeholders,
      });

      currentTerm = normalized;
      currentPage = page;
      allResults = append ? [...allResults, ...data.searchResults] : data.searchResults;

      renderResults(allResults, normalized);
      searchResult.style.display = 'block';
      divLoadMore.style.display = data.showLoadMore ? 'block' : 'none';
      showMessage(!allResults.length ? (data.noResultsMessage || config.noResultsText) : '');

      if (allResults.length) {
        saveRecentSearch(normalized, allResults);
      }
      saveLastResults({
        term: normalized,
        page: currentPage,
        results: allResults,
        showLoadMore: data.showLoadMore,
      });
    } catch (error) {
      resultsList.innerHTML = '';
      searchResult.style.display = 'block';
      divLoadMore.style.display = 'none';
      showMessage(messagePlaceholders.somethingWrong);
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  searchButton.addEventListener('click', () => runSearch(input.value, 1, false));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      runSearch(input.value, 1, false);
    }
  });

  loadMoreButton.addEventListener('click', () => {
    if (!loading && currentTerm) runSearch(currentTerm, currentPage + 1, true);
  });

  clearLastResults();
  input.value = '';
  showRecentSearches((recentTerm) => {
    input.value = recentTerm;
    runSearch(recentTerm, 1, false);
  });

  block.addEventListener('site-search:clear', () => {
    clearLastResults();
    input.value = '';
    currentTerm = '';
    currentPage = 1;
    allResults = [];
    resultsList.innerHTML = '';
    showMessage('');
    showRecentSearches((recentTerm) => {
      input.value = recentTerm;
      runSearch(recentTerm, 1, false);
    });
  });
}

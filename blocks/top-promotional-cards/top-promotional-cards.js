import {
  buildCardHtml,
  buildCardOptions,
  fetchJson, sortCards,
} from '../../scripts/utils/card-helpers.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';

function filterCards(activeCards, tabText, isTopPromo) {
  if (isTopPromo) {
    return activeCards.filter((card) => card.topPromotion === true);
  }
  const topCards = activeCards.filter(
    (card) => card.topCategory === true
      && card.category?.toLowerCase() === tabText.toLowerCase(),
  );
  if (topCards.length) return topCards;
  return activeCards.filter(
    (card) => card.category?.toLowerCase() === tabText.toLowerCase(),
  );
}

function setupPanel(panel, activeCards, placeholders) {
  const noResultsText = placeholders.promoNoResults || 'No results found.';
  const btnId = panel.getAttribute('aria-labelledby');
  const btn = btnId ? document.getElementById(btnId) : null;
  const tabText = btn?.textContent?.trim() || '';

  const topPromoTabLabel = (placeholders.topPromotionsTabLabel || 'toppromotions').toLowerCase().replace(/\s+/g, '');
  const isTopPromo = tabText.toLowerCase().replace(/\s+/g, '') === topPromoTabLabel;

  let cards = sortCards(filterCards(activeCards, tabText, isTopPromo));
  if (isTopPromo) {
    if (!cards.length) {
      panel.hidden = true;
      if (btn) {
        btn.hidden = true;
        btn.style.display = 'none';
        requestAnimationFrame(() => {
          const firstVisible = btn.closest('.tabs-nav')?.querySelector('button:not([hidden])');
          if (firstVisible) firstVisible.click();
        });
      }
      return;
    }
  }

  cards = cards.slice(0, 4);

  const grid = document.createElement('div');
  grid.className = 'promo-selector-grid top-promo-grid';
  grid.innerHTML = cards.length
    ? cards.map((card) => buildCardHtml(card, card.category || tabText, placeholders, buildCardOptions(card))).join('')
    : `<p class="top-promo-empty">${noResultsText}</p>`;

  panel.append(grid);
}

export default async function decorate(block) {
  const lang = getLang();
  const configs = await fetchConfigs();
  const baseUrl = configs?.promoCardListingCardSelector || '';
  const promotionsUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');

  const [data, placeholders] = await Promise.all([
    fetchJson(promotionsUrl),
    fetchPlaceholders(),
  ]);

  const allCards = data?.cards || [];

  const today = new Date();
  const activeCards = allCards.filter(
    (card) => !card.promotionEndDate || new Date(card.promotionEndDate) >= today,
  );

  const tabPanels = [...document.querySelectorAll('[role="tabpanel"]')];
  tabPanels.forEach((panel) => setupPanel(panel, activeCards, placeholders));

  const btnContainer = block.closest('.section')?.querySelector('.button-container');
  const tabsContent = document.querySelector('.tabs-content');
  if (btnContainer && tabsContent) {
    btnContainer.classList.add('top-promo-view-all', 'pad-bot-30');
    tabsContent.before(btnContainer);
  }

  block.hidden = true;

  requestAnimationFrame(() => {
    const tabsNav = document.querySelector('.tabs-nav');
    if (!tabsNav) return;
    const visibleBtns = () => [...tabsNav.querySelectorAll('button[role="tab"]:not([hidden])')];
    let activeIdx = visibleBtns().findIndex((b) => b.classList.contains('active'));
    if (activeIdx === -1) activeIdx = 0;

    tabsNav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[role="tab"]:not([hidden])');
      if (!btn) return;
      const newIdx = visibleBtns().indexOf(btn);
      if (newIdx === activeIdx) return;

      const forward = newIdx > activeIdx;
      activeIdx = newIdx;

      requestAnimationFrame(() => {
        const newGrid = document.getElementById(btn.getAttribute('aria-controls'))
          ?.querySelector('.top-promo-grid');
        if (newGrid) {
          newGrid.classList.remove('top-promo-enter-up', 'top-promo-enter-down');
          newGrid.classList.add(forward ? 'top-promo-enter-up' : 'top-promo-enter-down');
          newGrid.addEventListener('animationend', () => {
            newGrid.classList.remove('top-promo-enter-up', 'top-promo-enter-down');
          }, { once: true });
        }
      });
    });
  });
}

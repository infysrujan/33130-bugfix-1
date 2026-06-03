import { buildCardHtml, fetchJson, sortCards } from '../promo-card-listing/promo-card-listing.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { getLang } from '../../scripts/scripts.js';
import { fetchConfigs } from '../../scripts/config.js';

function filterCards(activeCards, tabText) {
  if (tabText.toLowerCase().replace(/\s+/g, '') === 'toppromotions') {
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
  const viewAllHref = placeholders.promoViewAllHref || '#';
  const viewAllText = placeholders.promoViewAll || 'View all promotions';
  const noResultsText = placeholders.promoNoResults || 'No results found.';
  const btnId = panel.getAttribute('aria-labelledby');
  const btn = btnId ? document.getElementById(btnId) : null;
  const tabText = btn?.textContent?.trim() || '';

  const isTopPromo = tabText.toLowerCase().replace(/\s+/g, '') === 'toppromotions';
  let cards = sortCards(filterCards(activeCards, tabText));
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
    ? cards.map((card) => buildCardHtml(card, card.category || tabText, placeholders)).join('')
    : `<p class="top-promo-empty">${noResultsText}</p>`;

  const footer = document.createElement('div');
  footer.className = 'top-promo-footer pad-bot-30';
  footer.innerHTML = `<span><a href="${viewAllHref}">${viewAllText}</a></span>`;
  footer.querySelector('a').className = 'button secondary';

  panel.append(footer, grid);
}

export default async function decorate(block) {
  const blockHref = block.querySelector('a')?.href || '#';
  const lang = getLang();
  const configs = await fetchConfigs();
  const baseUrl = configs?.promotionalCardSelector || '';
  const promotionsUrl = baseUrl.replace(/\.json$/, lang !== 'en' ? `.${lang}.json` : '.json');

  const [data, placeholders] = await Promise.all([
    fetchJson(promotionsUrl),
    fetchPlaceholders(),
  ]);

  if (!placeholders.promoViewAllHref) placeholders.promoViewAllHref = blockHref;

  const allCards = data?.cards || [];

  const today = new Date();
  const activeCards = allCards.filter(
    (card) => !card.promotionEndDate || new Date(card.promotionEndDate) >= today,
  );

  const tabPanels = [...document.querySelectorAll('[role="tabpanel"]')];
  tabPanels.forEach((panel) => setupPanel(panel, activeCards, placeholders));

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

import { moveInstrumentation } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

const MIN_COMPARE = 2;
const MAX_COMPARE = 3;

// ── Cookie helpers ─────────────────────────────────────────────────────────────

// Sanitize a card id into a valid cookie token (alphanumeric / dash / underscore, max 64 chars)
function buildCookieName(cardId) {
  return cardId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 64);
}

// Write the current card selection as a JSON cookie keyed by the first card's id
function saveComparatorCookie(selectedCards) {
  if (!selectedCards.length) return;
  const cookieName = buildCookieName(selectedCards[0].id || selectedCards[0].name);
  const cookieValue = selectedCards.map(({ id, name, image }) => ({
    id: id || name,
    title: name,
    photo: image,
  }));
  document.cookie = `${cookieName}=${encodeURIComponent(JSON.stringify(cookieValue))}; path=/; SameSite=Lax`;
}

// ── Config ─────────────────────────────────────────────────────────────────────

// Read the CTA link, label text, and target-blank flag from the authored block rows.
// Model field order (from _credit-card-comparator.json):
//   Row 0: link        (aem-content → anchor or plain text path)
//   Row 1: linkText    (text)
//   Row 2: linkTitle   (text, optional)
//   Row 3: linkType    (select: primary | secondary | tertiary)
//   Row 4: targetLink  (boolean, inside targetSettings container)
function readBlockConfig(block) {
  const rows = [...block.children];
  rows.forEach((row) => moveInstrumentation(row, block));

  const readText = (row) => row?.children[0]?.querySelector('p')?.textContent?.trim()
    ?? row?.children[0]?.textContent?.trim()
    ?? '';

  // Row 0: link — aem-content renders as <a href="published-url"> or plain-text path
  const cell0 = rows[0]?.children[0];
  const anchor = cell0?.querySelector('a');
  const link = anchor?.href ?? readText(rows[0]);

  return {
    link,
    linkText: readText(rows[1]) || 'Compare',
    linkTitle: readText(rows[2]),
    linkType: readText(rows[3]) || 'primary',
    targetLink: readText(rows[4]) === 'true',
  };
}

// ── DOM builders ───────────────────────────────────────────────────────────────

// Create the hidden warning banner shown when the card-selection limit is reached
function buildErrorDiv(warningText) {
  const el = document.createElement('div');
  el.className = 'compare-error';
  el.textContent = warningText;
  el.hidden = true;
  return el;
}

// Create the compare CTA button, disabled until MIN_COMPARE cards are selected
function buildCtaButton(linkText, linkType) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn-${linkType || 'primary'}`;
  btn.textContent = linkText;
  btn.disabled = true;
  return btn;
}

// Assemble the full comparator DOM inside block; returns the key child elements
function buildComparatorDOM(block, warningText, linkText, linkType) {
  const innerContainer = document.createElement('div');
  innerContainer.className = 'inner-container';

  const errorDiv = buildErrorDiv(warningText);
  const compareGroup = document.createElement('div');
  compareGroup.className = 'compare-group';
  const ctaBtn = buildCtaButton(linkText, linkType);

  innerContainer.appendChild(errorDiv);
  innerContainer.appendChild(compareGroup);
  innerContainer.appendChild(ctaBtn);
  block.appendChild(innerContainer);

  return { errorDiv, compareGroup, ctaBtn };
}

// ── Card bar rendering ─────────────────────────────────────────────────────────

// Build a single product-comparing item with a card thumbnail and a close (×) button
function buildCardItem(name, image) {
  const item = document.createElement('div');
  item.className = 'product-comparing';

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  if (image) thumb.style.backgroundImage = `url("${image}")`;

  const closeIcon = document.createElement('span');
  closeIcon.className = 'icon-close';
  closeIcon.textContent = 'x';
  thumb.appendChild(closeIcon);

  const info = document.createElement('div');
  info.className = 'info';
  const h3 = document.createElement('h3');
  h3.className = 'text-small';
  h3.textContent = name;
  info.appendChild(h3);

  item.appendChild(thumb);
  item.appendChild(info);

  return { item, closeIcon };
}

// Repaint the comparator bar with the current selection and wire up each close button
function renderBar(compareGroup, selectedCards) {
  compareGroup.innerHTML = '';
  selectedCards.forEach(({ name, image }) => {
    const { item, closeIcon } = buildCardItem(name, image);
    compareGroup.appendChild(item);
    closeIcon.addEventListener('click', () => {
      window.ccsSelectedCards = (window.ccsSelectedCards || []).filter((c) => c.name !== name);
      document.dispatchEvent(new CustomEvent('credit-card-compare-updated', {
        detail: { cards: window.ccsSelectedCards },
      }));
    });
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  // Remove any other already-decorated credit-card-comparator instances (UE duplication fix).
  // Only remove if it shares the same data-aue-resource (same AEM content path), so a
  // legitimately different comparator instance on the same page is not affected.
  const blockResource = block.dataset.aueResource;
  document.querySelectorAll('.credit-card-comparator.block').forEach((other) => {
    if (other === block) return;
    if (!other.querySelector('.inner-container')) return;
    const otherResource = other.dataset.aueResource;
    if (blockResource && otherResource && otherResource !== blockResource) return;
    other.remove();
  });

  // Remove previously built UI so re-decoration starts clean
  block.querySelector('.inner-container')?.remove();

  // Un-hide authored rows from any previous decoration pass
  [...block.children].forEach((row) => { row.classList.remove('ccs-source-row'); });

  const {
    link, linkText, linkTitle, linkType, targetLink,
  } = readBlockConfig(block);

  // Hide authored rows via CSS class with !important (UE cannot override this)
  [...block.children].forEach((row) => { row.classList.add('ccs-source-row'); });

  const ph = await fetchPlaceholders();
  const warningText = ph.compareLimitWarning;

  const {
    errorDiv, compareGroup, ctaBtn,
  } = buildComparatorDOM(block, warningText, linkText, linkType);
  if (linkTitle) ctaBtn.title = linkTitle;

  let warningTimer = null;

  // Show the max-limit warning banner and auto-dismiss it after 4 seconds
  function showWarning() {
    clearTimeout(warningTimer);
    errorDiv.hidden = false;
    warningTimer = setTimeout(() => { errorDiv.hidden = true; }, 4000);
  }

  // Sync the bar, button state, cookie, and sessionStorage whenever the card selection changes
  function update(selectedCards) {
    const count = selectedCards.length;
    block.classList.toggle('active', count > 0);
    ctaBtn.disabled = count < MIN_COMPARE;
    if (count < MAX_COMPARE) {
      clearTimeout(warningTimer);
      errorDiv.hidden = true;
    }
    saveComparatorCookie(selectedCards);
    // Persist to sessionStorage so the bar survives a same-tab page refresh
    try { sessionStorage.setItem('ccs-compare-cards', JSON.stringify(selectedCards)); } catch { /* ignore */ }
    renderBar(compareGroup, selectedCards);
  }

  // Scroll to inline results if the block is on the page; otherwise navigate to the compare URL
  ctaBtn.addEventListener('click', () => {
    const cards = window.ccsSelectedCards || [];
    const resultsContainer = document.querySelector('.card-comparator-results-container');
    if (resultsContainer) {
      document.dispatchEvent(new CustomEvent('credit-card-compare-show', { detail: { cards } }));
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (link) {
      window.open(`${link}?compare-product-btn=`, targetLink ? '_blank' : '_self');
    }
  });

  document.addEventListener('credit-card-compare-limit-reached', showWarning);
  document.addEventListener('credit-card-compare-updated', (e) => update(e.detail?.cards ?? []));

  // On page load, restore selection from sessionStorage so the bar and card buttons
  // re-appear after a refresh
  try {
    const stored = sessionStorage.getItem('ccs-compare-cards');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        window.ccsSelectedCards = parsed;
        // Notify other blocks (e.g. card results compare buttons) about the restored state
        document.dispatchEvent(new CustomEvent('credit-card-compare-updated', {
          detail: { cards: window.ccsSelectedCards },
        }));
      }
    }
  } catch { /* ignore */ }

  update(window.ccsSelectedCards || []);
}

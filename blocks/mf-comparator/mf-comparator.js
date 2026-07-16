import { moveInstrumentation } from '../../scripts/scripts.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

const MIN_COMPARE = 2;
const MAX_COMPARE = 3;

// ── Cookie helpers ─────────────────────────────────────────────────────────────

function buildCookieName(cardId) {
  return `mf_${cardId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60)}`;
}

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

/**
 * Block row mapping (matches _mf-comparator.json model):
 *   Row 0: link        (aem-content → compare results page URL)
 *   Row 1: linkText    (text)
 *   Row 2: linkTitle   (text, optional)
 *   Row 3: linkType    (select: primary | secondary | tertiary)
 *   Row 4: targetLink  (boolean, inside targetSettings container)
 */
function readBlockConfig(block) {
  const rows = [...block.children];
  rows.forEach((row) => moveInstrumentation(row, block));

  const readText = (row) => row?.children[0]?.querySelector('p')?.textContent?.trim()
    ?? row?.children[0]?.textContent?.trim()
    ?? '';

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

function buildErrorDiv(warningText) {
  const el = document.createElement('div');
  el.className = 'mfc-error';
  el.textContent = warningText;
  el.hidden = true;
  return el;
}

function buildCtaButton(linkText, linkType) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `button-m ${linkType || 'primary'}`;
  btn.textContent = linkText;
  btn.disabled = true;
  return btn;
}

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

function renderBar(compareGroup, selectedCards) {
  compareGroup.innerHTML = '';
  selectedCards.forEach(({ name, image }) => {
    const { item, closeIcon } = buildCardItem(name, image);
    compareGroup.appendChild(item);
    closeIcon.addEventListener('click', () => {
      window.mfsSelectedCards = (window.mfsSelectedCards || []).filter((c) => c.name !== name);
      document.dispatchEvent(new CustomEvent('mf-compare-updated', {
        detail: { cards: window.mfsSelectedCards },
      }));
    });
  });
}

// ── Main export ────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  // UE duplication guard
  const blockResource = block.dataset.aueResource;
  document.querySelectorAll('.mf-comparator.block').forEach((other) => {
    if (other === block) return;
    if (!other.querySelector('.inner-container')) return;
    const otherResource = other.dataset.aueResource;
    if (blockResource && otherResource && otherResource !== blockResource) return;
    other.remove();
  });

  block.querySelector('.inner-container')?.remove();
  [...block.children].forEach((row) => row.classList.remove('mfc-source-row'));

  const {
    link, linkText, linkTitle, linkType, targetLink,
  } = readBlockConfig(block);

  [...block.children].forEach((row) => row.classList.add('mfc-source-row'));

  const ph = await fetchPlaceholders();
  const warningText = ph.mfCompareLimitWarning;

  const {
    errorDiv, compareGroup, ctaBtn,
  } = buildComparatorDOM(block, warningText, linkText, linkType);
  if (linkTitle) ctaBtn.title = linkTitle;

  let warningTimer = null;

  function showWarning() {
    clearTimeout(warningTimer);
    errorDiv.hidden = false;
    warningTimer = setTimeout(() => { errorDiv.hidden = true; }, 4000);
  }

  function update(selectedCards) {
    const count = selectedCards.length;
    block.classList.toggle('active', count > 0);
    ctaBtn.disabled = count < MIN_COMPARE;
    if (count < MAX_COMPARE) {
      clearTimeout(warningTimer);
      errorDiv.hidden = true;
    }
    saveComparatorCookie(selectedCards);
    try {
      sessionStorage.setItem('mfs-compare-cards', JSON.stringify(selectedCards));
    } catch { /* ignore */ }
    renderBar(compareGroup, selectedCards);
  }

  ctaBtn.addEventListener('click', () => {
    const cards = window.mfsSelectedCards || [];
    const resultsContainer = document.querySelector('.mf-comparator-results-container');
    if (resultsContainer) {
      document.dispatchEvent(new CustomEvent('mf-compare-show', { detail: { cards } }));
      resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (link) {
      window.open(`${link}?mf-compare=`, targetLink ? '_blank' : '_self');
    }
  });

  document.addEventListener('mf-compare-limit-reached', showWarning);
  document.addEventListener('mf-compare-updated', (e) => update(e.detail?.cards ?? []));

  // Restore from sessionStorage on page load
  try {
    const stored = sessionStorage.getItem('mfs-compare-cards');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length) {
        window.mfsSelectedCards = parsed;
        document.dispatchEvent(new CustomEvent('mf-compare-updated', {
          detail: { cards: window.mfsSelectedCards },
        }));
      }
    }
  } catch { /* ignore */ }

  update(window.mfsSelectedCards || []);
}

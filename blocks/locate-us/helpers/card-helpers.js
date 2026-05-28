import { buildUrl, createEl, hasValue } from './utils.js';

export const CARDS_PER_PAGE = 12;

// ─── Thailand card ────────────────────────────────────────────────────────────

export function buildAddressCard(loc, isNearest, placeholders, configs, isAtm = false) {
  const address = [loc.Address1, loc.Address2, loc.Address3, loc.Province, loc.Postcode]
    .filter((v) => hasValue(v)).join(' ');
  const nearestLabel = placeholders?.nearestLocationTag || 'Nearest';
  const getDirectionText = placeholders?.getDirectionText || 'Get Direction';
  const statusLabel = placeholders?.statusLabel || 'Status:';
  const telLabel = placeholders?.telLabel || 'Tel:';
  const faxLabel = placeholders?.faxLabel || 'Fax:';

  const dirTemplate = configs?.locateUsGoogleMapsDirectionsUrl;
  const directionsUrl = (dirTemplate && loc.Lat && loc.Lng)
    ? buildUrl(dirTemplate, { LAT: loc.Lat, LNG: loc.Lng })
    : '';

  // ATM/ATM+ cards only show name, address, and directions
  const branchStatus = !isAtm && hasValue(loc.BranchStatus) ? loc.BranchStatus : '';
  const isOpen = branchStatus.toLowerCase() === 'open';
  const tel = !isAtm && hasValue(loc.Tel) && loc.Tel.trim() !== 'BeID' ? loc.Tel : '';
  const fax = !isAtm && hasValue(loc.Fax) ? loc.Fax : '';

  const card = createEl(`
    <article class="locate-us-card">
      <button type="button" class="locate-us-card-header" aria-expanded="false">
        <h3 class="locate-us-card-name"></h3>
        <span class="icon-dropdown locate-us-card-chevron" aria-hidden="true"></span>
      </button>
      <div class="locate-us-card-body" hidden>
        <hr class="locate-us-card-hr">
        <div class="locate-us-card-detail">
          ${isNearest ? '<div class="locate-us-card-nearest-tag"></div>' : ''}
          ${branchStatus ? `
            <div class="locate-us-card-row">
              <span class="locate-us-card-label"></span>
              <div class="locate-us-card-status-col">
                <span class="locate-us-card-status"></span>
                ${isOpen ? '<span class="locate-us-card-hours"></span>' : ''}
              </div>
            </div>` : ''}
          ${tel ? '<div class="locate-us-card-row"><span class="locate-us-card-label"></span><span class="locate-us-card-tel"></span></div>' : ''}
          ${fax ? '<div class="locate-us-card-row"><span class="locate-us-card-label"></span><span class="locate-us-card-fax"></span></div>' : ''}
          ${address ? '<p class="locate-us-card-address"></p>' : ''}
          ${directionsUrl ? '<a class="locate-us-card-directions" target="_blank" rel="noopener noreferrer"></a>' : ''}
        </div>
      </div>
    </article>`);

  card.querySelector('.locate-us-card-name').textContent = loc.BranchName;
  if (isNearest) card.querySelector('.locate-us-card-nearest-tag').textContent = nearestLabel;
  if (branchStatus) {
    card.querySelector('.locate-us-card-detail .locate-us-card-row .locate-us-card-label').textContent = statusLabel;
    const statusEl = card.querySelector('.locate-us-card-status');
    statusEl.textContent = branchStatus;
    statusEl.classList.add(`locate-us-card-status-${branchStatus.toLowerCase()}`);
  }
  if (isOpen) {
    card.querySelector('.locate-us-card-hours').textContent = hasValue(loc.MicroBranchHours) ? loc.MicroBranchHours : '-';
  }
  if (tel) {
    const rows = card.querySelectorAll('.locate-us-card-row');
    const telRow = [...rows].find((r) => r.querySelector('.locate-us-card-tel'));
    if (telRow) telRow.querySelector('.locate-us-card-label').textContent = telLabel;
    card.querySelector('.locate-us-card-tel').textContent = tel;
  }
  if (fax) {
    const rows = card.querySelectorAll('.locate-us-card-row');
    const faxRow = [...rows].find((r) => r.querySelector('.locate-us-card-fax'));
    if (faxRow) faxRow.querySelector('.locate-us-card-label').textContent = faxLabel;
    card.querySelector('.locate-us-card-fax').textContent = fax;
  }
  if (address) card.querySelector('.locate-us-card-address').textContent = address;
  if (directionsUrl) {
    const dirEl = card.querySelector('.locate-us-card-directions');
    dirEl.href = directionsUrl;
    dirEl.textContent = getDirectionText;
  }

  return card;
}

// ─── Overseas card ────────────────────────────────────────────────────────────

export function buildOverseasCard(loc, placeholders) {
  const address = [loc.Address1, loc.Address2, loc.Address3, loc.Province, loc.Postcode]
    .filter(Boolean).join(' ');
  const hours = hasValue(loc.MicroBranchHours) ? loc.MicroBranchHours : '';
  const tel = hasValue(loc.Tel) ? loc.Tel : '';
  const fax = hasValue(loc.Fax) ? loc.Fax : '';
  const hoursLabel = placeholders?.hoursLabel || 'Hours:';
  const telLabel = placeholders?.telLabel || 'Tel:';
  const faxLabel = placeholders?.faxLabel || 'Fax:';

  const card = createEl(`
    <article class="locate-us-card">
      <button type="button" class="locate-us-card-header" aria-expanded="false">
        <h3 class="locate-us-card-name"></h3>
        <span class="icon-dropdown locate-us-card-chevron" aria-hidden="true"></span>
      </button>
      <div class="locate-us-card-body" hidden>
        <hr class="locate-us-card-hr">
        <div class="locate-us-card-detail">
          ${hours ? `
            <div class="locate-us-card-row">
              <span class="locate-us-card-label"></span>
              <div class="locate-us-card-status-col">
                <span class="locate-us-card-hours"></span>
              </div>
            </div>` : ''}
          ${tel ? '<div class="locate-us-card-row"><span class="locate-us-card-label"></span><span class="locate-us-card-tel"></span></div>' : ''}
          ${fax ? '<div class="locate-us-card-row"><span class="locate-us-card-label"></span><span class="locate-us-card-fax"></span></div>' : ''}
          ${address ? '<p class="locate-us-card-address"></p>' : ''}
        </div>
      </div>
    </article>`);

  card.querySelector('.locate-us-card-name').textContent = loc.BranchName;
  if (hours) {
    card.querySelector('.locate-us-card-detail .locate-us-card-row .locate-us-card-label').textContent = hoursLabel;
    card.querySelector('.locate-us-card-hours').textContent = hours;
  }
  if (tel) {
    const rows = card.querySelectorAll('.locate-us-card-row');
    const telRow = [...rows].find((r) => r.querySelector('.locate-us-card-tel'));
    if (telRow) telRow.querySelector('.locate-us-card-label').textContent = telLabel;
    card.querySelector('.locate-us-card-tel').textContent = tel;
  }
  if (fax) {
    const rows = card.querySelectorAll('.locate-us-card-row');
    const faxRow = [...rows].find((r) => r.querySelector('.locate-us-card-fax'));
    if (faxRow) faxRow.querySelector('.locate-us-card-label').textContent = faxLabel;
    card.querySelector('.locate-us-card-fax').textContent = fax;
  }
  if (address) card.querySelector('.locate-us-card-address').textContent = address;

  return card;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export function renderPagination(paginationEl, total, page, onPageChange, placeholders) {
  const totalPages = Math.ceil(total / CARDS_PER_PAGE);
  if (totalPages <= 1) {
    paginationEl.innerHTML = '';
    return;
  }

  // Build 4-page window around current, matching BBL pagination behaviour
  const winStart = Math.max(1, Math.min(page - 2, totalPages - 3));
  const winEnd = Math.min(totalPages, winStart + 3);

  const show = new Set();
  [1, 2, totalPages - 1, totalPages].forEach((p) => {
    if (p >= 1 && p <= totalPages) show.add(p);
  });
  for (let p = winStart; p <= winEnd; p += 1) show.add(p);

  const sorted = [...show].sort((a, b) => a - b);

  const prevPageLabel = placeholders?.locateUsAriaPrevPage || 'Previous page';
  const nextPageLabel = placeholders?.locateUsAriaNextPage || 'Next page';
  const pagePrefix = placeholders?.locateUsAriaPagePrefix || 'Page';

  paginationEl.innerHTML = '';

  // Prev button
  const prevBtn = createEl(`
    <button class="locate-us-page-nav locate-us-page-prev" aria-label="${prevPageLabel}"
      ${page <= 1 ? 'disabled' : ''}>
      <span class="icon-arrow-left locate-us-page-nav-icon" aria-hidden="true"></span>
    </button>`);
  prevBtn.addEventListener('click', () => onPageChange(page - 1));
  paginationEl.appendChild(prevBtn);

  // Numbers wrapper
  const numbersEl = createEl('<div class="locate-us-page-numbers"></div>');

  function addEllipsis() {
    const ellipsis = createEl('<span class="locate-us-page-ellipsis" role="button" tabindex="0">…</span>');
    ellipsis.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1;
      input.max = totalPages;
      input.className = 'locate-us-page-input';
      ellipsis.replaceWith(input);
      input.focus();

      function commitInput() {
        const val = parseInt(input.value, 10);
        if (val >= 1 && val <= totalPages) {
          onPageChange(val);
        } else {
          input.replaceWith(ellipsis);
        }
      }
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commitInput(); });
      input.addEventListener('blur', commitInput);
    });
    numbersEl.appendChild(ellipsis);
  }

  sorted.forEach((p, idx) => {
    if (idx > 0 && p - sorted[idx - 1] > 1) addEllipsis();

    const btn = createEl(
      `<button class="locate-us-page-btn${p === page ? ' locate-us-page-btn-active' : ''}"
        aria-label="${pagePrefix} ${p}">${p}</button>`,
    );
    btn.addEventListener('click', () => onPageChange(p));
    numbersEl.appendChild(btn);
  });

  paginationEl.appendChild(numbersEl);

  // Next button
  const nextBtn = createEl(`
    <button class="locate-us-page-nav locate-us-page-next" aria-label="${nextPageLabel}"
      ${page >= totalPages ? 'disabled' : ''}>
      <span class="icon-arrow-left locate-us-page-nav-icon" aria-hidden="true"></span>
    </button>`);
  nextBtn.addEventListener('click', () => onPageChange(page + 1));
  paginationEl.appendChild(nextBtn);
}

// ─── renderCards ─────────────────────────────────────────────────────────────

export function renderCards(
  allResults,
  cardsContainer,
  paginationEl,
  page,
  placeholders,
  onSelect,
  configs,
  isAtm = false,
  autoSelect = true,
) {
  cardsContainer.innerHTML = '';
  const start = (page - 1) * CARDS_PER_PAGE;
  const pageResults = allResults.slice(start, start + CARDS_PER_PAGE);

  function scrollToMap() {
    const keywordWrapper = cardsContainer.closest('.locate-us-wrapper')?.querySelector('.locate-us-keyword-wrapper');
    if (keywordWrapper) keywordWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collapseAll() {
    cardsContainer.querySelectorAll('.locate-us-card-body').forEach((b) => { b.hidden = true; });
    cardsContainer.querySelectorAll('.locate-us-card-header').forEach((h) => h.setAttribute('aria-expanded', 'false'));
  }

  function restoreOrder(activeCard) {
    const others = [...cardsContainer.querySelectorAll('.locate-us-card')]
      .filter((c) => c !== activeCard)
      .sort((a, b) => Number(a.dataset.cardIndex) - Number(b.dataset.cardIndex));
    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(activeCard);
    others.forEach((c) => cardsContainer.appendChild(c));
  }

  pageResults.forEach((loc, idx) => {
    const isNearest = loc.Range === 0;
    const card = buildAddressCard(loc, isNearest, placeholders, configs, isAtm);
    card.dataset.cardIndex = idx;
    const header = card.querySelector('.locate-us-card-header');
    const body = card.querySelector('.locate-us-card-body');

    card.addEventListener('click', (e) => {
      if (window.matchMedia('(width > 47.5rem)').matches) {
        if (e.target.closest('a')) return;
        collapseAll();
        header.setAttribute('aria-expanded', 'true');
        onSelect(loc);
        scrollToMap();
        return;
      }
      if (!e.target.closest('.locate-us-card-header')) return;
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      collapseAll();
      if (!isExpanded) {
        body.hidden = false;
        header.setAttribute('aria-expanded', 'true');
        restoreOrder(card);
        onSelect(loc);
        scrollToMap();
      }
    });

    if (idx === 0) {
      body.hidden = false;
      header.setAttribute('aria-expanded', 'true');
      if (autoSelect) onSelect(loc);
    }

    cardsContainer.appendChild(card);
  });

  renderPagination(paginationEl, allResults.length, page, (newPage) => {
    // eslint-disable-next-line max-len
    renderCards(allResults, cardsContainer, paginationEl, newPage, placeholders, onSelect, configs, isAtm, false);
    scrollToMap();
  }, placeholders);
}

export function buildCardHtml(card, tag, placeholders = {}, options = {}) {
  const { dateLine = '', logoHtml = '', footerExtra = '' } = options;
  const target = card.targetLink === 'true' ? '_blank' : '_self';

  const cleanAltText = card.title
    ? card.title.replace(/<[^>]*>/g, '').trim()
    : '';

  return `<div class="listing-card-container">
  <div class="listing-card">
    <div class="listing-card-img-wrap">
      <span class="listing-card-tag">${tag}</span>
      <img src="${card.cardImageUrl}" alt="${cleanAltText}"
        class="listing-card-img" loading="lazy">
    </div>
    <div class="listing-card-body">
      <div class="listing-card-desc">${card.cardShortDescription || ''}</div>
      ${logoHtml}
      ${dateLine ? `<p class="listing-card-date">${dateLine}</p>` : ''}
    </div>
    <div class="listing-card-footer">
      <a href="${card.ctaLink || ''}" target="${target}" class="listing-card-cta button primary">${card.ctaLabel || placeholders.promoLearnMore || 'Learn More'}</a>
      ${footerExtra}
    </div>
  </div>
</div>`;
}

export function buildPaginationHtml(current, total) {
  if (total <= 1) return '';

  const show = new Set();
  for (let p = 1; p <= Math.min(2, total); p += 1) show.add(p);
  for (let p = Math.max(1, total - 1); p <= total; p += 1) show.add(p);
  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p += 1) show.add(p);

  const sorted = [...show].sort((a, b) => a - b);
  let inner = '';
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) {
      inner += '<span class="listing-card-ellipsis">...</span>';
    }
    const cls = p === current ? 'listing-card-page is-active' : 'listing-card-page';
    inner += `<button class="${cls}" data-page="${p}">${p}</button>`;
  });

  const prevAttr = current === 1 ? ' disabled' : '';
  const nextAttr = current === total ? ' disabled' : '';
  return `
    <button class="listing-card-arrow" data-dir="prev"${prevAttr} aria-label="Previous"><i class="icon-arrow-left" aria-hidden="true"></i></button>
    <div class="listing-card-pages">${inner}</div>
    <button class="listing-card-arrow listing-card-arrow-next" data-dir="next"${nextAttr} aria-label="Next"><i class="icon-arrow-left" aria-hidden="true"></i></button>`;
}

export function bindPaginationClick(paginationEl, pageRef, onPageChange, scrollTarget) {
  paginationEl?.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('.listing-card-page');
    const arrowBtn = e.target.closest('.listing-card-arrow');
    let changed = false;
    if (pageBtn) {
      pageRef.page = parseInt(pageBtn.dataset.page, 10);
      changed = true;
    } else if (arrowBtn?.dataset.dir === 'prev' && pageRef.page > 1) {
      pageRef.page -= 1;
      changed = true;
    } else if (arrowBtn?.dataset.dir === 'next') {
      pageRef.page += 1;
      changed = true;
    }
    if (changed) {
      onPageChange();
      scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

export function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const aStart = a.promotionStartDate ? new Date(a.promotionStartDate).getTime() : 0;
    const bStart = b.promotionStartDate ? new Date(b.promotionStartDate).getTime() : 0;
    if (bStart !== aStart) return bStart - aStart;
    const aEnd = a.promotionEndDate ? new Date(a.promotionEndDate).getTime() : Infinity;
    const bEnd = b.promotionEndDate ? new Date(b.promotionEndDate).getTime() : Infinity;
    return aEnd - bEnd;
  });
}

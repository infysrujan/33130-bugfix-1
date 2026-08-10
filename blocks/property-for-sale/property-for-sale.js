import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import {
  buildCardHtml,
  buildPaginationHtml,
  bindPaginationClick,
} from '../../scripts/utils/card-helpers.js';
import { fetchGet } from '../../scripts/utils/fetchApi.js';
import { applyLinkTarget } from '../../scripts/bbl-decorators.js';

function initFilterToggles(container) {
  container.querySelectorAll('[aria-haspopup="listbox"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const filter = btn.closest('[data-filter]');
      if (!filter) return;
      const isOpen = filter.classList.contains('is-open');
      container.querySelectorAll('[data-filter].is-open').forEach((f) => {
        f.classList.remove('is-open');
        f.querySelector('[aria-haspopup="listbox"]')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen && !btn.disabled) {
        filter.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

function setupFilterDropdown(container, filterAttr, defaultLabel, onSelect) {
  const filterEl = container.querySelector(`[data-filter="${filterAttr}"]`);
  const btn = filterEl?.querySelector('[aria-haspopup="listbox"]');
  const labelEl = filterEl?.querySelector('[data-filter-label]');
  const dropdown = filterEl?.querySelector('[role="listbox"]');
  if (!filterEl || !btn || !dropdown) return;

  dropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('[role="option"]');
    if (!opt) return;
    e.stopPropagation();
    const wasActive = opt.classList.contains('is-active');
    dropdown.querySelectorAll('[role="option"]').forEach((o) => o.classList.remove('is-active'));
    filterEl.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    const value = wasActive ? '' : opt.dataset.value;
    if (!wasActive) opt.classList.add('is-active');
    if (labelEl) labelEl.textContent = wasActive ? defaultLabel : opt.textContent.trim();
    if (onSelect) onSelect(value);
  });
}

function closeFiltersOnOutsideClick(container) {
  document.addEventListener('click', () => {
    container.querySelectorAll('[data-filter].is-open').forEach((f) => {
      f.classList.remove('is-open');
      f.querySelector('[aria-haspopup="listbox"]')?.setAttribute('aria-expanded', 'false');
    });
  });
}

function resolvePhotoSrc(photo) {
  if (!photo) return '';
  if (photo.startsWith('data:')) return photo;
  return `data:image/jpeg;base64,${photo}`;
}

function formatPrice(price) {
  if (!price) return '';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function buildOptions(items) {
  return items
    .map((item) => `<li class="pfs-option" data-value="${item.value}" role="option">${item.label}</li>`)
    .join('');
}

function buildFilterHtml(p, propertyTypes, priceRanges) {
  const typeOpts = buildOptions(propertyTypes);
  const priceOpts = buildOptions(priceRanges.map((r, i) => ({ value: i, label: r.label })));
  return `
    <div class="pfs-filter-row">
      <div class="pfs-search-wrap">
        <i class="icon-search pfs-search-icon" aria-hidden="true"></i>
        <input type="text" class="pfs-search-input"
          placeholder="${p.propertyForSaleSearchPlaceholder || 'พิมพ์คำค้นหา'}"
          autocomplete="off">
      </div>
      <div class="pfs-filter" data-filter="type">
        <button class="pfs-filter-btn" aria-expanded="false" aria-haspopup="listbox">
          <span class="pfs-filter-label" data-filter-label>${p.propertyForSaleType || 'เลือกประเภททรัพย์สิน'}</span>
          <span class="icon-dropdown pfs-filter-arrow" aria-hidden="true"></span>
        </button>
        <ul class="pfs-filter-dropdown" role="listbox">${typeOpts}</ul>
      </div>
      <div class="pfs-filter" data-filter="region">
        <button class="pfs-filter-btn" aria-expanded="false" aria-haspopup="listbox">
          <span class="pfs-filter-label" data-filter-label>${p.propertyForSaleRegion || 'เลือกพื้นที่'}</span>
          <span class="icon-dropdown pfs-filter-arrow" aria-hidden="true"></span>
        </button>
        <ul class="pfs-filter-dropdown" role="listbox"></ul>
      </div>
      <div class="pfs-filter is-hidden" data-filter="province">
        <button class="pfs-filter-btn" aria-expanded="false" aria-haspopup="listbox">
          <span class="pfs-filter-label" data-filter-label>${p.propertyForSaleProvince || 'เลือกจังหวัด'}</span>
          <span class="icon-dropdown pfs-filter-arrow" aria-hidden="true"></span>
        </button>
        <ul class="pfs-filter-dropdown" role="listbox"></ul>
      </div>
      <div class="pfs-filter is-hidden" data-filter="district">
        <button class="pfs-filter-btn" aria-expanded="false" aria-haspopup="listbox">
          <span class="pfs-filter-label" data-filter-label>${p.propertyForSaleDistrict || 'เลือกเขต/อำเภอ'}</span>
          <span class="icon-dropdown pfs-filter-arrow" aria-hidden="true"></span>
        </button>
        <ul class="pfs-filter-dropdown" role="listbox"></ul>
      </div>
      <div class="pfs-filter" data-filter="price">
        <button class="pfs-filter-btn" aria-expanded="false" aria-haspopup="listbox">
          <span class="pfs-filter-label" data-filter-label>${p.propertyForSalePrice || 'เลือกช่วงราคา'}</span>
          <span class="icon-dropdown pfs-filter-arrow" aria-hidden="true"></span>
        </button>
        <ul class="pfs-filter-dropdown" role="listbox">${priceOpts}</ul>
      </div>
      <div class="pfs-search-btn-wrap">
        <button class="pfs-btn-search button-m primary" type="button" disabled>${p.propertyForSaleSearch || 'ค้นหา'}</button>
      </div>
    </div>`;
}

function buildPropCardHtml(item, detailPath, p, category, pfsData) {
  const photo = item.PHOTO_FILE_1;
  const currency = p.propertyForSaleCurrency || 'บาท';
  const price = item.PR_PRICE ? `${formatPrice(item.PR_PRICE)} ${currency}` : '';
  const specialPrice = item.SPECIAL_PRICE ? `${formatPrice(item.SPECIAL_PRICE)} ${currency}` : '';
  const location = [item.LOCATION_AMPHUR, item.LOCATION_PROVINCE].filter(Boolean).join(', ');
  const tag = pfsData.categoryLabel[category] || item.MAIN_ASSET || '';

  const descParts = [
    item.MAIN_ASSET ? `<p class="pfs-card-id">${item.MAIN_ASSET}</p>` : '',
    location ? `<p class="pfs-card-location">${location}</p>` : '',
    price ? `<p class="pfs-card-price">${price}</p>` : '',
    specialPrice ? `<p class="pfs-card-price pfs-card-special-price">${specialPrice}</p>` : '',
  ].filter(Boolean).join('');

  const mapUrl = item.GPS_LATITUDE && item.GPS_LONGTITUDE && pfsData.mapBaseUrl
    ? `${pfsData.mapBaseUrl}N ${item.GPS_LATITUDE} E ${item.GPS_LONGTITUDE}`
    : '';

  const card = {
    cardImageUrl: resolvePhotoSrc(photo),
    title: item.MAIN_ASSET || '',
    cardShortDescription: descParts,
    ctaLink: `${detailPath}?FILE_ID=${encodeURIComponent(item.FILE_ID || '')}`,
    ctaLabel: p.propertyForSaleDetails || 'รายละเอียด',
    targetLink: p.propertyForSaleDetailsNewTab || 'true',
  };

  const footerExtra = mapUrl
    ? `<a href="${mapUrl}" class="listing-card-cta button-m secondary pfs-map-btn">${p.propertyForSaleMapLocation || 'ตำแหน่งที่ตั้ง'}</a>`
    : '';

  return buildCardHtml(card, tag, p, { footerExtra });
}

const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const apiCache = new Map();

function enforceHttps(url) {
  return url.replace(/^http:\/\//i, 'https://');
}

function getCached(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { apiCache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  apiCache.set(key, { data, ts: Date.now() });
}

function validateSearchParams(params, validCategories) {
  return {
    page: Math.max(0, parseInt(params.page, 10) || 0),
    regionId: params.regionId ? String(params.regionId).replace(/\D/g, '') : 0,
    province: params.province ? String(params.province).trim() : null,
    district: params.district ? String(params.district).trim() : null,
    assetTypeId: Math.max(0, parseInt(params.assetTypeId, 10) || 0),
    priceRangeKey: Math.max(0, parseInt(params.priceRangeKey, 10) || 0),
    keyword: params.keyword ? String(params.keyword).trim().slice(0, 100) : null,
    category: validCategories.includes(params.category) ? params.category : 'all',
  };
}

async function fetchJson(rawUrl, { useCache = true } = {}) {
  const url = enforceHttps(rawUrl);
  if (useCache) {
    const cached = getCached(url);
    if (cached) return cached;
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const data = await fetchGet(url, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
      throwOnError: false,
    });
    clearTimeout(timer);
    if (useCache && data) setCache(url, data);
    return data;
  } catch {
    return null;
  }
}

async function loadPfsData(configUrl) {
  const json = await fetchJson(configUrl, { useCache: true });
  const categories = (json?.categories?.data || []).filter((r) => r.Key);
  const types = (json?.['property-types']?.data || []).filter((r) => r.Label);
  const ranges = (json?.['price-ranges']?.data || []).filter((r) => r.Label);
  return {
    tabIndexCategory: categories.map((r) => r.Key),
    categoryLabel: Object.fromEntries(categories.map((r) => [r.Key, r.Label])),
    propertyTypes: types.map((r) => ({ label: r.Label, value: r.Key.trim() })),
    priceRanges: ranges.map((r) => ({ label: r.Label, key: r.Key.trim() })),
  };
}

function buildSearchUrl(apiBase, params, validCategories) {
  const v = validateSearchParams(params, validCategories);
  const location = v.district || v.province;
  const segments = [
    v.page,
    v.regionId,
    location ? encodeURIComponent(location) : 0,
    0,
    v.keyword ? v.keyword.split(',').map((s) => encodeURIComponent(s.trim())).join(',') : 0,
    v.priceRangeKey,
    v.category,
  ];
  return `${enforceHttps(apiBase)}/SearchProperty/${segments.join('/')}`;
}

async function searchProperties(apiBase, params, validCategories) {
  const url = buildSearchUrl(apiBase, params, validCategories);
  const json = await fetchJson(url, { useCache: !params.keyword });
  if (!json) return { items: [], total: 0 };
  const items = Array.isArray(json) ? json : (json.data ?? []);
  return { items, total: json.total ?? items.length };
}

function setupPanel(panel, state, config) {
  const {
    category, apiBase, detailPath, placeholders, onLoadStart, onLoadEnd, isDefault, pfsData,
    pageSize,
  } = config;
  const gridEl = document.createElement('div');
  gridEl.className = 'pfs-grid listing-card-grid';
  const paginationEl = document.createElement('div');
  paginationEl.className = 'pfs-pagination listing-card-pagination';
  panel.appendChild(gridEl);
  panel.appendChild(paginationEl);

  const pageRef = { page: 1 };
  let allItems = [];
  let hasSearched = false;
  let hasLoaded = false;
  let observer;

  function renderPage() {
    const start = (pageRef.page - 1) * pageSize;
    const pageItems = allItems.slice(start, start + pageSize);

    gridEl.innerHTML = pageItems.length
      ? pageItems.map((item) => buildPropCardHtml(item, detailPath, placeholders, category, pfsData)).join('')
      : `<p class="listing-card-empty">${placeholders.propertyForSaleNotFound || 'ขออภัย ไม่พบข้อมูลตามที่ท่านระบุ'}</p>`;

    const newTab = (placeholders.propertyForSaleDetailsNewTab || 'true') === 'true';
    gridEl.querySelectorAll('.listing-card-footer').forEach((footer) => {
      applyLinkTarget(footer, '.pfs-map-btn', newTab);
    });

    const carouselNavBtnsLabels = { prevBtnLabel: placeholders.carouselPrevBtnLabel || 'Previous', nextBtnLabel: placeholders.carouselNextBtnLabel || 'Next' };
    const totalPages = Math.max(1, Math.ceil(allItems.length / pageSize));
    paginationEl.innerHTML = buildPaginationHtml(pageRef.page, totalPages, carouselNavBtnsLabels);
  }

  async function render() {
    if (category === 'all' && !hasSearched) return;

    hasLoaded = true;
    onLoadStart?.();
    paginationEl.innerHTML = '';

    const priceRangeKey = state.priceRangeIdx !== ''
      ? (pfsData.priceRanges[parseInt(state.priceRangeIdx, 10)]?.key || 0)
      : 0;

    try {
      const typeLabel = state.type && state.type !== '0'
        ? (pfsData.propertyTypes.find((t) => t.value === state.type)?.label || '')
        : '';
      const searchParams = {
        page: 0,
        regionId: state.regionId,
        province: state.province,
        district: state.district,
        assetTypeId: 0,
        priceRangeKey,
        keyword: typeLabel || state.keyword,
      };

      const { items } = await searchProperties(
        apiBase,
        { ...searchParams, category },
        pfsData.tabIndexCategory,
      );
      allItems = items;
      pageRef.page = 1;
      renderPage();
    } finally {
      onLoadEnd?.();
    }
  }

  if (category === 'all') {
    observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { observer.disconnect(); render(); }
    }, { rootMargin: '100px' });
    observer.observe(panel);
  } else if (isDefault) {
    render();
  }

  bindPaginationClick(paginationEl, pageRef, renderPage, gridEl);

  function reset() {
    if (observer) { observer.disconnect(); observer = null; }
    hasSearched = true;
    pageRef.page = 1;
    allItems = [];
    render();
  }

  let isDirty = false;

  function lazyLoad() {
    if (!hasLoaded || isDirty) {
      isDirty = false;
      render();
    }
  }

  function markDirty() {
    isDirty = true;
    hasSearched = true;
  }

  return { reset, lazyLoad, markDirty };
}

export default async function decorate(block) {
  const [placeholders, configs] = await Promise.all([
    fetchPlaceholders(),
    fetchConfigs(),
  ]);

  const pageSize = parseInt(placeholders.propertyForSalePageSize, 10) || 12;
  const apiBase = (configs?.propertyForSaleBaseUrl || '').replace(/\/$/, '');
  const detailPath = configs?.propertyForSaleDetailPage || '';
  const pfsConfigUrl = configs?.propertyForSaleConfigUrl || '';
  const mapBaseUrl = configs?.propertyForSaleMapUrl || '';

  const pfsData = await loadPfsData(pfsConfigUrl);
  pfsData.mapBaseUrl = mapBaseUrl;

  const tabsBlock = block.closest('.section')?.querySelector('[data-block-name="tabs"]')
    || document.querySelector('[data-block-name="tabs"]');

  if (!tabsBlock) {
    block.hidden = true;
    return;
  }

  tabsBlock.parentElement?.classList.add('pfs-tabs-wrapper');

  const filterWrapper = document.createElement('div');
  filterWrapper.className = 'pfs-filters';
  const { propertyTypes, priceRanges, tabIndexCategory } = pfsData;
  filterWrapper.innerHTML = buildFilterHtml(placeholders, propertyTypes, priceRanges);
  tabsBlock.before(filterWrapper);

  const tabPanels = [...tabsBlock.querySelectorAll('[role="tab"]')]
    .map((btn) => {
      const id = btn.getAttribute('aria-controls');
      return id ? document.getElementById(id) : null;
    })
    .filter(Boolean);

  const state = {
    keyword: '',
    type: '',
    regionId: '',
    province: '',
    district: '',
    priceRangeIdx: '',
  };

  const tabButtons = [...tabsBlock.querySelectorAll('[role="tab"]')];
  const allTabBtn = tabButtons[0];
  const defaultTabBtn = tabButtons[1];

  allTabBtn.style.display = 'none';
  requestAnimationFrame(() => { defaultTabBtn.click(); });

  const overlay = document.createElement('div');
  overlay.className = 'pfs-page-overlay';
  document.body.appendChild(overlay);

  let activeLoads = 0;
  const showOverlay = () => {
    activeLoads += 1;
    overlay.classList.add('is-active');
  };
  const hideOverlay = () => {
    activeLoads = Math.max(0, activeLoads - 1);
    if (activeLoads === 0) overlay.classList.remove('is-active');
  };

  const categoryKeys = tabIndexCategory.filter((k) => k !== 'all');
  const panelHandlers = tabPanels.map((panel, index) => {
    const category = index === 0 ? 'all' : (categoryKeys[index - 1] || 'all');
    const isDefault = index === 1;
    return setupPanel(panel, state, {
      category,
      apiBase,
      detailPath,
      placeholders,
      onLoadStart: showOverlay,
      onLoadEnd: hideOverlay,
      isDefault,
      pfsData,
      pageSize,
    });
  });

  tabButtons.forEach((btn, index) => {
    if (index === 0) return;
    btn.addEventListener('click', () => panelHandlers[index]?.lazyLoad());
  });

  const searchInput = filterWrapper.querySelector('.pfs-search-input');
  const searchBtn = filterWrapper.querySelector('.pfs-btn-search');

  const typeDefault = placeholders.propertyForSaleType || 'เลือกประเภททรัพย์สิน';
  const regionDefault = placeholders.propertyForSaleRegion || 'เลือกพื้นที่';
  const provinceDefault = placeholders.propertyForSaleProvince || 'เลือกจังหวัด';
  const districtDefault = placeholders.propertyForSaleDistrict || 'เลือกเขต/อำเภอ';
  const priceDefault = placeholders.propertyForSalePrice || 'เลือกช่วงราคา';

  const provinceFilter = filterWrapper.querySelector('[data-filter="province"]');
  const provinceDropdown = provinceFilter.querySelector('[role="listbox"]');
  const provinceLabelEl = provinceFilter.querySelector('[data-filter-label]');
  const districtFilter = filterWrapper.querySelector('[data-filter="district"]');
  const districtDropdown = districtFilter.querySelector('[role="listbox"]');
  const districtLabelEl = districtFilter.querySelector('[data-filter-label]');

  function hasAnyFilter() {
    return (
      searchInput.value.trim()
      || state.type
      || state.regionId
      || state.province
      || state.district
      || state.priceRangeIdx !== ''
    );
  }

  function updateSearchBtn() {
    searchBtn.disabled = !hasAnyFilter();
  }

  searchInput.addEventListener('input', updateSearchBtn);

  initFilterToggles(filterWrapper);

  setupFilterDropdown(filterWrapper, 'type', typeDefault, (val) => {
    state.type = val;
    updateSearchBtn();
  });

  setupFilterDropdown(filterWrapper, 'region', regionDefault, async (regionId) => {
    state.regionId = regionId;
    state.province = '';
    state.district = '';
    provinceLabelEl.textContent = provinceDefault;
    districtLabelEl.textContent = districtDefault;
    provinceDropdown.querySelectorAll('[role="option"]').forEach((o) => o.classList.remove('is-active'));
    districtDropdown.querySelectorAll('[role="option"]').forEach((o) => o.classList.remove('is-active'));
    provinceDropdown.innerHTML = '';
    districtDropdown.innerHTML = '';

    if (regionId) {
      provinceFilter.classList.remove('is-hidden');
      districtFilter.classList.remove('is-hidden');
      const provinces = await fetchJson(`${apiBase}/GetProvince/${regionId}`);
      if (Array.isArray(provinces) && provinces.length) {
        provinceDropdown.innerHTML = buildOptions(
          provinces.map((pv) => {
            const name = (pv.LOCATION_PROVINCE ?? pv.ProvinceName ?? pv.Name ?? '').trim();
            return { value: name, label: name };
          }).filter((o) => o.label),
        );
      }
    } else {
      provinceFilter.classList.add('is-hidden');
      districtFilter.classList.add('is-hidden');
    }
    updateSearchBtn();
  });

  setupFilterDropdown(filterWrapper, 'province', provinceDefault, async (provinceName) => {
    state.province = provinceName;
    state.district = '';
    districtLabelEl.textContent = districtDefault;
    districtDropdown.querySelectorAll('[role="option"]').forEach((o) => o.classList.remove('is-active'));
    districtDropdown.innerHTML = '';

    if (provinceName) {
      const districts = await fetchJson(`${apiBase}/GetDistrict/${encodeURIComponent(provinceName)}`);
      if (Array.isArray(districts) && districts.length) {
        districtDropdown.innerHTML = buildOptions(
          districts.map((d) => {
            const name = (d.LOCATION_AMPHUR ?? d.DistrictName ?? d.Name ?? '').trim();
            return { value: name, label: name };
          }).filter((o) => o.label),
        );
      }
    }
    updateSearchBtn();
  });

  setupFilterDropdown(filterWrapper, 'district', districtDefault, (val) => {
    state.district = val;
    updateSearchBtn();
  });

  setupFilterDropdown(filterWrapper, 'price', priceDefault, (val) => {
    state.priceRangeIdx = val;
    updateSearchBtn();
  });

  searchBtn.addEventListener('click', () => {
    state.keyword = searchInput.value.trim();
    allTabBtn.style.display = '';
    requestAnimationFrame(() => {
      allTabBtn.click();
      panelHandlers[0]?.reset();
      panelHandlers.slice(1).forEach(({ markDirty }) => markDirty());
    });
  });

  closeFiltersOnOutsideClick(filterWrapper);

  const regions = await fetchJson(`${apiBase}/GetRegion`);
  if (Array.isArray(regions) && regions.length) {
    filterWrapper.querySelector('[data-filter="region"] [role="listbox"]').innerHTML = buildOptions(
      regions.map((r) => ({ value: r.RegionID, label: r.RegionName })),
    );
  }

  block.hidden = true;
}

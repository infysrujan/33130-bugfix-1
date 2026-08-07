import { loadFragment } from '../../fragment/fragment.js';
import {
  buildUrl, showToast, getUserLocation, hasValue,
} from './utils.js';
import { fetchGet } from '../../../scripts/utils/fetchApi.js';
import {
  updateMapIframe, populateSidebar,
  fetchNearMe, fetchProvinces, fetchDistricts, fetchByProvince, fetchByKeyword,
} from './api-helpers.js';
import {
  renderCards, renderPagination, buildOverseasCard, CARDS_PER_PAGE,
} from './card-helpers.js';

// ─── Thailand UI ──────────────────────────────────────────────────────────────

export async function buildThailandUI(container, data, placeholders, configs) {
  const { services, specialServiceName, specialFragmentPath } = data;

  if (!configs?.locateUsSelectServiceCodes) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: locate-us-select-service-codes');
  }
  if (!configs?.locateUsDefaultServiceCode) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: locate-us-default-service-code');
  }

  const serviceCodes = (configs?.locateUsSelectServiceCodes || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const serviceCodeMap = {};
  let codeIdx = 0;
  services.forEach((name) => {
    if (name === specialServiceName) {
      serviceCodeMap[name] = null;
    } else {
      const fallbackCode = serviceCodes[serviceCodes.length - 1]
        ?? configs?.locateUsDefaultServiceCode;
      serviceCodeMap[name] = serviceCodes[codeIdx] ?? fallbackCode;
      codeIdx += 1;
    }
  });

  const FALLBACK_LAT = 13.72643339;
  const FALLBACK_LNG = 100.5303671;
  const defaultLat = parseFloat(configs?.locateUsDefaultLat) || FALLBACK_LAT;
  const defaultLng = parseFloat(configs?.locateUsDefaultLng) || FALLBACK_LNG;

  const [location, provincesCache] = await Promise.all([
    getUserLocation(defaultLat, defaultLng),
    fetchProvinces(configs),
  ]);
  const userLat = location.lat;
  const userLng = location.lng;
  const serviceParamKeys = (configs?.locateUsServiceLocationCodes || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  let selectedServiceCode = '';
  let currentIsAtm = false;
  let currentPage = 1;
  let keywordFromSelection = false;
  // When a "…with BeMyID" service variant is active, results are filtered to
  // locations that support Be My ID (the API marks these with Tel === 'BeID').
  let beMyIdActive = false;

  const selectServiceText = placeholders?.selectServiceText || 'Select Service';
  const enterKeywordText = placeholders?.enterKeywordText || 'Enter Keyword';
  const searchResultText = placeholders?.searchResultText || 'Search Result';
  const noResultsText = placeholders?.noResultsFoundText || 'No Results Found';
  const selectProvinceText = placeholders?.selectProvinceText || 'Select Province';
  const searchRemarkText = placeholders?.searchRemarkText || 'Search results of service points near your location.';
  const ariaSearchForm = placeholders?.locateUsAriaSearchForm || 'Search by keyword';
  const ariaSearchBtn = placeholders?.ariaLableSearch || 'Search';
  const ariaShowProvinces = placeholders?.locateUsAriaShowProvinces || 'Show provinces';
  const ariaMapTitle = placeholders?.locateUsAriaMapTitle || 'Location map';
  const ariaPagination = placeholders?.locateUsAriaPagination || 'Results pages';

  const serviceItems = services.map(() => '<li class="locate-us-service-item" role="option"></li>').join('');

  container.innerHTML = `
    <div class="locate-us-filter-bar">
      <div class="locate-us-service-select-wrapper">
        <button type="button" class="locate-us-service-btn" aria-haspopup="listbox" aria-expanded="false">
          <span class="locate-us-service-btn-text"></span>
          <span class="icon-dropdown locate-us-service-btn-icon" aria-hidden="true"></span>
        </button>
        <ul class="locate-us-service-dropdown" role="listbox" hidden>
          <li class="locate-us-service-item locate-us-service-item-placeholder" role="option" aria-disabled="true"></li>
          ${serviceItems}
        </ul>
      </div>
      <div class="locate-us-keyword-wrapper">
        <form class="locate-us-keyword-form" aria-label="${ariaSearchForm}">
          <input type="text" class="locate-us-keyword-input" autocomplete="off" disabled />
          <button type="submit" class="locate-us-keyword-search-btn" aria-label="${ariaSearchBtn}">
            <span class="icon-search locate-us-keyword-search-icon" aria-hidden="true"></span>
          </button>
        </form>
        <div class="locate-us-district-wrapper" hidden></div>
        <button type="button" class="locate-us-keyword-dropdown-toggle" aria-label="${ariaShowProvinces}" aria-expanded="false"></button>
        <div class="locate-us-province-dropdown" hidden></div>
      </div>
    </div>
    <div class="locate-us-location-filter-row" hidden></div>
    <div class="locate-us-results" hidden>
      <div class="locate-us-results-title"></div>
      <div class="locate-us-map-row">
        <iframe class="locate-us-map" loading="lazy" frameborder="0" scrolling="no" title="${ariaMapTitle}"></iframe>
        <div class="locate-us-map-sidebar">
          <p class="locate-us-map-remark"></p>
        </div>
      </div>
      <div class="locate-us-no-results" hidden></div>
      <div class="locate-us-cards"></div>
      <nav class="locate-us-pagination" aria-label="${ariaPagination}"></nav>
    </div>
    <div class="locate-us-fragment" hidden></div>`;

  const serviceBtn = container.querySelector('.locate-us-service-btn');
  const serviceBtnText = container.querySelector('.locate-us-service-btn-text');
  const serviceDropdown = container.querySelector('.locate-us-service-dropdown');

  serviceBtnText.textContent = selectServiceText;
  container.querySelector('.locate-us-service-item-placeholder').textContent = selectServiceText;
  container.querySelectorAll('.locate-us-service-item:not(.locate-us-service-item-placeholder)').forEach((li, i) => {
    li.textContent = services[i];
    li.dataset.value = services[i];
  });
  container.querySelector('.locate-us-keyword-input').placeholder = enterKeywordText;
  container.querySelector('.locate-us-results-title').textContent = searchResultText;
  container.querySelector('.locate-us-no-results').textContent = noResultsText;
  container.querySelector('.locate-us-map-remark').textContent = searchRemarkText;

  // ── Service custom dropdown ────────────────────────────────────────────────
  function toggleServiceDropdown(force) {
    const isHidden = force !== undefined ? !force : !serviceDropdown.hidden;
    serviceDropdown.hidden = isHidden;
    serviceBtn.setAttribute('aria-expanded', String(!isHidden));
  }

  serviceBtn.addEventListener('click', () => toggleServiceDropdown());

  document.addEventListener('click', (e) => {
    if (!container.querySelector('.locate-us-service-select-wrapper').contains(e.target)) {
      toggleServiceDropdown(false);
    }
  });

  const serviceSelect = { value: '' };
  const keywordWrapper = container.querySelector('.locate-us-keyword-wrapper');
  const keywordForm = container.querySelector('.locate-us-keyword-form');
  const keywordInput = container.querySelector('.locate-us-keyword-input');
  const districtWrapper = container.querySelector('.locate-us-district-wrapper');
  const dropdownToggle = container.querySelector('.locate-us-keyword-dropdown-toggle');
  const provinceDropdown = container.querySelector('.locate-us-province-dropdown');
  const locationFilterRow = container.querySelector('.locate-us-location-filter-row');
  const resultsSection = container.querySelector('.locate-us-results');
  const mapContainer = container.querySelector('.locate-us-map');
  const mapSidebar = container.querySelector('.locate-us-map-sidebar');
  const noResults = container.querySelector('.locate-us-no-results');
  const cardsContainer = container.querySelector('.locate-us-cards');
  const paginationEl = container.querySelector('.locate-us-pagination');
  const fragmentContainer = container.querySelector('.locate-us-fragment');

  function onLocationSelect(loc) {
    updateMapIframe(mapContainer, loc, configs);
    populateSidebar(mapSidebar, loc, placeholders, configs, currentIsAtm);
    const remark = document.createElement('p');
    remark.className = 'locate-us-map-remark';
    remark.textContent = searchRemarkText;
    mapSidebar.appendChild(remark);
  }

  function showResults(rawLocs) {
    fragmentContainer.hidden = true;
    fragmentContainer.innerHTML = '';
    currentPage = 1;

    // For a "with BeMyID" variant, keep only locations that support Be My ID.
    const allLocs = beMyIdActive
      ? rawLocs.filter((l) => (l.Tel || '').trim() === 'BeID')
      : rawLocs;

    if (!allLocs.length) {
      resultsSection.hidden = false;
      noResults.hidden = false;
      cardsContainer.innerHTML = '';
      paginationEl.innerHTML = '';
      mapContainer.src = '';
      return;
    }

    noResults.hidden = true;
    resultsSection.hidden = false;
    // The API returns a numeric distance in `Range` (not a 0/1 flag), so the
    // nearest branch is the one with the smallest Range. Tag it here so the
    // card list and sidebar can show the "nearest" badge on that one only.
    const nearest = allLocs.reduce(
      (min, l) => (Number(l.Range) < Number(min.Range) ? l : min),
      allLocs[0],
    );
    allLocs.forEach((l) => { l.isNearest = l === nearest; });
    onLocationSelect(allLocs[0]);
    // eslint-disable-next-line max-len
    renderCards(allLocs, cardsContainer, paginationEl, currentPage, placeholders, onLocationSelect, configs, currentIsAtm);
  }

  function buildProvinceList(provinces) {
    const selectDistrictText = placeholders?.selectDistrictText || 'Select District';
    provinceDropdown.innerHTML = `
      <ul class="locate-us-province-list">
        <li class="locate-us-province-item locate-us-province-item-header">${selectProvinceText}</li>
        ${provinces.map(() => '<li class="locate-us-province-item"></li>').join('')}
      </ul>`;

    provinceDropdown.querySelector('.locate-us-province-item-header').addEventListener('click', async () => {
      keywordInput.value = '';
      provinceDropdown.querySelectorAll('.locate-us-province-item').forEach((item) => item.classList.remove('locate-us-province-item-active'));
      provinceDropdown.hidden = true;
      dropdownToggle.setAttribute('aria-expanded', 'false');
      districtWrapper.hidden = true;
      districtWrapper.innerHTML = '';
      const nearMeLocations = await fetchNearMe(userLat, userLng, selectedServiceCode, configs);
      showResults(nearMeLocations);
    });

    provinceDropdown.querySelectorAll('.locate-us-province-item:not(.locate-us-province-item-header)')
      .forEach((li, i) => {
        li.textContent = provinces[i];
        li.addEventListener('click', async () => {
          const province = provinces[i];
          keywordInput.value = province;
          keywordFromSelection = true;
          provinceDropdown.querySelectorAll('.locate-us-province-item').forEach((item) => item.classList.remove('locate-us-province-item-active'));
          li.classList.add('locate-us-province-item-active');
          provinceDropdown.hidden = true;
          dropdownToggle.setAttribute('aria-expanded', 'false');

          const [districts, locations] = await Promise.all([
            fetchDistricts(province, configs),
            fetchByProvince(province, '', userLat, userLng, selectedServiceCode, configs),
          ]);

          showResults(locations);

          const districtItems = districts.map(() => '<li class="locate-us-district-item" role="option"></li>').join('');
          districtWrapper.innerHTML = `
            <button type="button" class="locate-us-district-btn" aria-haspopup="listbox" aria-expanded="false">
              <span class="locate-us-district-btn-text"></span>
              <span class="icon-dropdown locate-us-district-btn-icon" aria-hidden="true"></span>
            </button>
            <ul class="locate-us-district-dropdown" role="listbox" hidden>
              <li class="locate-us-district-item locate-us-district-item-header" role="option"></li>
              ${districtItems}
            </ul>`;
          const districtBtn = districtWrapper.querySelector('.locate-us-district-btn');
          const districtBtnText = districtWrapper.querySelector('.locate-us-district-btn-text');
          const districtDropdown = districtWrapper.querySelector('.locate-us-district-dropdown');

          districtBtnText.textContent = selectDistrictText;
          districtDropdown.querySelector('.locate-us-district-item-header').textContent = selectDistrictText;
          districtDropdown.querySelectorAll('.locate-us-district-item:not(.locate-us-district-item-header)').forEach((districtEl, j) => {
            districtEl.textContent = districts[j];
            districtEl.dataset.value = districts[j];
          });

          function toggleDistrictDropdown(force) {
            const isHidden = force !== undefined ? !force : !districtDropdown.hidden;
            districtDropdown.hidden = isHidden;
            districtBtn.setAttribute('aria-expanded', String(!isHidden));
          }

          districtBtn.addEventListener('click', () => toggleDistrictDropdown());

          document.addEventListener('click', (e) => {
            if (!districtWrapper.contains(e.target)) {
              toggleDistrictDropdown(false);
            }
          });

          districtDropdown.querySelector('.locate-us-district-item-header').addEventListener('click', async () => {
            districtBtnText.textContent = selectDistrictText;
            districtDropdown.querySelectorAll('.locate-us-district-item').forEach((item) => item.classList.remove('locate-us-district-item-active'));
            toggleDistrictDropdown(false);
            const provinceLocations = await fetchByProvince(province, '', userLat, userLng, selectedServiceCode, configs);
            showResults(provinceLocations);
          });

          districtDropdown.querySelectorAll('.locate-us-district-item:not(.locate-us-district-item-header)').forEach((districtItem) => {
            districtItem.addEventListener('click', async () => {
              const district = districtItem.dataset.value;
              districtBtnText.textContent = district;
              districtDropdown.querySelectorAll('.locate-us-district-item').forEach((item) => item.classList.remove('locate-us-district-item-active'));
              districtItem.classList.add('locate-us-district-item-active');
              toggleDistrictDropdown(false);
              const args = [province, district, userLat, userLng, selectedServiceCode, configs];
              const districtLocations = await fetchByProvince(...args);
              showResults(districtLocations);
            });
          });

          districtDropdown.querySelector('.locate-us-district-item-header').addEventListener('click', async () => {
            districtBtnText.textContent = selectDistrictText;
            districtDropdown.querySelectorAll('.locate-us-district-item').forEach((item) => item.classList.remove('locate-us-district-item-active'));
            toggleDistrictDropdown(false);
            const districtLocations = await fetchByProvince(province, '', userLat, userLng, selectedServiceCode, configs);
            showResults(districtLocations);
          });

          districtWrapper.hidden = false;
        });
      });
  }

  async function onServiceChange(selectedService, opts = {}) {
    // `beMyId`/`baseIndex` are set for the synthetic "…with BeMyID" variants,
    // which reuse the base ATM/ATM+ service but filter results to Be My ID.
    const { beMyId = false, baseIndex = -1 } = opts;
    beMyIdActive = beMyId;

    serviceSelect.value = selectedService;
    serviceBtnText.textContent = selectedService;
    toggleServiceDropdown(false);
    serviceDropdown.querySelectorAll('.locate-us-service-item').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.value === selectedService ? 'true' : 'false');
    });

    // Resolve the service code + ATM flag from the base option when BeMyID,
    // otherwise from the selected option itself.
    const codeIndex = beMyId ? baseIndex : services.indexOf(selectedService);
    const codeLabel = beMyId ? services[baseIndex] : selectedService;
    selectedServiceCode = serviceCodeMap[codeLabel] ?? configs?.locateUsDefaultServiceCode;
    const serviceUrlCode = serviceParamKeys[codeIndex] || '';
    currentIsAtm = serviceUrlCode.toLowerCase().includes('atm');

    const isSpecial = !beMyId && serviceCodeMap[selectedService] === null;
    keywordInput.disabled = isSpecial;
    keywordInput.value = '';
    keywordWrapper.hidden = isSpecial;
    districtWrapper.hidden = true;
    districtWrapper.innerHTML = '';
    locationFilterRow.hidden = true;
    locationFilterRow.innerHTML = '';
    provinceDropdown.hidden = true;
    dropdownToggle.setAttribute('aria-expanded', 'false');

    if (isSpecial && specialFragmentPath) {
      resultsSection.hidden = true;
      fragmentContainer.innerHTML = '';
      const fragment = await loadFragment(specialFragmentPath);
      if (fragment) {
        fragmentContainer.appendChild(fragment);
        fragmentContainer.hidden = false;
      }
      return;
    }

    try {
      const locations = await fetchNearMe(userLat, userLng, selectedServiceCode, configs);
      showResults(locations);
    } catch {
      // eslint-disable-next-line no-console
      console.error('[locate-us] Error fetching near-me locations');
    }
  }

  container.querySelectorAll('.locate-us-service-item:not(.locate-us-service-item-placeholder)').forEach((li) => {
    li.addEventListener('click', () => onServiceChange(li.dataset.value));
  });

  function toggleProvinceDropdown() {
    if (!selectedServiceCode) return;
    const isHidden = provinceDropdown.hidden;
    if (isHidden) {
      districtWrapper.hidden = true;
      districtWrapper.innerHTML = '';
      provinceDropdown.querySelectorAll('.locate-us-province-item').forEach((item) => item.classList.remove('locate-us-province-item-active'));
      buildProvinceList(provincesCache || []);
      provinceDropdown.hidden = false;
      dropdownToggle.setAttribute('aria-expanded', 'true');
    } else {
      provinceDropdown.hidden = true;
      dropdownToggle.setAttribute('aria-expanded', 'false');
    }
  }

  dropdownToggle.addEventListener('click', toggleProvinceDropdown);
  keywordInput.addEventListener('click', () => {
    // Clicking the field clears any selected value so the placeholder shows.
    keywordInput.value = '';
    keywordFromSelection = false;
    toggleProvinceDropdown();
  });

  keywordInput.addEventListener('input', () => {
    keywordFromSelection = false;
    provinceDropdown.hidden = true;
    dropdownToggle.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', (e) => {
    if (!keywordWrapper.contains(e.target)) {
      provinceDropdown.hidden = true;
      dropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });

  keywordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (keywordFromSelection) return;
    if (!selectedServiceCode) {
      showToast(placeholders?.pleaseSelectServiceText || 'Please select service', placeholders);
      return;
    }
    const keyword = keywordInput.value.trim();
    if (!keyword) return;

    try {
      const kwArgs = [userLat, userLng, keyword, '0', selectedServiceCode, configs];
      const locations = await fetchByKeyword(...kwArgs);
      districtWrapper.hidden = true;
      districtWrapper.innerHTML = '';
      showResults(locations);
    } catch {
      // eslint-disable-next-line no-console
      console.error('[locate-us] Keyword search error');
    }
  });

  // Insert a synthetic "…with BeMyID" option directly below its base option
  // (e.g. "ATM+ with BeMyID" under ATM+) and wire it to the BeMyID variant.
  function addBeMyIdOption(baseIndex) {
    const baseLabel = services[baseIndex];
    const suffix = placeholders?.beMyIdLabelText || 'with BeMyID';
    const label = `${baseLabel} ${suffix}`;
    const items = [...serviceDropdown.querySelectorAll('.locate-us-service-item')];
    let li = items.find((el) => el.dataset.value === label);
    if (!li) {
      li = document.createElement('li');
      li.className = 'locate-us-service-item';
      li.setAttribute('role', 'option');
      li.textContent = label;
      li.dataset.value = label;
      const baseLi = items.find((el) => el.dataset.value === baseLabel);
      if (baseLi) baseLi.after(li); else serviceDropdown.appendChild(li);
      li.addEventListener('click', () => onServiceChange(label, { beMyId: true, baseIndex }));
    }
    return label;
  }

  // ── Auto-select service from URL query param ────────────────────────────────
  const urlService = new URLSearchParams(window.location.search).get('service');
  if (urlService && serviceParamKeys.length) {
    const paramIndex = serviceParamKeys.indexOf(urlService);
    if (paramIndex !== -1 && services[paramIndex]) {
      onServiceChange(services[paramIndex]);
    } else {
      // Not a listed option — support "<base>-BeMyId" variants by creating an
      // option below the matching base service (e.g. location-ATM-BeMyId →
      // ATM, location-ATM-Plus-BeMyId → ATM+).
      const baseKey = urlService.replace(/-BeMyId$/i, '');
      const baseIndex = baseKey !== urlService ? serviceParamKeys.indexOf(baseKey) : -1;
      if (baseIndex !== -1 && services[baseIndex]) {
        const label = addBeMyIdOption(baseIndex);
        onServiceChange(label, { beMyId: true, baseIndex });
      }
    }
  }
}

// ─── Overseas UI ─────────────────────────────────────────────────────────────

export async function buildOverseasUI(container, placeholders, configs) {
  const API_GET_COUNTRY = configs?.locateUsGetCountry;
  const API_GET_CITY = configs?.locateUsGetCity;
  const API_SEARCH_INTL = configs?.locateUsSearchInternational;
  const API_SEARCH_KW = configs?.locateUsSearchKeywordOverseas;

  if (!API_GET_COUNTRY) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: get-country');
  }
  if (!API_GET_CITY) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: get-city');
  }
  if (!API_SEARCH_INTL) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: search-international');
  }
  if (!API_SEARCH_KW) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: search-keyword-overseas');
  }

  let countriesCache = [];
  let selectedCountry = '';
  let keywordFromSelection = false;

  async function fetchCountries() {
    if (!API_GET_COUNTRY) return [];
    const data = await fetchGet(API_GET_COUNTRY, { throwOnError: false });
    if (!data) return [];
    return data.map((c) => c.Country);
  }

  async function fetchCities(country) {
    if (!API_GET_CITY) return [];
    const url = buildUrl(API_GET_CITY, { COUNTRY: country });
    const data = await fetchGet(url, { throwOnError: false });
    if (!data) return [];
    return data.map((c) => c.City);
  }

  async function fetchByCountryCity(country, city) {
    if (!API_SEARCH_INTL) return [];
    const url = buildUrl(API_SEARCH_INTL, { COUNTRY: country, CITY: city || '0' });
    const data = await fetchGet(url, { throwOnError: false });
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  }

  async function fetchByKeywordOverseas(keyword) {
    if (!API_SEARCH_KW) return [];
    const url = buildUrl(API_SEARCH_KW, { KEYWORD: keyword });
    return (await fetchGet(url, { throwOnError: false })) ?? [];
  }

  const enterKeywordText = placeholders?.enterKeywordText || 'Enter Keyword';
  const searchResultText = placeholders?.searchResultText || 'Search Result';
  const noResultsText = placeholders?.noResultsFoundText || 'No Results Found';
  const selectCityText = placeholders?.selectCityText || 'Select City';
  const selectCountryText = placeholders?.selectCountryText || 'Select Country';
  const ariaSearchOverseasForm = placeholders?.locateUsAriaSearchOverseasForm || 'Search overseas locations';
  const ariaSearchBtn = placeholders?.ariaLableSearch || 'Search';
  const ariaShowCountries = placeholders?.locateUsAriaShowCountries || 'Show countries';
  const ariaPagination = placeholders?.locateUsAriaPagination || 'Results pages';

  container.innerHTML = `
    <div class="locate-us-keyword-wrapper">
      <form class="locate-us-keyword-form" aria-label="${ariaSearchOverseasForm}">
        <input type="text" class="locate-us-keyword-input" autocomplete="off" />
        <button type="submit" class="locate-us-keyword-search-btn" aria-label="${ariaSearchBtn}">
          <span class="icon-search locate-us-keyword-search-icon" aria-hidden="true"></span>
        </button>
      </form>
      <div class="locate-us-district-wrapper" hidden></div>
      <button type="button" class="locate-us-keyword-dropdown-toggle" aria-label="${ariaShowCountries}" aria-expanded="false"></button>
      <div class="locate-us-province-dropdown" hidden></div>
    </div>
    <div class="locate-us-results locate-us-results-overseas" hidden>
      <div class="locate-us-results-title"></div>
      <div class="locate-us-no-results" hidden></div>
      <div class="locate-us-cards"></div>
      <nav class="locate-us-pagination" aria-label="${ariaPagination}"></nav>
    </div>`;

  container.querySelector('.locate-us-keyword-input').placeholder = enterKeywordText;
  container.querySelector('.locate-us-results-title').textContent = searchResultText;
  container.querySelector('.locate-us-no-results').textContent = noResultsText;

  const keywordWrapper = container.querySelector('.locate-us-keyword-wrapper');
  const keywordForm = container.querySelector('.locate-us-keyword-form');
  const keywordInput = container.querySelector('.locate-us-keyword-input');
  const districtWrapper = container.querySelector('.locate-us-district-wrapper');
  const dropdownToggle = container.querySelector('.locate-us-keyword-dropdown-toggle');
  const countryDropdown = container.querySelector('.locate-us-province-dropdown');
  const resultsSection = container.querySelector('.locate-us-results');
  const noResults = container.querySelector('.locate-us-no-results');
  const cardsContainer = container.querySelector('.locate-us-cards');
  const paginationEl = container.querySelector('.locate-us-pagination');

  function renderOverseasPage(allLocs, page) {
    cardsContainer.innerHTML = '';
    const start = (page - 1) * CARDS_PER_PAGE;
    allLocs.slice(start, start + CARDS_PER_PAGE).forEach((loc, idx) => {
      const card = buildOverseasCard(loc, placeholders);
      card.dataset.cardIndex = idx;
      const header = card.querySelector('.locate-us-card-header');
      const body = card.querySelector('.locate-us-card-body');
      header.addEventListener('click', () => {
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        cardsContainer.querySelectorAll('.locate-us-card-body').forEach((b) => { b.hidden = true; });
        cardsContainer.querySelectorAll('.locate-us-card-header').forEach((h) => h.setAttribute('aria-expanded', 'false'));
        if (!isExpanded) {
          body.hidden = false;
          header.setAttribute('aria-expanded', 'true');
        }
      });
      if (idx === 0) {
        body.hidden = false;
        header.setAttribute('aria-expanded', 'true');
      }
      cardsContainer.appendChild(card);
    });

    renderPagination(paginationEl, allLocs.length, page, (newPage) => {
      renderOverseasPage(allLocs, newPage);
    }, placeholders);
  }

  function showOverseasResults(allLocs) {
    const filtered = allLocs.filter((loc) => {
      const address = [loc.Address1, loc.Address2, loc.Address3, loc.Province, loc.Postcode].filter(Boolean).join(' ');
      const validTel = hasValue(loc.Tel) && /[\d]/.test(loc.Tel);
      return hasValue(loc.MicroBranchHours) && validTel && address;
    });

    if (!filtered.length) {
      resultsSection.hidden = false;
      noResults.hidden = false;
      cardsContainer.innerHTML = '';
      paginationEl.innerHTML = '';
      return;
    }
    noResults.hidden = true;
    resultsSection.hidden = false;
    renderOverseasPage(filtered, 1);
  }

  function buildCountryList(countries) {
    countryDropdown.innerHTML = `
      <ul class="locate-us-province-list">
        <li class="locate-us-province-item locate-us-province-item-header">${selectCountryText}</li>
        ${countries.map(() => '<li class="locate-us-province-item"></li>').join('')}
      </ul>`;

    countryDropdown.querySelectorAll('.locate-us-province-item:not(.locate-us-province-item-header)')
      .forEach((li, i) => {
        li.textContent = countries[i];
        li.addEventListener('click', async () => {
          selectedCountry = countries[i];
          keywordInput.value = countries[i];
          keywordFromSelection = true;
          countryDropdown.hidden = true;
          dropdownToggle.setAttribute('aria-expanded', 'false');
          districtWrapper.hidden = true;
          districtWrapper.innerHTML = '';

          const [cities, locations] = await Promise.all([
            fetchCities(selectedCountry),
            fetchByCountryCity(selectedCountry, ''),
          ]);

          showOverseasResults(locations);

          if (cities.length) {
            const cityItems = cities.map(() => '<li class="locate-us-district-item" role="option"></li>').join('');
            districtWrapper.innerHTML = `
              <button type="button" class="locate-us-district-btn" aria-haspopup="listbox" aria-expanded="false">
                <span class="locate-us-district-btn-text"></span>
                <span class="icon-dropdown locate-us-district-btn-icon" aria-hidden="true"></span>
              </button>
              <ul class="locate-us-district-dropdown" role="listbox" hidden>
                <li class="locate-us-district-item locate-us-district-item-header" role="option"></li>
                ${cityItems}
              </ul>`;

            const cityBtn = districtWrapper.querySelector('.locate-us-district-btn');
            const cityBtnText = districtWrapper.querySelector('.locate-us-district-btn-text');
            const cityDropdown = districtWrapper.querySelector('.locate-us-district-dropdown');

            cityBtnText.textContent = selectCityText;
            cityDropdown.querySelector('.locate-us-district-item-header').textContent = selectCityText;
            cityDropdown.querySelectorAll('.locate-us-district-item:not(.locate-us-district-item-header)').forEach((cityEl, j) => {
              cityEl.textContent = cities[j];
              cityEl.dataset.value = cities[j];
            });

            const toggleCityDropdown = (force) => {
              const isHidden = force !== undefined ? !force : !cityDropdown.hidden;
              cityDropdown.hidden = isHidden;
              cityBtn.setAttribute('aria-expanded', String(!isHidden));
            };

            cityBtn.addEventListener('click', () => toggleCityDropdown());
            document.addEventListener('click', (e) => {
              if (!districtWrapper.contains(e.target)) toggleCityDropdown(false);
            });

            cityDropdown.querySelector('.locate-us-district-item-header').addEventListener('click', async () => {
              cityBtnText.textContent = selectCityText;
              cityDropdown.querySelectorAll('.locate-us-district-item').forEach((item) => item.classList.remove('locate-us-district-item-active'));
              toggleCityDropdown(false);
              const countryLocations = await fetchByCountryCity(selectedCountry, '');
              showOverseasResults(countryLocations);
            });

            cityDropdown.querySelectorAll('.locate-us-district-item:not(.locate-us-district-item-header)').forEach((cityItem) => {
              cityItem.addEventListener('click', async () => {
                const city = cityItem.dataset.value;
                cityBtnText.textContent = city;
                cityDropdown.querySelectorAll('.locate-us-district-item').forEach((item) => item.classList.remove('locate-us-district-item-active'));
                cityItem.classList.add('locate-us-district-item-active');
                toggleCityDropdown(false);
                const cityFiltered = await fetchByCountryCity(selectedCountry, city);
                showOverseasResults(cityFiltered);
              });
            });

            cityDropdown.querySelector('.locate-us-district-item-header').addEventListener('click', async () => {
              cityBtnText.textContent = selectCityText;
              cityDropdown.querySelectorAll('.locate-us-district-item').forEach((item) => item.classList.remove('locate-us-district-item-active'));
              toggleCityDropdown(false);
              const cityFiltered = await fetchByCountryCity(selectedCountry, '');
              showOverseasResults(cityFiltered);
            });

            districtWrapper.hidden = false;
          }
        });
      });
  }

  function toggleCountryDropdown() {
    const isHidden = countryDropdown.hidden;
    if (isHidden) {
      districtWrapper.hidden = true;
      districtWrapper.innerHTML = '';
      buildCountryList(countriesCache);
      countryDropdown.hidden = false;
      dropdownToggle.setAttribute('aria-expanded', 'true');
    } else {
      countryDropdown.hidden = true;
      dropdownToggle.setAttribute('aria-expanded', 'false');
    }
  }

  dropdownToggle.addEventListener('click', toggleCountryDropdown);
  keywordInput.addEventListener('click', toggleCountryDropdown);

  keywordInput.addEventListener('input', () => {
    keywordFromSelection = false;
    countryDropdown.hidden = true;
    dropdownToggle.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', (e) => {
    if (!keywordWrapper.contains(e.target)) {
      countryDropdown.hidden = true;
      dropdownToggle.setAttribute('aria-expanded', 'false');
    }
  });

  keywordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (keywordFromSelection) return;
    const keyword = keywordInput.value.trim();
    if (!keyword) return;

    selectedCountry = '';
    districtWrapper.hidden = true;
    districtWrapper.innerHTML = '';
    countryDropdown.hidden = true;
    dropdownToggle.setAttribute('aria-expanded', 'false');

    try {
      const locations = await fetchByKeywordOverseas(keyword);
      showOverseasResults(locations);
    } catch {
      // eslint-disable-next-line no-console
      console.error('[locate-us] Overseas keyword search error');
    }
  });

  try {
    countriesCache = await fetchCountries();
  } catch {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Failed to fetch overseas countries');
  }
}

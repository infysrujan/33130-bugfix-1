import { buildUrl, createEl, hasValue } from './utils.js';

// ─── Google Maps iframe ───────────────────────────────────────────────────────

function buildEmbedUrl(lat, lng, configs, zoom = 15) {
  const template = configs?.locateUsGoogleMapsEmbedUrl;
  if (!template) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: locate-us-google-maps-embed-url');
    return '';
  }
  const apiKey = configs?.locateUsGoogleMapsApiKey || '';
  const url = buildUrl(template, { LAT: lat, LNG: lng, ZOOM: zoom });
  return apiKey ? `${url}&key=${apiKey}` : url;
}

export function updateMapIframe(iframe, loc, configs) {
  const lat = parseFloat(loc.Lat);
  const lng = parseFloat(loc.Lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return;
  const src = buildEmbedUrl(lat, lng, configs);
  if (src) iframe.src = src;
}

export function populateSidebar(sidebar, loc, placeholders, configs, isAtm = false) {
  const address = [loc.Address1, loc.Address2, loc.Address3, loc.Province, loc.Postcode]
    .filter((v) => hasValue(v)).join(' ');
  const dirTemplate = configs?.locateUsGoogleMapsDirectionsUrl;
  if (!dirTemplate) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: google-maps-directions-url');
  }
  const directionsUrl = dirTemplate ? buildUrl(dirTemplate, { LAT: loc.Lat, LNG: loc.Lng }) : '';
  const getDirectionText = placeholders?.getDirectionText || 'Get Direction';
  const branchBookingText = placeholders?.branchBookingText || 'Branch Booking';
  const nearestLabel = placeholders?.nearestLocationTag || 'Nearest';
  const statusLabel = placeholders?.statusLabel || 'Status:';
  const telLabel = placeholders?.telLabel || 'Tel:';
  const faxLabel = placeholders?.faxLabel || 'Fax:';
  const isNearest = loc.Range === 0;

  // ATM/ATM+ sidebar only shows name, address, and directions
  const branchStatus = !isAtm && hasValue(loc.BranchStatus) ? loc.BranchStatus : '';
  const isOpen = branchStatus.toLowerCase() === 'open';
  const tel = !isAtm && hasValue(loc.Tel) && loc.Tel.trim() !== 'BeID' ? loc.Tel : '';
  const fax = !isAtm && hasValue(loc.Fax) ? loc.Fax : '';
  const showAppointment = !isAtm && loc.BranchAppointment;

  const card = createEl(`
    <article class="locate-us-card">
      <button type="button" class="locate-us-card-header" aria-expanded="true">
        <h3 class="locate-us-card-name"></h3>
        <span class="icon-dropdown locate-us-card-chevron" aria-hidden="true"></span>
      </button>
      <div class="locate-us-card-body">
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
          ${showAppointment ? '<a class="locate-us-card-appointment" target="_blank" rel="noopener noreferrer"></a>' : ''}
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
  if (showAppointment) {
    const appointmentEl = card.querySelector('.locate-us-card-appointment');
    appointmentEl.href = loc.BranchAppointment;
    appointmentEl.textContent = branchBookingText;
  }

  sidebar.innerHTML = '';
  sidebar.appendChild(card);
}

// ─── Thailand API ─────────────────────────────────────────────────────────────

let provincesCache = null;

export async function fetchNearMe(lat, lng, code, configs) {
  const template = configs?.locateUsGetNearMe;
  if (!template) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: get-near-me');
    return [];
  }
  const url = buildUrl(template, { LAT: lat, LONG: lng, CODE: code });
  const resp = await fetch(url);
  if (!resp.ok) return [];
  return resp.json();
}

export async function fetchProvinces(configs) {
  if (provincesCache) return provincesCache;
  const url = configs?.locateUsGetProvince;
  if (!url) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: get-providence');
    return [];
  }
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  provincesCache = data.map((p) => p.Province);
  return provincesCache;
}

export async function fetchDistricts(province, configs) {
  const template = configs?.locateUsGetDistrict;
  if (!template) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: get-district');
    return [];
  }
  const url = buildUrl(template, { PROVINCE: province });
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return data.map((d) => d.District);
}

export async function fetchByProvince(province, district, lat, lng, code, configs) {
  const template = configs?.locateUsSearchThailandWithLocation;
  if (!template) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: search-thailand-with-location');
    return [];
  }
  const url = buildUrl(template, {
    PROVINCE: province,
    DISTRICT: district || '0',
    LAT: lat,
    LONG: lng,
    CODE: code,
  });
  const resp = await fetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : [data];
}

export async function fetchByKeyword(lat, lng, keyword, district, code, configs) {
  const template = configs?.locateUsSearchKeywordWithLocation;
  if (!template) {
    // eslint-disable-next-line no-console
    console.error('[locate-us] Missing config key: search-keyword-with-location');
    return [];
  }
  const url = buildUrl(template, {
    LAT: lat,
    LONG: lng,
    KEYWORD: keyword,
    DISTRICT: district || '0',
    CODE: code,
  });
  const resp = await fetch(url);
  if (!resp.ok) return [];
  return resp.json();
}

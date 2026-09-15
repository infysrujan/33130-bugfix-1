const DEFAULT_API_URL = 'https://bbl-sea-apim-u.azure-api.net/api/uat/BondConnectService/GetBondConnectDetail';
const LOCAL_API_URL = DEFAULT_API_URL;
const LOCAL_API_KEY = '';
const API_PATH_FRAGMENT = '/BondConnectService/GetBondConnectDetail';
const BOND_CONNECT_PANEL_SELECTOR = [
  '.bond-connect-panel',
  '.field-bond-connect',
  '.field-bondconnecttable',
].join(',');
const TABLE_TARGET_SELECTOR = [
  '.bond-connect-table',
  '.field-bond-connect-table',
  '.field-bondconnecttable',
  '.field-table-bond',
  '[data-bond-connect-table]',
].join(',');

const LABEL_FIELDS = {
  symbol: ['hdConnectSymbol', 'ConnectSymbol', 'connectSymbol'],
  referenceNo: ['hdConnectRefNo', 'ConnectRefNo', 'connectRefNo', 'RefNo'],
  reserve: [
    'hdConnectReserve',
    'ConnectReserve',
    'connectReserve',
    'TotalPurchaseAmount',
  ],
  allocate: [
    'hdConnectAllocate',
    'ConnectAllocate',
    'connectAllocate',
    'TotalAllotment',
  ],
  channel: ['hdConnectChannel', 'ConnectChannel', 'connectChannel', 'Channel'],
  total: ['hdConnectTotal', 'ConnectTotal', 'connectTotal'],
  grandTotal: ['hdConnectGrandTotal', 'ConnectGrandTotal', 'connectGrandTotal'],
};

const serviceResponseRenderers = new Set();
let serviceResponseCaptureBound = false;

function isBondConnectForm(form) {
  if (!form) return false;
  if (form.querySelector(BOND_CONNECT_PANEL_SELECTOR)) return true;
  // The authored form is still a copy of Bond Allocation — every panel and field carries the
  // same name — so nothing in the markup tells the two apart. The page path does. Replace
  // this with a formCode check once that field is given a value in AEM.
  return window.location.pathname.toLowerCase().includes('bond-connect');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getInputValue(form, names, fallback) {
  const selectors = names.flatMap((name) => [
    `#${CSS.escape(name)}`,
    `[name="${CSS.escape(name)}"]`,
    `.field-${CSS.escape(name.toLowerCase())} input`,
    `.field-${CSS.escape(name.toLowerCase())} p`,
    `.field-${CSS.escape(name.toLowerCase())} .field-label`,
  ]);
  const element = form.querySelector(selectors.join(','));
  return element?.value || element?.textContent?.trim() || fallback;
}

function getLocale() {
  const lang = document.documentElement.lang?.toLowerCase() || '';
  const path = window.location.pathname.toLowerCase();
  return lang.startsWith('th') || path.startsWith('/th/') ? 'th' : 'en';
}

function getLabels(form) {
  const isThai = getLocale() === 'th';

  return {
    symbol: isThai
      ? 'รุ่น'
      : getInputValue(form, LABEL_FIELDS.symbol, 'Symbol'),
    referenceNo: isThai
      ? 'เลขที่อ้างอิง (Ref No.)'
      : getInputValue(form, LABEL_FIELDS.referenceNo, 'Ref No.'),
    reserve: getInputValue(form, LABEL_FIELDS.reserve, 'Reserve Amount'),
    allocate: getInputValue(form, LABEL_FIELDS.allocate, 'Allocated Amount'),
    channel: isThai
      ? 'ช่องทาง'
      : getInputValue(form, LABEL_FIELDS.channel, 'Channel'),
    total: isThai ? 'รวม' : getInputValue(form, LABEL_FIELDS.total, 'Total'),
    grandTotal: getInputValue(form, LABEL_FIELDS.grandTotal, 'Total Summary'),
  };
}

function parseAmount(value) {
  if (value == null || value === '') return 0;
  const normalized = String(value).replace(/,/g, '');
  const amount = Number.parseFloat(normalized);
  return Number.isNaN(amount) ? 0 : amount;
}

function formatAmount(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function sumBy(items, keys) {
  return items.reduce((total, item) => {
    const key = keys.find((name) => item[name] != null && item[name] !== '');
    return total + parseAmount(key ? item[key] : 0);
  }, 0);
}

function groupAllocations(result) {
  const bonds = Array.isArray(result?.Bonds) ? result.Bonds : [];
  const allocations = Array.isArray(result?.Allocations)
    ? result.Allocations
    : [];
  const bondMap = new Map(bonds.map((bond) => [bond.Symbol, bond]));
  const groups = new Map();

  allocations.forEach((item) => {
    if (!groups.has(item.Symbol)) {
      groups.set(item.Symbol, {
        symbol: item.Symbol,
        items: [],
        subTotalPurchase: item.TotalReserveBySymbolFmt,
        subTotalAllocated: item.TotalAllocatedBySymbolFmt,
      });
    }
    groups.get(item.Symbol).items.push(item);
  });

  return [...groups.values()].sort((a, b) => {
    const orderA = bondMap.get(a.symbol)?.BondOrder ?? 999;
    const orderB = bondMap.get(b.symbol)?.BondOrder ?? 999;
    return orderA - orderB;
  });
}

function getBondName(bond, symbol) {
  if (!bond) return symbol;
  return getLocale() === 'th'
    ? bond.BondName_Th || bond.BondName_En || symbol
    : bond.BondName_En || bond.BondName_Th || symbol;
}

function getChannel(row) {
  return getLocale() === 'th'
    ? row.ChannelTH || row.ChannelEN || ''
    : row.ChannelEN || row.ChannelTH || '';
}

function createTableHtml(result, form) {
  const bonds = Array.isArray(result?.Bonds) ? result.Bonds : [];
  const allocations = Array.isArray(result?.Allocations)
    ? result.Allocations
    : [];
  const bondMap = new Map(bonds.map((bond) => [bond.Symbol, bond]));
  const labels = getLabels(form);
  const groups = groupAllocations(result);
  const totalReserveItem = allocations.find((item) => item.TotalReserveByIDFmt);
  const totalAllocatedItem = allocations.find(
    (item) => item.TotalAllocatedByIDFmt,
  );
  const grandTotalPurchase = totalReserveItem?.TotalReserveByIDFmt
    || formatAmount(sumBy(allocations, ['Amount', 'AmountFmt']));
  const grandTotalAllocated = totalAllocatedItem?.TotalAllocatedByIDFmt
    || formatAmount(sumBy(allocations, ['AllocatedAmount', 'AllocatedAmountFmt']));

  let html = '<table class="bond-connect-result-table"><tbody>';

  groups.forEach((group, index) => {
    const bondName = getBondName(bondMap.get(group.symbol), group.symbol);
    const subTotalPurchase = group.subTotalPurchase
      || formatAmount(sumBy(group.items, ['Amount', 'AmountFmt']));
    const subTotalAllocated = group.subTotalAllocated
      || formatAmount(
        sumBy(group.items, ['AllocatedAmount', 'AllocatedAmountFmt']),
      );

    html += `
      <tr class="bond-connect-bond-name">
        <th colspan="5"><span>${escapeHtml(bondName)}</span></th>
      </tr>
      <tr class="bond-connect-heading-row">
        <th>${escapeHtml(labels.symbol)}</th>
        <th>${escapeHtml(labels.referenceNo)}</th>
        <th class="is-numeric">${escapeHtml(labels.reserve)}</th>
        <th class="is-numeric">${escapeHtml(labels.allocate)}</th>
        <th>${escapeHtml(labels.channel)}</th>
      </tr>
    `;

    group.items.forEach((row) => {
      html += `
        <tr>
          <td>${escapeHtml(row.Symbol)}</td>
          <td>${escapeHtml(row.ReferenceNoDisplay)}</td>
          <td class="is-numeric is-strong">
            ${escapeHtml(row.AmountFmt ?? formatAmount(parseAmount(row.Amount)))}
          </td>
          <td class="is-numeric is-strong">
            ${escapeHtml(row.AllocatedAmountFmt ?? formatAmount(parseAmount(row.AllocatedAmount)))}
          </td>
          <td>${escapeHtml(getChannel(row))}</td>
        </tr>
      `;
    });

    html += `
      <tr class="bond-connect-total-row">
        <td></td>
        <td>${escapeHtml(labels.total)}</td>
        <td class="is-numeric is-strong">${escapeHtml(subTotalPurchase)}</td>
        <td class="is-numeric is-strong">${escapeHtml(subTotalAllocated)}</td>
        <td></td>
      </tr>
    `;

    if (index < groups.length - 1) {
      html += '<tr class="bond-connect-spacer-row"><td colspan="5"></td></tr>';
    }
  });

  if (groups.length > 1) {
    html += `
      <tr class="bond-connect-grand-total-row">
        <td></td>
        <td>${escapeHtml(labels.grandTotal)}</td>
        <td class="is-numeric">${escapeHtml(grandTotalPurchase)}</td>
        <td class="is-numeric">${escapeHtml(grandTotalAllocated)}</td>
        <td></td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  return html;
}

function findTableTarget(form) {
  const target = form.querySelector(TABLE_TARGET_SELECTOR);
  if (target) {
    return target.matches('input, textarea')
      ? target.closest('.field-wrapper')
      : target;
  }

  // Nothing authored to hold the table. Create the slot instead of giving up: the leftover
  // Bond Allocation fields sitting in the same panel are already hidden by bond-connect.css,
  // so appending here puts the table where those fields used to show.
  const successPanel = form.querySelector('.field-successpanel');
  if (!successPanel) return null;

  let host = successPanel.querySelector('[data-bond-connect-table]');
  if (!host) {
    host = document.createElement('div');
    host.dataset.bondConnectTable = '';
    successPanel.append(host);
  }
  return host;
}

function renderBondConnectTable(form, result) {
  const target = findTableTarget(form);
  if (!target) return false;

  const hasData = Array.isArray(result?.Allocations) && result.Allocations.length > 0;
  target.innerHTML = hasData ? createTableHtml(result, form) : '';
  target.hidden = !hasData;
  return hasData;
}

function getFieldValue(form, selectors) {
  const element = form.querySelector(selectors.join(','));
  return element?.value?.trim() || '';
}

function getMaskedCitizenId(form, result) {
  return (
    getFieldValue(form, ['[name="citizenID"]', '.field-citizenid input'])
    || result?.Allocations?.[0]?.CizID
    || ''
  );
}

function renderResultSubHeader(form, result) {
  const subHeader = form.querySelector('.field-resultsbondsubheader');
  if (!subHeader) return;

  const citizenId = getMaskedCitizenId(form, result);
  if (!citizenId) return;

  subHeader.replaceChildren();
  const text = document.createElement('p');
  text.className = 'bond-connect-result-subheader';
  text.textContent = getLocale() === 'th'
    ? `เลขบัตรประจำตัวประชาชน XXXXXXXXX${citizenId}`
    : `Citizen ID No. XXXXXXXXX${citizenId}`;
  subHeader.append(text);
}

function isLocalhost() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function getApiConfig() {
  return {
    url:
      sessionStorage.getItem('bondConnectApiUrl')
      || (isLocalhost() ? LOCAL_API_URL : DEFAULT_API_URL),
    subscriptionKey:
      sessionStorage.getItem('bondConnectApiKey')
      || (isLocalhost() ? LOCAL_API_KEY : ''),
  };
}

function isBondConnectServiceRequest(input) {
  const url = typeof input === 'string' ? input : input?.url;
  return String(url || '').includes(API_PATH_FRAGMENT);
}

function notifyServiceResponseRenderers(result) {
  serviceResponseRenderers.forEach((renderResult) => {
    renderResult(result);
  });
}

function parseServiceResponse(response) {
  if (!response) return null;
  if (typeof response === 'object') return response;
  try {
    return JSON.parse(response);
  } catch {
    return null;
  }
}

function bindFetchResponseCapture() {
  if (!window.fetch || window.fetch.bondConnectCaptureBound) return;

  const originalFetch = window.fetch.bind(window);
  const fetchWithBondConnectCapture = async (...args) => {
    const response = await originalFetch(...args);
    if (isBondConnectServiceRequest(args[0])) {
      response.clone().json()
        .then((result) => notifyServiceResponseRenderers(result))
        .catch(() => {});
    }
    return response;
  };

  fetchWithBondConnectCapture.bondConnectCaptureBound = true;
  window.fetch = fetchWithBondConnectCapture;
}

function bindXhrResponseCapture() {
  const XhrConstructor = window.XMLHttpRequest;
  if (!XhrConstructor || XhrConstructor.prototype.bondConnectCaptureBound) return;

  const originalOpen = XhrConstructor.prototype.open;
  const originalSend = XhrConstructor.prototype.send;

  XhrConstructor.prototype.open = function open(method, url, ...args) {
    this.bondConnectRequestUrl = url;
    return originalOpen.call(this, method, url, ...args);
  };

  XhrConstructor.prototype.send = function send(...args) {
    if (isBondConnectServiceRequest(this.bondConnectRequestUrl)) {
      this.addEventListener('load', () => {
        if (this.status < 200 || this.status >= 300) return;

        const result = this.responseType === 'json'
          ? parseServiceResponse(this.response)
          : parseServiceResponse(this.responseText);
        if (result) notifyServiceResponseRenderers(result);
      });
    }
    return originalSend.apply(this, args);
  };

  XhrConstructor.prototype.bondConnectCaptureBound = true;
}

function setPanelVisible(form, selector, visible) {
  const panel = form.querySelector(selector);
  if (!panel) return;
  panel.dataset.visible = String(visible);
  panel.hidden = !visible;
  panel.style.display = visible ? '' : 'none';
}

function setLoading(form, visible) {
  setPanelVisible(form, '.field-loadingtext', visible);
  form
    .querySelectorAll('[name="submitCTA"], .field-submitcta button')
    .forEach((button) => {
      button.disabled = visible;
    });
}

async function fetchBondConnectDetail(form) {
  const bondHolderNumber = getFieldValue(form, [
    '[name="Bond Holder Number"]',
    '.field-bond-holder-number input',
  ]);
  const bondCitizenId = getFieldValue(form, [
    '[name="citizenID"]',
    '.field-citizenid input',
  ]);
  const { url, subscriptionKey } = getApiConfig();
  const requestUrl = new URL(url);

  if (requestUrl.hostname.includes('azure-api.net')) {
    requestUrl.searchParams.set('BondHolderNumber', bondHolderNumber);
    requestUrl.searchParams.set('BondCitizenIDorPassportNumber', bondCitizenId);
  } else {
    requestUrl.searchParams.set('bondHolderNumber', bondHolderNumber);
    requestUrl.searchParams.set('bondCitizenIDorPassportNumber', bondCitizenId);
  }

  const headers = { Accept: 'application/json' };
  if (subscriptionKey) {
    headers['Ocp-Apim-Subscription-Key'] = subscriptionKey;
  }

  const options = { method: 'GET', headers };
  if (requestUrl.origin !== window.location.origin) {
    options.credentials = 'include';
  }

  const response = await fetch(requestUrl.toString(), options);
  if (!response.ok) {
    throw new Error(`Bond Connect API returned ${response.status}`);
  }
  return response.json();
}

function showResult(form, result) {
  renderResultSubHeader(form, result);
  const hasData = renderBondConnectTable(form, result);
  setPanelVisible(form, '.field-mainformpanel', false);
  setPanelVisible(form, '.field-bond-allocation-review', hasData);
  setPanelVisible(form, '.field-bond-allocation-notfound', !hasData);
  return hasData;
}

function showApiError(form, visible = true) {
  setPanelVisible(form, '.field-errorloading', visible);
}

function bindServiceResponseRendering(form) {
  serviceResponseRenderers.add((result) => showResult(form, result));
  if (serviceResponseCaptureBound) return;

  serviceResponseCaptureBound = true;
  bindFetchResponseCapture();
  bindXhrResponseCapture();
}

function bindLocalApiSubmit(form) {
  if (!isLocalhost()) return;

  const submitButton = form.querySelector(
    '[name="submitCTA"], .field-submitcta button',
  );
  if (!submitButton) return;

  submitButton.addEventListener(
    'click',
    async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();

      setLoading(form, true);
      showApiError(form, false);

      try {
        const result = await fetchBondConnectDetail(form);
        showResult(form, result);
      } catch {
        showApiError(form);
      } finally {
        setLoading(form, false);
      }
    },
    true,
  );
}

function parseJsonValue(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getResultFields(form) {
  return [
    ...form.querySelectorAll(
      [
        '#BondConnectResult',
        '#bondConnectResult',
        '[name="BondConnectResult"]',
        '[name="bondConnectResult"]',
        '.bond-connect-result-json textarea',
        '.bond-connect-result-json input',
        '.field-bondconnectresult textarea',
        '.field-bondconnectresult input',
      ].join(','),
    ),
  ];
}

function bindResultFieldRendering(form) {
  getResultFields(form).forEach((field) => {
    const renderFromField = () => {
      const result = parseJsonValue(field.value);
      if (result) showResult(form, result);
    };

    field.addEventListener('change', renderFromField);
    field.addEventListener('input', renderFromField);
    renderFromField();
  });
}

export { renderBondConnectTable };

export default function decorateBondConnectForm(form) {
  if (!isBondConnectForm(form)) return;

  document.body.classList.add('bond-connect-form');
  bindResultFieldRendering(form);
  bindServiceResponseRendering(form);
  bindLocalApiSubmit(form);

  window.BondConnectAem = window.BondConnectAem || {};
  window.BondConnectAem.render = (result, targetForm = form) => (
    showResult(targetForm, result)
  );
  window.BondConnectAem.setApiKey = (key) => {
    sessionStorage.setItem('bondConnectApiKey', key);
  };
  window.BondConnectAem.setApiUrl = (url) => {
    sessionStorage.setItem('bondConnectApiUrl', url);
  };
  window.BondConnectAem.fetchAndRender = async (targetForm = form) => {
    const result = await fetchBondConnectDetail(targetForm);
    showResult(targetForm, result);
    return result;
  };

  form.addEventListener('bondconnect:render', (event) => {
    showResult(form, event.detail);
  });
}

export function trimValue(value) {
  if (value === null || value === undefined) return '-';
  const normalized = String(value).trim();
  return normalized || '-';
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

function replaceTemplateTokens(url, values) {
  let output = url;
  Object.entries(values).forEach(([key, value]) => {
    const replacements = [`{{${key}}}`, `{{${key}`, `{${key}}`, `{${key}`, `:${key}`];
    replacements.forEach((token) => {
      output = output.split(token).join(String(value));
    });
  });
  return output;
}

/**
 * Creates API endpoint functions from configs.
 * Config key names (camelCase from config.json Key column):
 *   Section 1 (currency rates via FwbRateService / ExchangeRateService):
 *     fwbRateServiceGetLatestFxrates       - latest FX rates with date
 *     fwbRateServiceGetDayInMonth          - days with data for a given month
 *     fwbRateServiceGetUpdateInDay         - time updates for a given day
 *     fwbRateServiceGetFxrates             - FX rates for a date+update
 *   Section 2 (forward points via FwbRateService):
 *     fwbRateServiceGetFwdDateTimeLastUpdate - latest forward points date
 *     fwbRateServiceGetFwdDayInMonth         - days with fwd data for a given month
 *     fwbRateServiceGetFwdUpdateInDay        - time updates for a given day (fwd)
 *     fwbRateServiceGetFwdfxrates            - forward point rates for a date+update
 */
export function createApiEndpoints(configs) {
  const latestFxRatesUrl = configs?.fwbRateServiceGetLatestFxrates || '';
  const dayInMonthTemplate = configs?.fwbRateServiceGetDayInMonth || '';
  const updateInDayTemplate = configs?.fwbRateServiceGetUpdateInDay || '';
  const fxRatesTemplate = configs?.fwbRateServiceGetFxrates || '';

  const fwdLatestUrl = configs?.fwbRateServiceGetFwdDateTimeLastUpdate || '';
  const fwdDayInMonthTemplate = configs?.fwbRateServiceGetFwdDayInMonth || '';
  const fwdUpdateInDayTemplate = configs?.fwbRateServiceGetFwdUpdateInDay || '';
  const fwdRatesTemplate = configs?.fwbRateServiceGetFwdfxrates || '';

  return {
    // Section 1
    latestFxRates: () => latestFxRatesUrl,
    dayInMonth: (year, month) => replaceTemplateTokens(
      dayInMonthTemplate,
      { YEAR: year, MONTH: month },
    ),
    updateInDay: (day, month, year) => replaceTemplateTokens(updateInDayTemplate, {
      DATE: day, DAY: day, MONTH: month, YEAR: year,
    }),
    fxRates: (day, month, year, update) => replaceTemplateTokens(fxRatesTemplate, {
      DATE: day, DAY: day, MONTH: month, YEAR: year, NUM: update, UPDATE: update,
    }),
    // Section 2
    fwdLatest: () => fwdLatestUrl,
    fwdDayInMonth: (year, month) => replaceTemplateTokens(
      fwdDayInMonthTemplate,
      { YEAR: year, MONTH: month },
    ),
    fwdUpdateInDay: (day, month, year) => replaceTemplateTokens(fwdUpdateInDayTemplate, {
      DATE: day, DAY: day, MONTH: month, YEAR: year,
    }),
    fwdRates: (day, month, year, update) => replaceTemplateTokens(fwdRatesTemplate, {
      DATE: day, DAY: day, MONTH: month, YEAR: year, NUM: update, UPDATE: update,
    }),
  };
}

/**
 * Normalizes FX rates response for Section 1 currency table.
 * Fields mapped per API Technical Specifications for Exchange Rates v1.0.
 * Currency column shows: Family (e.g. "USD") + flag icon.
 * Columns: Sight Bill Buying Rates | TT Buying Rates | TT Selling Rates
 */
export function normalizeFxRates(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const raw = trimValue(item.Family);
    return {
      family: raw.replace(/\d+$/, ''),
      familyIcon: raw,
      sightBillBuying: trimValue(item.SightBill || item.SightBillBuying),
      ttBuying: trimValue(item.TTBuying || item.TT),
      ttSelling: trimValue(item.Bill_DD_TT || item.TTSelling),
    };
  });
}

/**
 * Normalizes forward points response from GetFwdfxrates.
 * API returns: [{Tier:"SME01", Tenors:[{TenorCode, BuyingRate, SellingRate}]}, {Tier:"SME02",...}]
 * SME01 = Table 1 (THB 50-200M), SME02 = Table 2 (THB 200-500M).
 * Output: one entry per tenor row (1M, 3M, 6M) with t1/t2 buying+selling.
 */
export function normalizeFwdRates(list) {
  if (!Array.isArray(list) || !list.length) return [];
  const tier1 = list.find((t) => t.Tier === 'SME01');
  const tier2 = list.find((t) => t.Tier === 'SME02');
  const tenors1 = Array.isArray(tier1?.Tenors) ? tier1.Tenors : [];
  const tenors2 = Array.isArray(tier2?.Tenors) ? tier2.Tenors : [];
  const len = Math.max(tenors1.length, tenors2.length);
  return Array.from({ length: len }, (_, i) => ({
    tenorCode: trimValue((tenors1[i] || tenors2[i])?.TenorCode),
    t1Buying: trimValue(tenors1[i]?.BuyingRate),
    t1Selling: trimValue(tenors1[i]?.SellingRate),
    t2Buying: trimValue(tenors2[i]?.BuyingRate),
    t2Selling: trimValue(tenors2[i]?.SellingRate),
  }));
}

export async function getLatestFxRates(endpoints) {
  const url = endpoints.latestFxRates();
  if (!url) return [];
  return fetchJson(url);
}

export async function getLatestFwdUpdate(endpoints) {
  const url = endpoints.fwdLatest();
  if (!url) return null;
  try {
    const data = await fetchJson(url);
    return Array.isArray(data) ? data[0] : data;
  } catch (e) {
    return null;
  }
}

export async function getEnabledDays(url) {
  if (!url) return [];
  try {
    const data = await fetchJson(url);
    return (Array.isArray(data) ? data : [])
      .map((item) => String(item.Day || '').trim())
      .filter(Boolean)
      .map((day) => day.padStart(2, '0'));
  } catch (e) {
    return [];
  }
}

export async function getUpdatesInDay(url) {
  if (!url) return [];
  try {
    const data = await fetchJson(url);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

export async function getFxRates(url) {
  if (!url) return [];
  try {
    return await fetchJson(url);
  } catch (e) {
    return [];
  }
}

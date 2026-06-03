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

export function createApiEndpoints(configs) {
  const latestUrl = configs?.exchangeRateServiceGetLatestRates || '';
  const dayInMonthTemplate = configs?.exchangeRateServiceGetDayInMonth || '';
  const updateInDayTemplate = configs?.exchangeRateServiceGetUpdateInDay || '';
  const fxRatesTemplate = configs?.exchangeRateServiceGetFxrates || '';

  return {
    latestRates: () => latestUrl,
    dayInMonth: (year, month) => replaceTemplateTokens(dayInMonthTemplate, {
      YEAR: year,
      MONTH: month,
    }),
    updateInDay: (day, month, year) => replaceTemplateTokens(updateInDayTemplate, {
      DATE: day,
      MONTH: month,
      YEAR: year,
    }),
    fxRates: (day, month, year, update, language) => replaceTemplateTokens(fxRatesTemplate, {
      DATE: day,
      DAY: day,
      MONTH: month,
      YEAR: year,
      NUM: update,
      UPDATE: update,
      LANGUAGE: language,
      LANG: language,
    }),
  };
}

export function normalizeRates(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    family: trimValue(item.Family),
    description: trimValue(item.Description),
    buyingRates: trimValue(item.BuyingRates),
    sellingRates: trimValue(item.SellingRates),
    sightBill: trimValue(item.SightBill),
    tt: trimValue(item.TT),
    billDdTt: trimValue(item.Bill_DD_TT),
  }));
}

export async function getLatestRates(endpoints) {
  return fetchJson(endpoints.latestRates());
}

export async function getEnabledDays(endpoints, year, month) {
  const data = await fetchJson(endpoints.dayInMonth(Number(year), Number(month)));
  return (Array.isArray(data) ? data : [])
    .map((item) => String(item.Day || '').trim())
    .filter(Boolean)
    .map((day) => day.padStart(2, '0'));
}

export async function getUpdatesInDay(endpoints, day, month, year) {
  return fetchJson(endpoints.updateInDay(day, month, year));
}

export async function getRates(endpoints, day, month, year, update, language) {
  const num = String(update || '').trim();
  const url = endpoints.fxRates(day, month, year, num, language);
  if (!url) return [];

  try {
    return await fetchJson(url);
  } catch (e) {
    return [];
  }
}

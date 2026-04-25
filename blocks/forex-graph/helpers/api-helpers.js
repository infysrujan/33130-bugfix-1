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
  const fxFamilyUrl = configs?.exchangeRateServiceGetFxrateFamily || '';
  const dayInMonthTemplate = configs?.exchangeRateServiceGetDayInMonth || '';
  const chartTemplate = configs?.exchangeRateServiceGetFxrateChart || '';
  const downloadTemplate = configs?.exchangeRateServiceGetFxrateDownload || '';

  return {
    fxFamily: () => fxFamilyUrl,
    dayInMonth: (year, month) => replaceTemplateTokens(dayInMonthTemplate, {
      YEAR: year,
      MONTH: month,
    }),
    chartRates: (sDay, sMon, sYear, eDay, eMon, eYear, family, lang) => replaceTemplateTokens(
      chartTemplate,
      {
        START_DATE: sDay,
        START_MONTH: sMon,
        START_YEAR: sYear,
        END_DATE: eDay,
        END_MONTH: eMon,
        END_YEAR: eYear,
        CURR_FAMILY: family,
        LANG: lang,
      },
    ),
    downloadRates: (sDay, sMon, sYear, eDay, eMon, eYear, family, lang) => replaceTemplateTokens(
      downloadTemplate,
      {
        START_DATE: sDay,
        START_MONTH: sMon,
        START_YEAR: sYear,
        END_DATE: eDay,
        END_MONTH: eMon,
        END_YEAR: eYear,
        CURR_FAMILY: family,
        LANG: lang,
      },
    ),
  };
}

export async function getFxFamily(endpoints) {
  return fetchJson(endpoints.fxFamily());
}

export async function getEnabledDays(endpoints, year, month) {
  const data = await fetchJson(endpoints.dayInMonth(Number(year), Number(month)));
  return (Array.isArray(data) ? data : [])
    .map((item) => String(item.Day || '').trim())
    .filter(Boolean)
    .map((day) => day.padStart(2, '0'));
}

export async function getChartRates(endpoints, sDay, sMon, sYear, eDay, eMon, eYear, family, lang) {
  const url = endpoints.chartRates(sDay, sMon, sYear, eDay, eMon, eYear, family, lang);
  if (!url) return [];
  try {
    return await fetchJson(url);
  } catch (e) {
    return [];
  }
}

export function getDownloadUrl(endpoints, sDay, sMon, sYear, eDay, eMon, eYear, family, lang) {
  return endpoints.downloadRates(sDay, sMon, sYear, eDay, eMon, eYear, family, lang);
}

export function normalizeChartData(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    date: String(item.Ddate || '').trim(),
    buyingRate: parseFloat(String(item.BuyingRates || '').trim()) || null,
    sellingRate: parseFloat(String(item.SellingRates || '').trim()) || null,
  })).filter((item) => item.date);
}

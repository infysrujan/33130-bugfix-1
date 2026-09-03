import { fetchGet } from '../../../scripts/utils/fetchApi.js';

export function trimValue(value) {
  if (value === null || value === undefined) return '-';
  const normalized = String(value).trim();
  return normalized || '-';
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
  const fxFamilyUrl = configs?.forexRatesGetFxrateFamily || '';
  const dayInMonthTemplate = configs?.forexRatesGetDayInMonth || '';
  const chartTemplate = configs?.forexGraphGetFxrateChart || '';
  const downloadTemplate = configs?.forexRatesGetFxrateDownload || '';

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
  return fetchGet(endpoints.fxFamily());
}

export async function getEnabledDays(endpoints, year, month) {
  const data = await fetchGet(endpoints.dayInMonth(Number(year), Number(month)));
  return (Array.isArray(data) ? data : [])
    .map((item) => String(item.Day || '').trim())
    .filter(Boolean)
    .map((day) => day.padStart(2, '0'));
}

export async function getChartRates(endpoints, sDay, sMon, sYear, eDay, eMon, eYear, family, lang) {
  const url = endpoints.chartRates(sDay, sMon, sYear, eDay, eMon, eYear, family, lang);
  if (!url) return [];
  try {
    return await fetchGet(url);
  } catch (e) {
    return [];
  }
}

export function getDownloadUrl(endpoints, sDay, sMon, sYear, eDay, eMon, eYear, family, lang) {
  return endpoints.downloadRates(sDay, sMon, sYear, eDay, eMon, eYear, family, lang);
}

export function normalizeChartData(list, lang) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const rawDate = String(item?.Ddate || '').trim();
    let date = rawDate;
    let timestamp = null;

    const [month, day, year] = rawDate.split('/');
    if (month && day && year) {
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(parsed.getTime())) timestamp = parsed.getTime();

      if (lang === 'th') {
        if (!Number.isNaN(parsed.getTime())) {
          date = parsed.toLocaleDateString('th-TH', {
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
          });
        }
      } else {
        date = `${day}/${month}/${year}`;
      }
    }

    const time = String(item?.DTime || '').trim();
    if (time) date = `${date} ${time}`;

    return {
      date,
      timestamp,
      buyingRate: parseFloat(String(item?.BuyingRates || '').trim()) || null,
      sellingRate: parseFloat(String(item?.SellingRates || '').trim()) || null,
    };
  }).filter((item) => item.date);
}

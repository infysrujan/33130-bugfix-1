import { pad2 } from './date-helpers.js';
import { fetchGet } from '../../../scripts/utils/fetchApi.js';

function replaceTemplateTokens(url, values) {
  let output = url;
  Object.entries(values).forEach(([key, value]) => {
    output = output.split(`{{${key}}}`).join(String(value));
  });
  return output;
}

function resolveUrls(configs, isGov) {
  if (isGov) {
    return {
      lastUpdate: configs?.dynamicBoardCorpBondGetLastUpdate || '',
      latestRates: configs?.dynamicBoardCorpBondGetLatestRates || '',
      dayInMonth: configs?.dynamicBoardCorpBondGetDayInMonth || '',
      updateInDay: configs?.dynamicBoardCorpBondGetUpdateInDay || '',
      ratesByDate: configs?.dynamicBoardCorpBondGetRatesByDate || '',
      filterLess1: configs?.dynamicBoardCorpBondGetRatesFilterLess1 || '',
      filter1to5: configs?.dynamicBoardCorpBondGetRatesFilterOneToFive || '',
      filter6to10: configs?.dynamicBoardCorpBondGetRatesFilterSixToTen || '',
      filterMore10: configs?.dynamicBoardCorpBondGetRatesFilterMore10 || '',
      filterRange: configs?.dynamicBoardCorpBondGetRatesDateRange || '',
    };
  }
  return {
    lastUpdate: configs?.dynamicBoardBondRatesGetLastUpdate || '',
    latestRates: configs?.dynamicBoardBondRatesGetLatestRates || '',
    dayInMonth: configs?.dynamicBoardBondRatesGetDayInMonth || '',
    updateInDay: configs?.dynamicBoardBondRatesGetUpdateInDay || '',
    ratesByDate: configs?.dynamicBoardBondRatesGetRatesByDate || '',
    filterLess1: configs?.dynamicBoardBondRatesGetFilterLess1 || '',
    filter1to5: configs?.dynamicBoardBondRatesGetFilterOneToFive || '',
    filter6to10: configs?.dynamicBoardBondRatesGetFilterSixToTen || '',
    filterMore10: configs?.dynamicBoardBondRatesGetFilterMore10 || '',
    filterRange: configs?.dynamicBoardBondRatesGetDateRange || '',
  };
}

export default function createApiService(configs, boardType) {
  const isGov = typeof boardType === 'string' && boardType.toLowerCase().includes('government');
  const urls = resolveUrls(configs, isGov);

  const filterTemplates = {
    less1: urls.filterLess1,
    '1to5': urls.filter1to5,
    '6to10': urls.filter6to10,
    more10: urls.filterMore10,
    '-': urls.filterRange,
  };

  return {
    getLastUpdate: () => {
      if (!urls.lastUpdate) return Promise.resolve(null);
      return fetchGet(urls.lastUpdate);
    },
    getLatestRates: () => {
      if (!urls.latestRates) return Promise.resolve(null);
      return fetchGet(urls.latestRates);
    },
    getDayInMonth: (date) => {
      if (!urls.dayInMonth) return Promise.resolve([]);
      const url = replaceTemplateTokens(urls.dayInMonth, {
        YEAR: date.getFullYear(),
        MONTH: date.getMonth() + 1,
      });
      return fetchGet(url);
    },
    getUpdatesInDay: (date) => {
      if (!urls.updateInDay) return Promise.resolve([]);
      const url = replaceTemplateTokens(urls.updateInDay, {
        DATE: pad2(date.getDate()),
        MONTH: pad2(date.getMonth() + 1),
        YEAR: date.getFullYear(),
      });
      return fetchGet(url);
    },
    getRatesByDate: (date, update) => {
      if (!urls.ratesByDate) return Promise.resolve([]);
      const url = replaceTemplateTokens(urls.ratesByDate, {
        DATE: pad2(date.getDate()),
        MONTH: pad2(date.getMonth() + 1),
        YEAR: date.getFullYear(),
        UPDATE: update,
      });
      return fetchGet(url);
    },
    getRatesByDateWithFilter: (date, update, maturity, fromDate, toDate) => {
      const template = filterTemplates[maturity] || '';
      if (!template) return Promise.resolve([]);
      const url = replaceTemplateTokens(template, {
        DATE: pad2(date.getDate()),
        MONTH: pad2(date.getMonth() + 1),
        YEAR: date.getFullYear(),
        UPDATE: update,
        FROM: fromDate,
        TO: toDate,
      });
      return fetchGet(url);
    },
  };
}

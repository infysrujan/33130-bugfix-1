/*
 * BWealth Series — port ของ SavingToolsV2 (React) มาเป็น vanilla EDS block
 *
 * ต้นทาง: sitecore/SitecoreSolution/src/Feature/FincalReact/code/src/pages/SavingToolsV2
 *   SavingTools.tsx, components/*, Graph/SavingToolsGraph.tsx, utils/*
 *
 * โครงไฟล์ล้อ blocks/saving-plan/ ซึ่งเป็น port ของเครื่องคำนวณตัวก่อนหน้า
 * ส่วนที่ต่างจาก saving-plan:
 *   - ฟิลด์เหลือ 3 ตัว (เป้าหมาย / จำนวนเงิน / ระยะเวลา) + dropdown ผลตอบแทน + checkbox เงินเฟ้อ
 *   - เป้าหมาย "อื่น ๆ" สลับ dropdown เป็น text input ให้พิมพ์เอง
 *   - ผลตอบแทนเป็น dropdown (ผูกกับระดับความเสี่ยง) ไม่ใช่ตัวเลขอิสระ
 *   - มีส่วนกองทุนแนะนำ + modal รายละเอียดกองทุน ซึ่ง saving-plan ไม่มี
 *   - ไม่มี slider ปรับแผน (ฝั่ง React comment ทิ้งไว้ ยังไม่ได้ใช้งานจริง)
 *
 * ข้อมูลกองทุน/label/endpoint อ่านจาก /configs.json -> /bwealth-series-config.json
 * โดย fund datasource อยู่ใน sheet fund_map, fund_data_en, fund_data_th
 */

import { loadScript } from '../../scripts/aem.js';
import { getLang } from '../../scripts/bbl-decorators.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchJson } from '../../scripts/utils/card-helpers.js';
import { fetchPost } from '../../scripts/utils/fetchApi.js';
import {
  loadChartJs, renderChart, destroyChart, buildChartLegend,
} from './bwealth-series-chart.js';

const DOMPURIFY_SRC = `${window.hlx.codeBasePath}/scripts/dompurify.min.js`;
const DEFAULT_CONFIG_PATH = '/bwealth-series-config.json';

// HARDCODE: ปกติมาจาก Sitecore Content-Provider (VITE_INFLATION_API_*)
const FALLBACK_INFLATION_RATE = 2.5;

const FALLBACK_RETURN_RATES = [2, 3, 4, 5, 6, 7];
const FIELD_DIGIT_CAP = { desiredSavingAmount: 9, yearsToSave: 2 };
const VALIDATION_RULES = {
  desiredSavingAmount: { min: 10000, max: 999999999 },
  yearsToSave: { min: 1, max: 30 },
};

let domPurifyReady = null;
let qrCodeReady = null;

/* ------------------------------------------------------------------ helpers */

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

function parseNumber(value) {
  if (typeof value !== 'string') return Number(value) || 0;
  const cleaned = value.replace(/,/g, '').trim();
  if (cleaned === '') return 0;
  return Number(cleaned) || 0;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v),
    template || '',
  );
}

function toBlockConfigKey(key) {
  return key.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase());
}

async function fetchBlockConfig() {
  const siteConfig = await fetchConfigs();
  const configPath = siteConfig.bwealthSeriesConfigPath || DEFAULT_CONFIG_PATH;
  const json = await fetchJson(configPath);
  const cfg = {};
  const configRows = json?.['bwealth-series-config']?.data || json?.saving_tool_config?.data || [];
  configRows.forEach(({ Key, Value }) => {
    if (Key) cfg[toBlockConfigKey(Key)] = Value;
  });
  return {
    calcUrl: cfg.bwealthSeriesCalculatorUrl || '',
    apimKey: cfg.bwealthSeriesApimKey || '',
    fragmentPath: cfg.bwealthSeriesFragmentPath || '',
    raw: json,
  };
}

function rowsToObject(rows) {
  const data = {};
  (rows || []).forEach(({ Key, Value }) => {
    if (Key) data[Key] = Value;
  });
  return data;
}

function getValue(data, key, fallback = '') {
  return data[key] ?? fallback;
}

function extractIndexedItems(data, prefix) {
  const ids = [...new Set(
    Object.keys(data)
      .filter((key) => key.startsWith(`${prefix}-`))
      .map((key) => key.slice(prefix.length + 1).split('-')[0]),
  )];

  return ids
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .map((id, index) => ({
      id: String(index + 1),
      value: getValue(data, `${prefix}-${id}-value`),
      label: getValue(data, `${prefix}-${id}-label`),
      category: getValue(data, `${prefix}-${id}-category`),
      imageUrl: getValue(data, `${prefix}-${id}-imageUrl`),
      title: getValue(data, `${prefix}-${id}-title`),
      backgroundColor: getValue(data, `${prefix}-${id}-backgroundColor`),
      description: getValue(data, `${prefix}-${id}-description`),
      link: getValue(data, `${prefix}-${id}-link`),
    }));
}

function buildTextsFromConfig(json, lang) {
  const L = rowsToObject(json?.[lang]?.data);
  const C = rowsToObject(json?.common?.data);

  const savingGoals = extractIndexedItems(L, 'savingGoals')
    .map(({ id, value, label }) => ({ id, value, label }))
    .filter((item) => item.value || item.label);

  const cards = extractIndexedItems(L, 'cards')
    .map(({
      id, category, imageUrl, title, backgroundColor, description, link,
    }) => ({
      id, category, imageUrl, title, backgroundColor, description, link,
    }))
    .filter((item) => item.category || item.title || item.imageUrl || item.link);

  return {
    common: {
      title: getValue(L, 'common-title'),
      subtitle: getValue(L, 'common-subtitle', getValue(L, 'common-Subtitle')),
      calculateButton: getValue(L, 'common-calculateButton'),
      unit: getValue(L, 'common-unit'),
      yearUnit: getValue(L, 'common-yearUnit'),
      percentUnit: getValue(L, 'common-percentUnit'),
      backButton: getValue(L, 'common-backButton'),
      nextButton: getValue(L, 'common-nextButton'),
      noteText: getValue(L, 'common-noteText'),
      noteincreasedSavingMonthly: getValue(L, 'common-noteincreasedSavingMonthly'),
      noterecommendSavingMonthly: getValue(L, 'common-noterecommendSavingMonthly'),
      step1Title: getValue(L, 'common-step1Title'),
      step2Title: getValue(L, 'common-step2Title'),
      rightCardTitle: getValue(L, 'common-rightCardTitle'),
      loadingCardData: getValue(L, 'common-loadingCardData'),
      learnMore: getValue(L, 'common-learnMore'),
      toHaveMoney: getValue(L, 'common-toHaveMoney'),
      clearButton: getValue(L, 'common-clearButton'),
      calculateButtonText: getValue(L, 'common-calculateButtonText'),
      resultsTitle: getValue(L, 'common-resultsTitle'),
      loadingCalculationResults: getValue(L, 'common-loadingCalculationResults'),
      additionalCalculationResultsTitle: getValue(L, 'common-additionalCalculationResultsTitle'),
      loadingTexts: getValue(L, 'common-loadingTexts'),
      allCategory: getValue(L, 'common-allCategory'),
      recommendedFundsTitle: getValue(L, 'common-recommendedFundsTitle'),
      recommendedFundsSubtitle: getValue(L, 'common-recommendedFundsSubtitle'),
      oneTimeInvestmentLabel: getValue(L, 'common-oneTimeInvestmentLabel'),
      factSheetLabel: getValue(L, 'common-factSheetLabel'),
      viewDetailsLabel: getValue(L, 'common-viewDetailsLabel'),
      adjustCalculationTitle: getValue(L, 'common-adjustCalculationTitle'),
      newCalculationResultsTitle: getValue(L, 'common-newCalculationResultsTitle'),
      sliderTooltip: getValue(L, 'common-sliderTooltip'),
    },
    validation: {
      minValueError: getValue(L, 'validation-minValueError'),
      maxValueError: getValue(L, 'validation-maxValueError'),
      percentageError: getValue(L, 'validation-percentageError'),
      requiredField: getValue(L, 'validation-requiredField'),
      minYearsToSave: getValue(L, 'validation-minYearsToSave'),
      maxYearsToSave: getValue(L, 'validation-maxYearsToSave'),
      minDesiredSavingAmount: getValue(L, 'validation-minDesiredSavingAmount'),
      maxDesiredSavingAmount: getValue(L, 'validation-maxDesiredSavingAmount'),
      annualSavingIncreaseRateError: getValue(L, 'validation-annualSavingIncreaseRateError'),
    },
    inputs: {
      savingGoal: getValue(L, 'inputs-savingGoal'),
      desiredSavingAmount: getValue(L, 'inputs-desiredSavingAmount'),
      yearsToSave: getValue(L, 'inputs-yearsToSave'),
      savedAmount: getValue(L, 'inputs-savedAmount'),
      expectedReturnRate: getValue(L, 'inputs-expectedReturnRate'),
      annualSavingIncreaseRate: getValue(L, 'inputs-annualSavingIncreaseRate'),
    },
    results: {
      futureValue: getValue(L, 'results-futureValue'),
      savingMonth: getValue(L, 'results-savingMonth'),
      recommendSavingMonthly: getValue(L, 'results-recommendSavingMonthly'),
      increasedSavingMonthly: getValue(L, 'results-increasedSavingMonthly'),
      noSavingRequired: getValue(L, 'results-noSavingRequired'),
      graph: {
        originalFutureValue: getValue(L, 'results-graph-originalFutureValue'),
        originalMonthlySavings: getValue(L, 'results-graph-originalMonthlySavings'),
        newFutureValue: getValue(L, 'results-graph-newFutureValue'),
        newMonthlySavings: getValue(L, 'results-graph-newMonthlySavings'),
        monthPrefix: getValue(L, 'results-graph-monthPrefix'),
        yearPrefix: getValue(L, 'results-graph-yearPrefix'),
        legendTitle: getValue(L, 'results-graph-legendTitle'),
        originalCalculationLabel: getValue(L, 'results-graph-originalCalculationLabel'),
        newCalculationLabel: getValue(L, 'results-graph-newCalculationLabel'),
        monthlySavingLabel: getValue(L, 'results-graph-monthlySavingLabel'),
        savingGoalLabel: getValue(L, 'results-graph-savingGoalLabel'),
        savingIncreasedSteppedLabel: getValue(L, 'results-graph-savingIncreasedSteppedLabel'),
        constantSavingLabel: getValue(L, 'results-graph-constantSavingLabel'),
        yAxisLabel: getValue(L, 'results-graph-yAxisLabel'),
        xAxisLabel: getValue(L, 'results-graph-xAxisLabel'),
      },
    },
    cards,
    savingGoals,
    defaultFormValues: {
      savingGoal: getValue(C, 'defaultFormValues-savingGoal'),
      desiredSavingAmount: Number(getValue(C, 'defaultFormValues-desiredSavingAmount')) || 500000,
      yearsToSave: Number(getValue(C, 'defaultFormValues-yearsToSave')) || 5,
      savedAmount: Number(getValue(C, 'defaultFormValues-savedAmount')) || 0,
      expectedReturnRate: Number(getValue(C, 'defaultFormValues-expectedReturnRate')) || 0.5,
      annualSavingIncreaseRate: Number(getValue(C, 'defaultFormValues-annualSavingIncreaseRate')) || 0,
      inflationRate: Number(getValue(C, 'defaultFormValues-inflationRate')) || FALLBACK_INFLATION_RATE,
    },
  };
}

function hasConfigTexts(json, lang) {
  return Array.isArray(json?.[lang]?.data) && json[lang].data.length > 0;
}

function extractKeyedMap(data, prefix) {
  return Object.keys(data)
    .filter((key) => key.startsWith(`${prefix}-`))
    .reduce((acc, key) => {
      const id = key.slice(prefix.length + 1);
      acc[id] = getValue(data, key);
      return acc;
    }, {});
}

function extractFundMap(data) {
  return Object.keys(data)
    .filter((key) => key.startsWith('fundMap-'))
    .reduce((acc, key) => {
      const rate = key.slice('fundMap-'.length);
      acc[rate] = String(getValue(data, key))
        .split('|')
        .map((code) => code.trim())
        .filter(Boolean);
      return acc;
    }, {});
}

function ensureFundDraft(drafts, code) {
  if (!drafts.has(code)) {
    drafts.set(code, {
      itemName: code,
      fundDetails: {},
      detailDrafts: {},
      componentDrafts: {},
      components: [],
    });
  }
  return drafts.get(code);
}

function extractFundDataRows(data) {
  const drafts = new Map();

  Object.keys(data)
    .filter((key) => key.startsWith('fund-'))
    .forEach((key) => {
      const value = getValue(data, key);
      const fieldMatch = key.match(/^fund-(.+)-(fundName|fundCode|imageUrl|factSheetUrl|fixLink|deepLink|infographic|header|remark)$/);
      const detailMatch = key.match(/^fund-(.+)-detail-(\d+)-(label|value)$/);
      const componentMatch = key.match(/^fund-(.+)-component-(\d+)-(teaserImage|teaserTitle|teaserDescription)$/);

      if (fieldMatch) {
        const [, code, field] = fieldMatch;
        const fund = ensureFundDraft(drafts, code);
        if (field === 'fundCode') fund.itemName = value || code;
        else if (field === 'fixLink') fund.FixLinkX = value;
        else fund[field] = value;
        return;
      }

      if (detailMatch) {
        const [, code, index, field] = detailMatch;
        const fund = ensureFundDraft(drafts, code);
        fund.detailDrafts[index] = fund.detailDrafts[index] || {};
        fund.detailDrafts[index][field] = value;
        return;
      }

      if (componentMatch) {
        const [, code, index, field] = componentMatch;
        const fund = ensureFundDraft(drafts, code);
        fund.componentDrafts[index] = fund.componentDrafts[index] || {};
        fund.componentDrafts[index][field] = value;
      }
    });

  return [...drafts.values()].map((fund) => {
    Object.keys(fund.detailDrafts)
      .sort((a, b) => Number(a) - Number(b))
      .forEach((index) => {
        const detail = fund.detailDrafts[index];
        if (detail.label) fund.fundDetails[detail.label] = detail.value || '';
      });

    fund.components = Object.keys(fund.componentDrafts)
      .sort((a, b) => Number(a) - Number(b))
      .map((index) => fund.componentDrafts[index])
      .filter((component) => (
        component.teaserImage || component.teaserTitle || component.teaserDescription
      ));

    delete fund.detailDrafts;
    delete fund.componentDrafts;
    return fund;
  });
}

function buildFundJsonFromConfig(json, lang) {
  const fundSheetName = `fund_data_${lang}`;
  const fundRows = json?.[fundSheetName]?.data;
  const mapRows = json?.fund_map?.data;

  if (!Array.isArray(fundRows) || fundRows.length === 0) {
    throw new Error(`ไม่พบ sheet "${fundSheetName}" หรือไม่มีข้อมูล`);
  }

  if (!Array.isArray(mapRows) || mapRows.length === 0) {
    throw new Error('ไม่พบ sheet "fund_map" หรือไม่มีข้อมูล');
  }

  const fundData = rowsToObject(fundRows);
  const mapData = rowsToObject(mapRows);

  return {
    fundMap: extractFundMap(mapData),
    Header: getValue(fundData, 'header'),
    Subtitle: getValue(fundData, 'subtitle'),
    Remark: getValue(fundData, 'remark'),
    RemarkMain: getValue(fundData, 'remarkMain'),
    RemarkSuggest: getValue(fundData, 'remarkSuggest'),
    deepLinkX: getValue(fundData, 'deepLinkTemplate'),
    expectedReturn: extractKeyedMap(fundData, 'expectedReturn'),
    modalLabels: extractKeyedMap(fundData, 'modalLabels'),
    funds: extractFundDataRows(fundData),
  };
}

async function ensureDomPurify() {
  if (window.DOMPurify) return;
  if (!domPurifyReady) domPurifyReady = loadScript(DOMPURIFY_SRC);
  await domPurifyReady;
}

/*
 * ตัวเข้ารหัส QR — vendor ไว้ที่ scripts/vendor/ แนวเดียวกับ chart.umd.js
 * ต้นฉบับใช้ qrcode.react ซึ่งผูกกับ React ใช้ตรง ๆ ไม่ได้
 * qrcode-generator เป็น MIT ไม่มี dependency และให้ผลลัพธ์ชุดเดียวกัน
 */
async function loadQrCode() {
  if (!qrCodeReady) {
    qrCodeReady = import(`${window.hlx.codeBasePath}/scripts/vendor/qrcode.mjs`)
      .then((mod) => mod.default)
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[bwealth-series] โหลดตัวสร้าง QR ไม่สำเร็จ', e);
        return null;
      });
  }
  return qrCodeReady;
}

/* เทียบเท่า <QRCodeSVG value size=204 level="M" includeMargin={false} /> ของต้นฉบับ */
async function renderQrCode(host, value) {
  if (!host || !value) return;
  const qrcode = await loadQrCode();
  if (!qrcode) return;
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  host.innerHTML = qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}

function sanitize(html) {
  if (!html) return '';
  if (window.DOMPurify) {
    return window.DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'class', 'style'] });
  }
  // ไม่มี DOMPurify ก็ไม่ปล่อย HTML ดิบออกไป
  return escapeHtml(html);
}

/* ------------------------------------------------ ported from SavingTools.tsx */

function normalizeExternalUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getStringValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

// ใช้เฉพาะกับ field ที่เป็นรูป/ไฟล์ ไม่แตะ deepLink ที่เป็น URL เต็มอยู่แล้ว
function mediaUrl(url) {
  return normalizeExternalUrl(url);
}

function parseInflationRate(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/%$/, '').replace(',', '.').trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// ค่าจาก Sitecore มาได้ทั้ง 0.025 และ 2.5 — ให้ออกมาเป็นเปอร์เซ็นต์เสมอ
function normalizeInflationPercentRate(value) {
  const parsed = parseInflationRate(value);
  if (parsed === undefined) return undefined;
  return Math.abs(parsed) < 1 ? parsed * 100 : parsed;
}

function getReturnRateKeys(values) {
  const keys = values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  return [...new Set(keys)].sort((a, b) => a - b);
}

// เลือก rate ที่ใช้ได้จริงจากค่าที่ผู้ใช้เลือก — ถ้าไม่ตรงพอดีเอาตัวที่ >= ค่านั้น
function resolveExpectedReturnRate(value, availableRates) {
  const rates = availableRates.length ? availableRates : FALLBACK_RETURN_RATES;
  const first = rates[0];
  const normalized = Number.isFinite(value) ? value : first;
  const exact = rates.find((rate) => rate === normalized);
  if (exact) return exact;
  return rates.find((rate) => normalized <= rate) || rates[rates.length - 1] || first;
}

function mapFundDetails(details) {
  if (!details) return [];
  return Object.entries(details)
    .map(([label, value]) => ({
      label: label.replace(/_/g, ' ').trim(),
      value: (value || '').trim() || '-',
    }))
    .filter((detail) => detail.label);
}

function mapTeaserComponents(components, rate) {
  if (!Array.isArray(components)) return [];
  return components
    .map((component, index) => {
      if (!component || typeof component !== 'object') return null;
      const teaserTitle = getStringValue(component.teaserTitle);
      const teaserDescription = getStringValue(component.teaserDescription);
      const teaserImage = mediaUrl(getStringValue(component.teaserImage));
      if (!teaserTitle && !teaserDescription && !teaserImage) return null;
      return {
        id: getStringValue(component.itemId) || getStringValue(component.itemName) || `${rate}-teaser-${index}`,
        teaserTitle,
        teaserDescription,
        teaserImage,
      };
    })
    .filter(Boolean);
}

function mapFundItemToRecommendedFund(fund, rate, index) {
  return {
    id: `${rate}-${fund.itemName || 'fund'}-${index}`,
    title: (fund.fundName || '').trim() || fund.itemName || '-',
    code: fund.itemName ? `(${fund.itemName})` : '-',
    details: mapFundDetails(fund.fundDetails),
    // fallback '/images/Home-DT.svg' ตรงตามต้นฉบับ
    imageUrl: mediaUrl(fund.imageUrl) || mediaUrl('/images/Home-DT.svg'),
    factSheetUrl: mediaUrl(fund.factSheetUrl),
    deepLink: normalizeExternalUrl(fund.deepLink),
    fixedLink: normalizeExternalUrl(fund.fixedLink || fund.FixLinkX),
    infographic: mediaUrl(fund.infographic),
    remark: (fund.remark || '').trim(),
    header: (fund.header || '').trim(),
    components: mapTeaserComponents(fund.components, rate),
  };
}

/* แปลง fundData ดิบให้เป็นรูปที่ใช้ render — ตรงกับ getFundDataFromScript */
function parseFundData(parsed) {
  const fundByCode = new Map((parsed.funds || []).map((fund) => [fund.itemName, fund]));
  const rates = getReturnRateKeys([
    ...Object.keys(parsed.expectedReturn || {}),
    ...Object.keys(parsed.fundMap || {}),
  ]);

  const fundsByRate = rates.reduce((acc, rate) => {
    const codes = (parsed.fundMap || {})[String(rate)] || [];
    acc[rate] = codes
      .map((code) => fundByCode.get(code))
      .filter(Boolean)
      .map((fund, index) => mapFundItemToRecommendedFund(fund, rate, index));
    return acc;
  }, {});

  const rawLabel = parsed.modalLabel ?? parsed.modalLabels ?? {};
  const modalLabel = Array.isArray(rawLabel) ? rawLabel[0] || {} : rawLabel;

  return {
    rates,
    fundsByRate,
    returnRateOptions: rates.map((rate) => ({
      value: String(rate),
      label: getStringValue((parsed.expectedReturn || {})[String(rate)]) || `${rate}%`,
    })),
    modalLabel,
    deepLink: normalizeExternalUrl(getStringValue(parsed.deepLinkX)),
    fixedLink: normalizeExternalUrl(getStringValue(parsed.FixLinkX)),
    header: getStringValue(parsed.Header),
    subtitle: getStringValue(parsed.Subtitle),
    remark: getStringValue(parsed.Remark ?? parsed.remark),
    remarkMain: getStringValue(parsed.RemarkMain ?? parsed.remarkMain),
    remarkSuggest: getStringValue(parsed.RemarkSuggest ?? parsed.remarkSuggest),
    inflationRate: normalizeInflationPercentRate(parsed.Inflation ?? parsed.inflation),
  };
}

/* --------------------------------------------------------- tracking / links */

function getLinkTrackingParams() {
  const params = new URLSearchParams(window.location.search);
  const get = (key) => (params.get(key) || '').trim() || undefined;
  return {
    utmSource: get('utm_source'),
    utmMedium: get('utm_medium'),
    utmCampaign: get('utm_campaign'),
  };
}

function appendTrackingParamsToLink(url, tracking, defaultPid) {
  const normalizedUrl = String(url).replace(/\s*&\s*/g, '&').trim();
  if (!normalizedUrl) return '';
  const { utmSource, utmMedium, utmCampaign } = tracking;
  if (!utmSource && !utmMedium && !utmCampaign) return normalizedUrl;

  try {
    const parsed = new URL(normalizedUrl, window.location.origin);
    const originalPid = (parsed.searchParams.get('pid') || '').trim();
    const pidBase = originalPid || defaultPid;
    const trackedPid = utmSource && pidBase ? `${pidBase}_${utmSource}` : originalPid;

    parsed.searchParams.delete('pid');
    parsed.searchParams.delete('af_channel');
    parsed.searchParams.delete('c');
    if (trackedPid) parsed.searchParams.append('pid', trackedPid);
    if (utmMedium) parsed.searchParams.append('af_channel', utmMedium);
    if (utmCampaign) parsed.searchParams.append('c', utmCampaign);

    if (/^[a-z][a-z\d+.-]*:/i.test(normalizedUrl)) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (e) {
    return normalizedUrl;
  }
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// deep_link_sub1 = CODE|DCA|จำนวนเงินต่อเดือน|เดือนเริ่ม|เดือนจบ
function buildFundDeepLinkSub1(fund, yearsToSave, monthlyAmount) {
  const years = Math.max(0, Math.round(yearsToSave || 0));
  const fundCode = fund.code.replace(/[()]/g, '').trim();
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const isDecember = month === 11;
  const fromMonth = (month + 1) % 12;
  const fromYear = year + (isDecember ? 1 : 0);
  const toYear = year + years + (isDecember ? 1 : 0);
  const from = `${MONTH_NAMES[fromMonth]}-${fromYear}`;
  const to = `${MONTH_NAMES[month]}-${toYear}`;
  return `${fundCode}|DCA|${Math.max(0, Math.round(monthlyAmount || 0))}|${from}|${to}`;
}

/* ------------------------------------------------------------- calculations */

function buildCalculationPayload(inputs, expectedReturnRate, inflationRate) {
  return {
    FutureSavingAmount: inputs.desiredSavingAmount,
    NYear: inputs.yearsToSave,
    FirstSavingAmount: 0,
    CompensationRate: expectedReturnRate / 100,
    SavingIncRate: 0,
    InflationRate: inputs.includeInflation && inflationRate !== undefined
      ? inflationRate / 100 : 0,
  };
}

/* กันไว้เวลา API ล่ม — สูตรเดียวกับ solveMonthly ของ saving-plan */
function getFallbackCalculation(payload) {
  const years = payload.NYear;
  const futureValue = payload.FutureSavingAmount * (1 + payload.InflationRate) ** years;
  const rm = payload.CompensationRate / 12;
  const months = years * 12;
  const fvAnnuity = rm === 0 ? months : ((1 + rm) ** months - 1) / rm;
  return {
    FutureValue: futureValue,
    SavingMonth: fvAnnuity === 0 ? 0 : futureValue / fvAnnuity,
    savingIncreasePerYear: 0,
  };
}

function normalizeCalculationResponse(payload, fallback) {
  const source = payload || {};
  const future = Number(source.FutureValue ?? source.futureValue ?? fallback.FutureValue);
  const monthly = Number(source.SavingMonth ?? source.savingMonth ?? fallback.SavingMonth);
  const increase = Number(source.savingIncreasePerYear ?? 0);
  return {
    FutureValue: Math.round(Number.isFinite(future) ? future : fallback.FutureValue),
    SavingMonth: Math.round(Number.isFinite(monthly) ? monthly : fallback.SavingMonth),
    savingIncreasePerYear: Number.isFinite(increase) ? increase : 0,
  };
}

async function fetchCalculation(payload, config) {
  const fallback = getFallbackCalculation(payload);
  if (!config?.calcUrl) {
    // eslint-disable-next-line no-console
    console.warn('[bwealth-series] calculator URL missing — ใช้ค่าที่คำนวณเองแทน');
    return fallback;
  }
  try {
    const json = await fetchPost(config.calcUrl, payload, {
      headers: { 'Ocp-Apim-Subscription-Key': config.apimKey },
      throwOnError: false,
    });
    if (!json) {
      // eslint-disable-next-line no-console
      console.warn('[bwealth-series] API error — ใช้ค่าที่คำนวณเองแทน');
      return fallback;
    }
    return normalizeCalculationResponse(json, fallback);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[bwealth-series] API fetch failed — ใช้ค่าที่คำนวณเองแทน:', e.message);
    return fallback;
  }
}

/* port ตรงจาก savingToolsApi.ts — ดอกเบี้ยของเดือนนี้ไปบวกต้นเดือนถัดไป */
function generateSavingGraphData(payload, monthlySaving) {
  const data = [];
  let accumulated = payload.FirstSavingAmount;
  let monthly = monthlySaving;
  const monthlyRate = payload.CompensationRate / 12;
  let interestNextMonth = 0;

  for (let month = 0; month < payload.NYear * 12; month += 1) {
    if (interestNextMonth > 0) {
      accumulated += interestNextMonth;
      interestNextMonth = 0;
    }
    if (month % 12 === 0 && month !== 0) {
      monthly *= (1 + payload.SavingIncRate);
    }
    accumulated += monthly;
    interestNextMonth = accumulated * monthlyRate;
    data.push({ month: month + 1, accumulatedValue: accumulated });
  }
  return data;
}

/* ------------------------------------------------------------------- markup */

const CHEVRON = '<span class="bwealth-series-chevron" aria-hidden="true"></span>';

const ICON_AMOUNT = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2.82609 23L5.56522 22H15.6087L22 18C21.5435 16 19.4435 15 17.8 16L14.6957 18H8.30435H13.6913C14.1478 18 14.513 17.5 14.4217 16.9L14.3304 16.7C14.0565 15.7 13.1435 14.9 12.2304 14.8L5.56522 14L1 16" stroke="#0064FF" stroke-width="2" stroke-miterlimit="10"/>
    <circle cx="12" cy="6" r="5" stroke="#0064FF" stroke-width="2" stroke-miterlimit="10"/>
  </svg>`;

const ICON_YEARS = `
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M22 4V22H2V4" stroke="#0064FF" stroke-width="2" stroke-miterlimit="10"/>
    <path d="M9 5H15" stroke="#0064FF" stroke-width="2" stroke-miterlimit="10"/>
    <path d="M18 1V10" stroke="#0064FF" stroke-width="2" stroke-miterlimit="10"/>
    <path d="M6 1V10" stroke="#0064FF" stroke-width="2" stroke-miterlimit="10"/>
  </svg>`;

function buildDropdown(name, label, options, placeholder) {
  const optionsMarkup = options
    .map((opt) => `
      <li class="bwealth-series-dropdown-option" role="option" data-value="${escapeHtml(opt.value)}" tabindex="-1">
        ${escapeHtml(opt.label)}
      </li>`)
    .join('');
  // โครงเดียวกับ buildDropdownField ของ saving-plan — ไม่มี label ลอยข้างบน
  // ตัว trigger แสดง placeholder เองจนกว่าจะเลือก
  return `
    <div class="bwealth-series-field bwealth-series-field-dropdown" data-field="${name}" data-value="">
      <button type="button" class="bwealth-series-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="bwealth-series-dropdown-current">${escapeHtml(placeholder || label)}</span>
        ${CHEVRON}
      </button>
      <ul class="bwealth-series-dropdown-panel" role="listbox" tabindex="-1">${optionsMarkup}</ul>
    </div>
  `;
}

/* โครงเดียวกับ buildField ของ saving-plan — label+icon ซ้าย, input ชิดขวา ในกรอบเดียว */
function buildNumberField(name, label, value, placeholder, icon) {
  const initial = value || value === 0 ? formatNumber(value) : '';
  return `
    <div class="bwealth-series-field" data-field="${name}">
      <div class="bwealth-series-field-row">
        <label class="bwealth-series-field-label" for="bws-${name}">
          <span class="bwealth-series-field-icon" aria-hidden="true">${icon}</span>
          <span class="bwealth-series-field-text">${escapeHtml(label)}</span>
        </label>
        <input
          id="bws-${name}"
          class="bwealth-series-field-input"
          type="text"
          inputmode="numeric"
          value="${initial}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="off"
        />
      </div>
    </div>
  `;
}

function buildShellMarkup(data) {
  const { texts, fundData, lang } = data;
  const { common, inputs, results } = texts;
  const defaults = texts.defaultFormValues || {};
  const customPlaceholder = lang === 'th' ? 'กรุณาระบุเป้าหมายการลงทุน' : 'Please specify';
  const returnPlaceholder = lang === 'th'
    ? 'ความเสี่ยงที่ยอมรับได้ และผลตอบแทนที่คาดหวังต่อปี'
    : 'Acceptable level of risk and expected annual return (%)';

  return `
    <div class="bwealth-series-section">
      <header class="bwealth-series-header">
        <h2 class="bwealth-series-header-title">${escapeHtml(common.title)}</h2>
        <span class="bwealth-series-header-divider" aria-hidden="true"></span>
        ${common.subtitle ? `<p class="bwealth-series-subtitle">${escapeHtml(common.subtitle)}</p>` : ''}
      </header>

      <div class="bwealth-series-calculator">
        <div class="bwealth-series-form">
          <h3 class="bwealth-series-form-title">${escapeHtml(common.step1Title)}</h3>
          <div class="bwealth-series-form-grid">
            ${buildDropdown('savingGoal', inputs.savingGoal, texts.savingGoals, inputs.savingGoal)}
            <div class="bwealth-series-field bwealth-series-custom-goal" data-field="customGoal" hidden>
              <div class="bwealth-series-field-row">
                <input type="text" class="bwealth-series-field-input" placeholder="${escapeHtml(customPlaceholder)}" autocomplete="off" />
                <button type="button" class="bwealth-series-custom-goal-clear" aria-label="Clear custom goal">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
            ${buildNumberField('desiredSavingAmount', inputs.desiredSavingAmount, defaults.desiredSavingAmount, `${formatNumber(10000)} - ${formatNumber(999999999)}`, ICON_AMOUNT)}
            ${buildNumberField('yearsToSave', inputs.yearsToSave, defaults.yearsToSave, `${formatNumber(1)} - ${formatNumber(30)}`, ICON_YEARS)}
            ${buildDropdown('expectedReturnRate', inputs.expectedReturnRate, fundData.returnRateOptions, returnPlaceholder)}
          </div>

          <div class="bwealth-series-inflation">
            <input type="checkbox" id="bws-include-inflation" class="bwealth-series-checkbox" />
            <label for="bws-include-inflation" data-inflation-label></label>
          </div>

          <div class="bwealth-series-actions">
            <button type="button" class="bwealth-series-btn bwealth-series-btn-secondary" data-action="clear" disabled>${escapeHtml(common.clearButton)}</button>
            <button type="button" class="bwealth-series-btn bwealth-series-btn-primary" data-action="calculate" disabled>${escapeHtml(common.calculateButtonText)}</button>
          </div>
        </div>

        <aside class="bwealth-series-result">
          <h3 class="bwealth-series-result-title">${escapeHtml(common.resultsTitle)}</h3>
          <div class="bwealth-series-result-card">
            <p class="bwealth-series-result-future" data-result="future"></p>
            <p class="bwealth-series-result-lead">${escapeHtml(results.recommendSavingMonthly)}</p>
            <p class="bwealth-series-result-monthly">
              <span class="bwealth-series-result-amount" data-result="monthly">0</span>
              <span class="bwealth-series-result-unit">${escapeHtml(common.unit)}</span>
            </p>
            <p class="bwealth-series-result-increase" data-result="increase" hidden></p>
          </div>
        </aside>
      </div>

      <section class="bwealth-series-results" hidden>
        <div class="bwealth-series-chart-wrap">
          ${buildChartLegend(results.graph, false)}
          <div class="bwealth-series-chart-canvas-wrap">
            <canvas class="bwealth-series-chart" aria-label="${escapeHtml(results.graph.yAxisLabel)}"></canvas>
          </div>
        </div>

        <div class="bwealth-series-remark" data-remark="main"></div>

        <div class="bwealth-series-funds">
          <div class="bwealth-series-header">
            <h2 class="bwealth-series-header-title">${escapeHtml(common.recommendedFundsTitle)}</h2>
            <span class="bwealth-series-header-divider" aria-hidden="true"></span>
            <p class="bwealth-series-subtitle">${escapeHtml(common.recommendedFundsSubtitle)}</p>
          </div>
          <div class="bwealth-series-funds-track"></div>
          <div class="bwealth-series-funds-dots" hidden></div>
        </div>

        <div class="bwealth-series-remark" data-remark="suggest"></div>
      </section>

      <!--
        RemarkMain แสดงเสมอ แต่ย้ายที่: ถ้ายังไม่มีผลลัพธ์อยู่ตรงนี้ (ใต้ฟอร์ม)
        พอคำนวณแล้วจะไปโผล่ใต้กราฟแทน ตรงตามต้นฉบับที่ render ไว้สองจุด
      -->
      <div class="bwealth-series-remark" data-remark="main-standalone"></div>

      <div class="bwealth-series-modal" hidden>
        <div class="bwealth-series-modal-backdrop" data-modal-close></div>
        <div class="bwealth-series-modal-dialog" role="dialog" aria-modal="true">
          <button type="button" class="bwealth-series-modal-close" data-modal-close aria-label="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
          <div class="bwealth-series-modal-body"></div>
        </div>
      </div>
    </div>
  `;
}

/* ----------------------------------------------------------- fund rendering */

function buildFundCard(fund, labels) {
  const detailRows = fund.details.map((detail) => `
    <div class="bwealth-series-fund-detail">
      <span class="bwealth-series-fund-detail-label" title="${escapeHtml(detail.label)}">${escapeHtml(detail.label)}</span>
      <span class="bwealth-series-fund-detail-value" title="${escapeHtml(detail.value)}">${escapeHtml(detail.value)}</span>
    </div>`).join('');

  const factSheetHref = fund.factSheetUrl || fund.deepLink || '';

  return `
    <article class="bwealth-series-fund" data-fund-id="${escapeHtml(fund.id)}">
      <div class="bwealth-series-fund-image">
        ${fund.imageUrl ? `<img src="${escapeHtml(fund.imageUrl)}" alt="${escapeHtml(fund.title)}" loading="lazy" />` : ''}
      </div>
      <div class="bwealth-series-fund-body">
        <div class="bwealth-series-fund-main">
          <div class="bwealth-series-fund-title-wrap">
            <h3 class="bwealth-series-fund-title" title="${escapeHtml(fund.title)}">${escapeHtml(fund.title)}</h3>
          </div>
          ${detailRows ? `<div class="bwealth-series-fund-details">${detailRows}</div>` : ''}
        </div>
        <div class="bwealth-series-fund-actions">
          <a class="bwealth-series-fund-factsheet${factSheetHref ? '' : ' is-disabled'}"
             href="${escapeHtml(factSheetHref || '#')}" target="_blank" rel="noopener noreferrer">
            <span>${escapeHtml(labels.factSheet)}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </a>
          <button type="button" class="bwealth-series-btn bwealth-series-btn-primary" data-action="fund-detail">
            ${escapeHtml(labels.viewDetails)}
          </button>
        </div>
      </div>
    </article>
  `;
}

function buildFundDetailMarkup(fund, labels, remarkHtml) {
  const highlights = fund.components.map((item) => `
    <div class="bwealth-series-highlight">
      ${item.teaserImage ? `<img src="${escapeHtml(item.teaserImage)}" alt="${escapeHtml(item.teaserTitle || '')}" loading="lazy" />` : ''}
      <h4>${escapeHtml(item.teaserTitle || '')}</h4>
      <span class="bwealth-series-highlight-rule"></span>
      <p>${escapeHtml(item.teaserDescription || '')}</p>
    </div>`).join('');

  return `
    <div class="bwealth-series-modal-detail">
      <h3 class="bwealth-series-modal-title">${escapeHtml(fund.title)}</h3>
      <h4 class="bwealth-series-modal-section-title">${escapeHtml(fund.header || labels.fundHighlights)}</h4>
      ${highlights ? `
        <div class="bwealth-series-highlights-scroll">
          <div class="bwealth-series-highlights-row">${highlights}</div>
        </div>
        <div class="bwealth-series-highlights-bar" aria-hidden="true"><span></span></div>` : ''}
      ${fund.infographic ? `<img class="bwealth-series-modal-infographic" src="${escapeHtml(fund.infographic)}" alt="" loading="lazy" />` : ''}
      ${remarkHtml ? `<div class="bwealth-series-modal-remark">${remarkHtml}</div>` : ''}
    </div>
    <div class="bwealth-series-modal-footer">
      <button type="button" class="bwealth-series-btn bwealth-series-btn-secondary" data-modal-close>${escapeHtml(labels.close)}</button>
      <button type="button" class="bwealth-series-btn bwealth-series-btn-primary" data-action="invest">${escapeHtml(labels.invest)}</button>
    </div>
  `;
}

const CHEVRON_DOWN = `
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

/*
 * ต้นฉบับ (useIsMobile 760px) สลับสองแบบนี้สดๆ เวลาเปลี่ยนขนาดจอ
 * เราจึง render ทั้งคู่ลงไปแล้วให้ CSS media query เป็นคนเลือก
 * จะได้สลับทันทีโดยไม่ต้องผูก resize listener หรือสร้าง markup ใหม่
 * < 47.5rem (760px) = ปุ่มคู่ / >= 47.5rem = QR
 */
function buildInvestButtons(labels, links) {
  return `
    <div class="bwealth-series-modal-invest-actions">
      <a class="bwealth-series-btn bwealth-series-btn-secondary${links.oneTime ? '' : ' is-disabled'}"
         href="${escapeHtml(links.oneTime || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(labels.oneTime)}</a>
      <a class="bwealth-series-btn bwealth-series-btn-primary${links.dca ? '' : ' is-disabled'}"
         href="${escapeHtml(links.dca || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(labels.dcaHeader)}</a>
    </div>
  `;
}

/* บน desktop เป็น QR ของ DCA แล้วมีปุ่มพับ/กาง QR ของการลงทุนรายครั้งอยู่ข้างล่าง */
function buildInvestQrCodes(labels, links) {
  return `
    <div class="bwealth-series-invest-qr">
      <h4 class="bwealth-series-invest-qr-title">${escapeHtml(labels.dcaHeader)}</h4>
      ${links.dca ? '<div class="bwealth-series-qr" data-qr="dca"></div>' : ''}
      <p class="bwealth-series-invest-or">${escapeHtml(labels.or)}</p>
      <div class="bwealth-series-onetime">
        <button
          type="button"
          class="bwealth-series-onetime-toggle"
          aria-expanded="false"
          ${links.oneTime ? '' : 'disabled'}
        >
          <span>${escapeHtml(labels.oneTime)}</span>
          ${CHEVRON_DOWN}
        </button>
        ${links.oneTime ? `
          <div class="bwealth-series-onetime-panel" hidden>
            <div class="bwealth-series-qr" data-qr="onetime"></div>
          </div>` : ''}
      </div>
    </div>
  `;
}

function buildInvestSummaryMarkup(fund, labels, summary, links) {
  const warningBody = labels.warningBody
    ? labels.warningBody.split('{0}').join(`${fund.title} `)
    : '';
  const monthlyText = summary.monthly > 0
    ? `${formatNumber(summary.monthly)} ${escapeHtml(labels.baht)}`
    : '--';

  return `
    <div class="bwealth-series-modal-summary">
      <h3 class="bwealth-series-modal-summary-title">${escapeHtml(labels.summaryTitle)}</h3>

      <div class="bwealth-series-modal-warning">
        <span class="bwealth-series-modal-warning-icon" aria-hidden="true">
          <svg width="35" height="35" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="#0064FF" stroke-width="2"/>
            <path d="M12 8h.01M11 12h1v5h1" stroke="#0064FF" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>
        <div>
          <p class="bwealth-series-modal-warning-title">${escapeHtml(labels.warningTitle)}</p>
          <p class="bwealth-series-modal-warning-body">${escapeHtml(warningBody)}</p>
        </div>
      </div>

      <div class="bwealth-series-modal-goal">
        <h4>${escapeHtml(labels.goalSummary)}</h4>
        <dl>
          <dt>${escapeHtml(labels.goalName)}</dt><dd>${escapeHtml(summary.goalName)}</dd>
          <dt>${escapeHtml(labels.targetAmount)}</dt><dd>${formatNumber(summary.futureValue)} ${escapeHtml(labels.baht)}</dd>
          <dt>${escapeHtml(labels.monthlyInvestment)}</dt><dd>${monthlyText}</dd>
          <dt>${escapeHtml(labels.investmentPeriod)}</dt><dd>${escapeHtml(String(summary.years))} ${escapeHtml(labels.years)}</dd>
        </dl>
      </div>

      ${buildInvestButtons(labels, links)}
      ${buildInvestQrCodes(labels, links)}
    </div>
  `;
}

/* ---------------------------------------------------------------- rendering */

function setText(root, selector, text) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function readInputs(root) {
  const goalWrap = root.querySelector('[data-field="savingGoal"]');
  const customWrap = root.querySelector('[data-field="customGoal"]');
  const isCustom = !customWrap.hasAttribute('hidden');
  return {
    savingGoal: isCustom
      ? (customWrap.querySelector('input').value || '').trim()
      : goalWrap.dataset.value || '',
    desiredSavingAmount: parseNumber(root.querySelector('[data-field="desiredSavingAmount"] input').value),
    yearsToSave: parseNumber(root.querySelector('[data-field="yearsToSave"] input').value),
    expectedReturnRate: Number(root.querySelector('[data-field="expectedReturnRate"]').dataset.value) || 0,
    includeInflation: root.querySelector('#bws-include-inflation').checked,
  };
}

function setFieldError(wrap, message) {
  if (!wrap) return;
  const input = wrap.querySelector('input');
  const existing = wrap.querySelector('.bwealth-series-field-error');
  if (message) {
    wrap.classList.add('has-error');
    if (input) input.setAttribute('aria-invalid', 'true');
    if (existing) {
      existing.textContent = message;
    } else {
      const span = document.createElement('span');
      span.className = 'bwealth-series-field-error';
      span.setAttribute('role', 'alert');
      span.textContent = message;
      wrap.appendChild(span);
    }
  } else {
    wrap.classList.remove('has-error');
    if (input) input.removeAttribute('aria-invalid');
    if (existing) existing.remove();
  }
}

function applyValidation(root, inputs, texts) {
  const { validation } = texts;
  let isValid = true;

  Object.entries(VALIDATION_RULES).forEach(([name, rule]) => {
    const value = inputs[name];
    let message = '';
    // ค่าว่าง (0) ยังไม่ถือว่าผิด — ปุ่มคำนวณจะถูกปิดจาก isFormComplete แทน
    if (Number.isFinite(value) && value !== 0) {
      if (value < rule.min) {
        message = fillTemplate(validation.minValueError, { min: formatNumber(rule.min) });
      } else if (value > rule.max) {
        message = fillTemplate(validation.maxValueError, { max: formatNumber(rule.max) });
      }
    }
    if (message) isValid = false;
    setFieldError(root.querySelector(`[data-field="${name}"]`), message);
  });

  return isValid;
}

function isFormComplete(inputs) {
  return !!inputs.savingGoal
    && inputs.desiredSavingAmount > 0
    && inputs.yearsToSave > 0
    && inputs.expectedReturnRate > 0;
}

/*
 * การ์ดผลลัพธ์เป็นสีน้ำเงินตลอดเหมือน saving-plan ไม่มี state สีเทา
 * ตอนยังไม่กดคำนวณให้ส่ง EMPTY_CALCULATION เข้ามาเพื่อโชว์เลข 0
 */
const EMPTY_CALCULATION = { FutureValue: 0, SavingMonth: 0, savingIncreasePerYear: 0 };

function renderResult(state, calculation) {
  const { root, texts } = state;
  const increaseEl = root.querySelector('[data-result="increase"]');
  const inputs = state.calculatedInputs || readInputs(root);

  const futureText = fillTemplate(texts.common.toHaveMoney, {
    money: `<strong>${escapeHtml(formatNumber(calculation.FutureValue))}</strong>`,
    unit: escapeHtml(texts.common.unit),
    years: `<strong>${escapeHtml(String(inputs.yearsToSave))}</strong>`,
  });
  const futureEl = root.querySelector('[data-result="future"]');
  if (futureEl) futureEl.innerHTML = futureText;

  setText(root, '[data-result="monthly"]', formatNumber(calculation.SavingMonth));

  if (calculation.savingIncreasePerYear > 0) {
    increaseEl.textContent = `${texts.results.increasedSavingMonthly} ${formatNumber(calculation.savingIncreasePerYear)} ${texts.common.percentUnit}`;
    increaseEl.hidden = false;
  } else {
    increaseEl.hidden = true;
  }
}

function renderFunds(state) {
  const { root, texts, fundData } = state;
  const track = root.querySelector('.bwealth-series-funds-track');
  const rate = resolveExpectedReturnRate(state.calculatedInputs.expectedReturnRate, fundData.rates);
  const funds = fundData.fundsByRate[rate] || [];
  state.visibleFunds = funds;

  const labels = {
    factSheet: texts.common.factSheetLabel,
    viewDetails: texts.common.viewDetailsLabel,
  };
  track.innerHTML = funds.map((fund) => buildFundCard(fund, labels)).join('');
  track.dataset.count = String(funds.length);

  // จำนวน dot ขึ้นกับตำแหน่งเลื่อนที่คำนวณได้ ต้องรอให้การ์ดวางเสร็จก่อน
  if (state.refreshFundsCarousel) state.refreshFundsCarousel();
}

function renderRemarks(state) {
  const { root, fundData } = state;
  const main = sanitize(fundData.remarkMain);
  root.querySelector('[data-remark="main"]').innerHTML = main;
  root.querySelector('[data-remark="main-standalone"]').innerHTML = main;
  root.querySelector('[data-remark="suggest"]').innerHTML = sanitize(fundData.remarkSuggest);
}

/* มีผลลัพธ์ = ใช้ตัวใต้กราฟ, ไม่มี = ใช้ตัวใต้ฟอร์ม จะได้ไม่ซ้ำกันสองอัน */
function setStandaloneRemarkVisible(state, visible) {
  state.root.querySelector('[data-remark="main-standalone"]').hidden = !visible;
}

function updateInflationLabel(state) {
  const { root, lang } = state;
  const label = root.querySelector('[data-inflation-label]');
  if (!label) return;
  const rate = state.inflationRate;
  const shown = rate === undefined ? '' : String(Number(rate.toFixed(4)));
  label.textContent = lang === 'th'
    ? `คำนวณเงินลงทุนที่ต้องการแบบรวมเงินเฟ้อ${shown ? ` ${shown}%` : ''}`
    : `Include inflation${shown ? ` rate of ${shown}% p.a.` : ''} in the calculation`;
}

/* ------------------------------------------------------------------- modals */

function getModalLabels(state) {
  const { fundData, texts, lang } = state;
  const label = fundData.modalLabel || {};
  const th = lang === 'th';
  const warningRaw = getStringValue(label.Warning);
  const warningTitle = warningRaw.includes('{0}') ? warningRaw.split('{0}')[0] : warningRaw;
  return {
    summaryTitle: getStringValue(label.Header1) || (th ? 'สรุปข้อมูลการลงทุนของคุณ' : 'Your investment summary'),
    warningTitle: warningTitle || (th ? 'คุณกำลังออกจากเว็บไซต์เพื่อไปลงทุน' : 'You are leaving this website'),
    warningBody: getStringValue(label.Warning_sub_1),
    goalSummary: getStringValue(label.Summary) || (th ? 'สรุปเป้าหมาย' : 'Goal summary'),
    goalName: getStringValue(label.GoalName) || (th ? 'ชื่อเป้าหมาย' : 'Goal name'),
    targetAmount: getStringValue(label.TargetAmount) || (th ? 'จำนวนเงินเป้าหมาย' : 'Target amount'),
    monthlyInvestment: getStringValue(label.MonthlyInvestment) || (th ? 'จำนวนเงินลงทุนต่อเดือน' : 'Monthly investment'),
    investmentPeriod: getStringValue(label.InvestmentPeriod) || (th ? 'ระยะเวลาลงทุน' : 'Investment period'),
    baht: getStringValue(label.baht) || (th ? 'บาท' : 'baht'),
    years: getStringValue(label.years) || (th ? 'ปี' : 'years'),
    dcaHeader: getStringValue(label.Header2) || (th ? 'ลงทุนต่อเนื่องแบบ DCA' : 'DCA investment'),
    or: getStringValue(label.Or) || getStringValue(label.or) || (th ? 'หรือ' : 'or'),
    oneTime: getStringValue(label.Seemore) || getStringValue(label.SeeMore)
      || texts.common.oneTimeInvestmentLabel || (th ? 'ลงทุนรายครั้ง' : 'One-time investment'),
    // หัวข้อส่วนจุดเด่น — ต้นฉบับใช้ fund.header ถ้าไม่มีค่อย fallback เป็นข้อความนี้
    fundHighlights: th ? 'จุดเด่นกองทุน' : 'Fund highlights',
    close: th ? 'ปิด' : 'Closed',
    invest: th ? 'คลิกเพื่อลงทุน' : 'Buy this fund',
  };
}

function buildFundLinks(state, fund) {
  const { fundData, tracking } = state;
  const monthly = Math.max(0, Math.round((state.calculation || {}).SavingMonth || 0));

  let dca = '';
  if (fundData.deepLink) {
    const sub1 = buildFundDeepLinkSub1(fund, state.calculatedInputs.yearsToSave, monthly);
    const template = fundData.deepLink.replace(/\s*&\s*/g, '&').trim();
    const resolved = template.includes('{0}') ? template.split('{0}').join(sub1) : template;
    dca = appendTrackingParamsToLink(resolved, tracking, 'pws_cal_mf');
  }

  const fixed = fund.fixedLink || fundData.fixedLink;
  const oneTime = fixed ? appendTrackingParamsToLink(fixed, tracking, 'All_Media') : '';

  return { dca, oneTime };
}

/*
 * แถวจุดเด่นกองทุนเลื่อนแนวนอนได้ด้วยการลาก และมี scrollbar ที่วาดเอง
 * โผล่ตอนเลื่อนแล้วจางหายใน 900ms — port จาก handleHighlights* ใน SavingTools.tsx
 * (ซ่อน scrollbar ของเบราว์เซอร์ไว้ใน CSS แล้ววาดแทน)
 */
function attachHighlightsScroll(state, body) {
  const scroller = body.querySelector('.bwealth-series-highlights-scroll');
  const bar = body.querySelector('.bwealth-series-highlights-bar');
  if (!scroller || !bar) return;
  const thumb = bar.querySelector('span');

  let dragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  const updateBar = () => {
    const { scrollLeft, scrollWidth, clientWidth } = scroller;
    if (scrollWidth <= clientWidth) {
      bar.classList.remove('is-visible');
      return;
    }
    // ความกว้าง thumb ตามสัดส่วนที่มองเห็น แต่ไม่ต่ำกว่า 12% เพื่อให้ยังจับได้
    const width = Math.max((clientWidth / scrollWidth) * 100, 12);
    const maxLeft = 100 - width;
    thumb.style.width = `${width}%`;
    thumb.style.marginLeft = `${(scrollLeft / (scrollWidth - clientWidth)) * maxLeft}%`;
  };

  const show = () => {
    updateBar();
    if (scroller.scrollWidth > scroller.clientWidth) bar.classList.add('is-visible');
  };

  const scheduleHide = () => {
    clearTimeout(state.highlightsHideTimer);
    state.highlightsHideTimer = setTimeout(() => bar.classList.remove('is-visible'), 900);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    scroller.classList.remove('is-dragging');
    scheduleHide();
  };

  scroller.addEventListener('scroll', () => {
    show();
    scheduleHide();
  }, { passive: true });

  scroller.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startScrollLeft = scroller.scrollLeft;
    scroller.classList.add('is-dragging');
    show();
  });

  scroller.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    scroller.scrollLeft = startScrollLeft - (e.clientX - startX);
    updateBar();
  });

  scroller.addEventListener('mouseup', endDrag);
  scroller.addEventListener('mouseleave', endDrag);

  updateBar();
}

function openModal(state, fund) {
  state.selectedFund = fund;
  const modal = state.root.querySelector('.bwealth-series-modal');
  const body = modal.querySelector('.bwealth-series-modal-body');
  body.innerHTML = buildFundDetailMarkup(
    fund,
    getModalLabels(state),
    sanitize(state.fundData.remark || fund.remark),
  );
  body.scrollTop = 0;
  modal.hidden = false;
  document.body.classList.add('bwealth-series-modal-open');
  attachHighlightsScroll(state, body);
}

/*
 * วาด QR หลังใส่ markup แล้ว และผูกปุ่มพับ/กาง QR ของการลงทุนรายครั้ง
 * ตัวรายครั้งวาดตอนกางครั้งแรกเท่านั้น จะได้ไม่เข้ารหัสทิ้งถ้าผู้ใช้ไม่กด
 */
function attachInvestQrCodes(body, links) {
  renderQrCode(body.querySelector('[data-qr="dca"]'), links.dca);

  const toggle = body.querySelector('.bwealth-series-onetime-toggle');
  const panel = body.querySelector('.bwealth-series-onetime-panel');
  if (!toggle || !panel) return;

  toggle.addEventListener('click', () => {
    const open = panel.hasAttribute('hidden');
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('is-open', open);
    const host = panel.querySelector('[data-qr="onetime"]');
    if (open && host && !host.childElementCount) renderQrCode(host, links.oneTime);
  });
}

function showInvestSummary(state) {
  const { selectedFund } = state;
  if (!selectedFund) return;
  const modal = state.root.querySelector('.bwealth-series-modal');
  const body = modal.querySelector('.bwealth-series-modal-body');
  const calculation = state.calculation || {};
  const summary = {
    goalName: state.calculatedInputs.savingGoal || '-',
    futureValue: Math.max(0, Math.round(calculation.FutureValue || 0)),
    monthly: Math.max(0, Math.round(calculation.SavingMonth || 0)),
    years: Math.max(0, Math.round(state.calculatedInputs.yearsToSave || 0)),
  };
  const links = buildFundLinks(state, selectedFund);
  body.innerHTML = buildInvestSummaryMarkup(
    selectedFund,
    getModalLabels(state),
    summary,
    links,
  );
  body.scrollTop = 0;
  attachInvestQrCodes(body, links);
}

function closeModal(state) {
  clearTimeout(state.highlightsHideTimer);
  state.root.querySelector('.bwealth-series-modal').hidden = true;
  state.selectedFund = null;
  document.body.classList.remove('bwealth-series-modal-open');
}

/* ------------------------------------------------------------------- resets */

function hideResults(state) {
  state.root.querySelector('.bwealth-series-results').hidden = true;
  setStandaloneRemarkVisible(state, true);
  destroyChart(state);
}

function resetForm(state, keepGoal) {
  const { root, texts } = state;
  const defaults = texts.defaultFormValues || {};
  const setVal = (name, value) => {
    const input = root.querySelector(`[data-field="${name}"] input`);
    if (input) input.value = value;
  };
  setVal('desiredSavingAmount', formatNumber(defaults.desiredSavingAmount));
  setVal('yearsToSave', formatNumber(defaults.yearsToSave));

  const rateWrap = root.querySelector('[data-field="expectedReturnRate"]');
  rateWrap.dataset.value = '';
  const rateCurrent = rateWrap.querySelector('.bwealth-series-dropdown-current');
  rateCurrent.textContent = state.returnRatePlaceholder;
  rateWrap.querySelectorAll('.bwealth-series-dropdown-option').forEach((opt) => opt.classList.remove('is-selected'));

  if (!keepGoal) {
    const goalWrap = root.querySelector('[data-field="savingGoal"]');
    goalWrap.dataset.value = '';
    const goalCurrent = goalWrap.querySelector('.bwealth-series-dropdown-current');
    goalCurrent.textContent = texts.inputs.savingGoal;
    goalWrap.querySelectorAll('.bwealth-series-dropdown-option').forEach((opt) => opt.classList.remove('is-selected'));
  }

  root.querySelectorAll('.bwealth-series-field-error').forEach((el) => el.remove());
  root.querySelectorAll('.has-error').forEach((el) => el.classList.remove('has-error'));

  state.calculatedInputs = null;
  state.calculation = null;
  renderResult(state, EMPTY_CALCULATION);
  hideResults(state);
}

function setCustomGoalMode(state, enabled) {
  const { root } = state;
  const goalWrap = root.querySelector('[data-field="savingGoal"]');
  const customWrap = root.querySelector('[data-field="customGoal"]');
  goalWrap.hidden = enabled;
  customWrap.hidden = !enabled;
  if (enabled) {
    const input = customWrap.querySelector('input');
    input.value = '';
    input.focus();
  }
}

/* ----------------------------------------------------------------- handlers */

function clampDigits(raw, cap) {
  if (cap === undefined) return raw;
  let digits = 0;
  return raw.split('').filter((ch) => {
    if (!/\d/.test(ch)) return false;
    digits += 1;
    return digits <= cap;
  }).join('');
}

function attachNumberField(state, name, onChange) {
  const wrap = state.root.querySelector(`[data-field="${name}"]`);
  const input = wrap.querySelector('input');
  const cap = FIELD_DIGIT_CAP[name];

  input.addEventListener('input', () => {
    // นับจากท้ายสตริงเพื่อคืนตำแหน่ง cursor หลังใส่ comma ใหม่
    const fromEnd = input.value.length - (input.selectionStart || 0);
    const digits = clampDigits(input.value, cap);
    input.value = digits === '' ? '' : formatNumber(parseNumber(digits));
    const pos = Math.max(0, input.value.length - fromEnd);
    input.setSelectionRange(pos, pos);
    onChange();
  });

  input.addEventListener('blur', () => {
    if (input.value.trim() === '') return;
    input.value = formatNumber(parseNumber(clampDigits(input.value, cap)));
    onChange();
  });
}

function attachDropdown(state, name, onSelect) {
  const wrap = state.root.querySelector(`[data-field="${name}"]`);
  const trigger = wrap.querySelector('.bwealth-series-dropdown-trigger');
  const panel = wrap.querySelector('.bwealth-series-dropdown-panel');
  const current = wrap.querySelector('.bwealth-series-dropdown-current');

  const close = () => {
    wrap.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = wrap.classList.toggle('is-open');
    trigger.setAttribute('aria-expanded', String(open));
  });

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.bwealth-series-dropdown-option');
    if (!option) return;
    wrap.dataset.value = option.dataset.value;
    current.textContent = option.textContent.trim();
    panel.querySelectorAll('.bwealth-series-dropdown-option').forEach((opt) => {
      opt.classList.toggle('is-selected', opt === option);
    });
    close();
    onSelect(option.dataset.value);
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });
}

function isOtherGoal(value) {
  const normalized = value.trim().toLowerCase();
  return normalized === 'other' || normalized.replace(/\s+/g, '') === 'อื่นๆ';
}

/* ค่าเดียวกับ recommendedFundsDesktopMinWidth / isRecommendedFundsNarrowViewport ในต้นฉบับ */
const FUNDS_DESKTOP_MIN_WIDTH = 1025;
const FUNDS_SINGLE_CARD_MAX_WIDTH = 430;

/*
 * คารูเซลกองทุนแนะนำ — port จาก getRecommendedFundScrollPositions
 * และ handleRecommendedFunds* ใน SavingTools.tsx
 *
 * ตำแหน่งหยุดของ dot คำนวณ 3 แบบตามความกว้างจอ:
 *   <=430px            หยุดที่ต้นการ์ดแต่ละใบ
 *   เห็นการ์ด <=1.5 ใบ  หยุดโดยจัดการ์ดไว้กลางจอ
 *   กว้างกว่านั้น       หยุดเป็นหน้า ๆ ตาม scrollWidth/clientWidth
 * >=1025px ไม่เลื่อนและไม่มี dot
 */
function attachFundsCarousel(state) {
  const track = state.root.querySelector('.bwealth-series-funds-track');
  const dots = state.root.querySelector('.bwealth-series-funds-dots');

  let positions = [];
  let scrollable = false;
  let dragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let autoScrolling = false;
  let autoScrollTimer = null;

  const isDesktop = () => window.innerWidth >= FUNDS_DESKTOP_MIN_WIDTH;
  const isSingleCard = () => window.innerWidth <= FUNDS_SINGLE_CARD_MAX_WIDTH;

  const getScrollPositions = () => {
    if (isDesktop()) return [];
    const cards = [...track.children];
    if (!cards.length) return [];

    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
    if (maxScrollLeft <= 1) return [];

    const clamp = (value) => Math.round(Math.min(maxScrollLeft, Math.max(0, value)));

    if (isSingleCard()) return cards.map((card) => clamp(card.offsetLeft));

    const firstCardWidth = cards[0].offsetWidth || 0;
    const visibleRatio = firstCardWidth > 0 ? track.clientWidth / firstCardWidth : 0;
    if (visibleRatio > 0 && visibleRatio <= 1.5) {
      const centered = cards
        .map((card) => clamp(card.offsetLeft - (track.clientWidth - card.offsetWidth) / 2));
      return centered.filter((position, i) => (
        i === 0 || Math.abs(position - centered[i - 1]) > 2
      ));
    }

    const pageCount = Math.ceil(track.scrollWidth / track.clientWidth);
    if (pageCount <= 1) return [];
    return Array.from({ length: pageCount }, (unused, i) => (
      Math.round((maxScrollLeft * i) / Math.max(1, pageCount - 1))
    ));
  };

  const setActive = (index) => {
    dots.querySelectorAll('.bwealth-series-dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === index);
    });
  };

  const updateActive = () => {
    if (isDesktop() || !positions.length) {
      setActive(0);
      return;
    }
    let closest = 0;
    let best = Number.POSITIVE_INFINITY;
    positions.forEach((position, i) => {
      const distance = Math.abs(position - track.scrollLeft);
      if (distance < best) {
        best = distance;
        closest = i;
      }
    });
    setActive(closest);
  };

  const refresh = () => {
    positions = getScrollPositions();
    if (isDesktop()) scrollable = false;
    else if (isSingleCard()) scrollable = state.visibleFunds.length > 1;
    else scrollable = track.scrollWidth > track.clientWidth + 1 && positions.length > 1;

    track.classList.toggle('is-scrollable', scrollable);

    // โหมดการ์ดเดียวใช้จำนวนการ์ดเป็น dot ตรงตามต้นฉบับ นอกนั้นใช้จำนวนตำแหน่งหยุด
    const count = isSingleCard() ? state.visibleFunds.length : positions.length;
    if (!scrollable || count <= 1) {
      dots.innerHTML = '';
      dots.hidden = true;
      return;
    }
    dots.innerHTML = Array.from({ length: count }, (unused, i) => (
      `<button type="button" class="bwealth-series-dot" data-dot="${i}" aria-label="${i + 1}"></button>`
    )).join('');
    dots.hidden = false;
    updateActive();
  };

  state.refreshFundsCarousel = refresh;

  track.addEventListener('scroll', () => {
    if (autoScrolling) return;
    updateActive();
  }, { passive: true });

  track.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || isDesktop() || !scrollable) return;
    e.preventDefault();
    autoScrolling = false;
    clearTimeout(autoScrollTimer);
    dragging = true;
    dragStartX = e.clientX;
    dragStartScrollLeft = track.scrollLeft;
    track.classList.add('is-dragging');
  });

  track.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    e.preventDefault();
    track.scrollLeft = dragStartScrollLeft - (e.clientX - dragStartX);
  });

  // ปล่อยเมาส์นอกกรอบก็ต้องหยุดลาก
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('is-dragging');
  };
  track.addEventListener('mouseleave', endDrag);
  window.addEventListener('mouseup', endDrag);

  window.addEventListener('resize', refresh);

  dots.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-dot]');
    if (!dot || isDesktop() || !scrollable) return;
    const targetLeft = positions[Number(dot.dataset.dot)];
    if (typeof targetLeft !== 'number') return;

    // กัน scroll handler มาแย่ง active ระหว่างเลื่อนแบบ smooth
    autoScrolling = true;
    clearTimeout(autoScrollTimer);
    track.scrollTo({ left: targetLeft, behavior: 'smooth' });
    setActive(Number(dot.dataset.dot));
    autoScrollTimer = setTimeout(() => { autoScrolling = false; }, 700);
  });

  track.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action="fund-detail"]');
    if (!button) return;
    const card = button.closest('.bwealth-series-fund');
    const fund = state.visibleFunds.find((f) => f.id === card.dataset.fundId);
    if (fund) openModal(state, fund);
  });
}

function attachModal(state) {
  const modal = state.root.querySelector('.bwealth-series-modal');

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]')) {
      closeModal(state);
      return;
    }
    if (e.target.closest('[data-action="invest"]')) showInvestSummary(state);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal(state);
  });
}

async function runCalculation(state) {
  const { root, texts } = state;
  const inputs = readInputs(root);
  if (!applyValidation(root, inputs, texts) || !isFormComplete(inputs)) return;

  const rate = resolveExpectedReturnRate(inputs.expectedReturnRate, state.fundData.rates);
  const payload = buildCalculationPayload(inputs, rate, state.inflationRate);
  const calculation = await fetchCalculation(payload, state.config);

  state.calculatedInputs = inputs;
  state.calculation = calculation;
  renderResult(state, calculation);

  if (calculation.SavingMonth <= 0) {
    hideResults(state);
    return;
  }

  root.querySelector('.bwealth-series-results').hidden = false;
  setStandaloneRemarkVisible(state, false);
  renderFunds(state);
  renderRemarks(state);

  await renderChart(state, {
    original: generateSavingGraphData(payload, calculation.SavingMonth),
    current: null,
    originalResult: calculation,
    currentResult: null,
    graphTexts: texts.results.graph,
    unit: texts.common.unit,
    yearsToSave: inputs.yearsToSave,
  });
}

function attachHandlers(state) {
  const { root, texts } = state;

  const refresh = () => {
    const inputs = readInputs(root);
    const valid = applyValidation(root, inputs, texts);
    root.querySelector('[data-action="calculate"]').disabled = !(valid && isFormComplete(inputs));
    root.querySelector('[data-action="clear"]').disabled = !inputs.savingGoal;
  };

  attachNumberField(state, 'desiredSavingAmount', refresh);
  attachNumberField(state, 'yearsToSave', refresh);

  attachDropdown(state, 'savingGoal', (value) => {
    // เลือก "อื่น ๆ" = สลับไปพิมพ์เอง และล้างค่าอื่นทั้งหมด
    if (isOtherGoal(value)) {
      setCustomGoalMode(state, true);
      resetForm(state, false);
    } else {
      resetForm(state, true);
    }
    refresh();
  });

  attachDropdown(state, 'expectedReturnRate', () => {
    hideResults(state);
    refresh();
  });

  const customWrap = root.querySelector('[data-field="customGoal"]');
  customWrap.querySelector('input').addEventListener('input', refresh);
  customWrap.querySelector('.bwealth-series-custom-goal-clear').addEventListener('click', () => {
    setCustomGoalMode(state, false);
    resetForm(state, false);
    refresh();
  });

  root.querySelector('#bws-include-inflation').addEventListener('change', () => {
    hideResults(state);
    refresh();
  });

  root.querySelector('[data-action="clear"]').addEventListener('click', () => {
    root.querySelector('#bws-include-inflation').checked = false;
    setCustomGoalMode(state, false);
    resetForm(state, false);
    refresh();
  });

  root.querySelector('[data-action="calculate"]').addEventListener('click', () => {
    runCalculation(state);
  });

  attachFundsCarousel(state);
  attachModal(state);
  refresh();
}

/* ----------------------------------------------------------------- decorate */

export default async function decorate(block) {
  const lang = getLang() === 'th' ? 'th' : 'en';

  const [config] = await Promise.all([
    fetchBlockConfig(),
    ensureDomPurify(),
    loadChartJs(),
  ]);

  const configJson = config.raw;
  if (!hasConfigTexts(configJson, lang)) {
    // eslint-disable-next-line no-console
    console.error(`[bwealth-series] ไม่พบ label config สำหรับภาษา "${lang}" ใน bwealth-series-config.json`);
    return;
  }

  const texts = buildTextsFromConfig(configJson, lang);
  let fundData;
  try {
    fundData = parseFundData(buildFundJsonFromConfig(configJson, lang));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[bwealth-series] โหลด fund datasource จาก AEM config ไม่สำเร็จ: ${e.message}`);
    return;
  }

  const state = {
    root: block,
    lang,
    texts,
    fundData,
    config,
    tracking: getLinkTrackingParams(),
    inflationRate: fundData.inflationRate ?? texts.defaultFormValues.inflationRate,
    returnRatePlaceholder: lang === 'th'
      ? 'ความเสี่ยงที่ยอมรับได้ และผลตอบแทนที่คาดหวังต่อปี'
      : 'Acceptable level of risk and expected annual return (%)',
    calculatedInputs: null,
    calculation: null,
    visibleFunds: [],
    selectedFund: null,
    chartInstance: null,
  };

  block.innerHTML = buildShellMarkup({ texts, fundData, lang });
  block.classList.add('bwealth-series-block');

  updateInflationLabel(state);
  // แสดงการ์ดผลลัพธ์ด้วยเลข 0 ตั้งแต่แรก เหมือน saving-plan ไม่ปล่อยว่าง
  renderResult(state, EMPTY_CALCULATION);
  // Disclaimer ต้องขึ้นตั้งแต่โหลดหน้า ไม่ต้องรอกดคำนวณ
  renderRemarks(state);
  attachHandlers(state);
}

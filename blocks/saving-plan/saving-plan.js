import { loadCategoryBannerFragment } from '../category-banner/category-banner.js';
import { getLang } from '../../scripts/bbl-decorators.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchJson } from '../../scripts/utils/card-helpers.js';
import { fetchPost } from '../../scripts/utils/fetchApi.js';
import { loadChartJs, renderChart, buildChartLegend } from './saving-plan-chart.js';

const INFLATION_RATE = 1.5;

const ICON_BASE = '/icons/saving-plan';
const ICONS_CACHE = {};

async function loadIcons() {
  const names = ['goal', 'goal-amount', 'goal-period', 'balance', 'annual-return', 'annual-increase', 'step-up', 'step-up-adjusted'];
  await Promise.all(names.map(async (name) => {
    try {
      const resp = await fetch(`${ICON_BASE}/${name}.svg`);
      if (resp.ok) ICONS_CACHE[name] = await resp.text();
    } catch { /* empty */ }
  }));
}

function getIcon(name) {
  return ICONS_CACHE[name] || '';
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

function formatDecimal(value) {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function parseNumber(value) {
  if (typeof value !== 'string') return Number(value) || 0;
  const cleaned = value.replace(/,/g, '').trim();
  if (cleaned === '') return 0;
  return Number(cleaned) || 0;
}

function fillTemplate(template, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), v),
    template,
  );
}

function parseProducts(L) {
  const nums = [...new Set(
    Object.keys(L)
      .filter((k) => /^products-\d+-title$/.test(k))
      .map((k) => k.match(/^products-(\d+)-title$/)[1]),
  )].sort((a, b) => Number(a) - Number(b));
  return nums.map((n) => ({
    title: L[`products-${n}-title`] || '',
    description: L[`products-${n}-description`] || '',
    image: L[`products-${n}-imageUrl`] || '',
    ctaText: L[`products-${n}-ctaText`] || '',
    ctaUrl: L[`products-${n}-ctaUrl`] || '',
  }));
}

function buildDataFromConfig(json, lang, placeholders) {
  const langData = json[lang]?.data || [];
  const commonData = json.common?.data || [];

  const L = {};
  langData.forEach(({ Key, Value }) => { if (Key) L[Key] = Value; });
  const C = {};
  commonData.forEach(({ Key, Value }) => { if (Key) C[Key] = Value; });

  const unit = L['common-unit'] || '';
  const footnoteReturnTemplate = placeholders.savingPlanFootnoteReturnTemplate || '';
  const footnoteIncreaseTemplate = placeholders.savingPlanFootnoteIncreaseTemplate || '';
  const futureValueTemplate = (L['common-toHaveMoney'] || '')
    .replace('{money}', '{amount}').replace('{unit}', unit);

  const minError = L['validation-minValueError'] || '';

  const goalKeys = [...new Set(
    Object.keys(L)
      .filter((k) => k.startsWith('savingGoals-') && k.endsWith('-label'))
      .map((k) => k.slice('savingGoals-'.length, -'-label'.length)),
  )];
  const goals = goalKeys.map((gk) => ({
    key: L[`savingGoals-${gk}-value`] || gk,
    label: L[`savingGoals-${gk}-label`] || gk,
    configKey: gk,
    fragmentId: L[`savingGoals-${gk}-fragmentId`] || L[`cards-${gk}-fragmentId`] || (L[`cards-${gk}-category`] || '').toLowerCase().replace(/\s+/g, '-'),
    infoTitle: L[`cards-${gk}-title`] || '',
    infoBg: L[`cards-${gk}-backgroundColor`] || '',
    infoCta: L[`cards-${gk}-description`] || '',
    infoUrl: L[`cards-${gk}-link`] || '#',
    imageUrl: L[`cards-${gk}-imageUrl`] || '',
  }));

  return {
    labels: {
      sectionTitle: L['common-title'] || '',
      calculateTitle: L['common-step1Title'] || '',
      resultTitle: L['common-resultsTitle'] || '',
      tweakTitle: L['common-adjustCalculationTitle'] || '',
      newPlanTitle: L['common-newCalculationResultsTitle'] || '',
      productSectionTitle: L['common-productSectionTitle'] || '',
      additionalInfoTitle: L['common-additionalInfoTitle'] || '',
      additionalInfoLinkText: L['common-additionalInfoLinkText'] || '',
      additionalInfoUrl: L['common-additionalInfoUrl'] || '',
      disclaimerTitle: L['common-disclaimerTitle'] || '',
      disclaimer: L['common-disclaimerText'] || '',
      fields: {
        goal: L['inputs-savingGoal'] || '',
        goalAmount: L['inputs-desiredSavingAmount'] || '',
        goalPeriod: L['inputs-yearsToSave'] || '',
        balance: L['inputs-savedAmount'] || '',
        annualReturn: L['inputs-expectedReturnRate'] || '',
        annualIncrease: L['inputs-annualSavingIncreaseRate'] || '',
      },
      fieldPlaceholders: {
        balance: placeholders.savingPlanPlaceholderBalance,
        goalAmount: placeholders.savingPlanPlaceholderGoalAmount,
        annualReturn: placeholders.savingPlanPlaceholderAnnualReturn,
        goalPeriod: placeholders.savingPlanPlaceholderGoalPeriod,
        annualIncrease: placeholders.savingPlanPlaceholderAnnualIncrease,
      },
      buttons: {
        clear: L['common-clearButton'] || '',
        calculate: L['common-calculateButtonText'] || '',
      },
      result: {
        futureValueTemplate,
        monthlySavingLabel: L['results-recommendSavingMonthly'] || '',
        currency: unit,
        footnote: '',
        footnoteReturnTemplate,
      },
      newPlan: {
        futureValueTemplate,
        monthlySavingLabel: L['results-increasedSavingMonthly'] || '',
        footnote: '',
        footnoteIncreaseTemplate,
        footnoteReturnTemplate,
      },
      chart: {
        title: '',
        xAxis: L['results-graph-xAxisLabel'] || '',
        yAxis: L['results-graph-yAxisLabel'] || '',
        legendResult: L['results-graph-originalCalculationLabel'] || '',
        legendFixed: L['results-graph-constantSavingLabel'] || '',
        legendStepUp: L['results-graph-savingIncreasedSteppedLabel'] || '',
        legendNewPlan: L['results-graph-newCalculationLabel'] || '',
        legendStepUpAdjusted: L['results-graph-savingIncreasedSteppedLabel'] || '',
        monthlySavingsTag: L['results-graph-monthlySavingLabel'] || '',
        goalAmountTag: L['results-graph-savingGoalLabel'] || '',
      },
      validation: {
        goalAmount: fillTemplate(minError, { min: '10,000' }),
        annualReturn: fillTemplate(minError, { min: '0.1' }),
        goalPeriod: fillTemplate(minError, { min: '1' }),
        crossFieldIncreaseExceedsReturn: L['validation-annualSavingIncreaseRateError'] || '',
      },
    },
    defaults: {
      goalAmount: Number(C['defaultFormValues-desiredSavingAmount']) || 500000,
      goalPeriod: Number(C['defaultFormValues-yearsToSave']) || 5,
      balance: Number(C['defaultFormValues-savedAmount']) || 0,
      annualReturn: Number(C['defaultFormValues-expectedReturnRate']) || 0.5,
      annualIncrease: Number(C['defaultFormValues-annualSavingIncreaseRate']) || 0,
    },
    validation: {
      goalAmount: { min: 10000 },
      goalPeriod: { min: 1, max: 50 },
      balance: { min: 0 },
      annualReturn: { min: 0.1, max: 100 },
      annualIncrease: { min: 0, max: 100 },
    },
    goals,
    products: parseProducts(L),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function solveMonthly({
  target, balance, years, annualReturn, annualIncrease,
}) {
  if (!Number.isFinite(years) || years <= 0) return 0;
  const r = annualReturn / 100;
  const g = annualIncrease / 100;
  const rm = r / 12; // nominal monthly rate — matches real API
  const months = years * 12;
  // Subtract future value of current balance from the target
  const fvBalance = (balance || 0) * (1 + r) ** years;
  const needed = target - fvBalance;
  if (needed <= 0) return 0;
  if (g === 0) {
    const fvAnnuity = rm === 0 ? months : ((1 + rm) ** months - 1) / rm;
    return fvAnnuity === 0 ? 0 : needed / fvAnnuity;
  }
  // Step-up: each year's savings grow by g
  const annuityFactor = rm === 0 ? 12 : ((1 + rm) ** 12 - 1) / rm;
  let coefficient = 0;
  for (let i = 0; i < years; i += 1) {
    coefficient += (1 + g) ** i * annuityFactor * (1 + r) ** (years - 1 - i);
  }
  return coefficient === 0 ? 0 : needed / coefficient;
}

function getFallbackCalculation(inputs) {
  const futureValue = inputs.goalAmount * (1 + INFLATION_RATE / 100) ** inputs.goalPeriod;
  return {
    FutureValue: futureValue,
    SavingMonth: solveMonthly({
      target: futureValue,
      balance: inputs.balance,
      years: inputs.goalPeriod,
      annualReturn: inputs.annualReturn,
      annualIncrease: inputs.annualIncrease,
    }),
  };
}

function normalizeCalculationResponse(payload, fallback) {
  const source = payload || {};
  const future = Number(
    source.FutureValue ?? source.futureValue ?? source.future ?? fallback.FutureValue,
  );
  const monthly = Number(
    source.SavingMonth ?? source.savingMonth ?? source.monthlySaving ?? fallback.SavingMonth,
  );
  return {
    FutureValue: Number.isFinite(future) ? future : fallback.FutureValue,
    SavingMonth: Number.isFinite(monthly) ? monthly : fallback.SavingMonth,
  };
}

function buildCalculationPayload(inputs) {
  return {
    FutureSavingAmount: inputs.goalAmount,
    NYear: inputs.goalPeriod,
    FirstSavingAmount: inputs.balance,
    CompensationRate: inputs.annualReturn / 100,
    SavingIncRate: inputs.annualIncrease / 100,
    inflationrate: INFLATION_RATE,
  };
}

async function fetchCalculation(inputs, calcUrl, apimKey) {
  const fallback = getFallbackCalculation(inputs);
  if (!calcUrl) return fallback;
  try {
    const payload = buildCalculationPayload(inputs);
    // eslint-disable-next-line no-console
    console.log('[saving-plan] API request payload:', payload);
    const json = await fetchPost(calcUrl, payload, {
      headers: { 'Ocp-Apim-Subscription-Key': apimKey },
      throwOnError: false,
    });
    if (!json) {
      // eslint-disable-next-line no-console
      console.warn('[saving-plan] API error — using fallback');
      return fallback;
    }
    // eslint-disable-next-line no-console
    console.log('[saving-plan] API response:', json);
    return normalizeCalculationResponse(json, fallback);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[saving-plan] API fetch failed — using fallback:', e.message);
    return fallback;
  }
}

function getFieldMinError(field, value, rules, messages) {
  const message = messages[field] || '';
  if (!Number.isFinite(value)) return message;
  const rule = rules[field];
  if (!rule) return '';
  if (rule.min !== undefined && value < rule.min) return message;
  if (rule.max !== undefined && value > rule.max) return message;
  return '';
}

function buildField({
  name, label, value, decimal = false, icon = '', placeholder = '',
}) {
  let formatted = '';
  if (value || value === 0) {
    formatted = decimal ? formatDecimal(value) : formatNumber(value);
  }
  return `
    <div class="saving-plan-field" data-field="${name}" data-decimal="${decimal ? '1' : '0'}">
      <div class="saving-plan-field-row">
        <label class="saving-plan-field-label" for="sp-${name}">
          <span class="saving-plan-field-icon" aria-hidden="true">${icon}</span>
          <span class="saving-plan-field-text">${label}</span>
        </label>
        <input
          id="sp-${name}"
          class="saving-plan-field-input"
          type="text"
          inputmode="decimal"
          value="${formatted}"
          ${placeholder ? `placeholder="${placeholder}"` : ''}
          autocomplete="off"
        />
      </div>
    </div>
  `;
}

function buildDropdownField({
  name, label, value, options,
}) {
  const selected = options.find((opt) => opt.key === value);
  const optionsMarkup = options
    .map((opt) => `
      <li class="saving-plan-dropdown-option${opt.key === selected?.key ? ' is-selected' : ''}"
          role="option" data-value="${opt.key}" tabindex="-1">
        <span class="saving-plan-dropdown-option-label">${opt.label}</span>
      </li>
    `)
    .join('');
  return `
    <div class="saving-plan-field saving-plan-field-dropdown" data-field="${name}" data-value="${selected?.key || ''}">
      <button type="button" class="saving-plan-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="saving-plan-dropdown-current">${selected?.label || label}</span>
        <span class="saving-plan-field-chevron" aria-hidden="true"></span>
      </button>
      <ul class="saving-plan-dropdown-panel" role="listbox" tabindex="-1">
        ${optionsMarkup}
      </ul>
    </div>
  `;
}

function buildSlider({
  name, label, value, min, max, step,
}) {
  const formatter = step < 1 ? formatDecimal : formatNumber;
  return `
    <div class="saving-plan-slider" data-slider="${name}">
      <span class="saving-plan-slider-label">${label}</span>
      <input
        type="range"
        class="saving-plan-slider-input"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}"
      />
      <div class="saving-plan-slider-range">
        <span class="saving-plan-slider-min">${formatter(min)}</span>
        <span class="saving-plan-slider-value">${formatter(max)}</span>
      </div>
    </div>
  `;
}

function buildProductCard(product) {
  const cta = product.ctaUrl
    ? `<a class="saving-plan-product-cta" href="${product.ctaUrl}">${product.ctaText || ''}</a>`
    : `<button type="button" class="saving-plan-product-cta">${product.ctaText || ''}</button>`;
  const imgStyle = product.image ? `style="background-image:url('${product.image}')"` : '';
  return `
    <article class="saving-plan-product">
      <div class="saving-plan-product-image" ${imgStyle}></div>
      <div class="saving-plan-product-body">
        <h3 class="saving-plan-product-title">${product.title || ''}</h3>
        <p class="saving-plan-product-description">${product.description || ''}</p>
        ${cta}
      </div>
    </article>
  `;
}

function buildShellMarkup(data) {
  const { labels, defaults, goals } = data;
  return `
    <div class="saving-plan-section">
      <header class="saving-plan-header">
        <h2 class="saving-plan-header-title">${labels.sectionTitle}</h2>
        <span class="saving-plan-header-divider" aria-hidden="true"></span>
      </header>

      <div class="saving-plan-calculator">
        <div class="saving-plan-form">
          <h3 class="saving-plan-form-title">${labels.calculateTitle}</h3>
          <div class="saving-plan-form-grid">
            ${buildDropdownField({
    name: 'goal', label: labels.fields.goal, value: '', options: goals,
  })}
            ${buildField({
    name: 'balance', label: labels.fields.balance, value: defaults.balance, icon: getIcon('balance'), placeholder: labels.fieldPlaceholders.balance,
  })}
            ${buildField({
    name: 'goalAmount', label: labels.fields.goalAmount, value: defaults.goalAmount, icon: getIcon('goal-amount'), placeholder: labels.fieldPlaceholders.goalAmount,
  })}
            ${buildField({
    name: 'annualReturn', label: labels.fields.annualReturn, value: defaults.annualReturn || '', decimal: true, icon: getIcon('annual-return'), placeholder: labels.fieldPlaceholders.annualReturn,
  })}
            ${buildField({
    name: 'goalPeriod', label: labels.fields.goalPeriod, value: defaults.goalPeriod, icon: getIcon('goal-period'), placeholder: labels.fieldPlaceholders.goalPeriod,
  })}
            ${buildField({
    name: 'annualIncrease', label: labels.fields.annualIncrease, value: defaults.annualIncrease, decimal: true, icon: getIcon('annual-increase'), placeholder: labels.fieldPlaceholders.annualIncrease,
  })}
          </div>
          <div class="saving-plan-form-actions">
            <button type="button" class="saving-plan-form-btn saving-plan-form-btn-secondary" data-action="clear" disabled>${labels.buttons.clear}</button>
            <button type="button" class="saving-plan-form-btn saving-plan-form-btn-primary" data-action="calculate" disabled>${labels.buttons.calculate}</button>
          </div>
        </div>

        <aside class="saving-plan-result">
          <h3 class="saving-plan-result-title">${labels.resultTitle}</h3>
          <div class="saving-plan-result-card">
            <p class="saving-plan-result-future" data-result="future"></p>
            <p class="saving-plan-result-lead">${labels.result.monthlySavingLabel}</p>
            <p class="saving-plan-result-monthly">
              <span class="saving-plan-result-amount" data-result="monthly">0</span>
              <span class="saving-plan-result-currency">${labels.result.currency}</span>
            </p>
          </div>
          <p class="saving-plan-result-footnote" data-result="footnote-increase"></p>
          <p class="saving-plan-result-footnote" data-result="footnote-return"></p>
        </aside>
      </div>

      <section class="saving-plan-chart-row" hidden>
        <div class="saving-plan-chart-wrap">
          ${buildChartLegend(labels.chart, getIcon)}
          <div class="saving-plan-chart-canvas-wrap">
            <canvas class="saving-plan-chart" aria-label="${labels.chart.title}"></canvas>
          </div>
        </div>
        <div class="saving-plan-info-card-slot"></div>
      </section>

      <section class="saving-plan-tweak" hidden>
        <div class="saving-plan-tweak-header">
          <h3 class="saving-plan-tweak-title">${labels.tweakTitle}</h3>
          <h4 class="saving-plan-newplan-title">${labels.newPlanTitle}</h4>
        </div>
        <div class="saving-plan-tweak-grid">
          <div class="saving-plan-tweak-sliders">
            ${buildSlider({
    name: 'goalAmount', label: labels.fields.goalAmount, value: defaults.goalAmount || 10000, min: 10000, max: 1000000, step: 10000,
  })}
            ${buildSlider({
    name: 'annualReturn', label: labels.fields.annualReturn, value: defaults.annualReturn || 0.5, min: 0.5, max: 40, step: 0.1,
  })}
            ${buildSlider({
    name: 'annualIncrease', label: labels.fields.annualIncrease, value: defaults.annualIncrease, min: 0, max: 40, step: 0.1,
  })}
          </div>
          <div class="saving-plan-newplan">
            <div class="saving-plan-newplan-card">
              <p class="saving-plan-newplan-future" data-newplan="future"></p>
              <p class="saving-plan-newplan-lead">${labels.newPlan.monthlySavingLabel}</p>
              <p class="saving-plan-newplan-monthly">
                <span class="saving-plan-newplan-amount" data-newplan="monthly">0</span>
                <span class="saving-plan-newplan-currency">${labels.result.currency}</span>
              </p>
            </div>
            <p class="saving-plan-newplan-footnote" data-newplan="footnote-increase"></p>
            <p class="saving-plan-newplan-footnote" data-newplan="footnote-return"></p>
          </div>
        </div>
      </section>

      ${labels.additionalInfoLinkText ? `
      <section class="saving-plan-additional">
        <h3 class="saving-plan-additional-title">${labels.additionalInfoTitle}</h3>
        <ul class="saving-plan-additional-list">
          <li><a class="saving-plan-additional-link" href="${labels.additionalInfoUrl || '#'}">${labels.additionalInfoLinkText}</a></li>
        </ul>
      </section>` : ''}

      <section class="saving-plan-disclaimer">
        <h4 class="saving-plan-disclaimer-title">${labels.disclaimerTitle}</h4>
        <div class="saving-plan-disclaimer-text">${labels.disclaimer}</div>
      </section>

      <section class="saving-plan-products" hidden>
        <h3 class="saving-plan-products-title">${labels.productSectionTitle}</h3>
        <div class="saving-plan-products-divider"></div>
<div class="saving-plan-products-grid"></div>
      </section>
    </div>
  `;
}

function readInputs(root) {
  const goalWrap = root.querySelector('[data-field="goal"]');
  return {
    goal: goalWrap?.dataset.value || '',
    goalAmount: parseNumber(root.querySelector('[data-field="goalAmount"] input')?.value),
    goalPeriod: parseNumber(root.querySelector('[data-field="goalPeriod"] input')?.value),
    balance: parseNumber(root.querySelector('[data-field="balance"] input')?.value),
    annualReturn: parseNumber(root.querySelector('[data-field="annualReturn"] input')?.value),
    annualIncrease: parseNumber(root.querySelector('[data-field="annualIncrease"] input')?.value),
  };
}

function setFieldError(wrap, message) {
  if (!wrap) return;
  const input = wrap.querySelector('input');
  const existing = wrap.querySelector('.saving-plan-field-error-message');
  if (message) {
    wrap.classList.add('saving-plan-field-error');
    input?.setAttribute('aria-invalid', 'true');
    if (existing) {
      existing.textContent = message;
    } else {
      const span = document.createElement('span');
      span.className = 'saving-plan-field-error-message';
      span.setAttribute('role', 'alert');
      span.textContent = message;
      wrap.appendChild(span);
    }
  } else {
    wrap.classList.remove('saving-plan-field-error');
    input?.removeAttribute('aria-invalid');
    if (existing) existing.remove();
  }
}

function applyValidation(root, inputs, data) {
  const messages = data.labels.validation;
  const rules = data.validation;
  const fields = ['goalAmount', 'goalPeriod', 'balance', 'annualReturn', 'annualIncrease'];
  let isValid = true;
  const fieldErrors = {};

  fields.forEach((name) => {
    fieldErrors[name] = getFieldMinError(name, inputs[name], rules, messages);
    if (fieldErrors[name]) isValid = false;
  });

  // Cross-field: annual increase must not exceed annual return.
  // Only applied when both fields pass their own min/max, so per-field messages take priority.
  if (!fieldErrors.annualReturn && !fieldErrors.annualIncrease
      && inputs.annualIncrease > inputs.annualReturn) {
    fieldErrors.annualReturn = messages.crossFieldIncreaseExceedsReturn || '';
    fieldErrors.annualIncrease = messages.crossFieldIncreaseExceedsReturn || '';
    isValid = false;
  }

  fields.forEach((name) => {
    setFieldError(root.querySelector(`[data-field="${name}"]`), fieldErrors[name]);
  });

  return isValid;
}

function setHTML(root, selector, html) {
  const el = root.querySelector(selector);
  if (el) el.innerHTML = html;
}

function setText(root, selector, text) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

function renderResult(state, data, calculation) {
  const { root } = state;
  const inputs = readInputs(root);
  const goalPeriod = inputs.goalPeriod || data.defaults?.goalPeriod || 0;
  const annualReturn = inputs.annualReturn || data.defaults?.annualReturn || 0;
  const futureText = fillTemplate(data.labels.result.futureValueTemplate, {
    amount: `<strong>${escapeHtml(formatNumber(calculation.FutureValue))}</strong>`,
    years: `<strong>${escapeHtml(String(goalPeriod))}</strong>`,
  });
  setHTML(root, '[data-result="future"]', futureText);
  setText(root, '[data-result="monthly"]', formatNumber(calculation.SavingMonth));
  const { annualIncrease } = inputs;
  if (annualIncrease > 0) {
    const { footnoteIncreaseTemplate } = data.labels.newPlan;
    const increaseLabel = footnoteIncreaseTemplate
      ? fillTemplate(footnoteIncreaseTemplate, { increase: formatDecimal(annualIncrease) })
      : '';
    setText(root, '[data-result="footnote-increase"]', increaseLabel);
  } else {
    setText(root, '[data-result="footnote-increase"]', '');
  }
  const returnLabel = data.labels.result.footnoteReturnTemplate
    ? fillTemplate(
      data.labels.result.footnoteReturnTemplate,
      { return: formatDecimal(annualReturn) },
    )
    : `*Including inflation rate of ${INFLATION_RATE}% p.a. and expected annual return ${formatDecimal(annualReturn)}%`;
  setText(root, '[data-result="footnote-return"]', returnLabel);
}

function clearNewPlan(root) {
  const future = root.querySelector('[data-newplan="future"]');
  if (future) future.setAttribute('hidden', '');
  const amount = root.querySelector('[data-newplan="monthly"]');
  if (amount) { amount.textContent = ''; amount.setAttribute('hidden', ''); }
  setText(root, '[data-newplan="footnote-increase"]', '');
  setText(root, '[data-newplan="footnote-return"]', '');
}

function setSliderBounds(root, name, {
  min, max, value, step,
}) {
  const input = root.querySelector(`[data-slider="${name}"] input`);
  if (!input) return;
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = value;
  const minEl = root.querySelector(`[data-slider="${name}"] .saving-plan-slider-min`);
  const maxEl = root.querySelector(`[data-slider="${name}"] .saving-plan-slider-value`);
  const formatter = step < 1 ? formatDecimal : formatNumber;
  if (minEl) minEl.textContent = formatter(min);
  if (maxEl) maxEl.textContent = formatter(max);
}

function goalAmountStep(amount) {
  if (amount >= 1000000) return 50000;
  if (amount >= 100000) return 10000;
  if (amount >= 10000) return 1000;
  return 100;
}

function syncSliderDisplays(root) {
  root.querySelectorAll('.saving-plan-slider').forEach((slider) => {
    const input = slider.querySelector('input[type="range"]');
    const display = slider.querySelector('.saving-plan-slider-value');
    if (!input || !display) return;
    const step = parseFloat(input.step);
    const formatter = step < 1 ? formatDecimal : formatNumber;
    display.textContent = formatter(parseNumber(input.value));
    const min = parseFloat(input.min) || 0;
    const max = parseFloat(input.max) || 100;
    const val = parseFloat(input.value) || 0;
    const pct = ((val - min) / (max - min)) * 100;
    input.style.background = `linear-gradient(to right, var(--sp-blue) ${pct}%, var(--sp-slider-track) ${pct}%)`;
  });
}

function renderNewPlanPlaceholder(state, data, inputs) {
  const { root } = state;
  const goalMin = inputs.goalAmount;
  const goalMax = inputs.goalAmount * 2;
  setSliderBounds(root, 'goalAmount', {
    min: goalMin, max: goalMax, value: inputs.goalAmount, step: goalAmountStep(inputs.goalAmount),
  });
  setSliderBounds(root, 'annualReturn', {
    min: 0.5, max: 40, value: inputs.annualReturn, step: 0.1,
  });
  const returnSliderEl = root.querySelector('[data-slider="annualReturn"] input');
  if (returnSliderEl) returnSliderEl.dataset.prev = inputs.annualReturn;
  setSliderBounds(root, 'annualIncrease', {
    min: 0, max: inputs.annualReturn, value: inputs.annualIncrease, step: 0.1,
  });
  syncSliderDisplays(root);
  root.querySelector('.saving-plan-newplan-card')?.classList.add('is-placeholder');
  const futureText = fillTemplate(data.labels.newPlan.futureValueTemplate, {
    amount: '<strong>0</strong>',
    years: `<strong>${escapeHtml(String(inputs.goalPeriod))}</strong>`,
  });
  const futureEl = root.querySelector('[data-newplan="future"]');
  if (futureEl) { futureEl.innerHTML = futureText; futureEl.removeAttribute('hidden'); }
  const amountEl = root.querySelector('[data-newplan="monthly"]');
  if (amountEl) { amountEl.textContent = '0'; amountEl.removeAttribute('hidden'); }
  const returnLabel = data.labels.newPlan.footnoteReturnTemplate
    ? fillTemplate(
      data.labels.newPlan.footnoteReturnTemplate,
      { return: formatDecimal(inputs.annualReturn) },
    )
    : '';
  setText(root, '[data-newplan="footnote-increase"]', '');
  setText(root, '[data-newplan="footnote-return"]', returnLabel);
}

async function renderNewPlan(state, data, tweakInputs) {
  const { root } = state;
  const baseInputs = state.calculatedInputs || readInputs(root);
  const tweakApiInputs = {
    goalAmount: tweakInputs.goalAmount || baseInputs.goalAmount,
    balance: baseInputs.balance,
    goalPeriod: baseInputs.goalPeriod,
    annualReturn: tweakInputs.annualReturn,
    annualIncrease: tweakInputs.annualIncrease,
  };
  // eslint-disable-next-line max-len
  const calculation = await fetchCalculation(tweakApiInputs, state.config.calcUrl, state.config.apimKey);
  const futureText = fillTemplate(data.labels.newPlan.futureValueTemplate, {
    amount: `<strong>${escapeHtml(formatNumber(calculation.FutureValue))}</strong>`,
    years: `<strong>${escapeHtml(String(baseInputs.goalPeriod))}</strong>`,
  });
  root.querySelector('.saving-plan-newplan-card')?.classList.remove('is-placeholder');
  const futureEl = root.querySelector('[data-newplan="future"]');
  if (futureEl) { futureEl.innerHTML = futureText; futureEl.removeAttribute('hidden'); }
  const amountEl = root.querySelector('[data-newplan="monthly"]');
  if (amountEl) { amountEl.textContent = formatNumber(calculation.SavingMonth); amountEl.removeAttribute('hidden'); }
  const increaseLabel = data.labels.newPlan.footnoteIncreaseTemplate
    ? fillTemplate(
      data.labels.newPlan.footnoteIncreaseTemplate,
      { increase: formatDecimal(tweakInputs.annualIncrease) },
    )
    : '';
  const returnLabel = data.labels.newPlan.footnoteReturnTemplate
    ? fillTemplate(
      data.labels.newPlan.footnoteReturnTemplate,
      { return: formatDecimal(tweakInputs.annualReturn) },
    )
    : '';
  setText(root, '[data-newplan="footnote-increase"]', increaseLabel);
  setText(root, '[data-newplan="footnote-return"]', returnLabel);
  state.tweakCalculation = calculation;
  return calculation;
}

function renderInfoCard(state) {
  // Clears the banner slot — the fragment is loaded only after Calculate.
  const slot = state.root.querySelector('.saving-plan-info-card-slot');
  if (slot) slot.innerHTML = '';
}

async function renderCategoryBannerForGoal(state, data) {
  const slot = state.root.querySelector('.saving-plan-info-card-slot');
  if (!slot) return;
  const goalKey = state.root.querySelector('[data-field="goal"]')?.dataset.value;
  if (!goalKey) return;
  const goal = data.goals.find((g) => g.key === goalKey);
  const fragmentId = goal?.fragmentId;
  if (!fragmentId) {
    // eslint-disable-next-line no-console
    console.warn(`[saving-plan] No fragmentId set for goal "${goalKey}". Add savingGoals-<key>-fragmentId to the config spreadsheet.`);
    return;
  }
  const lang = getLang();
  await loadCategoryBannerFragment(state.config.fragmentPath, `${fragmentId}-${lang}`, slot);
}

function renderProducts(state, data) {
  const grid = state.root.querySelector('.saving-plan-products-grid');
  if (!grid) return;
  grid.innerHTML = data.products.map(buildProductCard).join('');
}

function setButtonsEnabled(root, enabled) {
  const calc = root.querySelector('[data-action="calculate"]');
  const clear = root.querySelector('[data-action="clear"]');
  if (calc) calc.disabled = !enabled;
  if (clear) clear.disabled = !enabled;
}

function isAnyFieldEmpty(root) {
  const inputs = root.querySelectorAll('[data-field][data-decimal] input');
  if (Array.from(inputs).some((input) => input.value.trim() === '')) return true;
  const goalWrap = root.querySelector('[data-field="goal"]');
  if (goalWrap && !goalWrap.dataset.value) return true;
  return false;
}

function showAfterCalculate(root) {
  root.querySelector('.saving-plan-chart-row')?.removeAttribute('hidden');
  root.querySelector('.saving-plan-tweak')?.removeAttribute('hidden');
  root.querySelector('.saving-plan-products')?.removeAttribute('hidden');
  root.closest('.section')?.nextElementSibling?.classList.add('is-visible');
}

function readSliders(root) {
  return {
    goalAmount: parseNumber(root.querySelector('[data-slider="goalAmount"] input')?.value),
    annualReturn: parseNumber(root.querySelector('[data-slider="annualReturn"] input')?.value),
    annualIncrease: parseNumber(root.querySelector('[data-slider="annualIncrease"] input')?.value),
  };
}

function formatFieldValue(input, decimal) {
  const formatter = decimal ? formatDecimal : formatNumber;
  const value = parseNumber(input.value);
  input.value = formatter(value);
}

function formatLive(input, decimal) {
  const raw = input.value;
  const cursor = input.selectionStart;
  // Count digits (and dot for decimal) before cursor to restore position after reformatting.
  const digitsBeforeCursor = (raw.slice(0, cursor).match(/[\d.]/g) || []).length;
  const value = parseNumber(raw);
  if (!Number.isFinite(value) || raw.trim() === '') return;
  const formatter = decimal ? formatDecimal : formatNumber;
  const formatted = formatter(value);
  input.value = formatted;
  // Find new cursor: walk formatted string counting digits until we match digitsBeforeCursor.
  let count = 0;
  let newCursor = formatted.length;
  for (let i = 0; i < formatted.length; i += 1) {
    if (/[\d.]/.test(formatted[i])) count += 1;
    if (count === digitsBeforeCursor) { newCursor = i + 1; break; }
  }
  input.setSelectionRange(newCursor, newCursor);
}

function resetCalculator(state, data) {
  const { defaults } = data;
  const { root } = state;
  const setVal = (sel, val) => {
    const el = root.querySelector(sel);
    if (el) el.value = val;
  };
  // Reset dropdown back to unselected placeholder.
  const goalWrap = root.querySelector('[data-field="goal"]');
  if (goalWrap) {
    goalWrap.dataset.value = '';
    const current = goalWrap.querySelector('.saving-plan-dropdown-current');
    if (current) current.textContent = data.labels.fields.goal || '';
    goalWrap.querySelectorAll('.saving-plan-dropdown-option').forEach((opt) => {
      opt.classList.remove('is-selected');
    });
  }
  setVal('[data-field="goalAmount"] input', formatNumber(defaults.goalAmount));
  setVal('[data-field="goalPeriod"] input', formatNumber(defaults.goalPeriod));
  setVal('[data-field="balance"] input', formatNumber(defaults.balance));
  setVal('[data-field="annualReturn"] input', defaults.annualReturn ? formatDecimal(defaults.annualReturn) : '');
  setVal('[data-field="annualIncrease"] input', formatDecimal(defaults.annualIncrease));
  root.querySelectorAll('.saving-plan-field-error').forEach((el) => el.classList.remove('saving-plan-field-error'));
  root.querySelectorAll('.saving-plan-field-error-message').forEach((el) => el.remove());
  root.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  root.querySelector('.saving-plan-chart-row')?.setAttribute('hidden', '');
  root.querySelector('.saving-plan-tweak')?.setAttribute('hidden', '');
  root.querySelector('.saving-plan-products')?.setAttribute('hidden', '');
  clearNewPlan(root);
  state.tweakActive = false;
  state.tweakInputs = null;
  state.tweakCalculation = null;
  state.calculatedInputs = null;
  state.calculatedCalculation = null;
  if (state.chartInstance) {
    try { state.chartInstance.destroy(); } catch (_) { /* ignore */ }
    state.chartInstance = null;
  }
  if (state.chartResizeObserver) {
    state.chartResizeObserver.disconnect();
    state.chartResizeObserver = null;
  }
  if (state.chartResizeListener) {
    window.removeEventListener('resize', state.chartResizeListener);
    state.chartResizeListener = null;
  }
  renderInfoCard(state);
  renderResult(state, data, { FutureValue: 0, SavingMonth: 0 });
  root.closest('.section')?.nextElementSibling?.classList.remove('is-visible');
}

function attachDropdownHandlers(state, data, onSelectionChange) {
  const { root } = state;
  const wrap = root.querySelector('[data-field="goal"]');
  if (!wrap) return;
  const trigger = wrap.querySelector('.saving-plan-dropdown-trigger');
  const panel = wrap.querySelector('.saving-plan-dropdown-panel');
  const current = wrap.querySelector('.saving-plan-dropdown-current');
  if (!trigger || !panel || !current) return;

  const close = () => {
    wrap.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    wrap.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrap.classList.contains('is-open')) close();
    else open();
  });

  panel.addEventListener('click', (e) => {
    const option = e.target.closest('.saving-plan-dropdown-option');
    if (!option) return;
    const { value } = option.dataset;
    wrap.dataset.value = value;
    const goal = data.goals.find((g) => g.key === value);
    current.textContent = goal?.label || '';
    panel.querySelectorAll('.saving-plan-dropdown-option').forEach((opt) => {
      opt.classList.toggle('is-selected', opt === option);
    });
    close();
    renderInfoCard(state);
    state.root.querySelector('.saving-plan-chart-row')?.setAttribute('hidden', '');
    state.root.querySelector('.saving-plan-tweak')?.setAttribute('hidden', '');
    state.root.querySelector('.saving-plan-products')?.setAttribute('hidden', '');
    state.calculatedInputs = null;
    renderResult(state, data, { FutureValue: 0, SavingMonth: 0 });
    if (typeof onSelectionChange === 'function') onSelectionChange();
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) close();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
      panel.querySelector('.saving-plan-dropdown-option')?.focus();
    }
  });
}

function attachHandlers(state, data) {
  const { root } = state;

  const liveUpdate = async () => {
    const inputs = readInputs(root);
    const valid = applyValidation(root, inputs, data);
    const filled = !isAnyFieldEmpty(root);
    setButtonsEnabled(root, valid && filled);
    if (!valid || !filled) return;
    const chartShown = !root.querySelector('.saving-plan-chart-row')?.hasAttribute('hidden');
    if (!chartShown) return;

    const calculation = getFallbackCalculation(inputs);
    state.calculatedInputs = inputs;
    state.calculatedCalculation = calculation;
    renderResult(state, data, calculation);
    if (state.tweakActive && state.tweakInputs) {
      await renderNewPlan(state, data, state.tweakInputs);
    }
    await renderChart(state, data);
  };

  root.querySelectorAll('[data-field][data-decimal]').forEach((wrap) => {
    const input = wrap.querySelector('input');
    if (!input) return;
    const decimal = wrap.dataset.decimal === '1';
    input.addEventListener('input', () => {
      formatLive(input, decimal);
      liveUpdate();
    });
    input.addEventListener('blur', () => {
      formatFieldValue(input, decimal);
      liveUpdate();
    });
  });

  attachDropdownHandlers(state, data, liveUpdate);

  root.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
    resetCalculator(state, data);
    liveUpdate();
  });

  root.querySelector('[data-action="calculate"]')?.addEventListener('click', async () => {
    const inputs = readInputs(root);
    if (!applyValidation(root, inputs, data)) return;
    // Fetch from API and store result; falls back to local calculation if API unavailable
    const calculation = await fetchCalculation(inputs, state.config.calcUrl, state.config.apimKey);
    state.calculatedInputs = inputs;
    state.calculatedCalculation = calculation;
    state.tweakActive = false;
    state.tweakInputs = null;
    state.tweakCalculation = null;
    renderResult(state, data, calculation);

    syncSliderDisplays(root);
    await renderCategoryBannerForGoal(state, data);
    const isNegative = calculation.SavingMonth < 0;
    if (isNegative) {
      root.querySelector('.saving-plan-chart-row')?.setAttribute('hidden', '');
      root.querySelector('.saving-plan-tweak')?.setAttribute('hidden', '');
      root.querySelector('.saving-plan-products')?.setAttribute('hidden', '');
    } else {
      await loadChartJs(); // pre-load so Chart.js is ready before DOM update
      renderProducts(state, data);
      showAfterCalculate(root);
      renderNewPlanPlaceholder(state, data, inputs);
      await renderChart(state, data);
    }
  });

  let sliderDebounceTimer = null;
  root.querySelectorAll('.saving-plan-slider input').forEach((input) => {
    input.addEventListener('input', () => {
      const sliderName = input.closest('[data-slider]')?.dataset.slider;
      const returnSlider = root.querySelector('[data-slider="annualReturn"] input');
      const increaseSlider = root.querySelector('[data-slider="annualIncrease"] input');
      if (returnSlider && increaseSlider) {
        const returnVal = parseFloat(returnSlider.value);
        const increaseVal = parseFloat(increaseSlider.value);
        if (sliderName === 'annualReturn') {
          // annualIncrease max always equals the current annualReturn value
          const prevReturn = parseFloat(returnSlider.dataset.prev ?? returnVal);
          returnSlider.dataset.prev = returnVal;
          const delta = returnVal - prevReturn;
          // move increase in the opposite direction by the same delta, then clamp to [0, returnVal]
          const newIncrease = Math.min(returnVal, Math.max(0, increaseVal - delta));
          increaseSlider.max = returnVal;
          increaseSlider.value = newIncrease.toFixed(1);
          const maxEl = root.querySelector('[data-slider="annualIncrease"] .saving-plan-slider-value');
          if (maxEl) maxEl.textContent = formatDecimal(returnVal);
        } else if (sliderName === 'annualIncrease' && increaseVal > returnVal) {
          increaseSlider.value = returnVal;
        }
      }
      syncSliderDisplays(root);

      clearTimeout(sliderDebounceTimer);
      sliderDebounceTimer = setTimeout(async () => {
        const tweakInputs = {
          ...(state.calculatedInputs || readInputs(root)),
          ...readSliders(root),
        };
        state.tweakActive = true;
        state.tweakInputs = tweakInputs;
        await renderNewPlan(state, data, tweakInputs);
        await renderChart(state, data);
      }, 600);
    });
  });

  // Initial render — show projected balance with monthly=0 so result panel isn't empty on load.
  liveUpdate();
}

export default async function decorate(block) {
  const siteConfig = await fetchConfigs();
  const configPath = siteConfig.savingPlanConfigPath;
  if (!configPath) return;

  const [json, placeholders] = await Promise.all([
    fetchJson(configPath),
    fetchPlaceholders(),
    loadIcons(),
  ]);

  if (!json) return;

  const cfg = {};
  (json?.saving_tool_config?.data || []).forEach(({ Key, Value }) => {
    if (Key) cfg[Key.replace(/-([a-zA-Z0-9])/g, (_, c) => c.toUpperCase())] = Value;
  });

  const calcUrl = cfg.savingPlanCalculatorUrl || '';
  const apimKey = cfg.savingPlanApimKey || '';

  const lang = getLang();
  const data = buildDataFromConfig(json, lang, placeholders);
  const fragmentPath = cfg.savingPlanFragmentPath?.replace(/\{lang\}/g, lang) || '';

  block.innerHTML = buildShellMarkup(data);
  block.classList.add('saving-plan-block');

  const state = {
    root: block,
    config: { calcUrl, apimKey, fragmentPath },
    calculatedInputs: null,
    calculatedCalculation: null,
    tweakActive: false,
    tweakInputs: null,
    tweakCalculation: null,
    chartInstance: null,
    chartResizeObserver: null,
  };

  renderInfoCard(state);
  renderResult(state, data, { FutureValue: 0, SavingMonth: 0 });
  attachHandlers(state, data);

  // Tag the next section sibling so it can be styled relative to the saving-plan section.
  const section = block.closest('.section');
  const nextSection = section?.nextElementSibling;
  if (nextSection) nextSection.classList.add('saving-plan-container2');

  // // Hide the EDS section-separator <hr> that appears between the block's section and the next.
  // let el = block.parentElement;
  // while (el && el.tagName !== 'MAIN') {
  //   let sib = el.nextElementSibling;
  //   while (sib) {
  //     if (sib.tagName === 'HR') sib.style.display = 'none';
  //     sib = sib.nextElementSibling;
  //   }
  //   el = el.parentElement;
  // }
}

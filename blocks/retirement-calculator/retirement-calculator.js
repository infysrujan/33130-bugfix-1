import fetchBlockConfig from '../../scripts/block-config.js';
import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchPost } from '../../scripts/utils/fetchApi.js';

// ─── Utilities ──────────────────────────────────────────────────────────────────

function parseHTML(html) {
  return new DOMParser().parseFromString(html.trim(), 'text/html').body.firstElementChild;
}

function formatNumber(val) {
  const n = parseFloat(String(val ?? '').replace(/,/g, ''));
  if (Number.isNaN(n)) return '';
  return n.toLocaleString('en-US');
}

function stripCommas(str) {
  return String(str ?? '').replace(/,/g, '');
}

function getString(labels, key, fallback = '') {
  return labels[key] || fallback;
}

// ─── Data ────────────────────────────────────────────────────────────────────────

async function loadData() {
  const [siteConfig, labels, placeholders] = await Promise.all([
    fetchConfigs(),
    fetchBlockConfig('/retirement-config.json'),
    fetchPlaceholders(),
  ]);
  return {
    labels,
    apiUrl: siteConfig.retirementCalculatorApiUrl,
    inflationRate: String(siteConfig.retirementCalculatorInflationRate ?? '1.5'),
    afterRetirementRate: String(siteConfig.retirementCalculatorAfterRetirementRate ?? '3'),
    altCompensationRate: parseFloat(siteConfig.retirementCalculatorAltCompensationRate) || 0.05,
    defaultMonthlyIncome: parseFloat(placeholders.defaultMonthlyIncome) || 20000,
    defaultCurrentAge: parseInt(placeholders.defaultCurrentAge, 10) || 30,
    defaultRetirementAge: parseInt(placeholders.defaultRetirementAge, 10) || 60,
    defaultLifeExpectancy: parseInt(placeholders.defaultLifeExpectancy, 10) || 80,
    defaultSavingsReturnRate: parseFloat(placeholders.defaultSavingsReturnRate) || 3,
  };
}

// ─── Stepper ─────────────────────────────────────────────────────────────────────

function buildStepper(labels, activeStep) {
  const steps = [
    getString(labels, 'commonStep1Label', 'Your goal'),
    getString(labels, 'commonStep2Label', 'Savings & investments'),
    getString(labels, 'commonStep3Label', 'Result'),
  ];
  const stepsContainer = parseHTML('<div class="rc-stepper"></div>');
  steps.forEach((label, idx) => {
    const num = idx + 1;
    const isLastStep = activeStep === steps.length;
    let mod = '';
    if (num === activeStep) mod = isLastStep ? ' rc-step-done' : ' rc-step-active';
    else if (num < activeStep) mod = ' rc-step-done';
    const showTick = num < activeStep || (num === activeStep && isLastStep);
    stepsContainer.appendChild(parseHTML(`
      <div class="rc-step${mod}">
        <div class="rc-step-circle"><span>${showTick ? '✓' : num}</span></div>
        <div class="rc-step-label">${label}</div>
      </div>
    `));
    if (idx < steps.length - 1) {
      stepsContainer.appendChild(parseHTML(`<div class="rc-step-connector${num < activeStep ? ' rc-step-connector-done' : ''}"></div>`));
    }
  });
  return stepsContainer;
}

// ─── Income Card (J1 hero field) ─────────────────────────────────────────────────

function buildIncomeCard(labels, savedValue) {
  const minMsg = `${getString(labels, 'validationMinValueError', 'Minimum must not exceed')} 1`;
  const maxMsg = `${getString(labels, 'validationMaxValueError', 'Maximum up to')} 999,999,999`;

  const card = parseHTML(`
    <div class="rc-income-card">
      <div class="rc-income-title">${getString(labels, 'stepsStep1MonthlyIncomeTitle', 'Monthly amount you want after retirement')}</div>
      <div class="rc-income-input-wrap">
        <input type="text" id="rc-monthlyIncome" class="rc-income-input"
          placeholder="1-999,999,999" maxlength="${formatNumber(999999999).length}" value="${formatNumber(savedValue ?? 0)}">
        <span class="rc-income-unit">${getString(labels, 'commonUnit', 'baht')}</span>
      </div>
      <hr class="rc-income-divider">
      <div class="rc-income-footer">
        <span class="rc-error-text" id="rc-err-monthlyIncome"></span>
        <span class="rc-present-value">${getString(labels, 'stepsStep1CurrentValueNote', 'At present value')}</span>
      </div>
    </div>
  `);

  const inputWrap = card.querySelector('.rc-income-input-wrap');
  const input = card.querySelector('#rc-monthlyIncome');
  const errorElement = card.querySelector('#rc-err-monthlyIncome');

  const setError = (msg) => {
    errorElement.textContent = msg;
    inputWrap.classList.toggle('rc-income-input-wrap-error', !!msg);
    input.classList.toggle('rc-income-input-error', !!msg);
  };

  input.addEventListener('keypress', (e) => { if (!/\d/.test(e.key)) e.preventDefault(); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
      const pos = input.selectionStart;
      if (pos > 0 && input.value[pos - 1] === ',') {
        e.preventDefault();
        input.setSelectionRange(pos - 1, pos - 1);
      }
    }
  });

  input.addEventListener('focus', () => { if (stripCommas(input.value) === '0') input.value = ''; });
  input.addEventListener('blur', () => {
    const val = stripCommas(input.value).trim();
    input.value = formatNumber(val === '' ? 0 : val);
  });

  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const digitsBeforeCursor = input.value.substring(0, pos).replace(/,/g, '').length;
    const rawVal = stripCommas(input.value);
    const formatted = rawVal === '' ? '' : formatNumber(rawVal);
    input.value = formatted;

    let digitCount = 0;
    let newPos = formatted.length;
    for (let i = 0; i < formatted.length; i += 1) {
      if (digitCount === digitsBeforeCursor) { newPos = i; break; }
      if (formatted[i] !== ',') digitCount += 1;
    }
    input.setSelectionRange(newPos, newPos);

    const val = parseFloat(rawVal) || 0;
    if (val < 1) setError(minMsg);
    else if (val > 999999999) setError(maxMsg);
    else setError('');
  });

  return card;
}

// ─── Age Field (J1) ───────────────────────────────────────────────────────────────

function buildAgeField(id, label, savedValue, labels) {
  const minMsg = `${getString(labels, 'validationMinValueError', 'Minimum must not exceed')} 1`;
  const maxMsg = `${getString(labels, 'validationMaxValueError', 'Maximum up to')} 120`;

  const field = parseHTML(`
    <div class="rc-field" data-id="${id}">
      <div class="rc-field-inner">
        <input type="text" id="rc-${id}" class="rc-field-input"
          placeholder="1-120" maxlength="${formatNumber(120).length}" value="${savedValue ?? 0}">
        <label class="rc-field-label" for="rc-${id}">${label}</label>
      </div>
      <p class="rc-field-error" id="rc-err-${id}"></p>
    </div>
  `);

  const inner = field.querySelector('.rc-field-inner');
  const input = field.querySelector(`#rc-${id}`);
  const errorElement = field.querySelector(`#rc-err-${id}`);

  field.setError = (msg) => {
    errorElement.textContent = msg;
    inner.classList.toggle('rc-field-inner-error', !!msg);
    input.classList.toggle('rc-field-input-error', !!msg);
  };
  field.getValue = () => parseInt(input.value, 10) || 0;

  input.addEventListener('keypress', (e) => { if (!/\d/.test(e.key)) e.preventDefault(); });
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '');
    const val = parseInt(input.value, 10) || 0;
    if (val < 1) field.setError(minMsg);
    else if (val > 120) field.setError(maxMsg);
    else field.setError('');
  });

  return field;
}

// ─── Money Field (J2 sections) ───────────────────────────────────────────────────

function buildMoneyField(id, label, savedValue, labels) {
  const maxMsg = `${getString(labels, 'validationMaxValueError', 'Maximum up to')} 999,999,999`;

  const field = parseHTML(`
    <div class="rc-field" data-id="${id}">
      <div class="rc-field-inner">
        <input type="text" id="rc-${id}" class="rc-field-input"
          placeholder="0 - 999,999,999" maxlength="${formatNumber(999999999).length}" value="${formatNumber(savedValue ?? 0)}">
        <label class="rc-field-label" for="rc-${id}">${label}</label>
      </div>
      <p class="rc-field-error" id="rc-err-${id}"></p>
    </div>
  `);

  const inner = field.querySelector('.rc-field-inner');
  const input = field.querySelector(`#rc-${id}`);
  const errorElement = field.querySelector(`#rc-err-${id}`);

  field.setError = (msg) => {
    errorElement.textContent = msg;
    inner.classList.toggle('rc-field-inner-error', !!msg);
    input.classList.toggle('rc-field-input-error', !!msg);
  };
  field.getValue = () => parseFloat(stripCommas(input.value)) || 0;

  input.addEventListener('keypress', (e) => { if (!/\d/.test(e.key)) e.preventDefault(); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
      const pos = input.selectionStart;
      if (pos > 0 && input.value[pos - 1] === ',') {
        e.preventDefault();
        input.setSelectionRange(pos - 1, pos - 1);
      }
    }
  });

  input.addEventListener('focus', () => { if (stripCommas(input.value) === '0') input.value = ''; });
  input.addEventListener('blur', () => {
    const val = stripCommas(input.value).trim();
    input.value = formatNumber(val === '' ? 0 : val);
  });

  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const digitsBeforeCursor = input.value.substring(0, pos).replace(/,/g, '').length;
    const rawVal = stripCommas(input.value);
    const formatted = rawVal === '' ? '' : formatNumber(rawVal);
    input.value = formatted;

    let digitCount = 0;
    let newPos = formatted.length;
    for (let i = 0; i < formatted.length; i += 1) {
      if (digitCount === digitsBeforeCursor) { newPos = i; break; }
      if (formatted[i] !== ',') digitCount += 1;
    }
    input.setSelectionRange(newPos, newPos);

    if ((parseFloat(rawVal) || 0) > 999999999) field.setError(maxMsg);
    else field.setError('');
  });

  return field;
}

// ─── Percent Field (J2 sections) ─────────────────────────────────────────────────

function buildPercentField(id, label, savedValue, labels, { min = 0, max = 100 } = {}) {
  const rangeMsg = getString(labels, 'validationPercentageError', 'Value must be a number between 0 and 100');

  const field = parseHTML(`
    <div class="rc-field" data-id="${id}">
      <div class="rc-field-inner">
        <input type="text" id="rc-${id}" class="rc-field-input"
          placeholder="${min} - ${max}" maxlength="${formatNumber(Math.floor(max - 0.01)).length + 3}" value="${savedValue ?? 0}">
        <label class="rc-field-label" for="rc-${id}">${label}</label>
      </div>
      <p class="rc-field-error" id="rc-err-${id}"></p>
    </div>
  `);

  const inner = field.querySelector('.rc-field-inner');
  const input = field.querySelector(`#rc-${id}`);
  const errorElement = field.querySelector(`#rc-err-${id}`);

  field.setError = (msg) => {
    errorElement.textContent = msg;
    inner.classList.toggle('rc-field-inner-error', !!msg);
    input.classList.toggle('rc-field-input-error', !!msg);
  };
  field.getValue = () => parseFloat(input.value) || 0;

  input.addEventListener('keypress', (e) => {
    if (!/[\d.]/.test(e.key)) e.preventDefault();
    if (e.key === '.' && input.value.includes('.')) e.preventDefault();
    const dotIdx = input.value.indexOf('.');
    if (dotIdx !== -1 && e.key !== '.' && input.selectionStart > dotIdx && input.value.length - dotIdx > 2) {
      e.preventDefault();
    }
  });
  input.addEventListener('focus', () => { if (input.value === '0') input.value = ''; });
  input.addEventListener('blur', () => { if (input.value.trim() === '') input.value = '0'; });
  input.addEventListener('input', () => {
    const dotIdx = input.value.indexOf('.');
    if (dotIdx !== -1 && input.value.length - dotIdx > 3) {
      input.value = input.value.slice(0, dotIdx + 3);
    }
    const val = parseFloat(input.value);
    if (!Number.isNaN(val) && (val < min || val > max)) field.setError(rangeMsg);
    else field.setError('');
  });

  return field;
}

// ─── Section Header (J2) ─────────────────────────────────────────────────────────

function buildSectionHeader(title) {
  return parseHTML(`<h3 class="rc-section-title">${title}</h3>`);
}

// ─── Progressive Reveal (J2 sections) ────────────────────────────────────────────

function initProgressiveReveal(sectionEl) {
  const fields = [...sectionEl.querySelectorAll('.rc-field')];
  if (fields.length <= 1) return;
  fields.slice(1).forEach((f) => f.classList.add('rc-field-hidden'));
  const firstInput = fields[0].querySelector('input');
  if (!firstInput) return;
  firstInput.addEventListener('focus', () => {
    fields.forEach((f) => f.classList.remove('rc-field-hidden'));
  }, { once: true });
}

function buildHeader(labels) {
  return parseHTML(`
    <div class="rc-header">
      <h1 class="rc-title">${getString(labels, 'commonTitle', 'Plan your finances for retirement')}</h1>
      <div class="rc-divider"></div>
    </div>
  `);
}

// ─── Journey 1 ───────────────────────────────────────────────────────────────────

function renderJourney1(block, data, onNext, savedValues = {}) {
  block.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const { labels, apiUrl } = data;

  const container = parseHTML('<div class="rc-container rc-step-1"></div>');
  container.appendChild(buildHeader(labels));
  container.appendChild(buildStepper(labels, 1));

  const content = parseHTML('<div class="rc-content"></div>');
  const incomeCardValue = savedValues.monthlyIncome ?? data.defaultMonthlyIncome;
  content.appendChild(buildIncomeCard(labels, incomeCardValue));

  const fieldsWrap = parseHTML('<div class="rc-fields"></div>');
  const currentAgeField = buildAgeField('currentAge', getString(labels, 'stepsStep1CurrentAge', 'How old are you?'), savedValues.currentAge ?? data.defaultCurrentAge, labels);
  const retirementAgeField = buildAgeField('retirementAge', getString(labels, 'stepsStep1RetirementAge', 'What age do you plan to retire?'), savedValues.retirementAge ?? data.defaultRetirementAge, labels);
  const lifeExpectancyField = buildAgeField('lifeExpectancy', getString(labels, 'stepsStep1LifeExpectancy', 'Until what age do you expect to live?'), savedValues.lifeExpectancy ?? data.defaultLifeExpectancy, labels);
  fieldsWrap.appendChild(currentAgeField);
  fieldsWrap.appendChild(retirementAgeField);
  fieldsWrap.appendChild(lifeExpectancyField);
  content.appendChild(fieldsWrap);
  container.appendChild(content);

  const footer = parseHTML(`
    <div class="rc-actions">
      <button type="button" class="button-m primary">${getString(labels, 'buttonsNextButton', 'Next')}</button>
    </div>
  `);
  container.appendChild(footer);
  block.appendChild(container);

  const nextBtn = footer.querySelector('.button-m.primary');

  const validateCrossFields = () => {
    const currentAge = currentAgeField.getValue();
    const retirementAge = retirementAgeField.getValue();
    const lifeExpectancy = lifeExpectancyField.getValue();

    const crossAgeMsg = getString(labels, 'validationCurrentAgeRetirementAgeError', 'Your current age must be less than your retirement age');
    const crossRetireMsg = getString(labels, 'validationRetirementAgeLifeExpectancyError', 'Your retirement age must be less than your life expectancy');

    const ageErrEl = block.querySelector('#rc-err-currentAge');
    const retireErrEl = block.querySelector('#rc-err-retirementAge');
    const lifeErrEl = block.querySelector('#rc-err-lifeExpectancy');

    if (ageErrEl.textContent === crossAgeMsg) currentAgeField.setError('');
    if (retireErrEl.textContent === crossAgeMsg || retireErrEl.textContent === crossRetireMsg) retirementAgeField.setError('');
    if (lifeErrEl.textContent === crossRetireMsg) lifeExpectancyField.setError('');

    const currentAgeErr = block.querySelector('#rc-err-currentAge').textContent;
    const retirementAgeErr = block.querySelector('#rc-err-retirementAge').textContent;
    const lifeExpectancyErr = block.querySelector('#rc-err-lifeExpectancy').textContent;

    if (currentAge >= retirementAge) {
      if (!currentAgeErr) currentAgeField.setError(crossAgeMsg);
      if (!retirementAgeErr) retirementAgeField.setError(crossAgeMsg);
    } else if (retirementAge >= lifeExpectancy) {
      if (!retirementAgeErr) retirementAgeField.setError(crossRetireMsg);
      if (!lifeExpectancyErr) lifeExpectancyField.setError(crossRetireMsg);
    }
  };

  const syncBtnState = () => {
    const hasError = !!block.querySelector('.rc-field-error:not(:empty), #rc-err-monthlyIncome:not(:empty)');
    nextBtn.disabled = hasError;
    nextBtn.classList.toggle('rc-btn-error', hasError);
  };

  container.addEventListener('input', () => { validateCrossFields(); syncBtnState(); });

  nextBtn.addEventListener('click', async () => {
    const monthlyIncome = parseFloat(stripCommas(block.querySelector('#rc-monthlyIncome')?.value || '0')) || 0;
    const currentAge = currentAgeField.getValue();
    const retirementAge = retirementAgeField.getValue();
    const lifeExpectancy = lifeExpectancyField.getValue();

    nextBtn.disabled = true;
    try {
      const payload = {
        CurrentAGE: currentAge,
        RetireAGE: retirementAge,
        SavingAGE: lifeExpectancy,
        ChargesRetireAmount: monthlyIncome,
        SavingBeginAmount: 0,
        CompensationRate: 0.03,
        SavingIncRate: 0,
        SavingCurrent: 0,
        IncomeRetire: 0,
        PVDRetire: 0,
        IncIncomeRetire: 0,
        CompensationRateRetire: 0,
        RMFSumRetire: 0,
        RMFSavingRateRetire: 0,
        RMFCompensationRateRetire: 0,
        SumYearRetire: 0,
        YearCompensationRateRetire: 0,
        OneTimeMoneyRetire: 0,
        inflationrate: data.inflationRate,
        afterretirerate: data.afterRetirementRate,
      };
      const apiResult = await fetchPost(apiUrl, payload);
      onNext({
        monthlyIncome, currentAge, retirementAge, lifeExpectancy,
      }, apiResult);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Retirement calculator API error:', err);
      nextBtn.disabled = false;
    }
  });
}

// ─── Journey 2 ───────────────────────────────────────────────────────────────────

function renderJourney2(block, data, state, onBack, onCalculate, savedValues = {}) {
  block.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const { labels, apiUrl } = data;

  const container = parseHTML('<div class="rc-container rc-step-2"></div>');
  container.appendChild(buildHeader(labels));
  container.appendChild(buildStepper(labels, 2));

  const content = parseHTML('<div class="rc-content rc-content-sections"></div>');

  // ── J1 result summary ──
  const j1Result = state.j1ApiResult || {};
  const totalNeeded = formatNumber(Math.round(j1Result.TotalChargesValue || 0));
  const monthlyAvail = formatNumber(Math.round(j1Result.FvMonthlyGoals || 0));
  const bahtUnit = getString(labels, 'commonBahtUnit', 'baht');
  const summaryCard = parseHTML(`
    <div class="rc-j1-summary">
      <div class="rc-j1-summary-card">
        <div class="rc-j1-summary-row">
          <p class="rc-j1-summary-label">${getString(labels, 'stepsStep2TotalAmountNeededLabel', 'Total amount needed')}</p>
          <p class="rc-j1-summary-value">${totalNeeded} <span class="rc-j1-summary-unit">${bahtUnit}</span></p>
        </div>
        <hr class="rc-j1-summary-divider">
        <div class="rc-j1-summary-row">
          <p class="rc-j1-summary-label">${getString(labels, 'stepsStep2MonthlyAmountAvailableLabel', 'Monthly amount available')}</p>
          <p class="rc-j1-summary-value">${monthlyAvail} <span class="rc-j1-summary-unit">${bahtUnit}</span></p>
        </div>
      </div>
      <p class="rc-j1-summary-note">${getString(labels, 'stepsStep2InflationNote', 'Including an inflation rate of 1.5% p.a., the return on investment after retirement is assumed to be 3% p.a.')}</p>
    </div>
  `);
  content.appendChild(summaryCard);

  // ── J2 heading ──
  content.appendChild(parseHTML(`
    <div class="rc-j2-heading">
      <h2 class="rc-j2-heading-text">
        <span>${getString(labels, 'stepsStep2MoreInfoTitle', 'Give us more information')}</span><br>
        <span>${getString(labels, 'stepsStep2MoreInfoSubtitle', 'for a precise calculation')}</span>
      </h2>
    </div>
  `));

  // ── Savings ──
  const savingsWrap = parseHTML('<div class="rc-section"></div>');
  savingsWrap.appendChild(buildSectionHeader(getString(labels, 'stepsStep2SavingsSection', 'Savings')));
  const currentSavingsField = buildMoneyField('currentSavings', getString(labels, 'stepsStep2CurrentSavingsLabel', 'Current savings balance'), savedValues.SavingBeginAmount, labels);
  const savingsReturnRateField = buildPercentField('savingsReturnRate', getString(labels, 'stepsStep2SavingsExpectedReturnRateLabel', 'Expected annual return (%)'), savedValues.CompensationRatePct ?? data.defaultSavingsReturnRate, labels);
  const savingsIncreaseRateField = buildPercentField('savingsIncreaseRate', getString(labels, 'stepsStep2AnnualSavingsIncreaseRateLabel', 'Expected annual savings increase (%)'), savedValues.SavingIncRatePct ?? 0, labels);
  savingsWrap.appendChild(currentSavingsField);
  savingsWrap.appendChild(savingsReturnRateField);
  savingsWrap.appendChild(savingsIncreaseRateField);
  initProgressiveReveal(savingsWrap);
  content.appendChild(savingsWrap);

  // ── Provident Fund ──
  const pvdWrap = parseHTML('<div class="rc-section"></div>');
  pvdWrap.appendChild(buildSectionHeader(getString(labels, 'stepsStep2ProvidentFundSection', 'Provident fund')));
  const pvdCurrentField = buildMoneyField('pvdCurrent', getString(labels, 'stepsStep2CurrentProvidentFundSavingsLabel', 'Current balance in provident fund'), savedValues.PVDRetire, labels);
  const pvdReturnRateField = buildPercentField('pvdReturnRate', getString(labels, 'stepsStep2ProvidentFundExpectedReturnRateLabel', 'Expected annual return (%)'), savedValues.CompensationRateRetirePct ?? 0, labels);
  const salaryField = buildMoneyField('salary', getString(labels, 'stepsStep2MonthlySalaryLabel', 'Current salary'), savedValues.IncomeRetire, labels);
  const salaryIncreaseField = buildPercentField('salaryIncrease', getString(labels, 'stepsStep2AnnualSalaryIncreaseRateLabel', 'Estimated annual salary increase (%)'), savedValues.IncIncomeRetirePct ?? 0, labels);
  const pvdContribField = buildPercentField('pvdContrib', getString(labels, 'stepsStep2ProvidentFundContributionRateLabel', 'Monthly provident fund contribution (%)'), savedValues.SavingCurrentPct ?? 0, labels);
  pvdWrap.appendChild(pvdCurrentField);
  pvdWrap.appendChild(pvdReturnRateField);
  pvdWrap.appendChild(salaryField);
  pvdWrap.appendChild(salaryIncreaseField);
  pvdWrap.appendChild(pvdContribField);
  initProgressiveReveal(pvdWrap);
  content.appendChild(pvdWrap);

  // ── RMF ──
  const rmfWrap = parseHTML('<div class="rc-section"></div>');
  rmfWrap.appendChild(buildSectionHeader(getString(labels, 'stepsStep2RmfSection', 'Retirement Mutual Fund (RMF)')));
  const rmfCurrentField = buildMoneyField('rmfCurrent', getString(labels, 'stepsStep2CurrentRMFSavingsLabel', 'Current balance in RMF'), savedValues.RMFSumRetire, labels);
  const rmfAnnualField = buildMoneyField('rmfAnnual', getString(labels, 'stepsStep2ExpectedAnnualRMFAccumulationLabel', 'Expected annual RMF contribution'), savedValues.RMFSavingRateRetire, labels);
  const rmfReturnRateField = buildPercentField('rmfReturnRate', getString(labels, 'stepsStep2RmfExpectedReturnRateLabel', 'Expected annual return (%)'), savedValues.RMFCompensationRateRetirePct ?? 0, labels);
  rmfWrap.appendChild(rmfCurrentField);
  rmfWrap.appendChild(rmfAnnualField);
  rmfWrap.appendChild(rmfReturnRateField);
  initProgressiveReveal(rmfWrap);
  content.appendChild(rmfWrap);

  // ── Lump Sum ──
  const lumpSumWrap = parseHTML('<div class="rc-section"></div>');
  lumpSumWrap.appendChild(buildSectionHeader(getString(labels, 'stepsStep2LumpSumSection', 'Lump sum at retirement')));
  const lumpSumField = buildMoneyField('lumpSum', getString(labels, 'stepsStep2LumpSumAtRetirementLabel', 'Expected lump sum at retirement'), savedValues.SumYearRetire, labels);
  const annualInvestmentField = buildMoneyField('annualInvestment', getString(labels, 'stepsStep2ExpectedAnnualInvestmentLabel', 'Allocated lump sum for annual investing or savings'), savedValues.OneTimeMoneyRetire, labels);
  const lumpSumReturnRateField = buildPercentField('lumpSumReturnRate', getString(labels, 'stepsStep2LumpSumExpectedReturnRateLabel', 'Expected annual return (%)'), savedValues.YearCompensationRateRetirePct ?? 0, labels);
  lumpSumWrap.appendChild(lumpSumField);
  lumpSumWrap.appendChild(annualInvestmentField);
  lumpSumWrap.appendChild(lumpSumReturnRateField);
  initProgressiveReveal(lumpSumWrap);
  content.appendChild(lumpSumWrap);

  container.appendChild(content);

  const footer = parseHTML(`
    <div class="rc-actions">
      <button type="button" class="button-m secondary">${getString(labels, 'buttonsBackButton', 'Back')}</button>
      <button type="button" class="button-m primary">${getString(labels, 'buttonsCalculateButton', 'Calculate')}</button>
    </div>
  `);
  container.appendChild(footer);
  block.appendChild(container);

  const calculateBtn = footer.querySelector('.button-m.primary');

  const validateSavingsCross = () => {
    const returnRate = savingsReturnRateField.getValue();
    const increaseRate = savingsIncreaseRateField.getValue();
    const increaseErr = block.querySelector('#rc-err-savingsIncreaseRate').textContent;
    if (!increaseErr && increaseRate > returnRate) {
      savingsIncreaseRateField.setError(
        getString(labels, 'validationAnnualSavingsIncreaseRateError', '% of annual increase in savings must be less than/equal to the expected annual return.'),
      );
    }
  };

  const syncBtnState = () => {
    const hasError = !!block.querySelector('.rc-field-error:not(:empty)');
    calculateBtn.disabled = hasError;
    calculateBtn.classList.toggle('rc-btn-error', hasError);
  };

  container.addEventListener('input', () => { validateSavingsCross(); syncBtnState(); });

  footer.querySelector('.button-m.secondary').addEventListener('click', onBack);

  calculateBtn.addEventListener('click', async () => {
    calculateBtn.disabled = true;
    const journey2Values = {
      SavingBeginAmount: currentSavingsField.getValue(),
      CompensationRatePct: savingsReturnRateField.getValue(),
      SavingIncRatePct: savingsIncreaseRateField.getValue(),
      PVDRetire: pvdCurrentField.getValue(),
      CompensationRateRetirePct: pvdReturnRateField.getValue(),
      IncomeRetire: salaryField.getValue(),
      IncIncomeRetirePct: salaryIncreaseField.getValue(),
      SavingCurrentPct: pvdContribField.getValue(),
      RMFSumRetire: rmfCurrentField.getValue(),
      RMFSavingRateRetire: rmfAnnualField.getValue(),
      RMFCompensationRateRetirePct: rmfReturnRateField.getValue(),
      SumYearRetire: lumpSumField.getValue(),
      OneTimeMoneyRetire: annualInvestmentField.getValue(),
      YearCompensationRateRetirePct: lumpSumReturnRateField.getValue(),
    };

    try {
      const userReturnRate = journey2Values.CompensationRatePct
        ?? data.defaultSavingsReturnRate
        ?? 3;
      const altReturnRate = userReturnRate + 2;

      const payload = {
        CurrentAGE: state.journey1.currentAge,
        RetireAGE: state.journey1.retirementAge,
        SavingAGE: state.journey1.lifeExpectancy,
        ChargesRetireAmount: state.journey1.monthlyIncome,
        SavingBeginAmount: journey2Values.SavingBeginAmount,
        CompensationRate: userReturnRate / 100,
        SavingIncRate: journey2Values.SavingIncRatePct / 100,
        SavingCurrent: journey2Values.SavingCurrentPct / 100,
        IncomeRetire: journey2Values.IncomeRetire,
        PVDRetire: journey2Values.PVDRetire,
        IncIncomeRetire: journey2Values.IncIncomeRetirePct / 100,
        CompensationRateRetire: journey2Values.CompensationRateRetirePct / 100,
        RMFSumRetire: journey2Values.RMFSumRetire,
        RMFSavingRateRetire: journey2Values.RMFSavingRateRetire,
        RMFCompensationRateRetire: journey2Values.RMFCompensationRateRetirePct / 100,
        SumYearRetire: journey2Values.SumYearRetire,
        YearCompensationRateRetire: journey2Values.YearCompensationRateRetirePct / 100,
        OneTimeMoneyRetire: journey2Values.OneTimeMoneyRetire,
        inflationrate: data.inflationRate,
        afterretirerate: data.afterRetirementRate,
      };
      const payload5 = { ...payload, CompensationRate: altReturnRate / 100 };
      const [apiResult1, apiResult2] = await Promise.all([
        fetchPost(apiUrl, payload),
        fetchPost(apiUrl, payload5),
      ]);
      onCalculate(journey2Values, apiResult1, apiResult2);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Retirement calculator API error:', err);
      calculateBtn.disabled = false;
    }
  });
}

// ─── Journey 3 ───────────────────────────────────────────────────────────────────

function renderJourney3(block, data, state, onBack) {
  block.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const { labels } = data;
  const result1 = state.j2ApiResult1 || {};
  const result2 = state.j2ApiResult2 || {};
  const totalNeeded = Math.round(result1.TotalChargesValue || 0);
  const monthlyAvail = Math.round(result1.FvMonthlyGoals || 0);
  const savingMonth1 = Math.round(result1.SavingMonth || 0);
  const savingMonth2 = Math.round(result2.SavingMonth || 0);
  const currentSavings = state.journey2?.SavingBeginAmount || 0;
  const alreadySaved = savingMonth1 < 0;
  const baht = getString(labels, 'commonBahtUnit', 'baht');

  const container = parseHTML('<div class="rc-container rc-step-3"></div>');
  container.appendChild(buildHeader(labels));
  container.appendChild(buildStepper(labels, 3));

  const content = parseHTML('<div class="rc-content"></div>');

  // ── Summary card (same as J2) ──
  const summaryCard = parseHTML(`
    <div class="rc-j1-summary">
      <div class="rc-j1-summary-card">
        <div class="rc-j1-summary-row">
          <p class="rc-j1-summary-label">
            ${getString(labels, 'stepsStep2TotalAmountNeededLabel', 'Total amount needed')}
          </p>
          <p class="rc-j1-summary-value">
            ${formatNumber(totalNeeded)} <span class="rc-j1-summary-unit">${baht}</span>
          </p>
        </div>
        <hr class="rc-j1-summary-divider">
        <div class="rc-j1-summary-row">
          <p class="rc-j1-summary-label">
            ${getString(labels, 'stepsStep2MonthlyAmountAvailableLabel', 'Monthly amount available')}
          </p>
          <p class="rc-j1-summary-value">
            ${formatNumber(monthlyAvail)} <span class="rc-j1-summary-unit">${baht}</span>
          </p>
        </div>
      </div>
      <p class="rc-j1-summary-note">
        ${getString(labels, 'stepsStep2InflationNote', 'Including an inflation rate of 1.5% p.a., the return on investment after retirement is assumed to be 3% p.a.')}
      </p>
    </div>
  `);
  content.appendChild(summaryCard);

  if (alreadySaved) {
    // ── Case 1: already saved enough ──
    content.appendChild(parseHTML(`
      <div class="rc-awesome-banner">
        <p class="rc-awesome-text">
          ${getString(labels, 'stepsStep3AlreadySavedMessage', 'Awesome! After the calculation, you will have enough money for your retirement')}
        </p>
      </div>
    `));
  } else {
    const userReturnRate = state.journey2?.CompensationRatePct
      ?? data.defaultSavingsReturnRate
      ?? 3;
    const altReturnRate = userReturnRate + 2;

    const note1Text = getString(labels, 'stepsStep3SavingsReturnNote3', 'Based on expected annual return on savings of 3%')
      .replace(/\d+(?:\.\d+)?%/, `${userReturnRate}%`);
    const note2Text = getString(labels, 'stepsStep3SavingsReturnNote5', 'If you invest with an annual return of 5%')
      .replace(/\d+(?:\.\d+)?%/, `${altReturnRate}%`);

    // ── Cases 2 & 3: savings cards ──
    const altCard = savingMonth2 >= 0 ? `
        <div class="rc-savings-card-alt">
          <p class="rc-savings-card-title rc-savings-card-title-alt">${getString(labels, 'stepsStep3OrSaveJustLabel', 'Or\nsave just')}</p>
          <p class="rc-savings-card-amount rc-savings-card-amount-alt">
            ${formatNumber(savingMonth2)} <span class="rc-savings-card-unit rc-savings-card-unit-alt">${baht}</span>
          </p>
          <p class="rc-savings-card-note rc-savings-card-note-alt">
            ${note2Text}
          </p>
        </div>` : '';
    content.appendChild(parseHTML(`
      <div class="rc-savings-cards">
        <div class="rc-savings-card-recommended">
          <p class="rc-savings-card-title">${getString(labels, 'stepsStep3RecommendedMonthlySavingsLabel', 'Recommended\nmonthly savings')}</p>
          <p class="rc-savings-card-amount">
            ${formatNumber(savingMonth1)} <span class="rc-savings-card-unit">${baht}</span>
          </p>
          <p class="rc-savings-card-note">
            ${note1Text}
          </p>
        </div>
        ${altCard}
      </div>
    `));

    // ── Calculation summary heading ──
    content.appendChild(parseHTML(`
      <h2 class="rc-calc-summary-title">
        ${getString(labels, 'stepsStep3CalculationSummaryLabel', 'Calculation summary')}
      </h2>
    `));

    // ── Case 3: progress bar ──
    if (currentSavings > 0) {
      const pct = Math.min((currentSavings / totalNeeded) * 100, 100);
      content.appendChild(parseHTML(`
        <div class="rc-progress-wrap">
          <p class="rc-progress-label">${getString(labels, 'stepsStep3CurrentSavingsAmountLabel', 'Current savings amount')}</p>
          <div class="rc-progress-amounts">
            <p class="rc-progress-current">
              ${formatNumber(currentSavings)} <span class="rc-progress-unit">${baht}</span>
            </p>
            <p class="rc-progress-total">
              /${formatNumber(totalNeeded)} <span class="rc-progress-unit">${baht}</span>
            </p>
          </div>
          <div class="rc-progress-bar-track">
            <div class="rc-progress-bar-fill rc-progress-bar-fill-animated" style="width:${pct}%"></div>
          </div>
        </div>
      `));
    }

    // ── Summary table ──
    const currentSavingsDisplay = currentSavings > 0 ? formatNumber(currentSavings) : '-';
    content.appendChild(parseHTML(`
      <div class="rc-summary-table">
        <div class="rc-summary-row">
          <p class="rc-summary-label">
            ${getString(labels, 'stepsStep3TotalAmountNeededSummaryLabel', 'Total amount needed')}
          </p>
          <p class="rc-summary-value">
            ${formatNumber(totalNeeded)} <span class="rc-summary-unit">${baht}</span>
          </p>
        </div>
        <div class="rc-summary-row rc-summary-row-secondary">
          <p class="rc-summary-label">
            ${getString(labels, 'stepsStep3CurrentSavingsAmountLabel', 'Current savings amount')}
          </p>
          <p class="rc-summary-value rc-summary-value-plain">
            ${currentSavingsDisplay} <span class="rc-summary-unit">${baht}</span>
          </p>
        </div>
        <div class="rc-summary-row">
          <span>
            <p class="rc-summary-label">
              ${getString(labels, 'stepsStep3RecommendedMonthlySavingsSummaryLabel', 'Recommended monthly savings')}
            </p>
            <p class="rc-summary-sublabel">
              ${getString(labels, 'stepsStep3InvestConsistentlyNote', 'You can save less each month by investing consistently')}
            </p>
          </span>
          <p class="rc-summary-value rc-summary-value-arrow">
            <img src="/icons/down-arrow.svg" aria-hidden="true" width="24" height="24">
            ${formatNumber(savingMonth1)} <span class="rc-summary-unit">${baht}</span>
          </p>
        </div>
      </div>
    `));
  }

  container.appendChild(content);

  const footer = parseHTML(`
    <div class="rc-actions">
      <button type="button" class="button-m secondary">${getString(labels, 'buttonsBackButton', 'Back')}</button>
    </div>
  `);
  container.appendChild(footer);
  block.appendChild(container);

  footer.querySelector('.button-m.secondary').addEventListener('click', onBack);
}

// ─── Main ─────────────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  block.innerHTML = '';
  try {
    const data = await loadData();
    const state = {};

    const toggleCardListVisibility = (show) => {
      const sec = document.querySelector('.card-list-container');
      if (sec) {
        sec.classList.toggle('hidden', !show);
      }
    };

    const goToJourney3 = () => {
      toggleCardListVisibility(true);
      // eslint-disable-next-line no-use-before-define
      renderJourney3(block, data, state, goToJourney2);
    };

    const goToJourney2 = () => {
      toggleCardListVisibility(false);
      // eslint-disable-next-line no-use-before-define
      renderJourney2(block, data, state, goToJourney1, (journey2Values, apiResult1, apiResult2) => {
        state.journey2 = journey2Values;
        state.j2ApiResult1 = apiResult1;
        state.j2ApiResult2 = apiResult2;
        goToJourney3();
      }, state.journey2 || {});
    };

    const goToJourney1 = () => {
      toggleCardListVisibility(false);
      renderJourney1(block, data, (journey1Values, apiResult) => {
        state.journey1 = journey1Values;
        state.j1ApiResult = apiResult;
        goToJourney2();
      }, state.journey1 || {});
    };

    goToJourney1();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Retirement calculator failed to initialise:', e);
  }
}

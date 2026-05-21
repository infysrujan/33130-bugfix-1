import fetchBlockConfig from '../../scripts/block-config.js';
import { fetchConfigs } from '../../scripts/config.js';

// ─── Utilities ─────────────────────────────────────────────────────────────────

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

function parseHTML(html) {
  return new DOMParser().parseFromString(html.trim(), 'text/html').body.firstElementChild;
}

function buildNotes(title, noteLines) {
  const div = parseHTML('<div class="tax-calc-notes"></div>');
  const titleElement = parseHTML('<p class="tax-calc-notes-title"></p>');
  titleElement.textContent = title;
  div.appendChild(titleElement);
  noteLines.forEach((line) => {
    const p = parseHTML('<p class="tax-calc-notes-body"></p>');
    p.innerHTML = line;
    div.appendChild(p);
  });
  return div;
}

// ─── Data ───────────────────────────────────────────────────────────────────────

async function loadData() {
  const [siteConfig, labels] = await Promise.all([
    fetchConfigs(),
    fetchBlockConfig('/tax-savings-config.json'),
  ]);
  return {
    labels,
    apiCalculateTax: siteConfig.calculateTaxWithReduce,
    apiCalculateSaving: siteConfig.calculateSavingTaxBySelf,
    combinedInsuranceMax: parseFloat(siteConfig['combined-insurance-max']) || 100000,
    fatherInsureMax: parseFloat(siteConfig['father-insure-max']) || 15000,
    homeInterestMax: parseFloat(siteConfig['home-interest-max']) || 100000,
    otherDeductionsMax: parseFloat(siteConfig['other-deductions-max']) || 1000000,
    donateMax: parseFloat(siteConfig['donate-max']) || 999999999,
    maxChildrenCount: parseInt(siteConfig['max-children-count'], 10) || 10,
    providentFundMaxPct: parseFloat(siteConfig['provident-fund-max-pct']) || 15,
  };
}

// ─── Journey 1 field definitions ───────────────────────────────────────────────

function getJourney1Fields(labels, config) {
  return [
    {
      id: 'Income',
      label: getString(labels, 'stepsStep1CurrentMonthlyIncomeLabel', 'Salary*'),
      placeholder: `0 - ${formatNumber(999999999)}`,
      defaultValue: parseFloat(labels.defaultsCurrentMonthlyIncome) || 0,
      maxLength: 11,
      min: 0,
      max: 999999999,
      factor: 1,
      errorMsg: '',
    },
    {
      id: 'OtherIncome',
      label: getString(labels, 'stepsStep1OtherIncomeLabel', 'Other annual income (non-salary)*'),
      placeholder: `0 - ${formatNumber(999999999)}`,
      defaultValue: null,
      maxLength: 11,
      min: 0,
      max: 999999999,
      factor: 1,
      errorMsg: '',
    },
    {
      id: 'Bonus',
      label: getString(labels, 'stepsStep1AnnualBonusLabel', 'Annual bonus'),
      placeholder: `0 - ${formatNumber(999999999)}`,
      defaultValue: parseFloat(labels.defaultsAnnualBonus) || 0,
      maxLength: 11,
      min: 0,
      max: 999999999,
      factor: 1,
      errorMsg: '',
    },
    {
      id: 'ProvidentFund',
      label: getString(labels, 'stepsStep1ProvidentFundContributionRateLabel', 'Percentage of provident fund contribution (%)'),
      placeholder: `0 - ${config.providentFundMaxPct}`,
      defaultValue: parseFloat(labels.defaultsProvidentFundContributionRate) || 0,
      maxLength: null,
      min: 0,
      max: config.providentFundMaxPct,
      factor: 0.01,
      errorMsg: getString(labels, 'configValidationMaxValueError', 'Maximum up to {max}'),
    },
  ];
}

// ─── Journey 2 field groups ─────────────────────────────────────────────────────
// hint uses {max} as a placeholder — resolved dynamically by buildInputField.

function getJourney2Groups(labels, apiResponse, config) {
  const allUsedMsg = getString(labels, 'resultsNoRemainDeduction', 'All tax deductions have been used.');
  const maxErrMsg = getString(labels, 'configValidationMaxValueError', 'Maximum up to {max}');
  const insureHint = getString(labels, 'stepsStep2LifeInsurancePremiumMax', 'Max allowance {max} baht');
  const healthHint = getString(labels, 'stepsStep2HealthInsurancePremiumMax', 'Max allowance {max} baht');
  const pensionHint = getString(labels, 'stepsStep2LifePensionInsurancePremiumMax', 'Max allowance {max} baht');
  const fatherInsureHint = getString(labels, 'stepsStep2HealthParentInsurancePremiumMax', 'Max allowance {max} baht');
  const rmfHint = getString(labels, 'stepsStep2RmfSavingsMax', 'Max allowance {max} baht');
  const esgHint = getString(labels, 'stepsStep2ThaiEsgSavingsMax', 'Max allowance {max} baht');

  return [
    {
      id: 'family',
      label: getString(labels, 'stepsStep2FamilyDeductionLabel', 'Family'),
      tooltip: getString(labels, 'stepsStep2FamilyDeductionHint', 'The amount entered must not exceed the amount actually paid and not be more than the tax allowance threshold as specified by the Revenue Department.'),
      fields: [
        {
          id: 'NumberOfChildeBornBefore61',
          label: getString(labels, 'stepsStep2NumberOfChildrenBefore2561Label', 'Number of children (born before 2018)'),
          placeholder: `0 - ${config.maxChildrenCount}`,
          defaultValue: 0,
          maxLength: String(config.maxChildrenCount).length,
          min: 0,
          max: config.maxChildrenCount,
          factor: 1,
          errorMsg: maxErrMsg,
        },
        {
          id: 'NumberOfChildeBorn61OnWards',
          label: getString(labels, 'stepsStep2NumberOfChildrenAfter2561Label', 'Number of children (born in or after 2018)'),
          placeholder: `0 - ${config.maxChildrenCount}`,
          defaultValue: 0,
          maxLength: String(config.maxChildrenCount).length,
          min: 0,
          max: config.maxChildrenCount,
          factor: 1,
          errorMsg: maxErrMsg,
        },
        {
          id: 'FatherMother',
          type: 'checkbox',
          selfLabel: getString(labels, 'stepsStep2ParentalDeductionSelfLabel', 'Claim tax deduction for supporting parents (self)'),
          spouseLabel: getString(labels, 'stepsStep2ParentalDeductionSpouseLabel', "Claim tax deduction for supporting parents (spouse's)"),
          fatherLabel: getString(labels, 'commonFatherLabel', 'Father'),
          motherLabel: getString(labels, 'commonMotherLabel', 'Mother'),
        },
      ],
    },
    {
      id: 'insurance',
      label: getString(labels, 'stepsStep2InsuranceSectionLabel', 'Insurance'),
      tooltip: getString(labels, 'stepsStep2InsuranceSectionHint', 'The amount entered must not exceed the amount actually paid and not be more than the tax allowance threshold as specified by the Revenue Department.'),
      fields: [
        {
          id: 'Insure',
          label: getString(labels, 'stepsStep2LifeInsurancePremiumLabel', 'Life insurance premiums'),
          placeholder: `0 - ${formatNumber(apiResponse.MaxInsure)}`,
          defaultValue: 0,
          maxLength: 7,
          min: 0,
          max: apiResponse.MaxInsure,
          factor: 1,
          errorMsg: maxErrMsg,
          hint: insureHint,
          allUsedMsg,
        },
        {
          id: 'HealthInsure',
          label: getString(labels, 'stepsStep2HealthInsurancePremiumLabel', 'Health insurance premiums'),
          placeholder: `0 - ${formatNumber(apiResponse.MaxHealthInsure)}`,
          defaultValue: 0,
          maxLength: 6,
          min: 0,
          max: apiResponse.MaxHealthInsure,
          factor: 1,
          errorMsg: maxErrMsg,
          hint: healthHint,
          allUsedMsg,
        },
        {
          id: 'PensionInsure',
          label: getString(labels, 'stepsStep2LifePensionInsurancePremiumLabel', 'Pension insurance premiums'),
          placeholder: `0 - ${formatNumber(apiResponse.MaxInsure60)}`,
          defaultValue: 0,
          maxLength: 7,
          min: 0,
          max: apiResponse.MaxInsure60,
          factor: 1,
          errorMsg: maxErrMsg,
          hint: pensionHint,
        },
        {
          id: 'FatherInsure',
          label: getString(labels, 'stepsStep2HealthParentInsurancePremiumLabel', "Parents' Health Insurance Premiums"),
          placeholder: `0 - ${formatNumber(config.fatherInsureMax)}`,
          defaultValue: 0,
          maxLength: formatNumber(config.fatherInsureMax).length,
          min: 0,
          max: config.fatherInsureMax,
          factor: 1,
          errorMsg: maxErrMsg,
          hint: fatherInsureHint,
        },
      ],
    },
    {
      id: 'investment',
      label: getString(labels, 'stepsStep2InvestmentSectionLabel', 'Investment'),
      tooltip: getString(labels, 'stepsStep2InvestmentSectionHint', 'The amount entered must not exceed the amount actually paid and not be more than the tax allowance threshold as specified by the Revenue Department.'),
      fields: [
        {
          id: 'ReduceRMF',
          label: getString(labels, 'stepsStep2RmfSavingsLabel', 'RMF'),
          placeholder: `0 - ${formatNumber(apiResponse.MaxRMF)}`,
          defaultValue: 0,
          maxLength: 7,
          min: 0,
          max: apiResponse.MaxRMF,
          factor: 1,
          errorMsg: maxErrMsg,
          hint: rmfHint,
        },
        {
          id: 'ReduceESG',
          label: getString(labels, 'stepsStep2ThaiEsgSavingsLabel', 'Thai ESG'),
          placeholder: `0 - ${formatNumber(apiResponse.MaxESG)}`,
          defaultValue: 0,
          maxLength: 7,
          min: 0,
          max: apiResponse.MaxESG,
          factor: 1,
          errorMsg: maxErrMsg,
          hint: esgHint,
        },
      ],
    },
    {
      id: 'other',
      label: getString(labels, 'stepsStep2OtherDeductionsSectionLabel', 'Other allowances'),
      tooltip: getString(labels, 'stepsStep2OtherDeductionsSectionHint', '• The amount entered must not exceed the amount actually paid and not be more than the tax allowance threshold as specified by the Revenue Department.\n• For donations eligible for double deduction, enter double the calculated amount, but it must not exceed the tax allowance threshold as specified by the Revenue Department.\n• Enter the eligible amount as specified by the Revenue Department for some other types of tax allowances.'),
      fields: [
        {
          id: 'HomeInterest',
          label: getString(labels, 'stepsStep2HomeLoanInterestLabel', 'Mortgage loan interest'),
          placeholder: `0 - ${formatNumber(config.homeInterestMax)}`,
          defaultValue: 0,
          maxLength: formatNumber(config.homeInterestMax).length,
          min: 0,
          max: config.homeInterestMax,
          factor: 1,
          errorMsg: maxErrMsg,
        },
        {
          id: 'Donate',
          label: getString(labels, 'stepsStep2DonationLabel', 'Donations'),
          placeholder: `0 - ${formatNumber(config.donateMax)}`,
          defaultValue: 0,
          maxLength: formatNumber(config.donateMax).length,
          min: 0,
          max: config.donateMax,
          factor: 1,
          errorMsg: maxErrMsg,
        },
        {
          id: 'Other',
          label: getString(labels, 'stepsStep2OtherDeductionsLabel', 'Other'),
          placeholder: `0 - ${formatNumber(config.otherDeductionsMax)}`,
          defaultValue: 0,
          maxLength: formatNumber(config.otherDeductionsMax).length,
          min: 0,
          max: config.otherDeductionsMax,
          factor: 1,
          errorMsg: maxErrMsg,
        },
      ],
    },
  ];
}

// ─── Journey 3 field definitions ───────────────────────────────────────────────

function getJourney3InvestFields(apiResult1, labels) {
  const allUsedMsg = getString(labels, 'resultsNoRemainDeduction', 'All tax deductions have been used.');
  const upTo = getString(labels, 'resultsCanInvestMoreLabel', 'Up to');
  const unit = getString(labels, 'commonUnit', 'baht');
  const hintTemplate = `${upTo} {max} ${unit}`;
  const maxErrMsg = getString(labels, 'configValidationMaxValueError', 'Maximum up to {max}');

  return [
    {
      id: 'InputRMF',
      label: getString(labels, 'resultsRmfLabel', 'RMF*'),
      placeholder: `0 - ${formatNumber(apiResult1.MaxRMF)}`,
      defaultValue: 0,
      maxLength: 7,
      min: 0,
      max: apiResult1.MaxRMF,
      factor: 1,
      errorMsg: maxErrMsg,
      hint: hintTemplate,
      allUsedMsg,
      disableWhenEmpty: true,
    },
    {
      id: 'InputESG',
      label: getString(labels, 'resultsThaiEsgLabel', 'Thai ESG***'),
      placeholder: `0 - ${formatNumber(apiResult1.MaxESG)}`,
      defaultValue: 0,
      maxLength: 7,
      min: 0,
      max: apiResult1.MaxESG,
      factor: 1,
      errorMsg: maxErrMsg,
      hint: hintTemplate,
      allUsedMsg,
      disableWhenEmpty: true,
    },
    {
      id: 'InputInsure',
      label: getString(labels, 'resultsLifeInsuranceLabel', 'Life insurance premiums**'),
      placeholder: `0 - ${formatNumber(apiResult1.MaxInsure)}`,
      defaultValue: 0,
      maxLength: 7,
      min: 0,
      max: apiResult1.MaxInsure,
      factor: 1,
      errorMsg: maxErrMsg,
      hint: hintTemplate,
      allUsedMsg,
      disableWhenEmpty: true,
    },
    {
      id: 'InputHealthInsure',
      label: getString(labels, 'resultsHealthInsuranceLabel', 'Health insurance premiums**'),
      placeholder: `0 - ${formatNumber(apiResult1.MaxHealthInsure)}`,
      defaultValue: 0,
      maxLength: 6,
      min: 0,
      max: apiResult1.MaxHealthInsure,
      factor: 1,
      errorMsg: maxErrMsg,
      hint: hintTemplate,
      allUsedMsg,
      disableWhenEmpty: true,
    },
    {
      id: 'InputInsure60',
      label: getString(labels, 'resultsPensionInsuranceLabel', 'Pension insurance premiums*'),
      placeholder: `0 - ${formatNumber(apiResult1.MaxInsure60)}`,
      defaultValue: 0,
      maxLength: 7,
      min: 0,
      max: apiResult1.MaxInsure60,
      factor: 1,
      errorMsg: maxErrMsg,
      hint: hintTemplate,
      allUsedMsg,
      disableWhenEmpty: true,
    },
  ];
}

// ─── Header ─────────────────────────────────────────────────────────────────────

function buildHeader(labels) {
  const header = parseHTML('<div class="tax-calc-header"></div>');
  const title = parseHTML(`<h1 class="tax-calc-title">${getString(labels, 'configTitle', 'Plan your tax saving')}</h1>`);
  const divider = parseHTML('<div class="tax-calc-divider"></div>');
  header.appendChild(title);
  header.appendChild(divider);
  return header;
}

// ─── Step Indicator ─────────────────────────────────────────────────────────────

function buildStepIndicator(labels, activeStep) {
  const steps = [
    getString(labels, 'commonStep1Label', 'Income'),
    getString(labels, 'commonStep2Label', 'Allowance'),
    getString(labels, 'commonStep3Label', 'Result'),
  ];

  const stepsContainer = parseHTML('<div class="tax-calc-steps"></div>');

  steps.forEach((label, index) => {
    const stepNumber = index + 1;
    let stepModifier = '';
    if (stepNumber === activeStep) stepModifier = 'tax-calc-step-active';
    else if (stepNumber < activeStep) stepModifier = 'tax-calc-step-done';
    const step = parseHTML(`
      <div class="tax-calc-step ${stepModifier}">
        <div class="tax-calc-step-circle"><span>${stepNumber < activeStep ? '✓' : stepNumber}</span></div>
        <div class="tax-calc-step-label">${label}</div>
      </div>
    `);
    stepsContainer.appendChild(step);

    if (index < steps.length - 1) {
      stepsContainer.appendChild(parseHTML(`<div class="tax-calc-connector${stepNumber < activeStep ? ' tax-calc-connector-done' : ''}"></div>`));
    }
  });

  return stepsContainer;
}

// ─── Input Field ────────────────────────────────────────────────────────────────

function buildInputField(fieldDef, savedValue) {
  let displayVal = formatNumber(0);
  if (savedValue !== undefined && savedValue !== null) {
    displayVal = formatNumber(savedValue);
  } else if (fieldDef.defaultValue !== null && fieldDef.defaultValue !== undefined) {
    displayVal = formatNumber(fieldDef.defaultValue);
  }

  const isEmptyRange = fieldDef.max <= 0;
  const disabledInitially = isEmptyRange && !!fieldDef.disableWhenEmpty;
  const displayPlaceholder = isEmptyRange ? '0' : fieldDef.placeholder;
  const maxLength = fieldDef.max > 0 ? formatNumber(Math.round(fieldDef.max)).length : 1;

  const initialHintText = disabledInitially
    ? (fieldDef.allUsedMsg || 'All tax deductions have been used.')
    : fieldDef.hint?.replace('{max}', formatNumber(fieldDef.max)) ?? '';
  const hintHtml = fieldDef.hint
    ? `<p class="tax-calc-field-hint${disabledInitially ? ' tax-calc-field-hint-used' : ''}" id="tc-hint-${fieldDef.id}">${initialHintText}</p>`
    : '';

  const field = parseHTML(`
    <div class="tax-calc-field" data-id="${fieldDef.id}">
      <div class="tax-calc-input-wrap">
        <input
          type="text"
          id="tc-${fieldDef.id}"
          name="${fieldDef.id}"
          class="tax-calc-input"
          placeholder="${displayPlaceholder}"
          value="${displayVal}"
          maxlength="${maxLength}"
          ${isEmptyRange && !fieldDef.disableWhenEmpty ? 'readonly' : ''}
          ${disabledInitially ? 'disabled' : ''}
        />
        <label class="tax-calc-label" for="tc-${fieldDef.id}">${fieldDef.label}</label>
      </div>
      ${hintHtml}
      <p class="tax-calc-field-error" id="tc-err-${fieldDef.id}"></p>
    </div>
  `);

  const inputWrapper = field.querySelector('.tax-calc-input-wrap');
  const input = field.querySelector('.tax-calc-input');
  const hintElement = fieldDef.hint ? field.querySelector(`#tc-hint-${fieldDef.id}`) : null;
  const errorElement = field.querySelector('.tax-calc-field-error');

  // Only digits allowed + skip commas on backspace
  input.addEventListener('keydown', (e) => {
    if (!/[\d]|Backspace|Delete|ArrowLeft|ArrowRight|Tab|Home|End/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
    if (e.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
      const pos = input.selectionStart;
      if (pos > 0 && input.value[pos - 1] === ',') {
        e.preventDefault();
        input.setSelectionRange(pos - 1, pos - 1);
      }
    }
  });

  input.addEventListener('focus', () => {
    if (stripCommas(input.value) === '0') input.value = '';
    if (!inputWrapper.classList.contains('tax-calc-input-wrap-error')) {
      inputWrapper.classList.add('tax-calc-input-wrap-focus');
    }
  });

  // Empty on blur → 0, then reformat
  input.addEventListener('blur', () => {
    const val = stripCommas(input.value).trim();
    input.value = formatNumber(val === '' ? 0 : val);
    inputWrapper.classList.remove('tax-calc-input-wrap-focus');
  });

  // Live reformat + max validation — disabled inputs never fire this, no guard needed
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const digitsBeforeCursor = input.value.substring(0, pos).replace(/,/g, '').length;
    const rawVal = stripCommas(input.value);
    const formatted = rawVal === '' ? '' : formatNumber(rawVal);
    input.value = formatted;

    // Restore cursor position accounting for shifted commas
    let digitCount = 0;
    let newPos = formatted.length;
    for (let i = 0; i < formatted.length; i += 1) {
      if (digitCount === digitsBeforeCursor) { newPos = i; break; }
      if (formatted[i] !== ',') digitCount += 1;
    }
    input.setSelectionRange(newPos, newPos);

    const val = parseFloat(rawVal) || 0;
    if (val > fieldDef.max) {
      const msg = (fieldDef.errorMsg || getString({}, 'configValidationMaxValueError', 'Maximum up to {max}'))
        .replace('{max}', formatNumber(fieldDef.max))
        .replace('{{column-max-value}}', formatNumber(fieldDef.max));
      inputWrapper.classList.add('tax-calc-input-wrap-error');
      inputWrapper.classList.remove('tax-calc-input-wrap-focus');
      input.classList.add('tax-calc-input-error');
      errorElement.textContent = msg;
      if (hintElement) hintElement.hidden = true;
    } else {
      inputWrapper.classList.remove('tax-calc-input-wrap-error');
      input.classList.remove('tax-calc-input-error');
      errorElement.textContent = '';
      if (hintElement) hintElement.hidden = false;
    }
  });

  // Allows external callers to update the max value and hint text dynamically
  field.updateMax = (newMax) => {
    fieldDef.max = newMax;
    if (newMax <= 0) {
      input.placeholder = '0';
      input.value = formatNumber(0);
      input.disabled = true;
      inputWrapper.classList.remove('tax-calc-input-wrap-error');
      input.classList.remove('tax-calc-input-error');
      errorElement.textContent = '';
      if (hintElement) {
        hintElement.textContent = fieldDef.allUsedMsg || 'All tax deductions have been used.';
        hintElement.classList.add('tax-calc-field-hint-used');
        hintElement.hidden = false;
      }
    } else {
      input.disabled = false;
      input.maxLength = formatNumber(Math.round(newMax)).length;
      input.placeholder = `${formatNumber(fieldDef.min || 0)} - ${formatNumber(newMax)}`;
      if (hintElement) {
        hintElement.textContent = fieldDef.hint.replace('{max}', formatNumber(newMax));
        hintElement.classList.remove('tax-calc-field-hint-used');
        hintElement.hidden = false;
      }
      const val = parseFloat(stripCommas(input.value)) || 0;
      if (val <= newMax) {
        inputWrapper.classList.remove('tax-calc-input-wrap-error');
        input.classList.remove('tax-calc-input-error');
        errorElement.textContent = '';
      }
    }
  };

  return field;
}

// ─── Tooltip Icon ───────────────────────────────────────────────────────────────

function buildTooltipIcon(text, ariaLabel) {
  const tooltipContainer = parseHTML(`
    <div class="tax-calc-tooltip-wrap">
      <button type="button" class="tax-calc-tooltip-trigger" aria-label="${ariaLabel}">
        <img src="/icons/icon-info.svg" aria-hidden="true" width="20" height="20">
      </button>
      <div class="tax-calc-tooltip" role="tooltip">${text.replace(/\\n|\n/g, '<br>')}</div>
    </div>
  `);

  const trigger = tooltipContainer.querySelector('.tax-calc-tooltip-trigger');
  const tooltip = tooltipContainer.querySelector('.tax-calc-tooltip');
  let isClicked = false;

  const adjustPosition = () => {
    tooltip.style.left = '';
    tooltip.style.transform = '';
    tooltip.style.setProperty('--arrow-shift', '0px');

    const rect = tooltip.getBoundingClientRect();
    const pad = 16; // 1rem padding from edges
    let shift = 0;

    if (rect.left < pad) {
      shift = pad - rect.left;
    } else if (rect.right > window.innerWidth - pad) {
      shift = (window.innerWidth - pad) - rect.right;
    }

    if (shift !== 0) {
      tooltip.style.transform = `translateX(calc(-50% + ${shift}px))`;
      // Shift arrow in opposite direction to keep it over the icon
      tooltip.style.setProperty('--arrow-shift', `${-shift}px`);
    }
  };

  trigger.addEventListener('mouseenter', () => {
    tooltip.classList.add('tax-calc-tooltip-open');
    adjustPosition();
  });

  trigger.addEventListener('mouseleave', () => {
    if (!isClicked) {
      tooltip.classList.remove('tax-calc-tooltip-open');
    }
  });

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    isClicked = !isClicked;
    if (isClicked) {
      tooltipContainer.closest('.tax-calc')?.querySelectorAll('.tax-calc-tooltip-open').forEach((tip) => {
        if (tip !== tooltip) tip.classList.remove('tax-calc-tooltip-open');
      });
      tooltip.classList.add('tax-calc-tooltip-open');
      adjustPosition();
    } else {
      tooltip.classList.remove('tax-calc-tooltip-open');
    }
  });

  window.addEventListener('click', () => {
    isClicked = false;
    tooltip.classList.remove('tax-calc-tooltip-open');
  });

  return tooltipContainer;
}

// ─── Section Header ─────────────────────────────────────────────────────────────

function buildSectionHeader(label, tooltipText, ariaLabel) {
  const header = parseHTML(`<div class="tax-calc-section-header"><h3 class="tax-calc-section-title">${label}</h3></div>`);
  header.appendChild(buildTooltipIcon(tooltipText, ariaLabel));
  return header;
}

// ─── Parental Checkboxes (FatherMother) ─────────────────────────────────────────

function buildParentalCheckboxes(fieldDef, savedValue) {
  const {
    selfLabel, spouseLabel, fatherLabel, motherLabel,
  } = fieldDef;
  const checks = Array.isArray(savedValue)
    ? savedValue
    : [false, false, false, false];

  return parseHTML(`
    <div class="tax-calc-parental">
      <div class="tax-calc-parental-group">
        <p class="tax-calc-parental-title">${selfLabel}</p>
        <div class="tax-calc-parental-checks">
          <label class="tax-calc-parental-check">
            <input type="checkbox" class="tax-calc-checkbox" id="tc-father-self" ${checks[0] ? 'checked' : ''}>
            <span>${fatherLabel}</span>
          </label>
          <label class="tax-calc-parental-check">
            <input type="checkbox" class="tax-calc-checkbox" id="tc-mother-self" ${checks[1] ? 'checked' : ''}>
            <span>${motherLabel}</span>
          </label>
        </div>
      </div>
      <div class="tax-calc-parental-group">
        <p class="tax-calc-parental-title">${spouseLabel}</p>
        <div class="tax-calc-parental-checks">
          <label class="tax-calc-parental-check">
            <input type="checkbox" class="tax-calc-checkbox" id="tc-father-spouse" ${checks[2] ? 'checked' : ''}>
            <span>${fatherLabel}</span>
          </label>
          <label class="tax-calc-parental-check">
            <input type="checkbox" class="tax-calc-checkbox" id="tc-mother-spouse" ${checks[3] ? 'checked' : ''}>
            <span>${motherLabel}</span>
          </label>
        </div>
      </div>
    </div>
  `);
}

// ─── Journey 1: Income ─────────────────────────────────────────────────────────

function renderJourney1(block, data, onNext, savedValues = {}) {
  block.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const { labels } = data;
  const fieldDefinitions = getJourney1Fields(labels, data);

  const container = parseHTML('<div class="tax-calc tax-calc-step-1"></div>');
  container.appendChild(buildHeader(labels));
  container.appendChild(buildStepIndicator(labels, 1));

  const body = parseHTML('<div class="tax-calc-body"></div>');
  const fieldsWrap = parseHTML('<div class="tax-calc-fields"></div>');

  fieldDefinitions.forEach((fieldDef) => {
    // ProvidentFund is stored as decimal (0.05); display as percent (5)
    const savedVal = fieldDef.id === 'ProvidentFund' && savedValues[fieldDef.id] !== undefined
      ? savedValues[fieldDef.id] * 100
      : savedValues[fieldDef.id];
    fieldsWrap.appendChild(buildInputField(fieldDef, savedVal));
  });

  body.appendChild(fieldsWrap);

  const notesSection = buildNotes(
    getString(labels, 'configNotesTitle', 'Notes'),
    [getString(labels, 'commonNoteText', '*Enter only taxable income without deducting personal allowances and Social Security contributions.')],
  );
  notesSection.classList.add('tax-calc-notes-step-1');
  body.appendChild(notesSection);

  container.appendChild(body);

  const footer = parseHTML(`
    <div class="tax-calc-footer">
      <button type="button" class="tax-calc-btn tax-calc-btn-primary">${getString(labels, 'buttonsNextButton', 'Next')}</button>
    </div>
  `);
  container.appendChild(footer);
  block.appendChild(container);

  const primaryButton = footer.querySelector('.tax-calc-btn-primary');
  const syncButtonState = () => { primaryButton.disabled = !!block.querySelector('.tax-calc-field-error:not(:empty)'); };
  container.addEventListener('input', syncButtonState);

  footer.querySelector('.tax-calc-btn-primary').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    let valid = true;

    fieldDefinitions.forEach((fieldDef) => {
      const input = block.querySelector(`#tc-${fieldDef.id}`);
      const inputWrapper = input.closest('.tax-calc-input-wrap');
      const errorElement = block.querySelector(`#tc-err-${fieldDef.id}`);
      const val = parseFloat(stripCommas(input.value)) || 0;

      if (val > fieldDef.max) {
        const msg = (fieldDef.errorMsg || 'Maximum up to {max}').replace('{max}', formatNumber(fieldDef.max));
        inputWrapper.classList.add('tax-calc-input-wrap-error');
        input.classList.add('tax-calc-input-error');
        errorElement.textContent = msg;
        valid = false;
      }
    });

    if (!valid) return;

    const values = {};
    fieldDefinitions.forEach((fieldDef) => {
      const input = block.querySelector(`#tc-${fieldDef.id}`);
      const val = parseFloat(stripCommas(input.value)) || 0;
      values[fieldDef.id] = val * fieldDef.factor;
    });

    button.classList.add('tax-calc-btn-loading');

    try {
      const payload = {
        ...values,
        NumberOfChildeBornBefore61: 0,
        NumberOfChildeBorn61OnWards: 0,
        FatherMother: 0,
        HomeInterest: 0,
        FatherInsure: 0,
        Insure: 0,
        PensionInsure: 0,
        HealthInsure: 0,
        ReduceSSF: 0,
        ReduceRMF: 0,
        ReduceESG: 0,
        Donate: 0,
        Other: 0,
      };
      const response = await fetch(data.apiCalculateTax, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('API error');
      const result = await response.json();
      onNext(values, result);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Tax calculator API error:', err);
      button.classList.remove('tax-calc-btn-loading');
    }
  });
}

// ─── Journey 2: Allowance ──────────────────────────────────────────────────────

function renderJourney2(block, data, state, onBack, onCalculate) {
  block.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const { labels } = data;
  const { apiResponse, journey2 = {} } = state;
  const groups = getJourney2Groups(labels, apiResponse, data);

  const container = parseHTML('<div class="tax-calc tax-calc-step-2"></div>');
  container.appendChild(buildHeader(labels));
  container.appendChild(buildStepIndicator(labels, 2));

  const body = parseHTML('<div class="tax-calc-body"></div>');

  const tooltipAriaLabel = getString(labels, 'commonTooltipAriaLabel', 'More information');
  groups.forEach((group) => {
    body.appendChild(buildSectionHeader(group.label, group.tooltip, tooltipAriaLabel));

    group.fields.forEach((fieldDef) => {
      if (fieldDef.type === 'checkbox') {
        body.appendChild(buildParentalCheckboxes(fieldDef, journey2[fieldDef.id]));
      } else {
        const savedVal = journey2[fieldDef.id] !== undefined ? journey2[fieldDef.id] : null;
        body.appendChild(buildInputField(fieldDef, savedVal));
      }
    });
  });

  body.appendChild(buildNotes(
    getString(labels, 'configNotesTitle', 'Notes'),
    [
      getString(labels, 'configNotesTaxNote', '• Life insurance premiums, pension insurance premiums, health insurance premiums, RMF, Thai ESG, and donations must not exceed the allowable personal income tax deduction limits, as specified by the Revenue Department.'),
      getString(labels, 'configNotesThaiEsgNote', '• If you have invested in Thai ESGX, please enter the amount in the "Other" field. The entered amount must comply with the conditions as specified by the Revenue Department.'),
    ],
  ));

  container.appendChild(body);

  const footer = parseHTML(`
    <div class="tax-calc-footer">
      <button type="button" class="tax-calc-btn tax-calc-btn-outline">${getString(labels, 'buttonsBackButton', 'Back')}</button>
      <button type="button" class="tax-calc-btn tax-calc-btn-primary">${getString(labels, 'buttonsCalculateButton', 'Calculate')}</button>
    </div>
  `);
  container.appendChild(footer);
  block.appendChild(container);

  const step2PrimaryButton = footer.querySelector('.tax-calc-btn-primary');
  const syncStep2ButtonState = () => { step2PrimaryButton.disabled = !!block.querySelector('.tax-calc-field-error:not(:empty)'); };
  container.addEventListener('input', syncStep2ButtonState);

  // Wire Insure + HealthInsure combined max constraint
  const insureField = block.querySelector('[data-id="Insure"]');
  const healthInsureField = block.querySelector('[data-id="HealthInsure"]');
  const insureInput = block.querySelector('#tc-Insure');
  const healthInsureInput = block.querySelector('#tc-HealthInsure');

  if (insureInput && healthInsureInput) {
    insureInput.addEventListener('input', () => {
      const val = parseFloat(stripCommas(insureInput.value)) || 0;
      const newMax = Math.min(apiResponse.MaxHealthInsure, data.combinedInsuranceMax - val);
      if (healthInsureField?.updateMax) healthInsureField.updateMax(Math.max(0, newMax));
      syncStep2ButtonState();
    });

    healthInsureInput.addEventListener('input', () => {
      const val = parseFloat(stripCommas(healthInsureInput.value)) || 0;
      const newMax = Math.min(apiResponse.MaxInsure, data.combinedInsuranceMax - val);
      if (insureField?.updateMax) insureField.updateMax(Math.max(0, newMax));
      syncStep2ButtonState();
    });
  }

  footer.querySelector('.tax-calc-btn-outline').addEventListener('click', onBack);

  footer.querySelector('.tax-calc-btn-primary').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    let valid = true;

    groups.forEach((group) => {
      group.fields.forEach((fieldDef) => {
        if (fieldDef.type === 'checkbox') return;
        const input = block.querySelector(`#tc-${fieldDef.id}`);
        if (!input) return;
        const inputWrapper = input.closest('.tax-calc-input-wrap');
        const errorElement = block.querySelector(`#tc-err-${fieldDef.id}`);
        const val = parseFloat(stripCommas(input.value)) || 0;

        if (val > fieldDef.max) {
          const msg = (fieldDef.errorMsg || 'Maximum up to {max}').replace('{max}', formatNumber(fieldDef.max));
          inputWrapper.classList.add('tax-calc-input-wrap-error');
          input.classList.add('tax-calc-input-error');
          errorElement.textContent = msg;
          valid = false;
        }
      });
    });

    if (!valid) return;

    const values = {};
    groups.forEach((group) => {
      group.fields.forEach((fieldDef) => {
        if (fieldDef.type === 'checkbox') {
          values[fieldDef.id] = [...block.querySelectorAll('.tax-calc-parental .tax-calc-checkbox')]
            .map((c) => c.checked);
        } else {
          const input = block.querySelector(`#tc-${fieldDef.id}`);
          values[fieldDef.id] = parseFloat(stripCommas(input.value)) || 0;
        }
      });
    });

    button.classList.add('tax-calc-btn-loading');

    try {
      // Robust payload construction: Merge Step 1 (state.journey1) with Step 2 (values)
      const payload = {
        // Default values for fields not in Step 1/2
        Spouse: 0,
        ChildBornBefore61Other: 0,
        ChildBorn61OnWardsOther: 0,
        FatherInsure: 0,
        // Step 1 values
        ...state.journey1,
        // Step 2 values (with correct API mapping)
        ChildBornBefore61: values.NumberOfChildeBornBefore61 || 0,
        ChildBorn61OnWards: values.NumberOfChildeBorn61OnWards || 0,
        FatherMother: (values.FatherMother || []).filter(Boolean).length,
        HomeInterest: values.HomeInterest || 0,
        Insure: values.Insure || 0,
        PensionInsure: values.PensionInsure || 0,
        HealthInsure: values.HealthInsure || 0,
        ReduceSSF: values.ReduceSSF || 0,
        ReduceRMF: values.ReduceRMF || 0,
        ReduceESG: values.ReduceESG || 0,
        Donate: values.Donate || 0,
        Other: values.Other || 0,
      };

      const promises = [
        fetch(data.apiCalculateTax, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then((r) => { if (!r.ok) throw new Error('Primary API error'); return r.json(); }),
      ];

      // Second API is optional or might not be configured
      if (data.apiCalculateSaving) {
        promises.push(
          fetch(data.apiCalculateSaving, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        );
      }

      const [result1, result2] = await Promise.all(promises);
      onCalculate(values, result1, result2);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Tax calculator API error:', err);
      // eslint-disable-next-line no-alert
      alert(getString(labels, 'errorsCalculationFailed', 'Calculation failed. Please try again.'));
    } finally {
      button.classList.remove('tax-calc-btn-loading');
    }
  });
}

// ─── Journey 3: Result ────────────────────────────────────────────────────────

function renderJourney3(block, data, state, onBack, onRecalculate) {
  block.innerHTML = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const { labels } = data;
  const {
    apiResult1, apiResult2, apiResult3, journey3 = {},
  } = state;

  const taxPayment = Math.round(apiResult1.TaxPayment || 0);
  const noTax = taxPayment === 0;
  // Tax card rate comes from second API (CalculateSavingTaxBySelf); summary rate from first
  const cardTaxRate = Math.round(((apiResult2 || apiResult1).MaxTaxRateStep || 0) * 100);
  const summaryTaxRate = Math.round((apiResult1.MaxTaxRateStep || 0) * 100);

  const container = parseHTML('<div class="tax-calc tax-calc-results tax-calc-step-3"></div>');
  container.appendChild(buildHeader(labels));
  container.appendChild(buildStepIndicator(labels, 3));

  const body = parseHTML('<div class="tax-calc-body"></div>');

  // ── Tax card(s) ──
  const bahtUnit = getString(labels, 'commonUnit', 'baht');
  const noTaxLabel = getString(labels, 'resultsNoTaxPayable', 'No Tax Payable');
  const taxRateTpl = getString(labels, 'resultsTaxRateLabel', '(Tax rate {rate}%)');

  if (noTax) {
    body.appendChild(parseHTML(`
      <div class="tax-calc-no-tax">
        <p class="tax-calc-no-tax-text">${noTaxLabel}</p>
      </div>
    `));
  } else if (apiResult3) {
    const newTaxAmount = Math.round(apiResult3.TaxPaymentReduce || 0);
    const savedAmount = Math.round(apiResult3.SavingTax || 0);
    const newTaxRate = Math.round((apiResult3.MaxTaxRateStep || 0) * 100);
    const cardRateStr = taxRateTpl.replace('{rate}', cardTaxRate);
    const newRateStr = taxRateTpl.replace('{rate}', newTaxRate);
    const savedLabel = getString(labels, 'resultsTaxSavedLabel', 'Saved');
    body.appendChild(parseHTML(`
      <div class="tax-calc-tax-cards tax-calc-tax-cards-two">
        <div class="tax-calc-tax-card-wrap">
          <div class="tax-calc-tax-card tax-calc-tax-card-original">
            <p class="tax-calc-tax-card-title">${getString(labels, 'resultsTaxToBePaidOriginalLabel', 'Tax payable')}</p>
            <div class="tax-calc-tax-card-saved tax-calc-tax-card-saved-placeholder" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" stroke="#2DCD73"/>
              </svg>
              <p></p>
            </div>
            <p class="tax-calc-tax-card-amount">${formatNumber(taxPayment)} <span class="tax-calc-tax-card-unit">${bahtUnit}</span></p>
          </div>
          <p class="tax-calc-tax-rate">${cardRateStr}</p>
        </div>
        <div class="tax-calc-tax-card-wrap">
          <div class="tax-calc-tax-card tax-calc-tax-card-new">
            <p class="tax-calc-tax-card-title">${getString(labels, 'resultsTaxToBePaidNewLabel', 'New tax payable')}</p>
            <div class="tax-calc-tax-card-saved">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" stroke="#2DCD73"/>
              </svg>
              <p>${savedLabel} -${formatNumber(savedAmount)} <span class="tax-calc-tax-card-unit">${bahtUnit}</span></p>
            </div>
            <p class="tax-calc-tax-card-amount">${formatNumber(newTaxAmount)} <span class="tax-calc-tax-card-unit">${bahtUnit}</span></p>
          </div>
          <p class="tax-calc-tax-rate">${newRateStr}</p>
        </div>
      </div>
    `));
  } else {
    const cardRateStr = taxRateTpl.replace('{rate}', cardTaxRate);
    body.appendChild(parseHTML(`
      <div class="tax-calc-tax-cards">
        <div class="tax-calc-tax-card-wrap">
          <div class="tax-calc-tax-card tax-calc-tax-card-original">
            <p class="tax-calc-tax-card-title">${getString(labels, 'resultsTaxToBePaidLabel', 'Tax payable')}</p>
            <p class="tax-calc-tax-card-amount">${formatNumber(taxPayment)} <span class="tax-calc-tax-card-unit">${bahtUnit}</span></p>
          </div>
          <p class="tax-calc-tax-rate">${cardRateStr}</p>
        </div>
      </div>
    `));
  }

  // ── Summary box (always shown, values from apiResult1) ──
  const savingTax = Math.round(apiResult1.SavingTax || 0);
  const budget = Math.round(apiResult1.Budget || 0);
  const taxPaymentReduce = Math.round(apiResult1.TaxPaymentReduce || 0);
  const summaryRateTpl = getString(labels, 'resultsTaxRateRemainLabel', '(The maximum tax base {rate}%)');
  const summarySubtitle = (noTax || taxPaymentReduce === 0)
    ? noTaxLabel
    : summaryRateTpl.replace('{rate}', summaryTaxRate);

  body.appendChild(parseHTML(`
    <div class="tax-calc-summary-box">
      <div class="tax-calc-summary-row">
        <p class="tax-calc-summary-label">${getString(labels, 'resultsMaxTaxSavingsResult', 'You can save tax up to')}</p>
        <p class="tax-calc-summary-value"><span>${formatNumber(savingTax)}</span> <span class="tax-calc-summary-unit">${bahtUnit}</span></p>
      </div>
      <div class="tax-calc-summary-row">
        <p class="tax-calc-summary-label">${getString(labels, 'resultsMaxInvestmentSavingsResult', 'By investing only')}</p>
        <p class="tax-calc-summary-value"><span>${formatNumber(budget)}</span> <span class="tax-calc-summary-unit">${bahtUnit}</span></p>
      </div>
      <div class="tax-calc-summary-row">
        <p class="tax-calc-summary-label">${getString(labels, 'resultsRemainingTaxResult', 'Remaining tax')}</p>
        <p class="tax-calc-summary-value"><span>${formatNumber(taxPaymentReduce)}</span> <span class="tax-calc-summary-unit">${bahtUnit}</span></p>
      </div>
      <p class="tax-calc-summary-subtitle">${summarySubtitle}</p>
    </div>
  `));

  // ── Invest table (only when tax is payable) ──
  const rmfPensionMax = (apiResult1.MaxRMF || 0) + (apiResult1.MaxInsure60 || 0);
  const notesElement = buildNotes(
    getString(labels, 'configNotesTitle', 'Notes'),
    [
      getString(labels, 'configNotesInvestmentCalculation', 'Calculate the maximum amount that you can invest according to the conditions of the Revenue Department.'),
      getString(labels, 'configNotesRmfAndPension', `* The combined amount of RMF and pension insurance premiums must not exceed ${formatNumber(rmfPensionMax)} baht`).replace('{combinedRMFPensionMax}', formatNumber(rmfPensionMax)),
      getString(labels, 'configNotesLifeAndHealthInsurance', `** The combined amount of life insurance premiums and health insurance premiums must not exceed ${formatNumber(data.combinedInsuranceMax)} baht`).replace('{combinedLifeHealthMax}', formatNumber(data.combinedInsuranceMax)),
      getString(labels, 'configNotesThaiEsg', `*** Investing in Thai ESG funds must not exceed 30% of taxable income or ${formatNumber(apiResult1.MaxESG)} baht whichever is lower`).replace('{thaiEsgMax}', formatNumber(apiResult1.MaxESG)),
    ],
  );

  if (!noTax) {
    const investFieldDefs = getJourney3InvestFields(apiResult1, labels);

    body.appendChild(parseHTML(`
      <div class="tax-calc-invest-heading">
        <h2 class="tax-calc-invest-title">${getString(labels, 'resultsChooseMoreInvestmentLabel', 'Save more on tax by investing or buying insurance')}</h2>
      </div>
    `));

    const tableWrap = parseHTML('<div class="tax-calc-invest-table"></div>');
    tableWrap.appendChild(parseHTML(`
      <div class="tax-calc-invest-header">
        <div class="tax-calc-invest-header-cell">${getString(labels, 'resultsInvestmentAmountLabel', 'Additional investment or insurance (baht)')}</div>
        <div class="tax-calc-invest-header-cell">${getString(labels, 'resultsTotalInvestmentLabel', 'Total amount for each item (baht)')}</div>
      </div>
    `));

    const journey3ToJourney2Map = {
      InputRMF: 'ReduceRMF',
      InputESG: 'ReduceESG',
      InputInsure: 'Insure',
      InputHealthInsure: 'HealthInsure',
      InputInsure60: 'PensionInsure',
    };

    const fieldElements = {};
    const totalElements = {};

    investFieldDefs.forEach((fieldDef) => {
      const journey2Key = journey3ToJourney2Map[fieldDef.id];
      const journey2Value = state.journey2?.[journey2Key] ?? 0;
      const savedJourney3Val = journey3[fieldDef.id] !== undefined ? journey3[fieldDef.id] : null;
      const inputField = buildInputField(fieldDef, savedJourney3Val);
      const journey3Value = parseFloat(stripCommas(inputField.querySelector('.tax-calc-input')?.value || '0')) || 0;
      const initialTotal = journey2Value + journey3Value;

      const row = parseHTML(`
        <div class="tax-calc-invest-row">
          <div class="tax-calc-invest-input-col"></div>
          <div class="tax-calc-invest-total-col"><span class="tax-calc-invest-total">${formatNumber(initialTotal)}</span></div>
        </div>
      `);
      row.querySelector('.tax-calc-invest-input-col').appendChild(inputField);
      tableWrap.appendChild(row);

      fieldElements[fieldDef.id] = inputField;
      totalElements[fieldDef.id] = row.querySelector('.tax-calc-invest-total');
    });

    body.appendChild(tableWrap);
    body.appendChild(notesElement);
    container.appendChild(body);

    const hasJourney3Values = investFieldDefs.some((fieldDef) => (journey3[fieldDef.id] || 0) > 0);
    const footer = parseHTML(`
      <div class="tax-calc-footer">
        <button type="button" class="tax-calc-btn tax-calc-btn-outline">${getString(labels, 'buttonsBackButton', 'Back')}</button>
        <button type="button" class="tax-calc-btn tax-calc-btn-primary" id="tc-recalculate" ${hasJourney3Values ? '' : 'disabled'}>${getString(labels, 'buttonsRecalculateButton', 'Recalculate')}</button>
      </div>
    `);
    container.appendChild(footer);
    block.appendChild(container);

    // Live total column updates (journey2 base + journey3 input)
    investFieldDefs.forEach((fieldDef) => {
      const inputEl = fieldElements[fieldDef.id]?.querySelector('.tax-calc-input');
      if (!inputEl) return;
      const journey2Base = state.journey2?.[journey3ToJourney2Map[fieldDef.id]] ?? 0;
      inputEl.addEventListener('input', () => {
        const journey3Value = parseFloat(stripCommas(inputEl.value)) || 0;
        if (totalElements[fieldDef.id]) {
          totalElements[fieldDef.id].textContent = formatNumber(journey2Base + journey3Value);
        }
      });
    });

    // InputInsure + InputHealthInsure combined max constraint.
    // The 100k cap spans journey2 + journey3 together, so remaining room for journey3 inputs is:
    // COMBINED_INSURANCE_MAX - journey2_Insure - journey2_HealthInsure
    const journey2InsureBase = state.journey2?.Insure ?? 0;
    const journey2HealthBase = state.journey2?.HealthInsure ?? 0;
    const usedInsuranceCap = journey2InsureBase + journey2HealthBase;
    const remainingCombined = Math.max(0, data.combinedInsuranceMax - usedInsuranceCap);

    const insureField = fieldElements.InputInsure;
    const healthField = fieldElements.InputHealthInsure;
    const insureInput = insureField?.querySelector('#tc-InputInsure');
    const healthInput = healthField?.querySelector('#tc-InputHealthInsure');

    // Enable/disable recalculate
    const recalculateButton = footer.querySelector('#tc-recalculate');
    const checkRecalcEnabled = () => {
      const hasErrors = !!block.querySelector('.tax-calc-invest-table .tax-calc-field-error:not(:empty)');
      const anyNonZero = investFieldDefs.some((fieldDef) => {
        const inputEl = block.querySelector(`#tc-${fieldDef.id}`);
        return inputEl && (parseFloat(stripCommas(inputEl.value)) || 0) > 0;
      });
      recalculateButton.disabled = !anyNonZero || hasErrors;
    };
    block.querySelectorAll('.tax-calc-invest-table .tax-calc-input').forEach((inputEl) => {
      inputEl.addEventListener('input', checkRecalcEnabled);
    });

    if (insureInput && healthInput) {
      const syncHealthMax = () => {
        const insureVal = parseFloat(stripCommas(insureInput.value)) || 0;
        const cap = Math.min(apiResult1.MaxHealthInsure, remainingCombined - insureVal);
        if (healthField?.updateMax) healthField.updateMax(Math.max(0, cap));
      };
      const syncInsureMax = () => {
        const healthVal = parseFloat(stripCommas(healthInput.value)) || 0;
        const cap = Math.min(apiResult1.MaxInsure, remainingCombined - healthVal);
        if (insureField?.updateMax) insureField.updateMax(Math.max(0, cap));
      };

      insureInput.addEventListener('input', () => { syncHealthMax(); checkRecalcEnabled(); });
      healthInput.addEventListener('input', () => { syncInsureMax(); checkRecalcEnabled(); });

      // Apply immediately so pre-populated journey2 values are reflected on first render
      syncHealthMax();
      syncInsureMax();
    }

    footer.querySelector('.tax-calc-btn-outline').addEventListener('click', onBack);

    recalculateButton.addEventListener('click', async () => {
      const journey3Values = {};
      investFieldDefs.forEach((fieldDef) => {
        const inputEl = block.querySelector(`#tc-${fieldDef.id}`);
        journey3Values[fieldDef.id] = parseFloat(stripCommas(inputEl?.value || '0')) || 0;
      });

      recalculateButton.disabled = true;
      try {
        const payload = {
          ...state.journey1,
          ...state.journey2,
          FatherMother: (state.journey2.FatherMother || []).filter(Boolean).length,
          InputRMF: journey3Values.InputRMF,
          InputESG: journey3Values.InputESG,
          InputInsure: journey3Values.InputInsure,
          InputHealthInsure: journey3Values.InputHealthInsure,
          InputInsure60: journey3Values.InputInsure60,
        };
        const response = await fetch(data.apiCalculateSaving, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('API error');
        const apiResult3Result = await response.json();
        onRecalculate(journey3Values, apiResult3Result);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Tax calculator API error:', err);
        recalculateButton.disabled = false;
      }
    });
  } else {
    body.appendChild(notesElement);
    container.appendChild(body);

    const footer = parseHTML(`
      <div class="tax-calc-footer">
        <button type="button" class="tax-calc-btn tax-calc-btn-primary">${getString(labels, 'buttonsBackButton', 'Back')}</button>
      </div>
    `);
    container.appendChild(footer);
    block.appendChild(container);

    footer.querySelector('.tax-calc-btn-primary').addEventListener('click', onBack);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export default async function decorate(block) {
  block.innerHTML = '';
  try {
    const data = await loadData();
    const state = {};

    const goToJourney1 = () => {
      renderJourney1(block, data, (journey1Values, apiResponse) => {
        state.journey1 = journey1Values;
        state.apiResponse = apiResponse;
        goToJourney2(); // eslint-disable-line no-use-before-define
      }, state.journey1 || {});
    };

    const goToJourney3 = () => {
      // eslint-disable-next-line no-use-before-define
      renderJourney3(block, data, state, goToJourney2, (journey3Values, apiResult3) => {
        state.journey3 = journey3Values;
        state.apiResult3 = apiResult3;
        goToJourney3();
      });
    };

    const goToJourney2 = () => {
      renderJourney2(block, data, state, goToJourney1, (journey2Values, result1, result2) => {
        state.journey2 = journey2Values;
        state.apiResult1 = result1;
        state.apiResult2 = result2;
        goToJourney3();
      });
    };

    goToJourney1();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Tax calculator failed to initialise:', e);
  }
}

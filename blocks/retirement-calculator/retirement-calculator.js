const RETIREMENT_CALCULATOR_DATA_PATH = 'retirementplan.json';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        value += char;
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function mapKeyValueRows(rows) {
  const dataMap = {};
  const [header = []] = rows;
  const keyIndex = header.indexOf('key');
  const valueIndex = header.indexOf('value');

  rows.slice(1).forEach((row) => {
    const key = row[keyIndex >= 0 ? keyIndex : 0];
    const value = row[valueIndex >= 0 ? valueIndex : 1];
    if (key) dataMap[key] = value || '';
  });

  return dataMap;
}

function normalizeDataPayload(payload) {
  if (!payload) return {};

  const rows = Array.isArray(payload) ? payload : payload.data;
  if (Array.isArray(rows)) {
    return rows.reduce((dataMap, row) => {
      if (row?.key) dataMap[row.key] = row.value || '';
      return dataMap;
    }, {});
  }

  if (payload.data && typeof payload.data === 'object') return payload.data;
  if (payload.en && typeof payload.en === 'object') return payload.en;
  if (payload.values && typeof payload.values === 'object') return payload.values;
  return typeof payload === 'object' ? payload : {};
}

function getDataUrl(block) {
  const { pathname } = window.location;
  const contentRoot = pathname.match(/^(\/content\/bangkokbank)(?:\/|$)/)?.[1];
  const defaultDataUrl = contentRoot
    ? `${contentRoot}/${RETIREMENT_CALCULATOR_DATA_PATH}`
    : `/${RETIREMENT_CALCULATOR_DATA_PATH}`;

  return block.dataset.dataUrl
    || window.retirementCalculatorDataUrl
    || window.RETIREMENT_CALCULATOR_DATA_URL
    || block.querySelector('a')?.href
    || defaultDataUrl;
}

async function getJsonData(block) {
  const link = getDataUrl(block);
  if (!link) return {};
  try {
    const response = await fetch(link);
    if (!response.ok) throw new Error('Fetch failed');
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/csv') || link.endsWith('.csv')) {
      return mapKeyValueRows(parseCsv(await response.text()));
    }

    const json = await response.json();
    return normalizeDataPayload(json);
  } catch {
    return {};
  }
}

function createButton(text, className, onClick) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.textContent = text;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

function createHeading(tag, className, text) {
  const heading = document.createElement(tag);
  if (className) heading.className = className;
  if (text) heading.textContent = text;
  return heading;
}

function createLabel(text, htmlFor) {
  const label = document.createElement('label');
  if (htmlFor) label.htmlFor = htmlFor;
  label.textContent = text;
  return label;
}

function createInput(type, id, placeholder, value) {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  if (placeholder) input.placeholder = placeholder;
  if (value !== undefined) input.value = value;
  return input;
}

function createInputGroup(labelText, inputId, placeholder, suffixText) {
  const group = document.createElement('div');
  group.classList.add('input-group');

  const label = createLabel(labelText, inputId);
  const inputWrap = document.createElement('div');
  inputWrap.classList.add('input-with-suffix');
  const input = createInput('number', inputId, placeholder);
  inputWrap.appendChild(input);

  if (suffixText) {
    const suffix = document.createElement('span');
    suffix.classList.add('input-suffix');
    suffix.textContent = suffixText;
    inputWrap.appendChild(suffix);
  }

  group.appendChild(label);
  group.appendChild(inputWrap);
  return group;
}

function createAgeInputGroup(labelText, inputId, value) {
  const group = document.createElement('div');
  group.classList.add('age-input-group');
  const label = createLabel(labelText, inputId);
  const input = createInput('number', inputId, '', value);

  group.appendChild(label);
  group.appendChild(input);
  return group;
}

function toNumber(value) {
  return Number(String(value).replace(/,/g, ''));
}

function getInputNumber(container, selector) {
  return toNumber(container.querySelector(selector)?.value || 0);
}

function getText(data, key) {
  return data[key] || '';
}

function getNoteText(data) {
  return getText(data, 'common-noteText')
    .replace('{inflationRate}', '1.5')
    .replace('{afterretirerate}', '3');
}

function updateStepper(stepper, currentStep) {
  const steps = [...stepper.querySelectorAll('.step')];
  const lines = [...stepper.querySelectorAll('.line')];
  const isFinalStep = currentStep === steps.length;

  steps.forEach((step, index) => {
    const stepNumber = index + 1;
    step.classList.toggle('active', stepNumber === currentStep && !isFinalStep);
    step.classList.toggle('completed', stepNumber < currentStep || isFinalStep);
  });

  lines.forEach((line, index) => {
    line.classList.toggle('active', index < currentStep - 1);
  });
}

function setActiveStep(steps, stepper, currentStep) {
  steps.forEach((step, index) => {
    const isActive = index + 1 === currentStep;
    step.classList.toggle('active', isActive);
    step.hidden = !isActive;
  });
  updateStepper(stepper, currentStep);
}

function createSummaryRow(labelText, valueText, helperText, valueClass) {
  const row = document.createElement('div');
  const label = document.createElement('span');
  const value = document.createElement('span');

  label.textContent = labelText;
  value.textContent = valueText;
  if (valueClass) value.classList.add(valueClass);

  if (helperText) {
    const helper = document.createElement('small');
    helper.textContent = helperText;
    label.appendChild(helper);
  }

  row.appendChild(label);
  row.appendChild(value);
  return row;
}

function createStepper(jsonData) {
  const stepperData = [
    {
      label: getText(jsonData, 'common-step1Label'),
      step: 1,
    },
    {
      label: getText(jsonData, 'common-step2Label'),
      step: 2,
    },
    {
      label: getText(jsonData, 'common-step3Label'),
      step: 3,
    },
  ];

  const stepper = document.createElement('div');
  stepper.classList.add('stepper');

  stepperData.forEach((item, index) => {
    const step = document.createElement('div');
    step.classList.add('step');
    if (index === 0) step.classList.add('active');

    const stepNumber = document.createElement('div');
    stepNumber.classList.add('step-number');
    stepNumber.textContent = item.step;

    const stepLabel = document.createElement('div');
    stepLabel.classList.add('step-label');
    stepLabel.textContent = item.label;

    step.appendChild(stepNumber);
    step.appendChild(stepLabel);
    stepper.appendChild(step);

    if (index < stepperData.length - 1) {
      const line = document.createElement('div');
      line.classList.add('line');
      stepper.appendChild(line);
    }
  });

  return stepper;
}

function createStep1(jsonData) {
  const step1 = document.createElement('div');
  step1.classList.add('calculator-step', 'step-1', 'active');

  const monthlyAmountContainer = document.createElement('div');
  monthlyAmountContainer.classList.add('monthly-amount-container');

  const title = createHeading('h3', '', getText(jsonData, 'steps-step1-monthlyIncomeTitle'));
  monthlyAmountContainer.appendChild(title);

  const amountInputContainer = document.createElement('div');
  amountInputContainer.classList.add('amount-input-container');

  const amountInput = createInput('text', 'monthly-amount', '', '20,000');
  amountInput.inputMode = 'numeric';
  const unit = document.createElement('span');
  unit.textContent = getText(jsonData, 'common-unit');
  amountInputContainer.appendChild(amountInput);
  amountInputContainer.appendChild(unit);
  monthlyAmountContainer.appendChild(amountInputContainer);

  const presentValueNote = document.createElement('p');
  presentValueNote.textContent = getText(jsonData, 'steps-step1-currentValueNote');
  monthlyAmountContainer.appendChild(presentValueNote);

  step1.appendChild(monthlyAmountContainer);

  const ageInputsContainer = document.createElement('div');
  ageInputsContainer.classList.add('age-inputs-container');

  ageInputsContainer.appendChild(createAgeInputGroup(getText(jsonData, 'steps-step1-currentAge'), 'current-age', '30'));
  ageInputsContainer.appendChild(createAgeInputGroup(getText(jsonData, 'steps-step1-retirementAge'), 'retirement-age', '60'));
  ageInputsContainer.appendChild(createAgeInputGroup(getText(jsonData, 'steps-step1-lifeExpectancy'), 'life-expectancy', '80'));

  step1.appendChild(ageInputsContainer);

  const nextButton = createButton(getText(jsonData, 'buttons-nextButton'));
  nextButton.classList.add('next-btn');
  step1.appendChild(nextButton);

  return step1;
}

function createStep2(jsonData) {
  const step2 = document.createElement('div');
  step2.classList.add('calculator-step', 'step-2');
  step2.hidden = true;

  const resultsContainer = document.createElement('div');
  resultsContainer.classList.add('results-container');

  const totalAmountContainer = document.createElement('div');
  totalAmountContainer.classList.add('total-amount-container');
  const totalAmountLabel = createLabel(getText(jsonData, 'common-requiredAmount'));
  const totalAmountValue = createHeading('h3', '', '6,479,636');
  totalAmountContainer.appendChild(totalAmountLabel);
  totalAmountContainer.appendChild(totalAmountValue);

  const monthlyAmountContainer = document.createElement('div');
  monthlyAmountContainer.classList.add('monthly-amount-container-step2');
  const monthlyAmountLabel = createLabel(getText(jsonData, 'common-forSpending'));
  const monthlyAmountValue = createHeading('h3', '', '31,262');
  monthlyAmountContainer.appendChild(monthlyAmountLabel);
  monthlyAmountContainer.appendChild(monthlyAmountValue);

  resultsContainer.appendChild(totalAmountContainer);
  resultsContainer.appendChild(monthlyAmountContainer);
  step2.appendChild(resultsContainer);

  const note = document.createElement('p');
  note.classList.add('note-text');
  note.textContent = getNoteText(jsonData);
  step2.appendChild(note);

  const step2Title = createHeading(
    'h3',
    'step2-title',
    getText(jsonData, 'common-step2Title'),
  );
  step2.appendChild(step2Title);

  const savingsInputsContainer = document.createElement('div');
  savingsInputsContainer.classList.add('savings-inputs-container');

  const savingsSectionTitle = createHeading('h4', 'section-title', getText(jsonData, 'steps-step2-savingsSection'));
  savingsInputsContainer.appendChild(savingsSectionTitle);
  savingsInputsContainer.appendChild(
    createInputGroup(getText(jsonData, 'steps-step2-currentSavingsLabel'), 'current-savings', '0'),
  );

  const providentSectionTitle = createHeading('h4', 'section-title', getText(jsonData, 'steps-step2-providentFundSection'));
  savingsInputsContainer.appendChild(providentSectionTitle);
  savingsInputsContainer.appendChild(
    createInputGroup(getText(jsonData, 'steps-step2-currentProvidentFundSavingsLabel'), 'provident-fund', '0'),
  );

  const rmfSectionTitle = createHeading('h4', 'section-title', getText(jsonData, 'steps-step2-rmfSection'));
  savingsInputsContainer.appendChild(rmfSectionTitle);
  savingsInputsContainer.appendChild(
    createInputGroup(getText(jsonData, 'steps-step2-currentRMFSavingsLabel'), 'rmf-savings', '0'),
  );

  const lumpSumSectionTitle = createHeading('h4', 'section-title', getText(jsonData, 'steps-step2-lumpSumSection'));
  savingsInputsContainer.appendChild(lumpSumSectionTitle);
  savingsInputsContainer.appendChild(
    createInputGroup(getText(jsonData, 'steps-step2-lumpSumAtRetirementLabel'), 'lump-sum', '0'),
  );

  step2.appendChild(savingsInputsContainer);

  const buttonContainer = document.createElement('div');
  buttonContainer.classList.add('button-container');
  const backButton = createButton(getText(jsonData, 'buttons-backButton'));
  backButton.classList.add('back-btn');
  const calculateButton = createButton(getText(jsonData, 'buttons-calculateButton'));
  calculateButton.classList.add('calculate-btn');
  buttonContainer.appendChild(backButton);
  buttonContainer.appendChild(calculateButton);
  step2.appendChild(buttonContainer);

  return step2;
}

function createStep3(jsonData) {
  const step3 = document.createElement('div');
  step3.classList.add('calculator-step', 'step-3');
  step3.hidden = true;

  // Re-using the same results container from step 2 for consistency
  const resultsContainer = document.createElement('div');
  resultsContainer.classList.add('results-container');

  const totalAmountContainer = document.createElement('div');
  totalAmountContainer.classList.add('total-amount-container');
  const totalAmountLabel = createLabel(getText(jsonData, 'common-requiredAmount'));
  const totalAmountValue = createHeading('h3', '', '6,479,636');
  totalAmountContainer.appendChild(totalAmountLabel);
  totalAmountContainer.appendChild(totalAmountValue);

  const monthlyAmountContainer = document.createElement('div');
  monthlyAmountContainer.classList.add('monthly-amount-container-step2');
  const monthlyAmountLabel = createLabel(getText(jsonData, 'common-forSpending'));
  const monthlyAmountValue = createHeading('h3', '', '31,262');
  monthlyAmountContainer.appendChild(monthlyAmountLabel);
  monthlyAmountContainer.appendChild(monthlyAmountValue);

  resultsContainer.appendChild(totalAmountContainer);
  resultsContainer.appendChild(monthlyAmountContainer);
  step3.appendChild(resultsContainer);

  const note = document.createElement('p');
  note.classList.add('note-text');
  note.textContent = getNoteText(jsonData);
  step3.appendChild(note);

  const recommendationCards = document.createElement('div');
  recommendationCards.classList.add('recommendation-cards');

  const recommendedCard = document.createElement('div');
  recommendedCard.classList.add('card', 'recommended-card');
  const recommendedLabel = createLabel(getText(jsonData, 'steps-results-recommendedMonthlySavingLabel'));
  const recommendedValue = createHeading('h3', '', '11,092');
  const recommendedNote = document.createElement('p');
  recommendedNote.textContent = getText(jsonData, 'steps-results-byInvestingAt3Percent').replace('{rate}', '3');
  recommendedCard.appendChild(recommendedLabel);
  recommendedCard.appendChild(recommendedValue);
  recommendedCard.appendChild(recommendedNote);

  const alternativeCard = document.createElement('div');
  alternativeCard.classList.add('card', 'alternative-card');
  const alternativeLabel = createLabel(getText(jsonData, 'steps-results-alternativeMonthlySavingLabel'));
  const alternativeValue = createHeading('h3', '', '7,753');
  const alternativeNote = document.createElement('p');
  alternativeNote.textContent = getText(jsonData, 'steps-results-byInvestingAt5Percent').replace('{rate}', '5');
  alternativeCard.appendChild(alternativeLabel);
  alternativeCard.appendChild(alternativeValue);
  alternativeCard.appendChild(alternativeNote);

  recommendationCards.appendChild(recommendedCard);
  recommendationCards.appendChild(alternativeCard);
  step3.appendChild(recommendationCards);

  const summaryTitle = createHeading('h3', 'summary-title', getText(jsonData, 'steps-results-resultsTitle'));
  step3.appendChild(summaryTitle);

  const summaryTable = document.createElement('div');
  summaryTable.classList.add('summary-table');
  summaryTable.appendChild(createSummaryRow(
    getText(jsonData, 'steps-results-retirementGoal'),
    `6,479,636 ${getText(jsonData, 'common-unit')}`,
  ));
  summaryTable.appendChild(createSummaryRow(
    getText(jsonData, 'steps-results-currentSavingsStatus'),
    `- ${getText(jsonData, 'common-unit')}`,
  ));
  summaryTable.appendChild(createSummaryRow(
    getText(jsonData, 'steps-results-recommendedMonthlySavingResult'),
    `\u219311,092 ${getText(jsonData, 'common-unit')}`,
    getText(jsonData, 'steps-results-consistentInvestment'),
    'blue-text',
  ));
  step3.appendChild(summaryTable);

  const backButton = createButton(getText(jsonData, 'buttons-backButton'));
  backButton.classList.add('back-btn-step3');
  step3.appendChild(backButton);

  return step3;
}

export default async function decorate(block) {
  const jsonData = await getJsonData(block);

  const title = createHeading('h2', 'calculator-title', getText(jsonData, 'common-title'));
  block.innerHTML = ''; // clear any placeholder content
  block.appendChild(title);

  const stepper = createStepper(jsonData);
  block.appendChild(stepper);

  const step1 = createStep1(jsonData);
  block.appendChild(step1);

  const step2 = createStep2(jsonData);
  block.appendChild(step2);

  const step3 = createStep3(jsonData);
  block.appendChild(step3);

  const steps = [step1, step2, step3];
  const nextButton = step1.querySelector('.next-btn');
  const backButtonStep2 = step2.querySelector('.back-btn');
  const calculateButton = step2.querySelector('.calculate-btn');
  const backButtonStep3 = step3.querySelector('.back-btn-step3');

  setActiveStep(steps, stepper, 1);

  nextButton.addEventListener('click', () => {
    setActiveStep(steps, stepper, 2);
  });

  backButtonStep2.addEventListener('click', () => {
    setActiveStep(steps, stepper, 1);
  });

  calculateButton.addEventListener('click', async () => {
    // Gather user inputs from step 1 and step 2
    const payload = {
      monthlyAmount: getInputNumber(step1, '#monthly-amount'),
      currentAge: getInputNumber(step1, '#current-age'),
      retirementAge: getInputNumber(step1, '#retirement-age'),
      lifeExpectancy: getInputNumber(step1, '#life-expectancy'),
      currentSavings: getInputNumber(step2, '#current-savings'),
      savingsReturnRate: getInputNumber(step2, '#savings-return-rate'),
      savingsIncreaseRate: getInputNumber(step2, '#savings-increase-rate'),
      providentFund: getInputNumber(step2, '#provident-fund'),
      providentFundReturnRate: getInputNumber(step2, '#provident-fund-return'),
      monthlySalary: getInputNumber(step2, '#monthly-salary'),
      annualSalaryIncreaseRate: getInputNumber(step2, '#salary-increase-rate'),
      providentFundContributionRate: getInputNumber(step2, '#provident-fund-contribution'),
      rmfSavings: getInputNumber(step2, '#rmf-savings'),
      rmfAnnualAmount: getInputNumber(step2, '#rmf-annual-amount'),
      rmfReturnRate: getInputNumber(step2, '#rmf-return-rate'),
      lumpSum: getInputNumber(step2, '#lump-sum'),
      lumpSumAnnualInvestment: getInputNumber(step2, '#lump-sum-annual'),
      lumpSumReturnRate: getInputNumber(step2, '#lump-sum-return'),
    };

    const apiEndpoint = jsonData['api-endpoint'];
    let results = {};

    if (apiEndpoint) {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Retirement calculation failed');

      const data = await response.json();
      results = data.results || data.data || data;
    }

    const getResult = (...keys) => {
      const key = keys.find((item) => results[item] !== undefined && results[item] !== null);
      return key ? results[key] : undefined;
    };
    const formatAmount = (value) => (
      typeof value === 'number' ? value.toLocaleString('en-US') : value
    );
    const setText = (element, value, fallback = element?.textContent) => {
      if (element) element.textContent = formatAmount(value ?? fallback);
    };
    const formatAmountWithUnit = (value, fallback, prefix = '') => {
      if (value === undefined || value === null) return fallback;
      const amount = formatAmount(value);
      return typeof value === 'number'
        ? `${prefix}${amount} ${getText(jsonData, 'common-unit')}`.trim()
        : `${prefix}${amount}`;
    };

    const step3Totals = step3.querySelectorAll('.results-container h3');
    const retirementGoal = getResult('retirementGoal', 'requiredAmount', 'totalAmount');
    const monthlySpending = getResult('monthlySpending', 'forSpending', 'monthlyAmount');
    const recommendedSaving = getResult('recommendedMonthlySaving', 'recommendedMonthlySavingAt3Percent', 'recommendedSaving');
    const alternativeSaving = getResult('alternativeMonthlySaving', 'alternativeMonthlySavingAt5Percent', 'alternativeSaving');
    const currentSavingsStatus = getResult('currentSavingsStatus', 'totalCurrentSavings', 'currentSavingsStatusAmount');

    setText(step3Totals[0], retirementGoal);
    setText(step3Totals[1], monthlySpending);
    setText(step3.querySelector('.recommended-card h3'), recommendedSaving);
    setText(step3.querySelector('.alternative-card h3'), alternativeSaving);

    const summaryRows = step3.querySelectorAll('.summary-table > div');
    setText(
      summaryRows[0]?.querySelector('span:last-child'),
      formatAmountWithUnit(retirementGoal, `6,479,636 ${getText(jsonData, 'common-unit')}`),
    );
    setText(
      summaryRows[1]?.querySelector('span:last-child'),
      formatAmountWithUnit(currentSavingsStatus, `- ${getText(jsonData, 'common-unit')}`),
    );
    setText(
      summaryRows[2]?.querySelector('span:last-child'),
      formatAmountWithUnit(recommendedSaving, `\u2193 11,092 ${getText(jsonData, 'common-unit')}`, '\u2193 '),
    );

    setActiveStep(steps, stepper, 3);
  });

  backButtonStep3.addEventListener('click', () => {
    setActiveStep(steps, stepper, 2);
  });
}

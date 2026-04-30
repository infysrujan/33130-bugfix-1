async function getJsonData(blockName) {
  const code = document.documentElement.lang || 'en';
  const jsonUrl = `/blocks/${blockName}/_${blockName}.json`;
  try {
    const response = await fetch(jsonUrl);
    if (!response.ok) throw new Error('Fetch failed');
    const json = await response.json();
    return json.data ? json.data[code] : null;
  } catch (error) {
    console.error('Error fetching JSON data:', error);
    return null;
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
  if (text) heading.innerHTML = text; // Allow breaks if \n is replaced
  return heading;
}

function createLabel(text, htmlFor) {
  const label = document.createElement('label');
  if (htmlFor) label.htmlFor = htmlFor;
  label.textContent = text;
  return label;
}

function createInput(type, id, placeholder) {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function createStepper(jsonData) {
  const stepperData = [
    {
      label: jsonData.common.step1Label,
      step: 1,
    },
    {
      label: jsonData.common.step2Label,
      step: 2,
    },
    {
      label: jsonData.common.step3Label,
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

  const title = createHeading('h3', '', jsonData.steps.step1.monthlyIncomeTitle);
  monthlyAmountContainer.appendChild(title);

  const amountInputContainer = document.createElement('div');
  amountInputContainer.classList.add('amount-input-container');

  const amountInput = createInput('number', 'monthly-amount', '20,000');
  const unit = document.createElement('span');
  unit.textContent = jsonData.common.unit;
  amountInputContainer.appendChild(amountInput);
  amountInputContainer.appendChild(unit);
  monthlyAmountContainer.appendChild(amountInputContainer);

  const presentValueNote = document.createElement('p');
  presentValueNote.textContent = jsonData.steps.step1.currentValueNote;
  monthlyAmountContainer.appendChild(presentValueNote);

  step1.appendChild(monthlyAmountContainer);

  const ageInputsContainer = document.createElement('div');
  ageInputsContainer.classList.add('age-inputs-container');

  const currentAgeLabel = createLabel(jsonData.steps.step1.currentAge, 'current-age');
  const currentAgeInput = createInput('number', 'current-age', '30');
  ageInputsContainer.appendChild(currentAgeLabel);
  ageInputsContainer.appendChild(currentAgeInput);

  const retirementAgeLabel = createLabel(jsonData.steps.step1.retirementAge, 'retirement-age');
  const retirementAgeInput = createInput('number', 'retirement-age', '60');
  ageInputsContainer.appendChild(retirementAgeLabel);
  ageInputsContainer.appendChild(retirementAgeInput);

  const lifeExpectancyLabel = createLabel(jsonData.steps.step1.lifeExpectancy, 'life-expectancy');
  const lifeExpectancyInput = createInput('number', 'life-expectancy', '80');
  ageInputsContainer.appendChild(lifeExpectancyLabel);
  ageInputsContainer.appendChild(lifeExpectancyInput);

  step1.appendChild(ageInputsContainer);

  const nextButton = createButton(jsonData.buttons.nextButton);
  nextButton.classList.add('next-btn');
  step1.appendChild(nextButton);

  return step1;
}

function createStep2(jsonData) {
  const step2 = document.createElement('div');
  step2.classList.add('calculator-step', 'step-2');

  const resultsContainer = document.createElement('div');
  resultsContainer.classList.add('results-container');

  const totalAmountContainer = document.createElement('div');
  totalAmountContainer.classList.add('total-amount-container');
  const totalAmountLabel = createLabel(jsonData.common.requiredAmount);
  const totalAmountValue = createHeading('h3', '', '6,479,636');
  totalAmountContainer.appendChild(totalAmountLabel);
  totalAmountContainer.appendChild(totalAmountValue);

  const monthlyAmountContainer = document.createElement('div');
  monthlyAmountContainer.classList.add('monthly-amount-container-step2');
  const monthlyAmountLabel = createLabel(jsonData.common.forSpending);
  const monthlyAmountValue = createHeading('h3', '', '31,262');
  monthlyAmountContainer.appendChild(monthlyAmountLabel);
  monthlyAmountContainer.appendChild(monthlyAmountValue);

  resultsContainer.appendChild(totalAmountContainer);
  resultsContainer.appendChild(monthlyAmountContainer);
  step2.appendChild(resultsContainer);

  const note = document.createElement('p');
  note.classList.add('note-text');
  note.textContent = jsonData.common.noteText
    .replace('{inflationRate}', '1.75')
    .replace('{afterretirerate}', '2');
  step2.appendChild(note);

  const step2Title = createHeading('h3', 'step2-title', jsonData.common.step2Title);
  step2.appendChild(step2Title);

  const savingsInputsContainer = document.createElement('div');
  savingsInputsContainer.classList.add('savings-inputs-container');

  const savingsLabel = createLabel(jsonData.steps.step2.currentSavingsLabel, 'current-savings');
  const savingsInput = createInput('number', 'current-savings', '0');
  savingsInputsContainer.appendChild(savingsLabel);
  savingsInputsContainer.appendChild(savingsInput);

  const providentFundLabel = createLabel(jsonData.steps.step2.currentProvidentFundSavingsLabel, 'provident-fund');
  const providentFundInput = createInput('number', 'provident-fund', '0');
  savingsInputsContainer.appendChild(providentFundLabel);
  savingsInputsContainer.appendChild(providentFundInput);

  const rmfLabel = createLabel(jsonData.steps.step2.currentRMFSavingsLabel, 'rmf-savings');
  const rmfInput = createInput('number', 'rmf-savings', '0');
  savingsInputsContainer.appendChild(rmfLabel);
  savingsInputsContainer.appendChild(rmfInput);

  const lumpSumLabel = createLabel(jsonData.steps.step2.lumpSumAtRetirementLabel, 'lump-sum');
  const lumpSumInput = createInput('number', 'lump-sum', '0');
  savingsInputsContainer.appendChild(lumpSumLabel);
  savingsInputsContainer.appendChild(lumpSumInput);

  step2.appendChild(savingsInputsContainer);

  const buttonContainer = document.createElement('div');
  buttonContainer.classList.add('button-container');
  const backButton = createButton(jsonData.buttons.backButton);
  backButton.classList.add('back-btn');
  const calculateButton = createButton(jsonData.buttons.calculateButton);
  calculateButton.classList.add('calculate-btn');
  buttonContainer.appendChild(backButton);
  buttonContainer.appendChild(calculateButton);
  step2.appendChild(buttonContainer);

  return step2;
}

function createStep3(jsonData) {
  const step3 = document.createElement('div');
  step3.classList.add('calculator-step', 'step-3');

  // Re-using the same results container from step 2 for consistency
  const resultsContainer = document.createElement('div');
  resultsContainer.classList.add('results-container');

  const totalAmountContainer = document.createElement('div');
  totalAmountContainer.classList.add('total-amount-container');
  const totalAmountLabel = createLabel(jsonData.common.requiredAmount);
  const totalAmountValue = createHeading('h3', '', '6,479,636');
  totalAmountContainer.appendChild(totalAmountLabel);
  totalAmountContainer.appendChild(totalAmountValue);

  const monthlyAmountContainer = document.createElement('div');
  monthlyAmountContainer.classList.add('monthly-amount-container-step2');
  const monthlyAmountLabel = createLabel(jsonData.common.forSpending);
  const monthlyAmountValue = createHeading('h3', '', '31,262');
  monthlyAmountContainer.appendChild(monthlyAmountLabel);
  monthlyAmountContainer.appendChild(monthlyAmountValue);

  resultsContainer.appendChild(totalAmountContainer);
  resultsContainer.appendChild(monthlyAmountContainer);
  step3.appendChild(resultsContainer);

  const note = document.createElement('p');
  note.classList.add('note-text');
  note.textContent = jsonData.common.noteText
    .replace('{inflationRate}', '1.75')
    .replace('{afterretirerate}', '2');
  step3.appendChild(note);

  const recommendationCards = document.createElement('div');
  recommendationCards.classList.add('recommendation-cards');

  const recommendedCard = document.createElement('div');
  recommendedCard.classList.add('card', 'recommended-card');
  const recommendedLabel = createLabel(jsonData.steps.results.recommendedMonthlySavingLabel);
  const recommendedValue = createHeading('h3', '', '11,092');
  const recommendedNote = document.createElement('p');
  recommendedNote.textContent = jsonData.steps.results.byInvestingAt3Percent.replace('{rate}', '3');
  recommendedCard.appendChild(recommendedLabel);
  recommendedCard.appendChild(recommendedValue);
  recommendedCard.appendChild(recommendedNote);

  const alternativeCard = document.createElement('div');
  alternativeCard.classList.add('card', 'alternative-card');
  const alternativeLabel = createLabel(jsonData.steps.results.alternativeMonthlySavingLabel);
  const alternativeValue = createHeading('h3', '', '7,753');
  const alternativeNote = document.createElement('p');
  alternativeNote.textContent = jsonData.steps.results.byInvestingAt5Percent.replace('{rate}', '5');
  alternativeCard.appendChild(alternativeLabel);
  alternativeCard.appendChild(alternativeValue);
  alternativeCard.appendChild(alternativeNote);

  recommendationCards.appendChild(recommendedCard);
  recommendationCards.appendChild(alternativeCard);
  step3.appendChild(recommendationCards);

  const summaryTitle = createHeading('h3', 'summary-title', jsonData.steps.results.resultsTitle);
  step3.appendChild(summaryTitle);

  const summaryTable = document.createElement('div');
  summaryTable.classList.add('summary-table');
  // This would be dynamically populated with actual calculation results
  summaryTable.innerHTML = `
    <div><span>${jsonData.steps.results.retirementGoal}</span><span>6,479,636 ${jsonData.common.unit}</span></div>
    <div><span>${jsonData.steps.results.currentSavingsStatus}</span><span>- ${jsonData.common.unit}</span></div>
    <div><span>${jsonData.steps.results.recommendedMonthlySavingResult}</span><span class="blue-text">↓ 11,092 ${jsonData.common.unit}</span></div>
    <div class="consistent-investment">${jsonData.steps.results.consistentInvestment}</div>
  `;
  step3.appendChild(summaryTable);

  const backButton = createButton(jsonData.buttons.backButton);
  backButton.classList.add('back-btn-step3');
  step3.appendChild(backButton);

  return step3;
}

export default async function decorate(block) {
  const jsonData = await getJsonData('retirement-calculator');

  const title = createHeading('h2', 'calculator-title', jsonData.common.title);
  block.appendChild(title);

  const stepper = createStepper(jsonData);
  block.appendChild(stepper);

  const step1 = createStep1(jsonData);
  block.appendChild(step1);

  const step2 = createStep2(jsonData);
  block.appendChild(step2);

  const step3 = createStep3(jsonData);
  block.appendChild(step3);

  const nextButton = step1.querySelector('.next-btn');
  const backButtonStep2 = step2.querySelector('.back-btn');
  const calculateButton = step2.querySelector('.calculate-btn');
  const backButtonStep3 = step3.querySelector('.back-btn-step3');

  nextButton.addEventListener('click', () => {
    step1.classList.remove('active');
    step2.classList.add('active');
    stepper.children[0].classList.remove('active');
    stepper.children[1].classList.add('active');
    stepper.children[2].classList.add('active');
  });

  backButtonStep2.addEventListener('click', () => {
    step2.classList.remove('active');
    step1.classList.add('active');
    stepper.children[2].classList.remove('active');
    stepper.children[1].classList.remove('active');
    stepper.children[0].classList.add('active');
  });

  calculateButton.addEventListener('click', () => {
    step2.classList.remove('active');
    step3.classList.add('active');
    stepper.children[2].classList.remove('active');
    stepper.children[3].classList.add('active');
    stepper.children[4].classList.add('active');
  });

  backButtonStep3.addEventListener('click', () => {
    step3.classList.remove('active');
    step2.classList.add('active');
    stepper.children[4].classList.remove('active');
    stepper.children[3].classList.remove('active');
    stepper.children[2].classList.add('active');
  });
}

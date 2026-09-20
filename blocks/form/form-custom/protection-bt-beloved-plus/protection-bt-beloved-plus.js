// The plan-selection radio group's fieldset, confirmed via DevTools:
// <fieldset name="hospitalPlanDD" title="ความคุ้มครองที่แนะนำ แผน 4...">
// Scoping to this exact name means the fix only ever touches this one
// field, never any other radio/checkbox group in the form.
const PLAN_RADIO_FIELDSET_SELECTOR = 'fieldset[name="hospitalPlanDD"]';

// The recommended option's own wrapper, confirmed via DevTools:
// <div class="radio-wrapper" data-id="hospitalplandd-3"> (the 4th option,
// แผน 4). Targeting it directly by data-id avoids relying on label text,
// which could change independently of the option order.
const TOOLTIP_TARGET_OPTION_SELECTOR = '.radio-wrapper[data-id="hospitalplandd-3"]';

function toPlainText(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent.trim();
}

function isProtectionBtBelovedPlusForm(form) {
  if (!form) return false;
  return form.querySelector('fieldset[name="insuranceSummaryPanel"]') !== null;
}

function fixRadioGroupTooltip(fieldset) {
  const tooltipText = fieldset.getAttribute('title');
  if (!tooltipText) return;
  if (fieldset.dataset.tooltipFixed === 'true') return;

  const FALLBACK_DESCRIPTION = '*ค่าห้อง หมายความรวมถึงค่าอาหาร ค่าบริการในโรงพยาบาล (ผู้ป่วยใน) ต่อการเข้าพักรักษาเป็นผู้ป่วยในครั้งใดครั้งหนึ่งด้วย';
  const generalDescription = toPlainText(fieldset.getAttribute('data-description') || '') || FALLBACK_DESCRIPTION;

  const allOptions = fieldset.querySelectorAll('.radio-wrapper');
  const targetOption = fieldset.querySelector(TOOLTIP_TARGET_OPTION_SELECTOR);

  fieldset.removeAttribute('title');

  allOptions.forEach((optionWrapper) => {
    const label = optionWrapper.querySelector('label');
    if (!label) return;

    if (optionWrapper === targetOption) {
      label.title = tooltipText;
    } else {
      label.title = generalDescription;
    }
  });

  fieldset.dataset.tooltipFixed = 'true';
}

function fixPlanRadioTooltips(form) {
  const fieldsets = form.querySelectorAll(PLAN_RADIO_FIELDSET_SELECTOR);
  fieldsets.forEach(fixRadioGroupTooltip);

  const observer = new MutationObserver(() => {
    form.querySelectorAll(PLAN_RADIO_FIELDSET_SELECTOR).forEach((fieldset) => {
      if (fieldset.dataset.tooltipFixed !== 'true') {
        fixRadioGroupTooltip(fieldset);
      }
    });
  });
  observer.observe(form, { attributes: true, attributeFilter: ['title'], subtree: true });
}

export default function decorateProtectionBtBelovedPlus(form) {
  if (!isProtectionBtBelovedPlusForm(form)) return;

  fixPlanRadioTooltips(form);
}

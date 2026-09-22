// entirely so no option shows any tooltip on hover.
const PLAN_RADIO_FIELDSET_SELECTOR = 'fieldset[name="hospitalPlanDD"]';

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isProtectionBtBelovedPlusForm(form) {
  if (!form) return false;
  return form.querySelector(PLAN_RADIO_FIELDSET_SELECTOR) !== null;
}

/**
 * Removes the tooltip entirely: no title on the fieldset, no title on any
 * option label. Hovering any แผน option shows nothing.
 *
 * @param {HTMLElement} fieldset
 */
function removeRadioGroupTooltip(fieldset) {
  fieldset.removeAttribute('title');
  fieldset.querySelectorAll('.radio-wrapper label').forEach((label) => {
    label.removeAttribute('title');
  });
  fieldset.dataset.tooltipFixed = 'true';
}

/**
 * @param {HTMLFormElement} form
 */
function fixPlanRadioTooltips(form) {
  const fieldsets = form.querySelectorAll(PLAN_RADIO_FIELDSET_SELECTOR);
  fieldsets.forEach(removeRadioGroupTooltip);

  // The rule engine can rebuild radio-group markup (e.g. on enum/enumNames
  // change), which would re-add the title — watch and re-strip it.
  const observer = new MutationObserver(() => {
    form.querySelectorAll(PLAN_RADIO_FIELDSET_SELECTOR).forEach((fieldset) => {
      if (fieldset.getAttribute('title') || fieldset.querySelector('label[title]')) {
        removeRadioGroupTooltip(fieldset);
      }
    });
  });
  observer.observe(form, { attributes: true, attributeFilter: ['title'], subtree: true });
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateProtectionBtBelovedPlus(form) {
  if (!isProtectionBtBelovedPlusForm(form)) return;

  fixPlanRadioTooltips(form);
}

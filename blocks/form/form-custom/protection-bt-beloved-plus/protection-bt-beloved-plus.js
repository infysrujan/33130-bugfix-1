const PLAN_RADIO_FIELDSET_SELECTOR = 'fieldset[name="hospitalPlanDD"]';

let titleRulesMirrored = false;

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isProtectionBtBelovedPlusForm(form) {
  if (!form) return false;
  return form.querySelector(PLAN_RADIO_FIELDSET_SELECTOR) !== null;
}

/**
 * Removes the tooltip entirely from the plan radio group.
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
  form.querySelectorAll(PLAN_RADIO_FIELDSET_SELECTOR).forEach(removeRadioGroupTooltip);

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
 * For every CSS rule that uses attr(title) or a [title] selector, append a
 * copy that uses data-title instead. The inside text then keeps showing while
 * `title` is temporarily removed on hover.
 */
function mirrorTitleRulesToDataTitle() {
  if (titleRulesMirrored) return;
  titleRulesMirrored = true;

  Array.from(document.styleSheets).forEach((sheet) => {
    let rules;
    try {
      rules = Array.from(sheet.cssRules);
    } catch (err) {
      return; // cross-origin stylesheet, cannot be read
    }
    const extra = [];
    rules.forEach((rule) => {
      const css = rule.cssText || '';
      if (css.includes('attr(title)') || css.includes('[title]')) {
        extra.push(
          css.replaceAll('attr(title)', 'attr(data-title)').replaceAll('[title]', '[data-title]'),
        );
      }
    });
    extra.forEach((text) => {
      try {
        sheet.insertRule(text, sheet.cssRules.length);
      } catch (err) {
        // ignore rules the browser rejects
      }
    });
  });
}

/**
 * Returns the wrapper of a text/number field (age, amount), or null.
 * The plan radio group is ignored (handled by fixPlanRadioTooltips).
 *
 * @param {EventTarget | null} target
 * @returns {HTMLElement | null}
 */
function getTextFieldWrapper(target) {
  const wrapper = target?.closest?.('.field-wrapper');
  if (!wrapper || wrapper.closest(PLAN_RADIO_FIELDSET_SELECTOR)) return null;
  return wrapper.querySelector('input') ? wrapper : null;
}

/**
 * Keeps a permanent copy of each title in data-title (for the mirrored CSS).
 *
 * @param {HTMLElement} wrapper
 */
function copyTitlesToDataTitle(wrapper) {
  [wrapper, ...wrapper.querySelectorAll('[title]')].forEach((el) => {
    if (el.hasAttribute('title')) el.dataset.title = el.getAttribute('title');
  });
}

/**
 * Removes every title in the wrapper so the browser has no tooltip to show.
 *
 * @param {HTMLElement} wrapper
 */
function stashWrapperTitles(wrapper) {
  [wrapper, ...wrapper.querySelectorAll('[title]')].forEach((el) => {
    if (el.hasAttribute('title')) {
      const value = el.getAttribute('title');
      el.dataset.title = value;
      el.dataset.stashedTitle = value;
      el.removeAttribute('title');
    }
  });
}

/**
 * Puts the titles back once the pointer has left the field.
 *
 * @param {HTMLElement} wrapper
 */
function restoreWrapperTitles(wrapper) {
  [wrapper, ...wrapper.querySelectorAll('[data-stashed-title]')].forEach((el) => {
    if (el.dataset.stashedTitle !== undefined) {
      el.setAttribute('title', el.dataset.stashedTitle);
      delete el.dataset.stashedTitle;
    }
  });
}

/**
 * Hides the hover tooltip on the age and amount fields while keeping the
 * title (and the inside text that depends on it).
 *
 * @param {HTMLFormElement} form
 */
function fixTextFieldTooltips(form) {
  mirrorTitleRulesToDataTitle();

  // Initial pass so data-title exists before any hover.
  form.querySelectorAll('.field-wrapper').forEach((wrapper) => {
    if (getTextFieldWrapper(wrapper)) copyTitlesToDataTitle(wrapper);
  });

  // capture: true so this runs before the browser decides to show a tooltip.
  ['pointerover', 'mouseover', 'pointermove', 'focusin'].forEach((type) => {
    form.addEventListener(type, (e) => {
      const wrapper = getTextFieldWrapper(e.target);
      if (wrapper) stashWrapperTitles(wrapper);
    }, true);
  });

  form.addEventListener('pointerout', (e) => {
    const wrapper = getTextFieldWrapper(e.target);
    if (!wrapper) return;
    if (e.relatedTarget && wrapper.contains(e.relatedTarget)) return;
    if (wrapper.contains(document.activeElement)) return; // still focused
    restoreWrapperTitles(wrapper);
  }, true);

  form.addEventListener('focusout', (e) => {
    const wrapper = getTextFieldWrapper(e.target);
    if (wrapper && !wrapper.matches(':hover')) restoreWrapperTitles(wrapper);
  }, true);
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateProtectionBtBelovedPlus(form) {
  if (!form) return;

  fixTextFieldTooltips(form);

  if (!isProtectionBtBelovedPlusForm(form)) return;
  fixPlanRadioTooltips(form);
}

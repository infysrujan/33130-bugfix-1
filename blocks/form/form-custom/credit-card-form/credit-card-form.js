/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isCreditCardForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  // Field names vary per campaign (e.g. "field-creditcardhg"), so match by
  // prefix instead of requiring the exact "field-creditcard" class.
  return form.querySelector('[class*="field-creditcard"], .credit-card-form-panel, .creditcard-form-panel') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateCreditCardForm(form) {
  if (!isCreditCardForm(form)) return;
  document.body.classList.add('credit-card-form');
}

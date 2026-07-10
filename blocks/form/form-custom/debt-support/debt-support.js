/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isDebtSupportForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector('.field-main-form-panel .field-loan-type') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateDebtSupportForm(form) {
  if (!isDebtSupportForm(form)) return;
  document.body.classList.add('debt-support');
}

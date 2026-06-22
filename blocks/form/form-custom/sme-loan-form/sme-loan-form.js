/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isSmeLoanForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector('.sme-loan-form-panel') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateSmeLoanForm(form) {
  if (!isSmeLoanForm(form)) return;
  document.body.classList.add('sme-loan-form');
}

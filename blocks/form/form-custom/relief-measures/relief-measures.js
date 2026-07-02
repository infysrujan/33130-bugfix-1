/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isReliefMeasures(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector('.relief-measures-panel') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateReliefMeasures(form) {
  if (!isReliefMeasures(form)) return;
  document.body.classList.add('relief-measures-form');
}

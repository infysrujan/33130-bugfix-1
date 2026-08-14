/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isBondAllocationForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector('.bond-allocation-panel') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateBondAllocationForm(form) {
  if (!isBondAllocationForm(form)) return;
  document.body.classList.add('bond-allocation-form');
}

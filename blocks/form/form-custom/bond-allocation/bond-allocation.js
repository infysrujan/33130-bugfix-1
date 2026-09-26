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

  // Delegated listener (instead of binding to a static querySelectorAll snapshot) so that
  // inputs rendered later, e.g. rows added to a repeatable bond-allocation panel, are covered too.
  form.addEventListener('input', (e) => {
    const input = e.target;
    // Don't filter on input[type="text"]: fields with a displayFormat switch their
    // type to number/date while focused (see form.js inputDecorator/handleFocus),
    // so a type-based selector would stop matching mid-edit.
    if (input.matches?.('.bond-allocation-panel input')) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

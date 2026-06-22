/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isSipForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector('.sip-form-panel') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateSipForm(form) {
  if (!isSipForm(form)) return;
  document.body.classList.add('sip-form');
}

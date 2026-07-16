/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isContactUsForm(form) {
  if (!form) return false;

  // createForm() runs before the form is mounted in the section wrapper.
  return form.querySelector('.field-contact .field-main-panel') !== null;
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateContactUsForm(form) {
  if (!isContactUsForm(form)) return;
  document.body.classList.add('contact-us');
}

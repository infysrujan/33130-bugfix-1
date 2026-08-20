import { trackContactFormSubmit } from '../../../../scripts/analytics.js';

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isContactUsForm(form) {
  if (!form) return false;

  // Generated panel/fragment class names (field-contact, field-contactfragment,
  // field-main-panel, field-contactusfragment, ...) drift across environments
  // and are reused by other form templates, so matching on them is unreliable.
  // The hidden "formCode" field is an authored, form-specific identifier
  // added for tracking/submission purposes — use that instead.
  const formCode = form.querySelector('input[name="formCode"]')?.value;
  return formCode?.trim().toLowerCase() === 'contactus';
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateContactUsForm(form) {
  if (!isContactUsForm(form)) return;
  document.body.classList.add('contact-us');
  form.addEventListener('submit', trackContactFormSubmit);
}

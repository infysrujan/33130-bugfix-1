import { trackContactFormSubmit } from '../../../../scripts/analytics.js';

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isContactUsForm(form) {
  if (!form) return false;

  // Panel/fragment class names drift across environments, so match on the
  // authored "formCode" field instead. Strip non-alphanumerics since authored
  // values drift too (e.g. "ContactUs" vs "Contact-Us").
  const formCode = form.querySelector('input[name="formCode"]')?.value;
  return formCode?.replace(/[^a-z0-9]/gi, '').toLowerCase() === 'contactus';
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateContactUsForm(form) {
  if (!isContactUsForm(form)) return;
  document.body.classList.add('contact-us');
  form.addEventListener('submit', trackContactFormSubmit);
}

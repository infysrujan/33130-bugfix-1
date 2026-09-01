import { trackContactFormSubmit } from '../../../../scripts/analytics.js';

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isContactUsForm(form) {
  if (!form) return false;

  // Generated panel/fragment class names drift across environments.
  // The hidden "formCode" field is an authored, form-specific identifier
  // added for tracking/submission purposes (FormCode/formCode, ContactUs/Contact-Us).
  const formCodeInput = form.querySelector(
    'input[name="formCode" i], input[name="FormCode"], .field-formcode input, .field-form-code input',
  );
  const formCode = formCodeInput?.value?.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (formCode === 'contactus') return true;

  // Fallback check against form action or dataset attributes if formCode is not yet populated
  const actionPath = form.dataset?.action || form.getAttribute('action') || form.dataset?.formpath || '';
  const formAction = actionPath.toLowerCase();
  return formAction.includes('contact-us') || formAction.includes('contactus');
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateContactUsForm(form) {
  if (!isContactUsForm(form)) return;
  document.body.classList.add('contact-us');
  form.addEventListener('submit', trackContactFormSubmit);
}

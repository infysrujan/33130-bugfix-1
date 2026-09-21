import { trackContactFormSubmit } from '../../../../scripts/analytics.js';

const SUBJECT_FIELDSET_SELECTOR = 'fieldset[name="Subject"]';

/**
 * Splits each radio-tab label onto two lines at its first space, so long
 * Thai labels (e.g. "ร้องเรียน ไม่ใช่บริการทางการเงิน") wrap the same way
 * right point — inserting the break explicitly guarantees it.
 * Labels with no space (e.g. "สอบถาม") are left untouched.
 *
 * @param {HTMLElement} fieldset
 */
function splitSubjectLabels(fieldset) {
  if (fieldset.dataset.labelsSplit === 'true') return;

  fieldset.querySelectorAll('.radio-wrapper label').forEach((label) => {
    const text = label.textContent.trim();
    const spaceIndex = text.indexOf(' ');
    if (spaceIndex === -1) return; // single word — nothing to split

    const firstLine = text.slice(0, spaceIndex);
    const secondLine = text.slice(spaceIndex + 1);
    label.textContent = '';
    label.append(
      document.createTextNode(firstLine),
      document.createElement('br'),
      document.createTextNode(secondLine),
    );
  });

  fieldset.dataset.labelsSplit = 'true';
}

/**
 * @param {HTMLFormElement} form
 */
function fixSubjectLabelWrapping(form) {
  const fieldset = form.querySelector(SUBJECT_FIELDSET_SELECTOR);
  if (!fieldset) return;

  splitSubjectLabels(fieldset);

  // Re-split if the rule engine rebuilds the radio options (e.g. enum
  // change), since that would restore the original unsplit label text.
  const observer = new MutationObserver(() => {
    fieldset.dataset.labelsSplit = 'false';
    splitSubjectLabels(fieldset);
  });
  observer.observe(fieldset, { childList: true, subtree: true });
}

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
  form.addEventListener('reset', () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  });

  fixSubjectLabelWrapping(form);
}

function isSipForm(form) {
  if (!form) return false;

  return form.querySelector('.sip-form-code') !== null;
}

export default function decorateSipForm(form) {
  if (!isSipForm(form)) return;

  form.classList.add('sip-form');
}

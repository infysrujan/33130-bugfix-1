export default function decorateBelovedHealthSaver(form) {
  if (form.querySelector('.form-container.wizard-forms')) {
    const arrayLis = document.querySelectorAll('.wizard li');

    arrayLis.forEach((li) => {
      const span = document.createElement('span');

      while (li.firstChild) {
        span.appendChild(li.firstChild);
      }

      li.appendChild(span);
    });
  }
}

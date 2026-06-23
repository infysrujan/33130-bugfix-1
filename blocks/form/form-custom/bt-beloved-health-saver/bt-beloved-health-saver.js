export default function decorateBelovedHealthSaver(form) {
  if (document.querySelector('.form-container.wizard-forms')) {
    const arrayLis = form.querySelectorAll('.wizard li');

    arrayLis.forEach((li) => {
      const span = document.createElement('span');

      while (li.firstChild) {
        span.appendChild(li.firstChild);
      }

      li.appendChild(span);
    });
  }
}

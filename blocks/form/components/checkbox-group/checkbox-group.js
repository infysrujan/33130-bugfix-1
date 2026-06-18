/**
 * Enforces a maximum number of checkbox selections within a checkbox-group field.
 * Reads fd.properties.maxSelect (numeric string) and disables unchecked items
 * once the limit is reached, re-enabling them if a checked item is later unchecked.
 *
 * Activate by adding a custom property  maxSelect: "3"  to the field in UE.
 *
 * @param {HTMLElement} element - The rendered <fieldset> for the checkbox-group
 * @param {Object} fd - AEM Forms field definition
 */
export default function decorate(element, fd) {
  const max = parseInt(fd.properties?.maxSelect, 10);
  if (!max || Number.isNaN(max)) return;

  const checkboxes = [...element.querySelectorAll('input[type="checkbox"]')];

  function updateState() {
    const checkedCount = checkboxes.filter((cb) => cb.checked).length;
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        cb.disabled = false;
      } else {
        cb.disabled = checkedCount >= max;
      }
    });
  }

  checkboxes.forEach((cb) => cb.addEventListener('change', updateState));
  updateState();
}

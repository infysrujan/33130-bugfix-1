const AMOUNT_FIELD_NAMES = ['TotalPurchaseAmount', 'TotalAllotment'];

/**
 * @param {HTMLElement | null} form
 * @returns {boolean}
 */
function isBondAllocationForm(form) {
  if (!form) return false;
  return form.querySelector('input[name="TotalPurchaseAmount"]') !== null;
}

function interceptAmountInput(input) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  Object.defineProperty(input, 'value', {
    set(v) {
      const stripped = typeof v === 'string' && /^0+\d/.test(v) ? String(parseInt(v, 10)) : v;
      proto.set.call(this, stripped);
    },
    get() {
      return proto.get.call(this);
    },
    configurable: true,
  });
}

/**
 * @param {HTMLFormElement} form
 */
export default function decorateBondAllocationForm(form) {
  if (!isBondAllocationForm(form)) return;
  document.body.classList.add('bond-allocation-form');
  AMOUNT_FIELD_NAMES.forEach((name) => {
    const input = form.querySelector(`input[name="${name}"]`);
    if (input) interceptAmountInput(input);
  });
}

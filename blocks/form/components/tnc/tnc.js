const textIntersectionClass = 'tnc__text-intersect';
const textDecorationClass = 'tnc-text-decoration';

/**
* Returns true when the scrollable element has been scrolled to (or very
* close to) its bottom edge. Returns false when the element has no rendered
* height (e.g. inside a hidden wizard panel) so the checkbox is never
* unlocked before the user can actually see and read the terms.
* @param {HTMLElement} el
* @returns {boolean}
*/
function isScrolledToBottom(el) {
  if (el.clientHeight === 0 || el.scrollHeight === 0) return false;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 8;
}

class TermsAndConditions {
  constructor(fieldDiv, fieldJson) {
    this.fieldDiv = fieldDiv;
    this.fieldJson = fieldJson;
    this.formModel = null;
    this.decorate();
  }

  setFormModel(model) {
    this.formModel = model;
  }

  getfieldDiv() {
    return this.fieldDiv;
  }

  decorate() {
    const textWrapper = this.fieldDiv.querySelector('.plain-text-wrapper');
    const helpText = this.fieldDiv.querySelector('.field-description');
    if (helpText) {
      this.fieldDiv.append(helpText);
    }
    if (!textWrapper) {
      // eslint-disable-next-line no-console
      console.debug('No plain-text found in TnC field. Assuming Link based rendition and Skipping decoration.');
      this.fieldDiv.classList.add('link');
      return;
    }
    textWrapper.classList.add(textDecorationClass);
    const intersection = document.createElement('div');
    intersection.classList.add(textIntersectionClass);
    textWrapper.appendChild(intersection);
    this.handleScroll();
  }

  handleScroll() {
    const textWrapper = this.fieldDiv.querySelector('.plain-text-wrapper');
    const checkbox = this.fieldDiv.querySelector('input[type="checkbox"]');
    if (!textWrapper || !checkbox) {
      // eslint-disable-next-line no-console
      console.debug('TnC: Missing textWrapper or checkbox element');
      return;
    }
    checkbox.setAttribute('disabled', 'true');
    const onScroll = () => {
      if (isScrolledToBottom(textWrapper)) {
        checkbox.removeAttribute('disabled');
        textWrapper.removeEventListener('scroll', onScroll);
      }
    };
    textWrapper.addEventListener('scroll', onScroll);
    const ro = new ResizeObserver(() => {
      if (textWrapper.clientHeight === 0) return;
      ro.disconnect();
      if (isScrolledToBottom(textWrapper)) {
        checkbox.removeAttribute('disabled');
        textWrapper.removeEventListener('scroll', onScroll);
      }
    });
    ro.observe(textWrapper);
  }
}

export default async function decorate(tncDiv, fieldJson) {
  const tnc = new TermsAndConditions(tncDiv, fieldJson);
  return tnc.getfieldDiv();
}

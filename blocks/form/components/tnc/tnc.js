const textIntersectionClass = 'tnc__text-intersect';
const textDecorationClass = 'tnc-text-decoration';

/**
 * Returns true when the scrollable element has been scrolled to (or very
 * close to) its bottom edge.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isScrolledToBottom(el) {
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
    if (!textWrapper) { // rendition does not have a plain-text-wrapper => link rendition of TnC
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

    // Disable checkbox initially
    checkbox.setAttribute('disabled', 'true');

    // Enable checkbox after user has scrolled to the bottom
    const onScroll = () => {
      if (isScrolledToBottom(textWrapper)) {
        checkbox.removeAttribute('disabled');
        textWrapper.removeEventListener('scroll', onScroll);
      }
    };

    textWrapper.addEventListener('scroll', onScroll);

    // If the content is short enough that no scrolling is needed, unlock immediately
    requestAnimationFrame(() => {
      if (isScrolledToBottom(textWrapper)) {
        checkbox.removeAttribute('disabled');
      }
    });
  }
}
export default async function decorate(tncDiv, fieldJson) {
  const tnc = new TermsAndConditions(tncDiv, fieldJson);
  return tnc.getfieldDiv();
}

/**
 * Applies the authored alignment class to a radio-group fieldset.
 * Reads the `align` property set via Universal Editor (Basic tab → Alignment)
 * and adds `align-left`, `align-center`, or `align-right` to the wrapper element.
 *
 * The `align` property is stored in the JCR and surfaced in fd via the AFB runtime
 * either as fd.properties['afs:layout'].align or fd.properties.align or fd.align.
 *
 * @param {HTMLElement} element - The rendered <fieldset> for the radio-group
 * @param {Object} fd - AEM Forms field definition
 */
export default function decorate(element, fd) {
  const alignValue = fd.properties?.['afs:layout']?.align
    || fd.properties?.align
    || fd.align;
  if (alignValue) {
    element.classList.add(`align-${alignValue}`);
  }
}

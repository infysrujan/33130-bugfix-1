const ICON_MARKER_RE = /#icon(\d*)(?:x(\d+))?(?:-(inline|block))?/i;
const DCW = '.default-content-wrapper';

function processIconMarkers(paragraphs) {
  paragraphs.forEach((markerP) => {
    const match = ICON_MARKER_RE.exec(markerP.textContent);
    if (!match) return;

    const [fullMatch, width, height] = match;
    const widthPx = `${parseInt(width, 10) || 40}px`;
    const heightPx = `${parseInt(height, 10) || parseInt(width, 10) || 40}px`;

    const prev = markerP.previousElementSibling;
    const next = markerP.nextElementSibling;
    const prevPic = prev?.tagName === 'P' ? prev.querySelector('picture.rte-inline-image') : null;
    const nextPic = next?.tagName === 'P' ? next.querySelector('picture.rte-inline-image') : null;
    const picture = (prevPic && !prevPic.style.width ? prevPic : null)
      ?? nextPic
      ?? prevPic
      ?? markerP.querySelector('picture.rte-inline-image');

    if (picture) {
      picture.style.width = widthPx;
      picture.style.height = heightPx;

      const segments = markerP.innerHTML.split(/<br\s*\/?>/i);
      const markerOnNewLine = segments.length > 1
        && ICON_MARKER_RE.test(segments[segments.length - 1]);
      const restText = markerP.textContent.replace(fullMatch, '').trim();

      if (restText && !markerOnNewLine) {
        markerP.innerHTML = markerP.innerHTML.replace(fullMatch, '').trimEnd();
        const picP = picture.closest('p');
        if (picP && picP !== markerP) {
          const wrapper = document.createElement('div');
          wrapper.className = 'has-inline-icon';
          markerP.parentNode.insertBefore(wrapper, markerP);
          wrapper.append(markerP, picP);
        }
      } else if (markerOnNewLine) {
        markerP.innerHTML = segments.slice(0, -1).join('<br>').trimEnd();
      } else if (markerP.contains(picture)) {
        markerP.innerHTML = markerP.innerHTML.replace(fullMatch, '').trimEnd();
      } else {
        markerP.remove();
      }
    }
  });
}

export function decorateIconInContainer(container) {
  container.querySelectorAll('p picture').forEach((pic) => pic.classList.add('rte-inline-image'));
  processIconMarkers([...container.querySelectorAll('p')]);
}

export function decorateRteInlineImages(main) {
  main.querySelectorAll(`${DCW} p, ${DCW} li, ${DCW} td`).forEach((el) => {
    if (!el.innerHTML.includes('&amp;nbsp;')) return;
    el.innerHTML = el.innerHTML.replace(/&amp;nbsp;/g, '&nbsp;');
  });

  main.querySelectorAll(`${DCW} p picture, ${DCW} li picture`)
    .forEach((pic) => pic.classList.add('rte-inline-image'));

  processIconMarkers([...main.querySelectorAll(`${DCW} p`)]);
}

/**
 * Finds [#x.x] markers anywhere in RTE text, replaces them with an invisible
 * anchor <span> and removes the marker from visible content.
 * Authors write [#1.2] in the doc → generates <span id="1_2"> at that position.
 * @param {Element} main
 */
function addHintPageAnchors(main) {
  // Matches [#1.2] with optional HTML tags wrapping the content inside brackets
  // e.g. [#1.2], [<u>#1.2</u>], [<strong>#1.2</strong>]
  const MARKER = /\[(?:<[^>]+>)*#([\w.]+)(?:<\/[^>]+>)*\]/g;

  main.querySelectorAll('td, p, h1, h2, h3, h4, h5, h6, li').forEach((el) => {
    if (!el.innerHTML.includes('[')) return;
    el.innerHTML = el.innerHTML.replace(MARKER, (_, id) => `<span id="${id.replace(/\./g, '_')}" class="rte-anchor" aria-hidden="true"></span>`);
  });
}

/**
 * Scrolls smoothly to the element with the given id.
 * @param {string} id
 * @param {Document} doc
 */
function scrollToHash(id, doc) {
  const target = id ? doc.getElementById(id) : null;
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Initialises RTE anchor support for the page:
 *  1. Replaces [#x.x] markers with named anchor spans.
 *  2. Scrolls to the hash on load and on every hashchange.
 * @param {Element} main
 * @param {Document} doc
 */
export default function initRteAnchors(main, doc) {
  addHintPageAnchors(main);

  const { hash } = window.location;
  if (hash) scrollToHash(hash.substring(1), doc);

  window.addEventListener('hashchange', () => {
    scrollToHash(window.location.hash.substring(1), doc);
  });
}

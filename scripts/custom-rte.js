const NEWTAB_RE = /#(newtab)/i;

function walkToPicture(startNode, forward = true) {
  let n = startNode;
  while (n && n.nodeName !== 'PICTURE') n = forward ? n.nextSibling : n.previousSibling;
  return n || null;
}

function adjacentPicture(p) {
  return p.nextElementSibling?.querySelector('picture')
    ?? p.previousElementSibling?.querySelector('picture')
    ?? null;
}

function setPicDimensions(pic, w, h) {
  pic.style.width = w;
  pic.style.height = h;
  const img = pic.querySelector('img');
  if (img) { img.style.width = w; img.style.height = h; }
}

function processInlineImageMarkers(paragraphs) {
  const INLINE_IMAGE_RE = /#inlineimage/i;
  paragraphs.forEach((markerP) => {
    if (!INLINE_IMAGE_RE.test(markerP.textContent)) return;

    markerP.classList.add('rte-inline-image');

    if (!markerP.querySelector('picture')) {
      const nextEl = markerP.nextElementSibling;
      const prevEl = markerP.previousElementSibling;
      if (nextEl?.querySelector('picture')) nextEl.classList.add('rte-inline-image');
      else if (prevEl?.querySelector('picture')) prevEl.classList.add('rte-inline-image');
    }

    const tw = document.createTreeWalker(markerP, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (INLINE_IMAGE_RE.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/#inlineimage\s*/gi, '');
    }

    if (!markerP.textContent.trim() && !markerP.querySelector('picture, img')) markerP.remove();
  });
}

function processIconMarkers(paragraphs) {
  const ICON_MARKER_RE = /#icon(\d*)(?:x(\d+))?(?:-(inline|block))?/i;
  paragraphs.forEach((markerP) => {
    if (!ICON_MARKER_RE.test(markerP.textContent)) return;
    let hasIcon = false;
    [...markerP.childNodes].forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const match = ICON_MARKER_RE.exec(node.nodeValue);
      if (!match) return;
      const [fullMatch, width, height] = match;
      const w = parseInt(width, 10) || 40;
      const widthPx = `${w}px`;
      const heightPx = `${parseInt(height, 10) || w}px`;

      let pic = walkToPicture(node.nextSibling);
      let textHandled = false;

      if (!pic) {
        const nextP = markerP.nextElementSibling?.tagName === 'P' ? markerP.nextElementSibling : null;
        const prevP = markerP.previousElementSibling?.tagName === 'P' ? markerP.previousElementSibling : null;
        const nextPic = nextP?.querySelector('picture');
        const prevPic = prevP?.querySelector('picture');
        let adjacentP = null;
        if (nextPic) {
          pic = nextPic;
          adjacentP = nextP;
        } else if (prevPic) {
          pic = prevPic;
          adjacentP = prevP;
        }

        if (adjacentP) {
          const beforeText = node.nodeValue.slice(0, match.index);
          const afterText = node.nodeValue.slice(match.index + fullMatch.length);
          node.nodeValue = beforeText;
          node.after(pic);
          if (afterText) pic.after(document.createTextNode(afterText));
          if (!adjacentP.textContent.trim() && !adjacentP.querySelector('a, img')) adjacentP.remove();
          textHandled = true;
        }
      }

      if (pic) {
        setPicDimensions(pic, widthPx, heightPx);
        if (!textHandled) node.nodeValue = node.nodeValue.replace(fullMatch, '');
        hasIcon = true;
      }
    });

    if (hasIcon) {
      if (!markerP.textContent.trim() && !markerP.querySelector('picture, a')) markerP.remove();
      else if (markerP.querySelector('picture')) markerP.classList.add('rte-has-icon');
    }
  });
}

function processImageLinks(paragraphs) {
  const IMAGE_LINK_RE = /#imagelink/i;
  paragraphs.forEach((markerP) => {
    if (!IMAGE_LINK_RE.test(markerP.textContent)) return;

    const markerNode = [...markerP.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && IMAGE_LINK_RE.test(n.nodeValue),
    );
    if (!markerNode) return;

    // Search after markerNode then before it — icon processing may have already moved the picture
    const pic = walkToPicture(markerNode.nextSibling)
      ?? walkToPicture(markerNode.previousSibling, false)
      ?? adjacentPicture(markerP);
    if (!pic) return;

    const picP = pic.closest('p');
    let anchor = markerP.querySelector('a');
    let linkP = null;

    if (!anchor) {
      const nextSib = picP?.nextElementSibling;
      if (nextSib && nextSib !== markerP && !IMAGE_LINK_RE.test(nextSib.textContent)) {
        anchor = nextSib.querySelector('a');
        if (anchor) linkP = nextSib;
      }
    }
    if (!anchor) {
      const prevSib = picP?.previousElementSibling;
      if (prevSib && prevSib !== markerP && !IMAGE_LINK_RE.test(prevSib.textContent)) {
        anchor = prevSib.querySelector('a');
        if (anchor) linkP = prevSib;
      }
    }
    if (!anchor) return;

    let openInNewTab = false;
    [...markerP.childNodes].forEach((n) => {
      if (n.nodeType !== Node.TEXT_NODE || !NEWTAB_RE.test(n.nodeValue)) return;
      n.nodeValue = n.nodeValue.replace(NEWTAB_RE, '').trimEnd();
      openInNewTab = true;
    });

    const link = anchor.cloneNode(false);
    link.removeAttribute('class');
    if (openInNewTab) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    pic.replaceWith(link);
    link.append(pic);

    markerNode.nodeValue = markerNode.nodeValue.replace(/#imagelink\s*/i, '');
    if (markerP.contains(anchor)) anchor.remove();
    linkP?.remove();

    if (!markerP.textContent.trim() && !markerP.querySelector('picture, img')) markerP.remove();
    else markerP.classList.add('rte-image-link');
  });
}

function runRteMarkers(paragraphs) {
  processInlineImageMarkers(paragraphs);
  processIconMarkers(paragraphs);
  processImageLinks(paragraphs);
  paragraphs.forEach((p) => {
    if (!p.isConnected) return;
    if (p.classList.contains('rte-inline-image') && !p.querySelector('picture, img')) {
      p.classList.remove('rte-inline-image');
      return;
    }
    if (!p.classList.contains('rte-inline-image') || !p.querySelector('picture') || !p.textContent.trim()) return;
    let next = p.nextElementSibling;
    while (next?.classList.contains('rte-inline-image') && !next.textContent.trim()) {
      const pic = next.querySelector('picture');
      if (!pic) break;
      p.append(pic.closest('a') ?? pic);
      const done = next;
      next = done.nextElementSibling;
      done.remove();
    }
  });
}

export function decorateEncodedNbsp(root, selector = 'p, li, td') {
  root.querySelectorAll(selector).forEach((el) => {
    if (!el.innerHTML.includes('&amp;nbsp;')) return;
    el.innerHTML = el.innerHTML.replace(/&amp;nbsp;/g, '&nbsp;');
  });
}

export function decorateIconInContainer(container) {
  decorateEncodedNbsp(container);
  runRteMarkers([...container.querySelectorAll('p')]);
}

export function decorateNewTabLinks(container) {
  container.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const prev = a.previousSibling;
    const next = a.nextSibling;
    const inHref = NEWTAB_RE.test(href);
    const inPrev = prev?.nodeType === Node.TEXT_NODE && NEWTAB_RE.test(prev.nodeValue);
    const inNext = next?.nodeType === Node.TEXT_NODE && NEWTAB_RE.test(next.nodeValue);
    if (!inHref && !inPrev && !inNext) return;
    if (inHref) a.setAttribute('href', href.replace(NEWTAB_RE, ''));
    if (inPrev) prev.nodeValue = prev.nodeValue.replace(NEWTAB_RE, '').trimEnd();
    if (inNext) next.nodeValue = next.nodeValue.replace(NEWTAB_RE, '').trimStart();
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
}

export function decorateRteInlineImages(main) {
  runRteMarkers([...main.querySelectorAll('.default-content-wrapper p')]);
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

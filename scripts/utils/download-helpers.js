import { decorateIconInContainer, decorateNewTabLinks } from '../custom-rte.js';

const RTE_MARKER_RE = /#(?:newtab|inlineimage|imagelink|icon)/i;

export default function createDownloadLink(anchor, doc = document) {
  if (!anchor) return null;
  const anchorEl = anchor.tagName === 'A' ? anchor : anchor.querySelector('a');
  if (!anchorEl) return null;

  const prev = anchorEl.previousSibling;
  const host = anchorEl.parentElement;
  if (host && prev?.nodeType === Node.TEXT_NODE && RTE_MARKER_RE.test(prev.nodeValue)) {
    decorateNewTabLinks(host);
    decorateIconInContainer(host);
  }

  const wrapper = doc.createElement('div');
  wrapper.className = 'download-button-wrapper content';

  const link = anchorEl.cloneNode(true);
  link.classList.remove('button-tertiary');
  link.classList.remove('button');
  link.classList.add('download-files', 'icon-download');

  wrapper.appendChild(link);
  return wrapper;
}

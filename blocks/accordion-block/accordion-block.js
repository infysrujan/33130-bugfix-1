import { readBlockConfig } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';

let placeholders = {};

/**
 * @param {string|string[]|undefined} raw
 * @returns {string}
 */
function firstHref(raw) {
  if (Array.isArray(raw)) return raw[0] || '';
  return typeof raw === 'string' ? raw : '';
}

/**
 * Path suitable for loadFragment (.plain.html fetch).
 * @param {string} path
 * @returns {string}
 */
function normalizeFragmentPath(path) {
  const t = path.trim();
  if (!t) return '';
  if (t.startsWith('http')) {
    try {
      return new URL(t).pathname;
    } catch {
      return '';
    }
  }
  return t.startsWith('/') ? t : `/${t}`;
}

/**
 * @param {unknown} raw
 * @returns {boolean}
 */
function parseBooleanField(raw) {
  if (raw === true) return true;
  if (raw === false) return false;
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'false' || s === 'no' || s === '0') return false;
  if (s === 'true' || s === 'yes' || s === '1') return true;
  return true;
}

/**
 * @param {Element | undefined} fragmentRow
 * @returns {string}
 */
function extractFragmentHrefFromRow(fragmentRow) {
  if (!fragmentRow) return '';
  const link = fragmentRow.querySelector('a');
  return link?.getAttribute('href') || link?.href || fragmentRow.textContent.trim();
}

/**
 * EDS / Crosswalk: one cell per row in model field order (see _accordion-block.json).
 * Classic Franklin: two columns label | value.
 * @param {Element} block
 */
function getAccordionBlockConfig(block) {
  const firstRow = block.querySelector(':scope > div');
  const isKeyValueRows = firstRow && firstRow.children.length >= 2;

  if (isKeyValueRows) {
    const c = readBlockConfig(block);
    return {
      showExpandAll: parseBooleanField(c['show-expand-all'] ?? c.showexpandall ?? true),
      showPrint: parseBooleanField(c['show-print'] ?? c.showprint ?? true),
      fragmentPath: normalizeFragmentPath(firstHref(c['fragment-path'] || c.fragmentpath)),
    };
  }

  const rows = [...block.querySelectorAll(':scope > div')];

  // Legacy single-column: title, description, showExpandAll, showPrint, fragmentPath
  if (rows.length >= 5) {
    const showExpandAll = parseBooleanField(rows[2]?.children[0]?.textContent);
    const showPrint = parseBooleanField(rows[3]?.children[0]?.textContent);
    const rawPath = extractFragmentHrefFromRow(rows[4]);
    return {
      showExpandAll,
      showPrint,
      fragmentPath: normalizeFragmentPath(rawPath),
    };
  }

  // Single-column field order: showExpandAll, showPrint, fragmentPath
  if (rows.length >= 3) {
    const showExpandAll = parseBooleanField(rows[0]?.children[0]?.textContent);
    const showPrint = parseBooleanField(rows[1]?.children[0]?.textContent);
    const rawPath = extractFragmentHrefFromRow(rows[2]);
    return {
      showExpandAll,
      showPrint,
      fragmentPath: normalizeFragmentPath(rawPath),
    };
  }

  if (rows.length === 2) {
    const rawPath = extractFragmentHrefFromRow(rows[1]);
    return {
      showExpandAll: true,
      showPrint: true,
      fragmentPath: normalizeFragmentPath(rawPath),
    };
  }

  if (rows.length === 1) {
    const rawPath = extractFragmentHrefFromRow(rows[0]);
    return {
      showExpandAll: true,
      showPrint: true,
      fragmentPath: normalizeFragmentPath(rawPath),
    };
  }

  return {
    showExpandAll: true,
    showPrint: true,
    fragmentPath: '',
  };
}

/**
 * First title under the section: Title block (Franklin `div.title.block`) or first heading.
 * @param {Element} section
 * @returns {Element|null}
 */
function findFirstTitleRoot(section) {
  const titleBlock = section.querySelector('.block.title, .title.block');
  if (titleBlock) return titleBlock;
  return section.querySelector('h1, h2, h3, h4, h5, h6');
}

/**
 * Moves all section children into a fragment, removes the title subtree,
 * returns { titleText, contentFrag }.
 * @param {Element} section
 */
function extractTitleAndBody(section) {
  const titleRoot = findFirstTitleRoot(section);
  const titleText = titleRoot?.textContent?.trim() || '';

  const contentFrag = document.createDocumentFragment();
  while (section.firstChild) {
    contentFrag.appendChild(section.firstChild);
  }
  if (titleRoot) {
    titleRoot.remove();
  }

  return { titleText, contentFrag };
}

function wireAccordionHeader(header, panel) {
  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    panel.hidden = expanded;
  });
}

function accordionIconUrl(filename) {
  const base = window.hlx?.codeBasePath || '';
  return `${base}/icons/${encodeURIComponent(filename)}`;
}

/**
 * @param {Element} block
 * @returns {boolean}
 */
function allAccordionPanelsExpanded(block) {
  const headers = [...block.querySelectorAll(':scope > .accordion-item .accordion-header')];
  if (!headers.length) return false;
  return headers.every((h) => h.getAttribute('aria-expanded') === 'true');
}

/**
 * @param {Element} block
 * @param {boolean} expand
 */
function setAllAccordionPanels(block, expand) {
  block.querySelectorAll(':scope > .accordion-item').forEach((item) => {
    const header = item.querySelector('.accordion-header');
    const panel = item.querySelector('.accordion-panel');
    if (!header || !panel) return;
    header.setAttribute('aria-expanded', expand ? 'true' : 'false');
    panel.hidden = !expand;
  });
}

/**
 * @param {HTMLButtonElement} expandBtn
 * @param {Element} block
 */
function syncExpandAllToolbarButton(expandBtn, block) {
  const expanded = allAccordionPanelsExpanded(block);
  const label = expandBtn.querySelector('.accordion-toolbar-label');
  const icon = expandBtn.querySelector('.accordion-toolbar-icon');
  if (label) {
    label.textContent = expanded ? placeholders.collapseAllLabel : placeholders.expandAllLabel;
  }
  expandBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  expandBtn.setAttribute(
    'aria-label',
    expanded ? placeholders.ariaLabelCollapseAll : placeholders.ariaLabelExpandAll,
  );
  if (icon) {
    icon.className = expanded ? 'accordion-toolbar-icon icon-close' : 'accordion-toolbar-icon icon-expand';
    icon.src = expanded
      ? accordionIconUrl('icon-close.svg')
      : accordionIconUrl('icon-expand.svg');
  }
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Snapshot panel open state, expand all, build HTML, restore.
 * @param {Element} block
 */
function buildAccordionPrintDocument(block) {
  const items = [...block.querySelectorAll(':scope > .accordion-item')];
  const states = items.map((item) => {
    const header = item.querySelector('.accordion-header');
    const panel = item.querySelector('.accordion-panel');
    return {
      expanded: header?.getAttribute('aria-expanded') === 'true',
      hidden: panel?.hidden ?? true,
    };
  });

  setAllAccordionPanels(block, true);

  const clone = block.cloneNode(true);
  clone.querySelectorAll('.accordion-block-toolbar').forEach((el) => el.remove());

  clone.querySelectorAll('.accordion-item').forEach((item) => {
    const headingWrap = item.querySelector('.accordion-heading');
    const btn = item.querySelector('.accordion-header');
    const titleText = btn?.querySelector('.accordion-header-title')?.textContent?.trim() || '';
    const panel = item.querySelector('.accordion-panel');
    headingWrap?.remove();
    const h3 = document.createElement('h3');
    h3.className = 'accordion-print-heading';
    h3.textContent = titleText;
    item.insertBefore(h3, item.firstChild);
    if (panel) {
      panel.hidden = false;
      panel.removeAttribute('hidden');
    }
  });

  const wrapper = block.closest('.accordion-block-wrapper');
  const container = wrapper?.parentElement?.classList.contains('accordion-block-container')
    ? wrapper.parentElement
    : null;
  const wrapperIsDirectChild = Boolean(
    container && [...container.children].includes(wrapper),
  );

  let bodyHtml;
  if (wrapperIsDirectChild) {
    const shell = document.createElement('div');
    [...container.children].forEach((child) => {
      if (child === wrapper) {
        shell.appendChild(clone);
      } else {
        shell.appendChild(child.cloneNode(true));
      }
    });
    bodyHtml = shell.innerHTML;
  } else {
    bodyHtml = clone.outerHTML;
  }

  items.forEach((item, i) => {
    const header = item.querySelector('.accordion-header');
    const panel = item.querySelector('.accordion-panel');
    const s = states[i];
    if (!header || !panel || !s) return;
    header.setAttribute('aria-expanded', s.expanded ? 'true' : 'false');
    panel.hidden = s.hidden;
  });

  const docTitle = block.querySelector('.accordion-block-title')?.textContent?.trim()
    || document.querySelector('title')?.textContent
    || placeholders.printLabel;

  const printCss = `
    body { font-family: system-ui, -apple-system, sans-serif; padding: 1.5rem; color: #111; }
    .accordion { border: 0; }
    .accordion-block-intro { padding: 0 0 1rem; }
    .accordion-block-title { font-size: 1.5rem; margin: 0 0 0.5rem; }
    .accordion-item { border-bottom: 1px solid #ddd; padding-bottom: 1rem; margin-bottom: 1rem; }
    .accordion-print-heading { font-size: 1.125rem; margin: 0 0 0.5rem; }
    .accordion-panel { display: block !important; padding: 0; }
    .accordion-header { display: none; }
    .accordion-heading { display: none; }
  `;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(docTitle)}</title><style>${printCss}</style></head><body>${bodyHtml}</body></html>`;
}

/**
 * @param {Element} block
 */
function openAccordionPrintWindow(block) {
  const html = buildAccordionPrintDocument(block);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  // Do not use noopener: many browsers return null from window.open, so the tab stays blank.
  const win = window.open(url, '_blank');
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }

  const revokeSoon = () => URL.revokeObjectURL(url);
  win.addEventListener('afterprint', revokeSoon, { once: true });
  setTimeout(revokeSoon, 120_000);

  const runPrint = () => {
    win.focus();
    win.print();
  };

  if (win.document.readyState === 'complete') {
    requestAnimationFrame(runPrint);
  } else {
    win.addEventListener('load', runPrint);
  }
}

/**
 * @param {Element} block
 * @param {string} baseId
 * @param {{ showExpandAll: boolean, showPrint: boolean }} options
 * @returns {{ expandBtn: HTMLButtonElement | null, printBtn: HTMLButtonElement | null }}
 */
function renderAccordionToolbar(block, baseId, { showExpandAll, showPrint }) {
  if (!showExpandAll && !showPrint) {
    return { expandBtn: null, printBtn: null };
  }

  const toolbar = document.createElement('div');
  toolbar.className = 'accordion-block-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', placeholders.ariaLabelToolbar);
  toolbar.id = `${baseId}-toolbar`;

  const inner = document.createElement('div');
  inner.className = 'accordion-block-toolbar-inner';

  let expandBtn = null;
  if (showExpandAll) {
    expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'accordion-toolbar-button accordion-toolbar-expand';
    expandBtn.id = `${baseId}-expand-all`;
    expandBtn.setAttribute('aria-pressed', 'false');
    expandBtn.setAttribute('aria-label', placeholders.ariaLabelExpandAll);

    const label = document.createElement('span');
    label.className = 'accordion-toolbar-label';
    label.textContent = placeholders.expandAllLabel;

    const icon = document.createElement('img');
    icon.className = 'accordion-toolbar-icon';
    icon.src = accordionIconUrl('icon-expand.svg');
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.width = 20;
    icon.height = 20;

    expandBtn.append(label, icon);
    inner.appendChild(expandBtn);
  }

  let printBtn = null;
  if (showPrint) {
    printBtn = document.createElement('button');
    printBtn.type = 'button';
    printBtn.className = 'accordion-toolbar-button accordion-toolbar-print';
    printBtn.id = `${baseId}-print`;
    printBtn.setAttribute('aria-label', placeholders.ariaLabelPrint);

    const label = document.createElement('span');
    label.className = 'accordion-toolbar-label';
    label.textContent = placeholders.printLabel;

    const icon = document.createElement('span');
    icon.className = 'accordion-toolbar-icon icon-print';
    // icon.src = accordionIconUrl('Print.sv');
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    icon.width = 20;
    icon.height = 20;

    printBtn.append(label, icon);
    inner.appendChild(printBtn);
  }

  toolbar.appendChild(inner);
  block.appendChild(toolbar);

  return { expandBtn, printBtn };
}

/**
 * @param {Element} block
 * @param {{ expandBtn: HTMLButtonElement | null, printBtn: HTMLButtonElement | null }} buttons
 */
function wireAccordionToolbar(block, { expandBtn, printBtn }) {
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      if (allAccordionPanelsExpanded(block)) {
        setAllAccordionPanels(block, false);
      } else {
        setAllAccordionPanels(block, true);
      }
      syncExpandAllToolbarButton(expandBtn, block);
    });

    block.addEventListener('click', (e) => {
      if (!e.target.closest('.accordion-header')) return;
      queueMicrotask(() => syncExpandAllToolbarButton(expandBtn, block));
    });

    syncExpandAllToolbarButton(expandBtn, block);
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      openAccordionPrintWindow(block);
    });
  }
}

/**
 * WAI-ARIA APG accordion: Arrow/Home/End move focus between header buttons.
 * @param {Element} block
 */
function wireAccordionGroupNavigation(block) {
  const headers = [...block.querySelectorAll(':scope > .accordion-item > .accordion-heading .accordion-header')];
  if (headers.length < 2) return;

  headers.forEach((header, i) => {
    header.addEventListener('keydown', (e) => {
      let next = i;
      if (e.key === 'ArrowDown') {
        next = (i + 1) % headers.length;
      } else if (e.key === 'ArrowUp') {
        next = (i - 1 + headers.length) % headers.length;
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = headers.length - 1;
      } else {
        return;
      }
      e.preventDefault();
      headers[next].focus();
    });
  });
}

/**
 * @param {string} baseId
 * @param {number} itemIndex
 * @param {string} titleText
 * @param {string} fallbackTitle
 * @returns {{
 *   item: HTMLDivElement,
 *   header: HTMLButtonElement,
 *   panel: HTMLDivElement,
 *   label: HTMLSpanElement,
 * }}
 */
function createAccordionItemElements(baseId, itemIndex, titleText, fallbackTitle) {
  const panelId = `${baseId}-panel-${itemIndex}`;
  const trimmed = titleText != null ? String(titleText).trim() : '';
  const labelText = trimmed || fallbackTitle;

  const item = document.createElement('div');
  item.classList.add('accordion-item');

  const heading = document.createElement('div');
  heading.classList.add('accordion-heading');

  const header = document.createElement('button');
  header.type = 'button';
  header.classList.add('accordion-header');
  header.id = `${panelId}-toggle`;
  header.setAttribute('aria-expanded', 'false');
  header.setAttribute('aria-controls', panelId);

  const label = document.createElement('span');
  label.classList.add('accordion-header-title');
  label.textContent = labelText;
  header.appendChild(label);

  heading.appendChild(header);

  const panel = document.createElement('div');
  panel.id = panelId;
  panel.classList.add('accordion-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', header.id);

  item.appendChild(heading);
  item.appendChild(panel);

  return {
    item,
    header,
    panel,
    label,
  };
}

/* Group the download-file-wrapper nodes after each default-content-wrapper heading */
/**
 * @param {Node} node
 * @returns {boolean}
 */
function isDefaultContentHeaderWrapper(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && /** @type {Element} */ (node).classList.contains('default-content-wrapper')
    && /** @type {Element} */ (node).querySelector('h1, h2, h3, h4, h5, h6') !== null;
}

/* Check if the node is a download-file-wrapper */
/**
 * @param {Node} node
 * @returns {boolean}
 */
function isDownloadFileWrapper(node) {
  return node.nodeType === Node.ELEMENT_NODE
    && /** @type {Element} */ (node).classList.contains('download-file-wrapper');
}

/**
 * Wraps each default-content-wrapper heading and its consecutive download-file-wrapper
 * siblings in a download-section container (heading first).
 * @param {DocumentFragment} contentFrag
 */
function groupDownloadSections(contentFrag) {
  const nodes = [...contentFrag.childNodes];
  while (contentFrag.firstChild) {
    contentFrag.removeChild(contentFrag.firstChild);
  }

  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    if (isDefaultContentHeaderWrapper(node)) {
      const section = document.createElement('div');
      section.classList.add('download-section');
      section.appendChild(node);
      i += 1;

      while (i < nodes.length && isDownloadFileWrapper(nodes[i])) {
        section.appendChild(nodes[i]);
        i += 1;
      }

      contentFrag.appendChild(section);
    }

    contentFrag.appendChild(node);
    i += 1;
  }
}

/**
 * @param {Element} block
 * @param {string} baseId
 * @param {string} itemTitle
 * @param {DocumentFragment} contentFrag
 * @param {number} index
 */
function appendAccordionItem(block, baseId, itemTitle, contentFrag, index) {
  const { item, header, panel } = createAccordionItemElements(
    baseId,
    index,
    itemTitle,
    `Item ${index + 1}`,
  );
  groupDownloadSections(contentFrag);
  panel.appendChild(contentFrag);
  block.appendChild(item);
  wireAccordionHeader(header, panel);
}

/**
 * @param {Element} block
 * @param {{
 *   expandBtn: HTMLButtonElement | null,
 *   printBtn: HTMLButtonElement | null,
 * }} toolbarButtons
 */
function wireAccordionToolbarAndNavigation(block, toolbarButtons) {
  if (toolbarButtons.expandBtn || toolbarButtons.printBtn) {
    wireAccordionToolbar(block, toolbarButtons);
  }
  wireAccordionGroupNavigation(block);
}

/**
 * Accordion block: optional fragmentPath loads a page whose top-level sections
 * each become one item.
 * @param {Element} block
 */
export default async function decorate(block) {
  const config = getAccordionBlockConfig(block);
  const { fragmentPath, showExpandAll, showPrint } = config;

  const placeholder = await fetchPlaceholders();
  if (!placeholder || Object.keys(placeholder).length === 0) return;

  // Populate module-level placeholders with fallbacks
  placeholders = {
    collapseAllLabel: placeholder.accordionCollapseAll,
    expandAllLabel: placeholder.accordionExpandAll,
    printLabel: placeholder.accordionPrint,
    ariaLabelExpandAll: placeholder.accordionAriaLabelExpandAll,
    ariaLabelCollapseAll: placeholder.accordionAriaLabelCollapseAll,
    ariaLabelToolbar: placeholder.accordionAriaLabelToolbar,
    ariaLabelPrint: placeholder.accordionAriaLabelPrint,
    fragmentErrorText: placeholder.accordionFragmentErrorText,
    accordionPlaceholder: placeholder.accordionPlaceholder,
  };

  block.textContent = '';
  block.classList.add('accordion');

  const baseId = block.id || `accordion-${crypto.randomUUID().slice(0, 8)}`;

  const toolbarButtons = renderAccordionToolbar(block, baseId, {
    showExpandAll,
    showPrint,
  });

  if (!fragmentPath) {
    const { item, header, panel } = createAccordionItemElements(
      baseId,
      0,
      placeholders.accordionPlaceholder,
      placeholders.accordionPlaceholder,
    );
    block.appendChild(item);
    wireAccordionHeader(header, panel);
    wireAccordionToolbarAndNavigation(block, toolbarButtons);
    return;
  }

  block.setAttribute('aria-busy', 'true');
  block.classList.add('accordion-panel-loading');
  let fragment;
  try {
    fragment = await loadFragment(fragmentPath);
  } finally {
    block.removeAttribute('aria-busy');
    block.classList.remove('accordion-panel-loading');
  }

  if (!fragment) {
    block.querySelector('.accordion-block-toolbar')?.remove();
    const status = document.createElement('p');
    status.className = 'accordion-load-error';
    status.setAttribute('role', 'status');
    status.textContent = placeholders.fragmentErrorText;
    block.appendChild(status);
    return;
  }

  const sections = [...fragment.querySelectorAll(':scope > .section')];

  if (sections.length > 0) {
    sections.forEach((section, index) => {
      const { titleText, contentFrag } = extractTitleAndBody(section);
      appendAccordionItem(block, baseId, titleText, contentFrag, index);
    });
    block.classList.add('accordion-panel-loaded');
    wireAccordionToolbarAndNavigation(block, toolbarButtons);
    return;
  }

  const {
    item,
    header,
    panel,
    label,
  } = createAccordionItemElements(
    baseId,
    0,
    placeholders.accordionPlaceholder,
    placeholders.accordionPlaceholder,
  );
  block.appendChild(item);
  wireAccordionHeader(header, panel);

  const fragmentSection = fragment.querySelector(':scope .section');
  if (fragmentSection) {
    panel.append(...fragmentSection.childNodes);
  } else {
    const { titleText, contentFrag } = extractTitleAndBody(fragment);
    if (titleText) {
      label.textContent = titleText;
    }
    panel.appendChild(contentFrag);
  }
  block.classList.add('accordion-panel-loaded');
  wireAccordionToolbarAndNavigation(block, toolbarButtons);
}

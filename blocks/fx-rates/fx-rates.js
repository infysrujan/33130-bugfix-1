import { fetchConfigs } from '../../scripts/config.js';
import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { loadFragment } from '../fragment/fragment.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseBooleanField(raw) {
  if (raw === true) return true;
  if (raw === false) return false;
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'false' || s === 'no' || s === '0') return false;
  return true;
}

function normalizeFragmentPath(path) {
  const t = String(path ?? '').trim();
  if (!t) return '';
  if (t.startsWith('http')) {
    try { return new URL(t).pathname; } catch { return ''; }
  }
  return t.startsWith('/') ? t : `/${t}`;
}

// ── Authoring parser ───────────────────────────────────────────────────────

function parseAuthoring(block) {
  const rows = [...block.querySelectorAll(':scope > div')];
  const get = (index) => rows[index]?.children?.[1]?.textContent?.trim()
    ?? rows[index]?.children?.[0]?.textContent?.trim() ?? '';

  // Support both key-value layout (2 cols) and single-column layout
  const isKeyValue = rows[0] && rows[0].children.length >= 2;

  if (isKeyValue) {
    const data = {};
    rows.forEach((row) => {
      const key = row.children[0]?.textContent?.trim()
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const val = row.children[1]?.textContent?.trim()
        ?? row.children[0]?.textContent?.trim();
      if (key) data[key] = val;
    });

    const fragmentLink = rows.find((r) => {
      const text = r.children[0]?.textContent?.trim().toLowerCase();
      return text === 'accordionfragmentpath' || text === 'accordion-fragment-path' || text === 'accordion fragment path';
    });
    const fragmentHref = fragmentLink?.querySelector('a')?.href
      ?? fragmentLink?.children[1]?.querySelector('a')?.href
      ?? '';

    return {
      currencyColumnLabel: data.currencyColumnLabel || 'สกุลเงิน',
      rateColumnLabel: data.rateColumnLabel || 'อัตราแลกเปลี่ยน',
      updateTimeLabel: data.updateTimeLabel || 'อัพเดท ณ วันที่',
      remarkText: data.remarkText || '[หน่วย : เงินบาทต่อ 1 หน่วยเงินตราต่างประเทศ]',
      accordionFragmentPath: normalizeFragmentPath(fragmentHref),
      showExpandAll: parseBooleanField(data.showExpandAll ?? true),
      showPrint: parseBooleanField(data.showPrint ?? true),
    };
  }

  // Single-column fallback
  const fragmentHref = rows[4]?.querySelector('a')?.href ?? '';
  return {
    currencyColumnLabel: get(0) || 'สกุลเงิน',
    rateColumnLabel: get(1) || 'อัตราแลกเปลี่ยน',
    updateTimeLabel: get(2) || 'อัพเดท ณ วันที่',
    remarkText: get(3) || '[หน่วย : เงินบาทต่อ 1 หน่วยเงินตราต่างประเทศ]',
    accordionFragmentPath: normalizeFragmentPath(fragmentHref),
    showExpandAll: parseBooleanField(get(5) ?? true),
    showPrint: parseBooleanField(get(6) ?? true),
  };
}

// ── API ────────────────────────────────────────────────────────────────────

async function fetchLatestFxRates(endpoint) {
  if (!endpoint) return [];
  try {
    const resp = await fetch(endpoint);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  } catch {
    return [];
  }
}

function normalizeRates(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    family: String(item.Family ?? item.family ?? '').trim(),
    description: String(item.Description ?? item.description ?? '').trim(),
    sellingRates: String(item.SellingRates ?? item.sellingRates ?? item.Rate ?? item.rate ?? '-').trim(),
    updateTime: String(item.UpdateTime ?? item.updateTime ?? item.Time ?? item.time ?? '').trim(),
    updateDate: String(item.Ddate ?? item.ddate ?? item.Date ?? item.date ?? '').trim(),
  }));
}

// ── Date formatting ────────────────────────────────────────────────────────

function formatThaiDate(dateStr, timeStr, buddhistYearOffset, updateTimeLabel) {
  if (!dateStr && !timeStr) return '';

  let display = '';

  if (dateStr) {
    // Try to parse common API date formats: YYYY-MM-DD or DD/MM/YYYY or YYYYMMDD
    let d;
    const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const slash = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const compact = dateStr.match(/^(\d{4})(\d{2})(\d{2})/);

    if (iso) {
      const [, y, m, day] = iso;
      d = { day: parseInt(day, 10), month: parseInt(m, 10), year: parseInt(y, 10) };
    } else if (slash) {
      const [, day, m, y] = slash;
      d = { day: parseInt(day, 10), month: parseInt(m, 10), year: parseInt(y, 10) };
    } else if (compact) {
      const [, y, m, day] = compact;
      d = { day: parseInt(day, 10), month: parseInt(m, 10), year: parseInt(y, 10) };
    }

    if (d) {
      const buddhistYear = d.year + buddhistYearOffset;
      display = `${updateTimeLabel} ${d.day}/${d.month}/${buddhistYear}`;
    } else {
      display = `${updateTimeLabel} ${dateStr}`;
    }
  }

  if (timeStr) {
    const timePart = timeStr.includes(':') ? timeStr.substring(0, 5) : timeStr;
    display += ` เวลา ${timePart}`;
  }

  return display.trim();
}

// ── Table renderer ─────────────────────────────────────────────────────────

function renderTable(rates, authoring) {
  if (!rates.length) {
    return `<div class="fx-rates-empty">-</div>`;
  }

  const rows = rates.map((rate) => {
    const flagSrc = `/icons/${escapeHtml(rate.family)}.svg`;
    return `<tr>
      <td class="fx-rates-currency-cell">
        <img src="${flagSrc}" alt="${escapeHtml(rate.family)}" loading="lazy" class="fx-rates-flag" onerror="this.style.display='none'">
        <span>${escapeHtml(rate.description || rate.family)}</span>
      </td>
      <td class="fx-rates-rate-cell">${escapeHtml(rate.sellingRates)}</td>
    </tr>`;
  }).join('');

  return `<div class="fx-rates-table-wrap">
    <table class="fx-rates-table">
      <thead>
        <tr>
          <th class="fx-rates-col-currency">${escapeHtml(authoring.currencyColumnLabel)}</th>
          <th class="fx-rates-col-rate">${escapeHtml(authoring.rateColumnLabel)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// ── Accordion helpers ──────────────────────────────────────────────────────

function accordionIconUrl(filename) {
  const base = window.hlx?.codeBasePath || '';
  return `${base}/icons/${encodeURIComponent(filename)}`;
}

function allPanelsExpanded(block) {
  const headers = [...block.querySelectorAll('.fx-rates-accordion-header')];
  return headers.length > 0 && headers.every((h) => h.getAttribute('aria-expanded') === 'true');
}

function setAllPanels(block, expand) {
  block.querySelectorAll('.fx-rates-accordion-item').forEach((item) => {
    const header = item.querySelector('.fx-rates-accordion-header');
    const panel = item.querySelector('.fx-rates-accordion-panel');
    if (!header || !panel) return;
    header.setAttribute('aria-expanded', expand ? 'true' : 'false');
    panel.hidden = !expand;
  });
}

function syncExpandBtn(expandBtn, block, placeholders) {
  if (!expandBtn) return;
  const expanded = allPanelsExpanded(block);
  const label = expandBtn.querySelector('.fx-rates-toolbar-label');
  const icon = expandBtn.querySelector('.fx-rates-toolbar-icon');
  if (label) {
    label.textContent = expanded
      ? (placeholders.accordionCollapseAll || 'ยุบทั้งหมด')
      : (placeholders.accordionExpandAll || 'ขยายทั้งหมด');
  }
  expandBtn.setAttribute('aria-pressed', expanded ? 'true' : 'false');
  if (icon) {
    icon.src = expanded ? accordionIconUrl('icon-close.svg') : accordionIconUrl('icon-expand.svg');
  }
}

function wireAccordionHeader(header, panel) {
  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    panel.hidden = expanded;
  });
}

function buildAccordionPrintDoc(accordionEl) {
  const items = [...accordionEl.querySelectorAll('.fx-rates-accordion-item')];
  const states = items.map((item) => ({
    expanded: item.querySelector('.fx-rates-accordion-header')?.getAttribute('aria-expanded') === 'true',
  }));

  setAllPanels(accordionEl, true);
  const clone = accordionEl.cloneNode(true);
  clone.querySelectorAll('.fx-rates-accordion-toolbar').forEach((el) => el.remove());
  clone.querySelectorAll('.fx-rates-accordion-item').forEach((item) => {
    const btn = item.querySelector('.fx-rates-accordion-header');
    const titleText = btn?.querySelector('.fx-rates-accordion-header-title')?.textContent?.trim() || '';
    const panel = item.querySelector('.fx-rates-accordion-panel');
    item.querySelector('.fx-rates-accordion-heading')?.remove();
    const h3 = document.createElement('h3');
    h3.textContent = titleText;
    item.insertBefore(h3, item.firstChild);
    if (panel) { panel.hidden = false; panel.removeAttribute('hidden'); }
  });

  items.forEach((item, i) => {
    const header = item.querySelector('.fx-rates-accordion-header');
    const panel = item.querySelector('.fx-rates-accordion-panel');
    if (header) header.setAttribute('aria-expanded', states[i]?.expanded ? 'true' : 'false');
    if (panel) panel.hidden = !states[i]?.expanded;
  });

  const css = `body{font-family:system-ui,sans-serif;padding:1.5rem;color:#111}.fx-rates-accordion-item{border-bottom:1px solid #ddd;padding-bottom:1rem;margin-bottom:1rem}.fx-rates-accordion-panel{display:block!important}.fx-rates-accordion-header{display:none}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${clone.outerHTML}</body></html>`;
}

function openPrintWindow(accordionEl) {
  const html = buildAccordionPrintDoc(accordionEl);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) { URL.revokeObjectURL(url); return; }
  const revoke = () => URL.revokeObjectURL(url);
  win.addEventListener('afterprint', revoke, { once: true });
  setTimeout(revoke, 120000);
  const print = () => { win.focus(); win.print(); };
  if (win.document.readyState === 'complete') { requestAnimationFrame(print); } else { win.addEventListener('load', print); }
}

// ── Fragment title / body extractor ───────────────────────────────────────

function extractTitleAndBody(section) {
  const titleEl = section.querySelector('h1,h2,h3,h4,h5,h6')
    || section.querySelector('.block.title,.title.block');
  const titleText = titleEl?.textContent?.trim() || '';
  const frag = document.createDocumentFragment();
  while (section.firstChild) frag.appendChild(section.firstChild);
  titleEl?.remove();
  return { titleText, contentFrag: frag };
}

// ── Accordion builder ──────────────────────────────────────────────────────

function buildAccordionSection(container, fragment, authoring, placeholders, baseId) {
  const accordionEl = document.createElement('div');
  accordionEl.className = 'fx-rates-accordion';

  // Toolbar
  if (authoring.showExpandAll || authoring.showPrint) {
    const toolbar = document.createElement('div');
    toolbar.className = 'fx-rates-accordion-toolbar';

    let expandBtn = null;
    if (authoring.showExpandAll) {
      expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'fx-rates-toolbar-btn fx-rates-toolbar-expand';
      expandBtn.setAttribute('aria-pressed', 'false');

      const lbl = document.createElement('span');
      lbl.className = 'fx-rates-toolbar-label';
      lbl.textContent = placeholders.accordionExpandAll || 'ขยายทั้งหมด';

      const ico = document.createElement('img');
      ico.className = 'fx-rates-toolbar-icon';
      ico.src = accordionIconUrl('icon-expand.svg');
      ico.alt = '';
      ico.setAttribute('aria-hidden', 'true');
      ico.width = 20;
      ico.height = 20;

      expandBtn.append(lbl, ico);
      toolbar.appendChild(expandBtn);
    }

    let printBtn = null;
    if (authoring.showPrint) {
      printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'fx-rates-toolbar-btn fx-rates-toolbar-print';

      const lbl = document.createElement('span');
      lbl.className = 'fx-rates-toolbar-label';
      lbl.textContent = placeholders.accordionPrint || 'พิมพ์';

      const ico = document.createElement('span');
      ico.className = 'fx-rates-toolbar-icon icon-print';
      ico.setAttribute('aria-hidden', 'true');

      printBtn.append(lbl, ico);
      toolbar.appendChild(printBtn);
    }

    accordionEl.appendChild(toolbar);

    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        if (allPanelsExpanded(accordionEl)) {
          setAllPanels(accordionEl, false);
        } else {
          setAllPanels(accordionEl, true);
        }
        syncExpandBtn(expandBtn, accordionEl, placeholders);
      });

      accordionEl.addEventListener('click', (e) => {
        if (!e.target.closest('.fx-rates-accordion-header')) return;
        queueMicrotask(() => syncExpandBtn(expandBtn, accordionEl, placeholders));
      });
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => openPrintWindow(accordionEl));
    }
  }

  // Items from fragment sections
  const sections = [...(fragment?.querySelectorAll(':scope > .section') ?? [])];

  if (sections.length > 0) {
    sections.forEach((section, index) => {
      const { titleText, contentFrag } = extractTitleAndBody(section);
      const panelId = `${baseId}-panel-${index}`;

      const item = document.createElement('div');
      item.className = 'fx-rates-accordion-item';

      const heading = document.createElement('div');
      heading.className = 'fx-rates-accordion-heading';

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'fx-rates-accordion-header';
      header.id = `${panelId}-toggle`;
      header.setAttribute('aria-expanded', 'false');
      header.setAttribute('aria-controls', panelId);

      const titleSpan = document.createElement('span');
      titleSpan.className = 'fx-rates-accordion-header-title';
      titleSpan.textContent = titleText || `Item ${index + 1}`;
      header.appendChild(titleSpan);
      heading.appendChild(header);

      const panel = document.createElement('div');
      panel.id = panelId;
      panel.className = 'fx-rates-accordion-panel';
      panel.hidden = true;
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', header.id);
      panel.appendChild(contentFrag);

      item.appendChild(heading);
      item.appendChild(panel);
      wireAccordionHeader(header, panel);
      accordionEl.appendChild(item);
    });
  } else if (fragment) {
    // No sections — treat entire fragment as single panel
    const panelId = `${baseId}-panel-0`;
    const item = document.createElement('div');
    item.className = 'fx-rates-accordion-item';

    const heading = document.createElement('div');
    heading.className = 'fx-rates-accordion-heading';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'fx-rates-accordion-header';
    header.id = `${panelId}-toggle`;
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', panelId);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'fx-rates-accordion-header-title';
    const fragSection = fragment.querySelector(':scope .section');
    const titleEl = fragSection?.querySelector('h1,h2,h3,h4,h5,h6');
    titleSpan.textContent = titleEl?.textContent?.trim() || '';
    titleEl?.remove();
    header.appendChild(titleSpan);
    heading.appendChild(header);

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'fx-rates-accordion-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', header.id);

    if (fragSection) {
      panel.append(...fragSection.childNodes);
    } else {
      const frag2 = document.createDocumentFragment();
      while (fragment.firstChild) frag2.appendChild(fragment.firstChild);
      panel.appendChild(frag2);
    }

    item.appendChild(heading);
    item.appendChild(panel);
    wireAccordionHeader(header, panel);
    accordionEl.appendChild(item);
  }

  container.appendChild(accordionEl);
}

// ── Main decorate ──────────────────────────────────────────────────────────

export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const [configs, placeholders] = await Promise.all([fetchConfigs(), fetchPlaceholders()]);

  const buddhistYearOffset = Number(configs?.buddhistYearOffset) || 0;
  const apiEndpoint = configs?.exchangeRateServiceGetLatestRates || '';

  // Clear block authoring content
  block.textContent = '';

  const baseId = block.id || `fx-rates-${crypto.randomUUID().slice(0, 8)}`;

  // ── Loading state ───────────────────────────────────────────────────────
  block.setAttribute('aria-busy', 'true');

  // ── Fetch rates ─────────────────────────────────────────────────────────
  let rawData = [];
  try {
    rawData = await fetchLatestFxRates(apiEndpoint);
  } catch {
    rawData = [];
  }

  const rates = normalizeRates(rawData);

  // ── Derive update date/time from first record ────────────────────────────
  const firstRecord = Array.isArray(rawData) ? rawData[0] : null;
  const updateDate = firstRecord
    ? String(firstRecord.Ddate ?? firstRecord.ddate ?? firstRecord.Date ?? '').trim()
    : '';
  const updateTime = firstRecord
    ? String(firstRecord.Time ?? firstRecord.time ?? firstRecord.UpdateTime ?? '').trim()
    : '';

  // ── Build wrapper ────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'fx-rates-wrapper';

  // 1. Table
  wrapper.insertAdjacentHTML('beforeend', renderTable(rates, authoring));

  // 2. Update time eyebrow
  const timeText = formatThaiDate(updateDate, updateTime, buddhistYearOffset, authoring.updateTimeLabel);
  if (timeText) {
    const timeEl = document.createElement('p');
    timeEl.className = 'fx-rates-update-time';
    timeEl.textContent = timeText;
    wrapper.appendChild(timeEl);
  }

  // 3. Remark eyebrow
  if (authoring.remarkText) {
    const remarkEl = document.createElement('p');
    remarkEl.className = 'fx-rates-remark';
    remarkEl.textContent = authoring.remarkText;
    wrapper.appendChild(remarkEl);
  }

  block.appendChild(wrapper);
  block.removeAttribute('aria-busy');

  // 4. Accordion (lazy-loaded from fragment)
  if (authoring.accordionFragmentPath) {
    try {
      const fragment = await loadFragment(authoring.accordionFragmentPath);
      if (fragment) {
        buildAccordionSection(block, fragment, authoring, placeholders, baseId);
      }
    } catch {
      // silently skip accordion if fragment fails
    }
  }
}

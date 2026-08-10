import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { getLang } from '../../scripts/scripts.js';
import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';
import { MONTHS_EN, MONTHS_TH, BE_OFFSET } from '../../scripts/utils/datelang.js';
import {
  getMonthKey,
  parseApiDate,
  parseIsoDate,
} from './helpers/date-helpers.js';
import {
  createApiEndpoints,
  getEnabledDays,
  getLatestRates,
  getRates,
  getUpdatesInDay,
  normalizeRates,
  trimValue,
} from './helpers/api-helpers.js';
import parseAuthoring from './helpers/authoring-helpers.js';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isNextMonthDisabled(titleText, rawLang) {
  const text = String(titleText || '').trim();
  const lastSpace = text.lastIndexOf(' ');
  if (lastSpace < 0) return false;

  const lang = String(rawLang || '').toLowerCase().trim().startsWith('th') ? 'th' : 'en';
  const monthName = text.slice(0, lastSpace);
  const yearRaw = text.slice(lastSpace + 1);
  const months = lang === 'th' ? MONTHS_TH : MONTHS_EN;
  const monthIndex = months.indexOf(monthName);
  let year = Number.parseInt(yearRaw, 10);
  if (lang === 'th') year -= BE_OFFSET;
  if (monthIndex < 0 || Number.isNaN(year)) return false;

  const now = new Date();
  return year > now.getFullYear()
    || (year === now.getFullYear() && monthIndex >= now.getMonth());
}

function isValidSelectedDay(state) {
  const parsed = parseIsoDate(state.selectedDate);
  if (!parsed) return false;
  const selectedMonthKey = getMonthKey(parsed.year, parsed.month);
  const enabledDays = state.enabledDaysByMonth[selectedMonthKey] || [];
  if (!enabledDays.length) return true;
  return enabledDays.includes(parsed.day);
}

function renderBlock(block, state, authoring) {
  const selectedUpdateObj = state.updates.find(
    (item) => trimValue(item.Update) === state.selectedUpdate,
  );
  const selectedLabel = selectedUpdateObj
    ? `${trimValue(selectedUpdateObj.Update)}: ${trimValue(selectedUpdateObj.Time)}`
    : (state.selectedUpdate || '');

  const timeItems = state.updates.map((item) => {
    const update = trimValue(item.Update);
    const time = trimValue(item.Time);
    const label = `${update}: ${time}`;
    const isActive = update === state.selectedUpdate;
    return `<li class="forex-rates-time-item${isActive ? ' is-active' : ''}" role="option" aria-selected="${isActive}" data-value="${escapeHtml(update)}">${escapeHtml(label)}</li>`;
  }).join('');

  const timeDropdownOpen = state.timeDropdownOpen ? ' is-open' : '';
  const timeDisabled = !state.updates.length ? ' is-disabled' : '';

  const rows = state.rates.map((rate) => `<tr>
    <td class="forex-rates-currency">
      <img src="/icons/${escapeHtml(rate.family)}.svg" alt="${escapeHtml(rate.family)} flag" loading="lazy" class="forex-rates-flag">
      <span>${escapeHtml(rate.family)}</span>
    </td>
    <td>${escapeHtml(rate.description)}</td>
    <td class="is-right">${escapeHtml(rate.buyingRates)}</td>
    <td class="is-right">${escapeHtml(rate.sellingRates)}</td>
    <td class="is-right">${escapeHtml(rate.sightBill)}</td>
    <td class="is-right">${escapeHtml(rate.tt)}</td>
    <td class="is-right">${escapeHtml(rate.billDdTt)}</td>
  </tr>`).join('');

  const columnWidths = ['10%', '11%', '12%', '12%', '19%', '19%', '19%'];
  const headings = authoring.columns.map((heading, i) => `<th width="${columnWidths[i] || 'auto'}">${heading}</th>`).join('');

  block.innerHTML = `<section class="forex-rates-content">
    <div class="forex-rates-controls">
      <div class="forex-rates-control-row">
        <span class="forex-rates-calendar-label">${escapeHtml(authoring.calendarLabel)}</span>
        <div class="forex-rates-date-group">
          <input id="forex-rates-date-text-input" class="forex-rates-date-text-input" type="text" inputmode="text" placeholder="DD MMM YYYY" aria-label="${escapeHtml(authoring.calendarLabel)} date">
          <button type="button" class="forex-rates-date-trigger icon-calendar" title="${escapeHtml(authoring.openCalendarLabel)}" aria-label="${escapeHtml(authoring.openCalendarLabel)}"></button>
        </div>
        <div class="forex-rates-time-wrap">
          <div class="forex-rates-time-dropdown${timeDropdownOpen}${timeDisabled}" role="combobox" aria-expanded="${state.timeDropdownOpen}" aria-haspopup="listbox">
            <button type="button" class="forex-rates-time-trigger" aria-label="Select time" ${state.updates.length ? '' : 'disabled'}>
              <span class="forex-rates-time-label">${escapeHtml(selectedLabel)}</span>
              <i class="icon-dropdown forex-rates-time-chevron" aria-hidden="true"></i>
            </button>
            <ul class="forex-rates-time-list" role="listbox">${timeItems}</ul>
          </div>
        </div>
        <button type="button" class="forex-rates-go-btn"${(!state.selectedDate || !state.selectedUpdate || state.loading) ? ' disabled' : ''}>${escapeHtml(authoring.ctaLabel)}</button>
        <button type="button" class="forex-rates-print-btn">${escapeHtml(authoring.printCtaLabel)}<i class="icon-print" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="forex-rates-table-wrap">
      <table class="forex-rates-table">
        <thead><tr>${headings}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="forex-rates-disclaimer">${authoring.disclaimerHtml}</div>
  </section>`;

  block.querySelectorAll('.forex-rates-flag').forEach((img) => {
    img.addEventListener('error', (event) => {
      event.target.style.display = 'none';
    });
  });
}

function printForexRates(block) {
  const content = block.querySelector('.forex-rates-content');
  if (!content) return;

  const cloned = content.cloneNode(true);

  cloned.querySelectorAll(
    '.forex-rates-print-btn, .forex-rates-go-btn, .forex-rates-time-list, .forex-rates-time-chevron, .forex-rates-date-trigger',
  ).forEach((el) => el.remove());

  const dateInput = cloned.querySelector('.forex-rates-date-text-input');
  if (dateInput) {
    const span = block.ownerDocument.createElement('span');
    span.className = 'forex-rates-date-text-input';
    span.textContent = dateInput.value;
    dateInput.replaceWith(span);
  }

  const doc = block.ownerDocument;
  const logoEl = doc.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || doc.querySelector('.brand-logo-container picture, .brand-logo-container img');
  const brandLogo = logoEl ? logoEl.cloneNode(true).outerHTML : '';

  const pageTitle = doc.querySelector('h1')?.textContent?.trim() || 'Foreign Exchange Rates';

  const printCss = `
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: var(--bbl-font-family-primary); margin: 0; padding: 0; }
    /* Print background colors (title underline, table header shading) — off by default */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* Logo */
    .print-logo { margin-bottom: var(--bbl-space-075); }
    .print-logo img { height: 1.5rem; width: auto; }

    /* Horizontal rule after logo */
    .print-divider { border: none; border-top: 0.0625rem solid var(--bbl-color-grey-125); margin: var(--bbl-space-075) 0 var(--bbl-space-100); }

    /* Page H1 title */
    .print-title {
      font-size: 1.25rem; font-weight: 700; color: var(--bbl-color-black);
      margin: 0 0 var(--bbl-space-050); padding-bottom: var(--bbl-space-075); position: relative;
    }
    .print-title::after {
      content: ''; position: absolute; bottom: 0; left: 0;
      width: 2.25rem; height: var(--bbl-space-025); background: var(--bbl-color-blue-105);
    }

    /* Controls */
    .forex-rates-control-row {
      display: flex; flex-direction: row; flex-wrap: wrap; align-items: center;
      gap: 0.4rem; padding: 0; margin: var(--bbl-space-100) 0 var(--bbl-space-075);
    }
    .forex-rates-calendar-label { font-size: 0.5625rem; font-weight: 900; line-height: normal; width: auto; }
    .forex-rates-date-group { display: flex; align-items: center; gap: 0.2rem; }
    .forex-rates-date-text-input { font-size: 0.5625rem; border: 0.0625rem solid var(--bbl-color-grey-125); padding: 0.1rem 0.3rem; border-radius: 0.2rem; }
    .forex-rates-date-trigger { position: static; transform: none; font-size: var(--bbl-font-size-b3); background: none; border: none; padding: 0; }
    .forex-rates-time-trigger {
      display: flex; align-items: center; border: 0.0625rem solid var(--bbl-color-grey-125);
      background: none; border-radius: 0.2rem;
      padding: 0.1rem 0.3rem; font-size: 0.5625rem; font-weight: 700; height: auto;
    }

    /* Table */
    .forex-rates-table-wrap { overflow: visible; margin-top: var(--bbl-space-050); }
    .forex-rates-table {
      min-width: 0; width: 100%; table-layout: fixed; border-collapse: collapse;
      border: 0.0625rem solid var(--bbl-color-black); font-size: 0.5rem; color: #555;
    }
    .forex-rates-table thead tr { height: auto; }
    .forex-rates-table thead th {
      padding-block: var(--bbl-space-050); padding-inline: 20px; font-size: 0.5rem; font-weight: 700;
      white-space: normal; line-height: 1.2; color: var(--bbl-color-black);
      border-bottom: 0.0625rem solid var(--bbl-color-black); border-right: 0.0625rem solid var(--bbl-color-black); text-align: left;
    }
    .forex-rates-table thead th:last-child { border-right: none; }
    .forex-rates-table thead th:nth-child(n+3) { text-align: center; width: 9%; }
    .forex-rates-table thead th:nth-child(1) { width: 15%; }
    .forex-rates-table thead th:nth-child(2) { width: 40%; }
    .forex-rates-table tbody tr { height: auto; }
    .forex-rates-table tbody td {
      padding-block: 0.15rem; padding-inline: 20px; font-size: 0.5rem; height: auto; vertical-align: middle;
      border-bottom: 0.0625rem solid var(--bbl-color-black); border-right: 0.0625rem solid var(--bbl-color-black);
      color: var(--bbl-color-black);
    }
    .forex-rates-table tbody td:last-child { border-right: none; }
    .forex-rates-table tbody tr:last-child td { border-bottom: none; }
    .forex-rates-table tbody td.is-right { text-align: right; }
    .forex-rates-currency { display: table-cell; vertical-align: middle; white-space: nowrap; }
    .forex-rates-flag { display: inline-block; vertical-align: middle; margin-right: var(--bbl-space-075); width: var(--bbl-space-150); height: var(--bbl-space-150); object-fit: contain; }

    /* Disclaimer */
    .forex-rates-disclaimer { font-size: 0.5rem; line-height: 1.4; margin-top: var(--bbl-space-075); color: #555; }
    .forex-rates-disclaimer p { margin: 0; }
    .forex-rates-disclaimer p:first-child { font-weight: 700; color: var(--bbl-color-black); padding-bottom: 0.2rem; }

    @media print {
      .forex-rates-table thead { display: table-header-group; }
      .forex-rates-table tbody { display: table-row-group; }
      .forex-rates-table { break-inside: auto; }
      .forex-rates-table tbody tr { break-inside: avoid; }
    }
  `;

  const printHtml = `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8"/>
      <title>${escapeHtml(pageTitle)}</title>
      <link rel="stylesheet" href="/styles/tokens.css">
      <link rel="stylesheet" href="/styles/fonts.css">
      <style>${printCss}</style>
    </head>
    <body>
      <div class="print-logo">${brandLogo}</div>
      <hr class="print-divider">
      <h1 class="print-title">${escapeHtml(pageTitle)}</h1>
      <div class="forex-rates block" data-block-status="loaded">
        ${cloned.outerHTML}
      </div>
    </body>
  </html>`;

  const iframe = doc.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
  doc.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    }, 300);
    window.addEventListener('afterprint', () => {
      if (doc.body.contains(iframe)) doc.body.removeChild(iframe);
    }, { once: true });
  };

  const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write(printHtml);
  iframeDoc.close();
}

export default async function decorate(block) {
  const authoring = parseAuthoring(block);
  const [placeholders, configs] = await Promise.all([fetchPlaceholders(), fetchConfigs()]);

  authoring.openCalendarLabel = placeholders?.forexRatesOpenCalendar || 'Open calendar';
  const language = getLang();
  const endpoints = createApiEndpoints(configs);

  const state = {
    selectedDate: '',
    selectedUpdate: '',
    updates: [],
    rates: [],
    enabledDaysByMonth: {},
    loading: false,
    timeDropdownOpen: false,
  };

  let datePicker = null;
  let navObserver = null;

  const render = () => {
    try {
      renderBlock(block, state, authoring);
    } catch (e) {
      setTimeout(render, 0);
      return;
    }

    const dateInput = block.querySelector('.forex-rates-date-text-input');
    const dateTrigger = block.querySelector('.forex-rates-date-trigger');
    const timeDropdownEl = block.querySelector('.forex-rates-time-dropdown');
    const timeTrigger = block.querySelector('.forex-rates-time-trigger');
    const goButton = block.querySelector('.forex-rates-go-btn');
    const printButton = block.querySelector('.forex-rates-print-btn');

    const loadRates = async (dateIso, updateValue) => {
      const parsed = parseIsoDate(dateIso);
      if (!parsed || !updateValue) return;
      state.loading = true;
      render();

      try {
        const fxRates = await getRates(
          endpoints,
          parsed.day,
          parsed.month,
          parsed.year,
          updateValue,
          language,
        );
        state.rates = normalizeRates(fxRates);
      } finally {
        state.loading = false;
        render();
      }
    };

    const applyDateSelection = async (dateIso) => {
      const parsed = parseIsoDate(dateIso);
      if (!parsed) return false;

      const monthKey = getMonthKey(parsed.year, parsed.month);
      if (!state.enabledDaysByMonth[monthKey]) {
        try {
          state.enabledDaysByMonth[monthKey] = await getEnabledDays(
            endpoints,
            parsed.year,
            parsed.month,
          );
        } catch (e) {
          state.enabledDaysByMonth[monthKey] = [];
        }
      }

      const monthDays = state.enabledDaysByMonth[monthKey] || [];
      if (monthDays.length && !monthDays.includes(parsed.day)) return false;

      state.selectedDate = dateIso;
      render();

      try {
        const updateOptions = await getUpdatesInDay(
          endpoints,
          parsed.day,
          parsed.month,
          parsed.year,
        );
        const normalizedUpdates = Array.isArray(updateOptions) ? updateOptions : [];
        state.updates = normalizedUpdates;
        state.selectedUpdate = trimValue(normalizedUpdates[normalizedUpdates.length - 1]?.Update);
      } catch (e) {
        // no-op to match live-site silent behavior
      }

      render();
      if (
        state.selectedDate
        && state.selectedUpdate
        && isValidSelectedDay(state)
      ) {
        await loadRates(state.selectedDate, state.selectedUpdate);
      }

      return true;
    };

    if (navObserver) {
      navObserver.disconnect();
      navObserver = null;
    }

    if (datePicker) {
      datePicker.destroy();
      datePicker = null;
    }

    if (dateInput) {
      const selectedParsed = parseIsoDate(state.selectedDate);
      const initialValue = selectedParsed
        ? new Date(
          Number(selectedParsed.year),
          Number(selectedParsed.month) - 1,
          Number(selectedParsed.day),
        )
        : null;

      const existingPopovers = new Set(document.querySelectorAll('.bbl-calendar-picker-popover'));

      datePicker = attachCalendarPicker({
        input: dateInput,
        value: initialValue,
        fetchEnabledDays: async ({ year, month }) => {
          try {
            return await getEnabledDays(endpoints, year, month + 1);
          } catch (e) {
            return [];
          }
        },
        onChange: (selectedDate) => {
          const iso = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
          applyDateSelection(iso);
        },
      });

      const popoverEl = [...document.querySelectorAll('.bbl-calendar-picker-popover')]
        .find((el) => !existingPopovers.has(el));
      const titleEl = popoverEl?.querySelector('.bbl-calendar-picker-title');
      const nextBtn = popoverEl?.querySelector('.bbl-calendar-picker-nav[aria-label="Next month"]');

      if (titleEl && nextBtn) {
        const syncNextNavState = () => {
          nextBtn.disabled = isNextMonthDisabled(titleEl.textContent, language);
        };
        navObserver = new MutationObserver(syncNextNavState);
        navObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
        syncNextNavState();
      }

      if (dateTrigger) {
        dateTrigger.addEventListener('click', (e) => {
          e.stopPropagation();
          datePicker.open();
        });
      }
    }

    const toggleTimeDropdown = (open) => {
      state.timeDropdownOpen = open;
      if (timeDropdownEl) timeDropdownEl.classList.toggle('is-open', open);
    };

    if (timeTrigger) {
      timeTrigger.addEventListener('click', () => {
        const next = !state.timeDropdownOpen;
        toggleTimeDropdown(next);
        if (next) {
          document.addEventListener('mousedown', function closeTime(e) {
            if (!timeDropdownEl || !timeDropdownEl.contains(e.target)) {
              toggleTimeDropdown(false);
            }
            document.removeEventListener('mousedown', closeTime);
          });
        }
      });
    }

    block.querySelectorAll('.forex-rates-time-item').forEach((item) => {
      item.addEventListener('click', () => {
        const prev = state.selectedUpdate;
        state.selectedUpdate = item.dataset.value;
        toggleTimeDropdown(false);
        if (prev !== state.selectedUpdate) {
          const labelEl = block.querySelector('.forex-rates-time-label');
          const selectedObj = state.updates.find(
            (u) => trimValue(u.Update) === state.selectedUpdate,
          );
          if (labelEl && selectedObj) {
            labelEl.textContent = `${trimValue(selectedObj.Update)}: ${trimValue(selectedObj.Time)}`;
          }
          block.querySelectorAll('.forex-rates-time-item').forEach((li) => {
            li.classList.toggle('is-active', li.dataset.value === state.selectedUpdate);
            li.setAttribute('aria-selected', li.dataset.value === state.selectedUpdate);
          });
          if (state.selectedDate && state.selectedUpdate && isValidSelectedDay(state)) {
            loadRates(state.selectedDate, state.selectedUpdate);
          }
        }
      });
    });

    if (goButton) {
      goButton.addEventListener('click', () => {
        if (!state.selectedDate || !state.selectedUpdate || !isValidSelectedDay(state)) return;
        loadRates(state.selectedDate, state.selectedUpdate);
      });
    }

    if (printButton) {
      printButton.addEventListener('click', () => {
        printForexRates(block);
      });
    }
  };

  const init = async () => {
    state.loading = true;
    render();

    try {
      const latest = await getLatestRates(endpoints);
      state.rates = normalizeRates(latest);

      const latestDate = parseApiDate(latest?.[0]?.Ddate);
      if (!latestDate) return;

      state.selectedDate = latestDate.iso;

      const latestMonthKey = getMonthKey(latestDate.year, latestDate.month);
      state.enabledDaysByMonth[latestMonthKey] = await getEnabledDays(
        endpoints,
        latestDate.year,
        latestDate.month,
      );

      const updateOptions = await getUpdatesInDay(
        endpoints,
        latestDate.day,
        latestDate.month,
        latestDate.year,
      );

      const normalizedUpdates = Array.isArray(updateOptions) ? updateOptions : [];
      state.updates = normalizedUpdates;

      state.selectedUpdate = trimValue(normalizedUpdates[normalizedUpdates.length - 1]?.Update);
    } finally {
      state.loading = false;
      render();
    }
  };

  await init();
}

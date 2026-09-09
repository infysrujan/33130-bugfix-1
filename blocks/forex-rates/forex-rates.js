import { fetchPlaceholders } from '../../scripts/placeholder.js';
import { fetchConfigs } from '../../scripts/config.js';
import { getLang } from '../../scripts/scripts.js';
import { attachCalendarPicker } from '../../scripts/utils/calendar-picker.js';
import { MONTHS_EN, MONTHS_TH, BE_OFFSET } from '../../scripts/utils/datelang.js';
import {
  getMonthKey,
  parseApiDate,
  parseIsoDate,
} from '../../scripts/utils/date-helpers.js';
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

function getPageTitle(root = document) {
  const tabsContainer = root.querySelector('.tabs-container');
  if (!tabsContainer) {
    return 'Foreign Exchange Rates';
  }

  let previous = tabsContainer.previousElementSibling;
  while (previous && !previous.classList.contains('section')) {
    previous = previous.previousElementSibling;
  }

  return previous?.querySelector('h1, h2, h3, h4, h5, h6')?.textContent?.trim()
    || 'Foreign Exchange Rates';
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
  // Guard: remove any leftover root from a previous print (e.g. afterprint didn't fire)
  document.getElementById('forex-rates-print-root')?.remove();
  document.getElementById('forex-rates-print-style')?.remove();

  const content = block.querySelector('.forex-rates-content');
  if (!content) return;

  const cloned = content.cloneNode(true);

  cloned.querySelectorAll(
    '.forex-rates-print-btn, .forex-rates-go-btn, .forex-rates-time-list, .forex-rates-time-chevron, .forex-rates-date-trigger',
  ).forEach((el) => el.remove());

  const dateInput = cloned.querySelector('.forex-rates-date-text-input');
  if (dateInput) {
    const span = document.createElement('span');
    span.className = 'forex-rates-date-text-input';
    span.textContent = dateInput.value;
    dateInput.replaceWith(span);
  }

  // Logo — clone directly from the live page (images already loaded, no fetch needed)
  const logoEl = document.querySelector('.brand-logo-print-logo picture, .brand-logo-print-logo img')
    || document.querySelector('.brand-logo-container picture, .brand-logo-container img');
  const brandLogoHtml = logoEl ? logoEl.cloneNode(true).outerHTML : '';

  const pageTitle = getPageTitle(document);

  const printRoot = document.createElement('div');
  printRoot.id = 'forex-rates-print-root';
  printRoot.innerHTML = `
    <div class="print-logo">${brandLogoHtml}</div>
    <hr class="print-divider">
    <h1 class="print-title">${escapeHtml(pageTitle)}</h1>
    <div class="forex-rates block" data-block-status="loaded">${cloned.outerHTML}</div>
  `;

  // Inline <style> applies synchronously (no network delay), so these rules are
  // guaranteed active before window.print() fires. It holds the cross-device
  // CONSISTENCY primitives that must not depend on any external/responsive CSS.
  // Everything is under @media print so engines that do a real print re-layout
  // (Safari, iPad, desktop) paginate to the A4 page box instead of capturing the
  // on-screen render — the live page is never visually altered before printing.
  const printStyle = document.createElement('style');
  printStyle.id = 'forex-rates-print-style';
  printStyle.textContent = `
    /* Fixed A4 page box so the print area is identical on every device/printer. */
    @page { size: a4 portrait; margin: 10mm; }

    @media print {
      /* Isolation: print only the cloned root, hide the live page. */
      body > *:not(#forex-rates-print-root) { display: none !important; }

      /* Root resets: neutralize page themes (private/wealth/bbm tints) and, crucially,
         iOS/WebKit text inflation — text-size-adjust is what makes iOS render text at a
         different scale than Windows/Android. Pinning it to 100% keeps glyph metrics
         (and therefore column fit) identical on every device and engine. */
      #forex-rates-print-root {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        color: #000 !important;
        -webkit-text-size-adjust: 100% !important;
        text-size-adjust: 100% !important;
      }

      /* Print painted backgrounds/borders regardless of the "background graphics" toggle. */
      #forex-rates-print-root, #forex-rates-print-root * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      #forex-rates-print-root .print-logo { display: block !important; }
      #forex-rates-print-root .print-logo img { display: block !important; height: 1.5rem !important; width: auto !important; max-width: none !important; }
    }
  `;

  document.head.appendChild(printStyle);
  document.body.appendChild(printRoot);

  window.print();

  const cleanup = () => {
    printRoot.remove();
    printStyle.remove();
    window.removeEventListener('afterprint', cleanup);
    window.removeEventListener('focus', cleanup);
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  // Fallback: some iOS browsers don't fire afterprint. Restore the page when it
  // regains focus after the print/share sheet closes (attached a tick later so
  // the current focus state can't trigger it early).
  setTimeout(() => window.addEventListener('focus', cleanup, { once: true }), 0);
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

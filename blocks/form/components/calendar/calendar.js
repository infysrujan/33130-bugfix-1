/* Thai Buddhist Era date picker — form-integrated component */
const BE_OFFSET = 543;
const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const WEEKDAYS_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
/**
 * Parse a yyyy-MM-dd string as a LOCAL midnight Date.
 * Using new Date("yyyy-MM-dd") would give UTC midnight, which in UTC+7
 * falls on the previous calendar day — causing min/max comparisons to
 * incorrectly disable the boundary date itself.
 */
function parseISODate(str) {
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}
function toISODate(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function formatDisplay(date) {
  return `${date.getDate()} ${MONTHS_TH[date.getMonth()]} ${date.getFullYear() + BE_OFFSET}`;
}
function formatHeader(year, month) {
  return `${MONTHS_TH[month]} ${year + BE_OFFSET}`;
}

let uid = 0;

export default function decorate(element, fd) {
  /* inputDecorator (which runs before us) sets input.id = fd.id.
     If displayFormat is configured it also changes input.type from "date" to "text",
     so we cannot rely on [type="date"] — use the field id instead. */
  const nativeInput = element.querySelector(`#${fd.id}`) || element.querySelector('input');
  if (!nativeInput) return;

  /* The calendar dialog model stores min/max as "minimumDate"/"maximumDate" with
     valueFormat "YYYY-MM-DD[T]HH:mm:ss.000-00:00". Non-standard field names land
     under fd.properties.*; standard AEM Forms constraints are fd.minimum/fd.maximum.
     Always parse as local time — new Date("yyyy-MM-dd") returns UTC midnight which
     in UTC+7 shifts the boundary date by one day, incorrectly disabling it. */
  function getMin() {
    return parseISODate(
      fd.minimum
      || fd.minimumDate
      || fd.properties?.minimumDate
      || nativeInput.getAttribute('min'),
    );
  }
  function getMax() {
    return parseISODate(
      fd.maximum
      || fd.maximumDate
      || fd.properties?.maximumDate
      || nativeInput.getAttribute('max'),
    );
  }
  const initialDate = parseISODate(fd.value || nativeInput.value);
  uid += 1;
  const displayId = `cal-th-${uid}`;
  /* Hide native input but keep it in the DOM for form submission and validation */
  nativeInput.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
  nativeInput.setAttribute('tabindex', '-1');
  /* Display text input */
  const displayInput = document.createElement('input');
  displayInput.type = 'text';
  displayInput.id = displayId;
  displayInput.className = 'cal-th-input';
  displayInput.readOnly = true;
  displayInput.placeholder = 'วว เดือน ปปปป';
  displayInput.setAttribute('aria-haspopup', 'dialog');
  displayInput.setAttribute('aria-expanded', 'false');
  if (nativeInput.disabled) displayInput.disabled = true;
  /* Point existing label at the display input */
  const label = element.querySelector('label');
  if (label) label.htmlFor = displayId;
  /* Calendar icon trigger */
  const iconBtn = document.createElement('button');
  iconBtn.type = 'button';
  iconBtn.className = 'cal-th-icon icon-calendar';
  iconBtn.setAttribute('aria-hidden', 'true');
  iconBtn.tabIndex = -1;
  const fieldRow = document.createElement('div');
  fieldRow.className = 'cal-th-field';
  fieldRow.append(displayInput, iconBtn);
  nativeInput.insertAdjacentElement('afterend', fieldRow);
  /* Popover */
  const popover = document.createElement('div');
  popover.className = 'cal-th-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-modal', 'true');
  popover.setAttribute('aria-label', 'ปฏิทิน');
  popover.hidden = true;

  const popHeader = document.createElement('div');
  popHeader.className = 'cal-th-header';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.className = 'cal-th-nav';
  btnPrev.setAttribute('aria-label', 'เดือนก่อนหน้า');
  btnPrev.innerHTML = '<span aria-hidden="true">&#8249;</span>';

  const monthTitle = document.createElement('h2');
  monthTitle.className = 'cal-th-month-title';

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.className = 'cal-th-nav';
  btnNext.setAttribute('aria-label', 'เดือนถัดไป');
  btnNext.innerHTML = '<span aria-hidden="true">&#8250;</span>';

  popHeader.append(btnPrev, monthTitle, btnNext);

  const weekRow = document.createElement('div');
  weekRow.className = 'cal-th-weekdays';
  WEEKDAYS_TH.forEach((day) => {
    const span = document.createElement('span');
    span.textContent = day;
    weekRow.append(span);
  });

  const grid = document.createElement('div');
  grid.className = 'cal-th-grid';
  grid.setAttribute('role', 'grid');

  popover.append(popHeader, weekRow, grid);
  document.body.append(popover);

  /* State */
  let selected = initialDate ? startOfDay(initialDate) : null;
  let viewYear = (selected || new Date()).getFullYear();
  let viewMonth = (selected || new Date()).getMonth();
  let isOpen = false;

  function positionPopover() {
    const rect = fieldRow.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + window.scrollY + margin;
    let left = rect.left + window.scrollX;
    popover.style.visibility = 'hidden';
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    requestAnimationFrame(() => {
      const pw = popover.offsetWidth;
      const ph = popover.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (left + pw > vw - margin) left = Math.max(margin, vw - margin - pw);
      if (rect.bottom + ph > vh - margin && rect.top - margin - ph > 0) {
        top = rect.top + window.scrollY - margin - ph;
      }
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.visibility = '';
    });
  }
  function renderGrid() {
    grid.replaceChildren();
    monthTitle.textContent = formatHeader(viewYear, viewMonth);
    const minDate = getMin();
    const maxDate = getMax();
    /* Disable prev nav if we're at or before the min month */
    if (minDate) {
      btnPrev.disabled = viewYear < minDate.getFullYear()
        || (viewYear === minDate.getFullYear() && viewMonth <= minDate.getMonth());
    } else {
      btnPrev.disabled = false;
    }
    /* Disable next nav if we're at or after the max month */
    if (maxDate) {
      btnNext.disabled = viewYear > maxDate.getFullYear()
        || (viewYear === maxDate.getFullYear() && viewMonth >= maxDate.getMonth());
    } else {
      btnNext.disabled = false;
    }
    const firstDow = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < firstDow; i += 1) {
      const empty = document.createElement('div');
      empty.className = 'cal-th-day cal-th-day--empty';
      empty.setAttribute('aria-hidden', 'true');
      grid.append(empty);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellDate = startOfDay(new Date(viewYear, viewMonth, day));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-th-day';
      btn.textContent = String(day);
      btn.setAttribute('role', 'gridcell');
      btn.dataset.day = String(day);
      /* Compare local-midnight cell against local-midnight min/max — no UTC skew */
      btn.disabled = (minDate && cellDate < minDate) || (maxDate && cellDate > maxDate);
      if (selected && sameDay(cellDate, selected)) {
        btn.classList.add('cal-th-day--selected');
        btn.setAttribute('aria-pressed', 'true');
      }
      grid.append(btn);
    }
  }
  function commitDay(day) {
    selected = startOfDay(new Date(viewYear, viewMonth, day));
    displayInput.value = formatDisplay(selected);
    nativeInput.value = toISODate(selected);
    /* Fire events so the AFB rules engine and form validation pick up the change */
    nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
    nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
    renderGrid();
  }
  function openPopover() {
    isOpen = true;
    if (selected) { viewYear = selected.getFullYear(); viewMonth = selected.getMonth(); }
    displayInput.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    renderGrid();
    positionPopover();
  }
  function closePopover() {
    if (!isOpen) return;
    isOpen = false;
    displayInput.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
  }
  function shiftMonth(delta) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    renderGrid();
  }
  /* Event wiring */
  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('button.cal-th-day');
    if (!btn || btn.disabled) return;
    commitDay(Number.parseInt(btn.dataset.day, 10));
    closePopover();
  });
  btnPrev.addEventListener('click', (e) => { e.stopPropagation(); shiftMonth(-1); });
  btnNext.addEventListener('click', (e) => { e.stopPropagation(); shiftMonth(+1); });
  fieldRow.addEventListener('click', (e) => {
    e.stopPropagation();
    if (displayInput.disabled) return;
    if (isOpen) closePopover(); else openPopover();
  });
  document.addEventListener('click', (e) => {
    if (!isOpen) return;
    if (!popover.contains(e.target) && !fieldRow.contains(e.target)) closePopover();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { e.stopPropagation(); closePopover(); }
  });
  const onResize = () => { if (isOpen) positionPopover(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  /* Watch for dynamic min/max updates from the form rules engine */
  new MutationObserver(() => { if (isOpen) renderGrid(); }).observe(nativeInput, {
    attributes: true,
    attributeFilter: ['min', 'max'],
  });
  /* Watch for disabled state changes from the form rules engine */
  new MutationObserver(() => {
    displayInput.disabled = nativeInput.disabled;
  }).observe(nativeInput, {
    attributes: true,
    attributeFilter: ['disabled'],
  });
  /* Set initial display value */
  if (selected) displayInput.value = formatDisplay(selected);
}

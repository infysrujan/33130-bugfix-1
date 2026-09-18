export function buildIntlDayLabels(language) {
  const baseSunday = new Date(Date.UTC(2026, 3, 5));
  return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(language, { weekday: 'short' }).format(new Date(baseSunday.getTime() + i * 864e5)));
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatDisplayDate(date, monthLabels) {
  const monthShort = monthLabels[date.getMonth()]?.slice(0, 3);
  return `${pad2(date.getDate())} ${monthShort} ${date.getFullYear()}`;
}

export function formatMaturityDate(isoStr, monthLabels, yearOffset = 0) {
  const d = new Date(isoStr);
  const monthShort = monthLabels[d.getMonth()]?.slice(0, 3);
  return `${pad2(d.getDate())} ${monthShort} ${String(d.getFullYear() + yearOffset).slice(-2)}`;
}

export function formatRemainTerm(remainTerm, isThai = false) {
  const parts = remainTerm.split('.');
  const years = parseInt(parts[0], 10);
  const months = parseInt(parts[1], 10);
  const days = parseInt(parts[2] || '0', 10);
  if (isThai) {
    if (years === 0 && months === 0) return `${days} วัน`;
    if (years === 0) return `${months} เดือน`;
    if (months === 0) return `${years} ปี`;
    return `${years} ปี ${months} เดือน`;
  }
  if (years === 0 && months === 0) return `${days}D`;
  if (years === 0) return `${months}M`;
  if (months === 0) return `${years}Y`;
  return `${years}Y ${months}M`;
}

export function remainTermToMonths(remainTerm) {
  const parts = remainTerm.split('.');
  const years = parseInt(parts[0], 10);
  const months = parseInt(parts[1], 10);
  const days = parseInt(parts[2] || '0', 10);
  return years * 12 + months + days / 30;
}

export function formatMonthYear(month, year) {
  return `${month}-${year}`;
}

export function formatMonthYearDisplay(month, year, yearOffset = 0) {
  return `${pad2(month)}/${Number(year) + yearOffset}`;
}

export function buildCalendarGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    cells.push({ day: daysInPrev - i, otherMonth: true });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ day: d, otherMonth: false });
  }
  while (cells.length < 42) {
    cells.push({ day: cells.length - firstDay - daysInMonth + 1, otherMonth: true });
  }
  return cells;
}

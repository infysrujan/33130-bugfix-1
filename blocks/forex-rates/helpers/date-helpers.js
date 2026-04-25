export function parseApiDate(rawDate) {
  if (!rawDate) return null;
  const parts = rawDate.split('/').map((part) => part.trim());
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const day = d.padStart(2, '0');
  const month = m.padStart(2, '0');
  return {
    day,
    month,
    year: y,
    iso: `${y}-${month}-${day}`,
  };
}

export function parseIsoDate(rawDate) {
  if (!rawDate) return null;
  const parts = rawDate.split('-').map((part) => part.trim());
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  return {
    day,
    month,
    year,
  };
}

export function parseCsvConfigList(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

export function buildIntlMonthLabels(language) {
  return Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(language, {
    month: 'long',
  }).format(new Date(2026, index, 1)));
}

export function buildIntlDayLabels(language) {
  const baseSunday = new Date(Date.UTC(2026, 3, 5));
  return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(language, {
    weekday: 'short',
  }).format(new Date(baseSunday.getTime() + (index * 24 * 60 * 60 * 1000))));
}

export function formatDateInputValue(isoDate, monthLabels, yearOffset = 0) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return '';
  const monthIndex = Number(parsed.month) - 1;
  const monthShort = monthLabels[monthIndex]?.slice(0, 3) || parsed.month;
  return `${parsed.day} ${monthShort} ${Number(parsed.year) + yearOffset}`;
}

export function parseTypedDate(rawValue, yearOffset = 0) {
  if (!rawValue) return null;
  const text = rawValue.trim();

  const fromParts = (yearValue, monthValue, dayValue) => {
    let normalizedYear = Number(yearValue);
    if (yearOffset && normalizedYear > yearOffset) {
      normalizedYear -= yearOffset;
    }

    const year = String(normalizedYear);
    const month = String(monthValue).padStart(2, '0');
    const day = String(dayValue).padStart(2, '0');
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return null;

    const asDate = new Date(Number(year), Number(month) - 1, Number(day));
    const isValidDate = asDate.getFullYear() === Number(year)
      && asDate.getMonth() + 1 === Number(month)
      && asDate.getDate() === Number(day);

    if (!isValidDate) return null;

    return {
      day,
      month,
      year,
      iso: `${year}-${month}-${day}`,
    };
  };

  const ddMmYyyyMatch = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ddMmYyyyMatch) {
    const [, day, month, year] = ddMmYyyyMatch;
    return fromParts(year, month, day);
  }

  const yyyyMmDdMatch = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (yyyyMmDdMatch) {
    const [, year, month, day] = yyyyMmDdMatch;
    return fromParts(year, month, day);
  }

  const parsedMillis = Date.parse(text);
  if (Number.isNaN(parsedMillis)) return null;
  const parsedDate = new Date(parsedMillis);
  return fromParts(parsedDate.getFullYear(), parsedDate.getMonth() + 1, parsedDate.getDate());
}

export function getMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildCalendarGrid(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDay = new Date(year, month - 1, 1).getDay();
  const weeks = [];
  let cursor = 1 - firstDay;

  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = [];
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      week.push({
        day: cursor,
        inMonth: cursor >= 1 && cursor <= daysInMonth,
      });
      cursor += 1;
    }

    weeks.push(week);
    if (cursor > daysInMonth && weekIndex > 3) {
      break;
    }
  }

  return weeks;
}

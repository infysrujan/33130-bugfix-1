export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export const BE_OFFSET = 543;

/**
 * @param {Date} date - local date (time ignored)
 * @param {'en' | 'th'} lang
 * @returns {string} e.g. `1 July 2026` or `1 กรกฎาคม 2569`
 */
export function formatLongDate(date, lang) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const d = date.getDate();
  if (lang === 'th') {
    const m = MONTHS_TH[date.getMonth()];
    const y = date.getFullYear() + BE_OFFSET;
    return `${d} ${m} ${y}`;
  }
  const m = MONTHS_EN[date.getMonth()];
  const y = date.getFullYear();
  return `${d} ${m} ${y}`;
}

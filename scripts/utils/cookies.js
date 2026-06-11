/**
 * Reads a cookie value by name from `document.cookie`.
 * @param {string} name - Cookie name (exact match).
 * @returns {string} Decoded value, or `''` if missing or `name` is empty.
 */
export function getCookie(name) {
  if (!name) return '';
  const encoded = encodeURIComponent(name);
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${encoded}=`));
  return match ? decodeURIComponent(match.split('=')[1]) : '';
}

/**
 * Sets a cookie with a given name, value, and expiry (in days).
 * @param {string} name
 * @param {string} value
 * @param {number} days
 */
export function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; `
    + `expires=${expires}; path=/; SameSite=Lax`;
}

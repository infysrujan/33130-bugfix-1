// ─── Shared utilities ─────────────────────────────────────────────────────────

export function hasValue(val) {
  if (!val) return false;
  const trimmed = val.trim();
  return trimmed !== '' && !/^[-–—]+$/.test(trimmed);
}

export function buildUrl(template, params) {
  return Object.entries(params).reduce(
    (url, [key, val]) => url.replace(`{{${key}}}`, encodeURIComponent(String(val))),
    template,
  );
}

export function createEl(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function showToast(message, placeholders) {
  let container = document.getElementById('locate-us-toast-container');
  if (!container) {
    container = createEl('<div id="locate-us-toast-container" class="locate-us-toast-container"></div>');
    document.body.appendChild(container);
  }

  const closeLabel = placeholders?.locateUsAriaToastClose || 'Close';

  const toast = createEl(`
    <div class="locate-us-toast" aria-live="assertive">
      <span class="locate-us-toast-message"></span>
      <button type="button" class="locate-us-toast-close" aria-label="${closeLabel}">×</button>
    </div>`);

  toast.querySelector('.locate-us-toast-message').textContent = message;
  toast.querySelector('.locate-us-toast-close').addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function getUserLocation(defaultLat, defaultLng) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: defaultLat, lng: defaultLng });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: defaultLat, lng: defaultLng }),
      { timeout: 5000 },
    );
  });
}

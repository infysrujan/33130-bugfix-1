/* eslint-env serviceworker */
/* eslint-disable no-restricted-globals */

const pdfStore = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const { type, url, buffer } = event.data || {};
  if (type === 'register-pdf') {
    pdfStore.set(url, buffer);
    if (event.ports[0]) event.ports[0].postMessage({ ok: true });
  } else if (type === 'unregister-pdf') {
    pdfStore.delete(url);
  }
});

self.addEventListener('fetch', (event) => {
  const buffer = pdfStore.get(event.request.url);
  if (!buffer) return;
  const name = decodeURIComponent(new URL(event.request.url).pathname.split('/').pop());
  event.respondWith(new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
    },
  }));
});

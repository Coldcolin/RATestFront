/* Service worker: app-shell caching for offline load, plus Web Push display. */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const STATIC = `static-${VERSION}`;
const SHELL_PAGES = ['/', '/login', '/onboarding', '/notifications', '/privacy'];

// Cache the shell pages and the hashed JS/CSS they reference, so the onboarding wizard opens offline.
async function precache() {
  const shell = await caches.open(SHELL);
  const statics = await caches.open(STATIC);
  await shell.addAll(['/manifest.json', '/icons/icon-192.png']);
  for (const path of SHELL_PAGES) {
    const res = await fetch(path, { credentials: 'same-origin' });
    if (!res.ok) continue;
    const html = await res.clone().text();
    await shell.put(path, res);
    const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || []);
    await Promise.all([...assets].map((a) => statics.add(a).catch(() => {})));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Only same-origin GETs. API calls go to another origin and are never cached: no PII in Cache Storage.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    // Hashed, immutable assets: cache-first.
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(request, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    // Pages: network-first so users get the latest build, falling back to the cached shell offline.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && SHELL_PAGES.includes(url.pathname)) caches.open(SHELL).then((c) => c.put(url.pathname, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) || (await caches.match('/onboarding')) || Response.error()),
    );
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Executive Portal', {
      body: data.body || 'You have a new update.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) return existing.navigate(target).then((w) => w && w.focus());
      return self.clients.openWindow(target);
    }),
  );
});

/* Hidrata — cache do app e lembretes.
   O relógio confiável é a página aberta. Este worker cobre o melhor esforço
   com o app fechado (sincronização periódica e, se existir, Notification Triggers).
   A folga de 90 min / 3 h espelha FOREGROUND_GRACE_MS e BACKGROUND_GRACE_MS em js/logic.js. */

const CACHE = 'hidrata-v1';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/ui.js',
  './js/store.js',
  './js/logic.js',
  './js/notify.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const FOREGROUND_GRACE_MS = 90 * 60 * 1000;
const BACKGROUND_GRACE_MS = 3 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  event.respondWith(
    (async () => {
      try {
        const fresh = await fetch(event.request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }
        throw new Error('offline');
      }
    })(),
  );
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('hidrata', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('kv')) {
        request.result.createObjectStore('kv');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const request = tx.objectStore('kv').get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function idbSet(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mergeNotified(current = {}, incoming = {}) {
  const out = { ...current };
  for (const [key, ids] of Object.entries(incoming || {})) {
    if (!Array.isArray(ids)) continue;
    out[key] = [...new Set([...(out[key] || []), ...ids.filter((id) => typeof id === 'string')])];
  }
  return out;
}

function dueItems(schedule, notified, now, graceMs) {
  const key = dateKey(now);
  const sent = new Set((notified && notified[key]) || []);
  const due = [];
  for (const item of schedule || []) {
    if (!item || sent.has(item.id) || typeof item.time !== 'string') continue;
    const [hour, minute] = item.time.split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    const when = new Date(now);
    when.setHours(hour, minute, 0, 0);
    const late = now.getTime() - when.getTime();
    if (late >= 0 && late <= graceMs) due.push(item);
  }
  return { key, due };
}

async function readStore() {
  const db = await openDb();
  const stored = await idbGet(db, 'reminders');
  return { db, stored: stored || { schedule: [], notified: {} } };
}

async function broadcast(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage(message);
}

async function showDue(graceMs) {
  const { db, stored } = await readStore();
  const now = new Date();
  const { key, due } = dueItems(stored.schedule, stored.notified, now, graceMs);
  if (!due.length) return stored.notified;

  const delivered = [];
  for (const item of due) {
    try {
      await self.registration.showNotification(item.title, {
        body: item.body,
        tag: `hidrata-${key}-${item.id}`,
        lang: 'pt-BR',
        icon: new URL('icons/icon-192.png', self.location).href,
        data: { url: './' },
        vibrate: [60, 40, 60],
      });
      delivered.push(item.id);
    } catch {
      // Sem permissão ou notificações indisponíveis.
    }
  }

  if (!delivered.length) return stored.notified;
  stored.notified = mergeNotified(stored.notified, { [key]: delivered });
  await idbSet(db, 'reminders', stored);
  await broadcast({ type: 'NOTIFIED', notified: stored.notified });
  return stored.notified;
}

let chain = Promise.resolve();

function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  event.waitUntil(
    enqueue(async () => {
      if (data.type === 'SYNC') {
        const { db, stored } = await readStore();
        const next = {
          schedule: Array.isArray(data.schedule) ? data.schedule : [],
          notified: mergeNotified(stored.notified, data.notified),
        };
        await idbSet(db, 'reminders', next);
        const message = { type: 'SYNCED', notified: next.notified };
        if (event.source) event.source.postMessage(message);
        else await broadcast(message);
        return;
      }
      if (data.type === 'CHECK_NOW') {
        await showDue(FOREGROUND_GRACE_MS);
      }
    }),
  );
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'hydration-reminders') return;
  event.waitUntil(enqueue(() => showDue(BACKGROUND_GRACE_MS)));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('./', self.location).href;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) {
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

import { reminderSchedule } from './logic.js';

let registration = null;

export function isIos() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function notificationPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission;
}

export function triggersSupported() {
  return typeof globalThis.TimestampTrigger === 'function' && 'Notification' in window && 'showTrigger' in Notification.prototype;
}

export async function setupWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.warn('Não foi possível registrar o service worker.', error);
    return null;
  }
}

export async function enableNotifications() {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

async function activeWorker() {
  if (!registration) return null;
  if (registration.active) return registration.active;
  const ready = await navigator.serviceWorker.ready;
  return ready.active;
}

export async function pushSchedule(state) {
  const worker = await activeWorker();
  if (!worker) return;
  worker.postMessage({
    type: 'SYNC',
    schedule: reminderSchedule(state.settings),
    notified: state.notified,
  });
}

export async function requestCheck() {
  const worker = await activeWorker();
  worker?.postMessage({ type: 'CHECK_NOW' });
}

export async function registerPeriodicSync() {
  try {
    const ready = registration || (await navigator.serviceWorker?.ready);
    if (!ready?.periodicSync) return false;
    await ready.periodicSync.register('hydration-reminders', { minInterval: 60 * 60 * 1000 });
    return true;
  } catch {
    return false;
  }
}

export async function scheduleExperimentalTriggers(state) {
  if (!triggersSupported() || notificationPermission() !== 'granted') return;
  const ready = registration || (await navigator.serviceWorker.ready);
  try {
    const existing = await ready.getNotifications({ includeTriggered: true });
    for (const note of existing) {
      if (typeof note.tag === 'string' && note.tag.startsWith('hidrata-agenda-')) note.close();
    }
    const now = Date.now();
    const items = reminderSchedule(state.settings);
    for (const dayOffset of [0, 1]) {
      const day = new Date();
      day.setDate(day.getDate() + dayOffset);
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      for (const item of items) {
        const [hour, minute] = item.time.split(':').map(Number);
        const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
        const delta = when.getTime() - now;
        if (delta < 5000 || delta > 36 * 60 * 60 * 1000) continue;
        await ready.showNotification(item.title, {
          body: item.body,
          tag: `hidrata-agenda-${key}-${item.id}`,
          lang: 'pt-BR',
          icon: new URL('icons/icon-192.png', window.location.href).href,
          data: { url: './' },
          showTrigger: new TimestampTrigger(when.getTime()),
        });
      }
    }
  } catch {
    // A API de agendar com o app fechado não está disponível neste navegador.
  }
}

export async function showTestNotification() {
  const ready = registration || (await navigator.serviceWorker.ready);
  await ready.showNotification('Hidrata', {
    body: 'Prontinho. Os lembretes vão aparecer assim.',
    tag: 'hidrata-teste',
    lang: 'pt-BR',
    icon: new URL('icons/icon-192.png', window.location.href).href,
  });
}

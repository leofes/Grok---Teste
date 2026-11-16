import {
  addWater,
  completeOnboarding,
  dateKey,
  ensureToday,
  loadState,
  mergeNotified,
  parseAmount,
  parseGoal,
  saveState,
  setGoal,
  setSupplement,
  undoLast,
  withReminders,
} from './store.js';
import {
  enableNotifications,
  isIos,
  isStandalone,
  notificationPermission,
  pushSchedule,
  registerPeriodicSync,
  requestCheck,
  scheduleExperimentalTriggers,
  setupWorker,
  showTestNotification,
} from './notify.js';
import { init as initUi, render } from './ui.js';

let state = loadState();
if (state.onboarded) state = saveState(ensureToday(state));

let openDay = dateKey(new Date());
let toastMessage = '';
let toastTimer = 0;
let deferredPrompt = null;

initUi({
  onOnboard(raw) {
    const parsed = parseGoal(raw);
    if (!parsed.ok) return parsed.message;
    commit(completeOnboarding(state, parsed.value));
    return '';
  },
  onAdd(ml) {
    commit(addWater(state, ml));
    pulse();
  },
  onCustom(raw) {
    const parsed = parseAmount(raw);
    if (!parsed.ok) return parsed.message;
    commit(addWater(state, parsed.value));
    pulse();
    return '';
  },
  onUndo() {
    const next = undoLast(state);
    if (next === state) return;
    commit(next);
  },
  onToggle(field, checked) {
    commit(setSupplement(state, field, checked));
  },
  onSaveGoal(raw) {
    const parsed = parseGoal(raw);
    if (!parsed.ok) return parsed.message;
    commit(setGoal(state, parsed.value));
    toast('Meta salva.');
    return '';
  },
  onToggleReminder(kind, enabled) {
    const reminders = state.settings.reminders;
    commit(
      withReminders(state, {
        ...reminders,
        [kind]: { ...reminders[kind], enabled },
      }),
    );
  },
  onWaterTimeAdd(value) {
    if (!value) {
      toast('Escolha um horário.');
      return;
    }
    const times = state.settings.reminders.water.times;
    if (times.includes(value.slice(0, 5))) {
      toast('Esse horário já está na lista.');
      return;
    }
    commit(
      withReminders(state, {
        ...state.settings.reminders,
        water: { ...state.settings.reminders.water, times: [...times, value] },
      }),
    );
  },
  onWaterTimeRemove(value) {
    const reminders = state.settings.reminders;
    commit(
      withReminders(state, {
        ...reminders,
        water: { ...reminders.water, times: reminders.water.times.filter((time) => time !== value) },
      }),
    );
  },
  onReminderTime(kind, value) {
    if (!value) return;
    const reminders = state.settings.reminders;
    commit(
      withReminders(state, {
        ...reminders,
        [kind]: { ...reminders[kind], time: value },
      }),
    );
  },
  async onEnableNotifications() {
    const result = await enableNotifications();
    if (result === 'granted') {
      await registerPeriodicSync();
      await publish();
      toast('Notificações ativadas.');
    } else if (result === 'denied') {
      toast('Permissão negada.');
    } else if (result === 'unsupported') {
      toast('Este navegador não oferece notificações.');
    }
    draw();
  },
  async onTestNotification() {
    try {
      await showTestNotification();
      toast('Notificação de teste enviada.');
    } catch {
      toast('Não foi possível mostrar a notificação.');
    }
  },
  async onInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    draw();
  },
});

draw();

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  draw();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  toast('App instalado na tela de início.');
});

setupWorker()
  .then(() => {
    navigator.serviceWorker?.addEventListener('message', onWorkerMessage);
    return publish();
  })
  .catch(() => {});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  rollIfNeeded();
  if (notificationPermission() === 'granted') requestCheck();
});

setInterval(() => {
  rollIfNeeded();
  if (state.onboarded && notificationPermission() === 'granted') requestCheck();
}, 15000);

function commit(next) {
  try {
    state = saveState(next);
  } catch {
    toast('Não foi possível salvar neste navegador.');
    draw();
    return;
  }
  draw();
  publish();
}

function draw() {
  render(state, {
    permission: notificationPermission(),
    ios: isIos(),
    standalone: isStandalone(),
    installAvailable: Boolean(deferredPrompt),
    toast: toastMessage,
  });
}

function toast(message) {
  toastMessage = message;
  draw();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage = '';
    draw();
  }, 2800);
}

function pulse() {
  if (navigator.vibrate) navigator.vibrate(12);
  const total = document.getElementById('total');
  total.classList.remove('bump');
  void total.offsetWidth;
  total.classList.add('bump');
}

function rollIfNeeded() {
  const key = dateKey(new Date());
  if (key === openDay) return;
  openDay = key;
  if (!state.onboarded) return;
  state = saveState(ensureToday(state, new Date()));
  draw();
  publish();
}

async function publish() {
  if (!state.onboarded) return;
  try {
    await pushSchedule(state);
    await scheduleExperimentalTriggers(state);
    if (notificationPermission() === 'granted') await requestCheck();
  } catch (error) {
    console.warn(error);
  }
}

function onWorkerMessage(event) {
  const data = event.data;
  if (!data || (data.type !== 'SYNCED' && data.type !== 'NOTIFIED')) return;
  const merged = mergeNotified(state.notified, data.notified);
  if (JSON.stringify(merged) === JSON.stringify(state.notified)) return;
  try {
    state = saveState({ ...state, notified: merged });
  } catch {
    state = { ...state, notified: merged };
  }
}

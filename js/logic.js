/** Regras puras do Hidrata: dia local, meta, registros e lembretes. Sem DOM. */

export const LIMITS = {
  goalMin: 250,
  goalMax: 8000,
  amountMin: 10,
  amountMax: 3000,
  historyDays: 90,
};

/** Janela em que um horário atrasado ainda dispara com o app aberto. */
export const FOREGROUND_GRACE_MS = 90 * 60 * 1000;

/** Janela maior para quando o service worker acorda sozinho (pode ser bem mais tarde). */
export const BACKGROUND_GRACE_MS = 3 * 60 * 60 * 1000;

export const DEFAULT_GOAL_ML = 2000;

const DEFAULT_REMINDERS = {
  water: { enabled: true, times: ['09:00', '12:00', '15:00', '18:00'] },
  creatine: { enabled: true, time: '08:00' },
  vitaminD: { enabled: true, time: '10:00' },
};

export function defaultState() {
  return {
    version: 1,
    onboarded: false,
    settings: {
      goalMl: DEFAULT_GOAL_ML,
      reminders: structuredClone(DEFAULT_REMINDERS),
    },
    notified: {},
    days: {},
  };
}

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatMl(ml) {
  return Math.round(Number(ml) || 0).toLocaleString('pt-BR');
}

export function formatLongDate(date) {
  const text = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatHistoryDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const text = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(y, m - 1, d));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function litersLabel(ml) {
  const liters = Number(ml) / 1000;
  if (!Number.isFinite(liters)) return '';
  if (liters === 1) return '1 litro';
  const text = liters.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return `${text} litros`;
}

export function percentOf(total, goal) {
  if (!goal) return 0;
  return Math.round((Number(total) / Number(goal)) * 100);
}

export function parseGoal(input) {
  return parseRange(input, LIMITS.goalMin, LIMITS.goalMax, 'Escolha uma meta entre 250 e 8.000 ml.');
}

export function parseAmount(input) {
  return parseRange(input, LIMITS.amountMin, LIMITS.amountMax, 'Adicione entre 10 e 3.000 ml por vez.');
}

function parseRange(input, min, max, rangeMessage) {
  const text = String(input ?? '').trim();
  if (!/^\d+$/.test(text)) {
    return { ok: false, message: 'Use só números, em mililitros.' };
  }
  const value = Number(text);
  if (value < min || value > max) return { ok: false, message: rangeMessage };
  return { ok: true, value };
}

export function validTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function uniqueTimes(times) {
  const set = new Set();
  for (const time of times || []) {
    const parsed = validTime(time);
    if (parsed) set.add(parsed);
  }
  return [...set].sort();
}

export function sanitizeReminders(reminders = {}) {
  const water = reminders.water || {};
  const creatine = reminders.creatine || {};
  const vitaminD = reminders.vitaminD || {};
  return {
    water: {
      enabled: typeof water.enabled === 'boolean' ? water.enabled : true,
      times: Array.isArray(water.times) ? uniqueTimes(water.times) : [...DEFAULT_REMINDERS.water.times],
    },
    creatine: {
      enabled: typeof creatine.enabled === 'boolean' ? creatine.enabled : true,
      time: validTime(creatine.time) || DEFAULT_REMINDERS.creatine.time,
    },
    vitaminD: {
      enabled: typeof vitaminD.enabled === 'boolean' ? vitaminD.enabled : true,
      time: validTime(vitaminD.time) || DEFAULT_REMINDERS.vitaminD.time,
    },
  };
}

function emptyDay(goalMl) {
  return { goalMl, entries: [], creatine: false, vitaminD: false };
}

function sanitizeDay(day, fallbackGoal) {
  if (!day || typeof day !== 'object') return null;
  const entries = Array.isArray(day.entries)
    ? day.entries
        .filter((entry) => entry && Number.isFinite(Number(entry.ml)) && Number(entry.ml) > 0)
        .map((entry) => ({
          id: String(entry.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
          ml: Math.round(Number(entry.ml)),
          at: typeof entry.at === 'string' ? entry.at : new Date().toISOString(),
        }))
    : [];
  const goal = parseGoal(day.goalMl);
  return {
    goalMl: goal.ok ? goal.value : fallbackGoal,
    entries,
    creatine: Boolean(day.creatine),
    vitaminD: Boolean(day.vitaminD),
  };
}

export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const goal = parseGoal(raw.settings?.goalMl);
  const goalMl = goal.ok ? goal.value : base.settings.goalMl;
  const days = {};
  if (raw.days && typeof raw.days === 'object') {
    for (const [key, day] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const clean = sanitizeDay(day, goalMl);
      if (clean) days[key] = clean;
    }
  }
  const notified = {};
  if (raw.notified && typeof raw.notified === 'object') {
    for (const [key, ids] of Object.entries(raw.notified)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(ids)) continue;
      notified[key] = [...new Set(ids.filter((id) => typeof id === 'string'))];
    }
  }
  return {
    version: 1,
    onboarded: Boolean(raw.onboarded),
    settings: {
      goalMl,
      reminders: sanitizeReminders(raw.settings?.reminders),
    },
    notified,
    days,
  };
}

export function pruneState(state, today = new Date()) {
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cutoff.setDate(cutoff.getDate() - LIMITS.historyDays);
  const cutoffKey = dateKey(cutoff);
  const days = {};
  for (const [key, day] of Object.entries(state.days)) {
    if (key >= cutoffKey) days[key] = day;
  }
  const notified = {};
  for (const [key, ids] of Object.entries(state.notified)) {
    if (key >= cutoffKey) notified[key] = ids;
  }
  return { ...state, days, notified };
}

export function ensureToday(state, today = new Date()) {
  const key = dateKey(today);
  if (state.days[key]) return state;
  return {
    ...state,
    days: {
      ...state.days,
      [key]: emptyDay(state.settings.goalMl),
    },
  };
}

export function dayTotal(day) {
  if (!day?.entries) return 0;
  return day.entries.reduce((sum, entry) => sum + entry.ml, 0);
}

function newId(today) {
  return `${today.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function addWater(state, ml, today = new Date()) {
  const parsed = parseAmount(ml);
  if (!parsed.ok) throw new Error(parsed.message);
  const next = ensureToday(state, today);
  const key = dateKey(today);
  const day = next.days[key];
  const entry = { id: newId(today), ml: parsed.value, at: today.toISOString() };
  return {
    ...next,
    days: {
      ...next.days,
      [key]: { ...day, entries: [...day.entries, entry] },
    },
  };
}

export function undoLast(state, today = new Date()) {
  const key = dateKey(today);
  const day = state.days[key];
  if (!day?.entries?.length) return state;
  return {
    ...state,
    days: {
      ...state.days,
      [key]: { ...day, entries: day.entries.slice(0, -1) },
    },
  };
}

export function setSupplement(state, field, value, today = new Date()) {
  if (field !== 'creatine' && field !== 'vitaminD') throw new Error('Suplemento desconhecido');
  const next = ensureToday(state, today);
  const key = dateKey(today);
  return {
    ...next,
    days: {
      ...next.days,
      [key]: { ...next.days[key], [field]: Boolean(value) },
    },
  };
}

export function setGoal(state, goalMl, today = new Date()) {
  const parsed = parseGoal(goalMl);
  if (!parsed.ok) throw new Error(parsed.message);
  const key = dateKey(today);
  const days = { ...state.days };
  if (days[key]) days[key] = { ...days[key], goalMl: parsed.value };
  return {
    ...state,
    settings: { ...state.settings, goalMl: parsed.value },
    days,
  };
}

export function completeOnboarding(state, goalMl, today = new Date()) {
  const parsed = parseGoal(goalMl);
  if (!parsed.ok) throw new Error(parsed.message);
  const next = {
    ...state,
    onboarded: true,
    settings: { ...state.settings, goalMl: parsed.value },
  };
  return ensureToday(next, today);
}

export function withReminders(state, reminders) {
  return {
    ...state,
    settings: {
      ...state.settings,
      reminders: sanitizeReminders(reminders),
    },
  };
}

export function historyDays(state, today = new Date()) {
  const todayKey = dateKey(today);
  return Object.keys(state.days)
    .filter((key) => key < todayKey)
    .filter((key) => {
      const day = state.days[key];
      return day.entries.length > 0 || day.creatine || day.vitaminD;
    })
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => {
      const day = state.days[key];
      return { key, ...day, total: dayTotal(day) };
    });
}

export function reminderSchedule(settings) {
  const reminders = sanitizeReminders(settings?.reminders);
  const items = [];
  if (reminders.water.enabled) {
    for (const time of reminders.water.times) {
      items.push({
        id: `water-${time}`,
        kind: 'water',
        time,
        title: 'Hora da água',
        body: 'Que tal um copo agora? Pequenos goles somam a meta do dia.',
      });
    }
  }
  if (reminders.creatine.enabled) {
    items.push({
      id: `creatine-${reminders.creatine.time}`,
      kind: 'creatine',
      time: reminders.creatine.time,
      title: 'Hora da creatina',
      body: 'Hora de tomar a creatina. Marque no Hidrata quando tomar.',
    });
  }
  if (reminders.vitaminD.enabled) {
    items.push({
      id: `vitaminD-${reminders.vitaminD.time}`,
      kind: 'vitaminD',
      time: reminders.vitaminD.time,
      title: 'Hora da vitamina D',
      body: 'Hora de tomar a vitamina D. Marque no Hidrata quando tomar.',
    });
  }
  return items;
}

export function dueReminders(state, now = new Date(), graceMs = FOREGROUND_GRACE_MS) {
  const key = dateKey(now);
  const sent = new Set(state.notified?.[key] || []);
  const due = [];
  for (const item of reminderSchedule(state.settings)) {
    if (sent.has(item.id)) continue;
    const [hour, minute] = item.time.split(':').map(Number);
    const when = new Date(now);
    when.setHours(hour, minute, 0, 0);
    const late = now.getTime() - when.getTime();
    if (late >= 0 && late <= graceMs) due.push(item);
  }
  return due;
}

export function markNotified(state, ids, now = new Date()) {
  if (!ids?.length) return state;
  const key = dateKey(now);
  const prev = state.notified[key] || [];
  return {
    ...state,
    notified: {
      ...state.notified,
      [key]: [...new Set([...prev, ...ids])],
    },
  };
}

export function mergeNotified(current = {}, incoming = {}) {
  const out = { ...current };
  for (const [key, ids] of Object.entries(incoming || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Array.isArray(ids)) continue;
    out[key] = [...new Set([...(out[key] || []), ...ids.filter((id) => typeof id === 'string')])];
  }
  return out;
}

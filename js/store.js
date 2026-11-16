import { normalizeState, pruneState } from './logic.js';

export {
  addWater,
  BACKGROUND_GRACE_MS,
  completeOnboarding,
  dateKey,
  dayTotal,
  DEFAULT_GOAL_ML,
  defaultState,
  dueReminders,
  ensureToday,
  FOREGROUND_GRACE_MS,
  formatHistoryDate,
  formatLongDate,
  formatMl,
  historyDays,
  litersLabel,
  markNotified,
  mergeNotified,
  normalizeState,
  parseAmount,
  parseGoal,
  percentOf,
  pruneState,
  reminderSchedule,
  setGoal,
  setSupplement,
  undoLast,
  withReminders,
} from './logic.js';

const STORAGE_KEY = 'hidrata.v1';

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeState(null);
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(null);
  }
}

export function saveState(state) {
  const pruned = pruneState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  return pruned;
}

export { STORAGE_KEY };

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addWater,
  completeOnboarding,
  dateKey,
  dayTotal,
  defaultState,
  dueReminders,
  ensureToday,
  historyDays,
  litersLabel,
  markNotified,
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
  FOREGROUND_GRACE_MS,
} from '../js/logic.js';

const morning = new Date(2026, 10, 16, 9, 30);

test('a meta padrão é 2.000 ml e o primeiro uso ainda não foi concluído', () => {
  const state = defaultState();
  assert.equal(state.onboarded, false);
  assert.equal(state.settings.goalMl, 2000);
  assert.equal(litersLabel(2000), '2 litros');
  assert.equal(litersLabel(1500), '1,5 litros');
});

test('a primeira abertura grava a meta e abre o dia', () => {
  const state = completeOnboarding(defaultState(), '2000', morning);
  assert.equal(state.onboarded, true);
  assert.equal(state.settings.goalMl, 2000);
  assert.equal(state.days[dateKey(morning)].goalMl, 2000);
  assert.equal(dayTotal(state.days[dateKey(morning)]), 0);
});

test('rejeita meta e quantidade fora da faixa', () => {
  assert.equal(parseGoal('100').ok, false);
  assert.equal(parseGoal('8001').ok, false);
  assert.equal(parseGoal('2.000').ok, false);
  assert.equal(parseGoal('2500').value, 2500);
  assert.equal(parseAmount('5').ok, false);
  assert.equal(parseAmount('250').value, 250);
});

test('soma goles, desfaz só o último e não mistura o dia seguinte', () => {
  let state = completeOnboarding(defaultState(), 2000, morning);
  state = addWater(state, 100, morning);
  state = addWater(state, 250, morning);
  const key = dateKey(morning);
  assert.equal(dayTotal(state.days[key]), 350);
  state = undoLast(state, morning);
  assert.equal(dayTotal(state.days[key]), 100);
  assert.equal(state.days[key].entries.length, 1);

  const nextDay = new Date(2026, 10, 17, 0, 5);
  state = ensureToday(state, nextDay);
  assert.equal(dayTotal(state.days[dateKey(nextDay)]), 0);
  assert.equal(state.days[dateKey(nextDay)].creatine, false);
  assert.equal(dayTotal(state.days[key]), 100);
});

test('creatina e vitamina D ficam só no dia marcado', () => {
  let state = completeOnboarding(defaultState(), 2000, morning);
  state = setSupplement(state, 'creatine', true, morning);
  state = setSupplement(state, 'vitaminD', true, morning);
  const later = new Date(2026, 10, 18, 8);
  state = setSupplement(state, 'creatine', false, later);
  assert.equal(state.days['2026-11-16'].creatine, true);
  assert.equal(state.days['2026-11-16'].vitaminD, true);
  assert.equal(state.days['2026-11-18'].creatine, false);
  assert.equal(state.days['2026-11-18'].vitaminD, false);
});

test('mudar a meta atualiza hoje e preserva o dia anterior', () => {
  const yesterday = new Date(2026, 10, 15, 12);
  let state = completeOnboarding(defaultState(), 2000, yesterday);
  state = addWater(state, 500, yesterday);
  const today = new Date(2026, 10, 16, 12);
  state = ensureToday(state, today);
  state = setGoal(state, 2500, today);
  assert.equal(state.days['2026-11-15'].goalMl, 2000);
  assert.equal(state.days['2026-11-16'].goalMl, 2500);
  assert.equal(state.settings.goalMl, 2500);
  assert.equal(percentOf(500, 2000), 25);
});

test('o histórico esconde o dia de hoje e dias vazios', () => {
  let state = completeOnboarding(defaultState(), 2000, morning);
  state = addWater(state, 100, new Date(2026, 10, 14, 11));
  state = ensureToday(state, new Date(2026, 10, 15, 11));
  const history = historyDays(state, morning);
  assert.deepEqual(history.map((day) => day.key), ['2026-11-14']);
});

test('lembrete atrasado dentro da janela dispara uma vez', () => {
  const now = new Date(2026, 10, 16, 12, 30);
  let state = defaultState();
  state = withReminders(state, {
    water: { enabled: true, times: ['09:00', '12:00', '15:00'] },
    creatine: { enabled: false, time: '08:00' },
    vitaminD: { enabled: true, time: '12:10' },
  });
  state = markNotified(state, ['water-12:00'], now);
  const due = dueReminders(state, now, FOREGROUND_GRACE_MS);
  assert.deepEqual(
    due.map((item) => item.id),
    ['vitaminD-12:10'],
  );
  const later = dueReminders(markNotified(state, ['vitaminD-12:10'], now), now);
  assert.equal(later.length, 0);
});

test('horário futuro e lembrete desligado ficam de fora', () => {
  const now = new Date(2026, 10, 16, 8, 30);
  const state = withReminders(defaultState(), {
    water: { enabled: true, times: ['09:00'] },
    creatine: { enabled: false, time: '08:00' },
    vitaminD: { enabled: true, time: '10:00' },
  });
  assert.deepEqual(dueReminders(state, now).map((item) => item.id), []);
  const titles = reminderSchedule(state.settings).map((item) => item.title);
  assert.deepEqual(titles, ['Hora da água', 'Hora da vitamina D']);
});

test('normaliza dados salvos e esquece dias antigos', () => {
  const raw = normalizeState({
    onboarded: true,
    settings: { goalMl: '2000', reminders: { water: { enabled: true, times: ['8:00', '8:00', 'bad'] } } },
    days: { 'nao-data': { entries: [] }, '2026-11-01': { goalMl: 1800, entries: [{ ml: 200 }], creatine: 1 } },
    notified: { '2026-11-01': ['water-08:00', 3] },
  });
  assert.equal(raw.onboarded, true);
  assert.deepEqual(raw.settings.reminders.water.times, ['08:00']);
  assert.equal(raw.days['2026-11-01'].creatine, true);
  assert.equal(raw.days['2026-11-01'].entries[0].ml, 200);
  assert.deepEqual(raw.notified['2026-11-01'], ['water-08:00']);

  const today = new Date(2026, 10, 16);
  const pruned = pruneState(
    {
      ...raw,
      days: { ...raw.days, '2020-01-01': raw.days['2026-11-01'] },
      notified: { ...raw.notified, '2020-01-01': ['x'] },
    },
    today,
  );
  assert.equal(pruned.days['2020-01-01'], undefined);
  assert.ok(pruned.days['2026-11-01']);
  assert.equal(pruned.notified['2020-01-01'], undefined);
});

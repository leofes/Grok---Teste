import { dayTotal, formatHistoryDate, formatLongDate, formatMl, historyDays, litersLabel, parseGoal, percentOf } from './logic.js';

const BOTTLE_TOP = 50;
const BOTTLE_BOTTOM = 364;

let handlers = {};
let view = 'today';
let shownRatio = 0;
let fillFrame = 0;
let booted = false;
let lastAnnouncement = '';

export function init(nextHandlers) {
  handlers = nextHandlers;
  bindStatic();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('#bottle animateTransform').forEach((node) => node.remove());
  }
  showView('today', { focus: false });
}

export function render(state, env) {
  const onboarding = !state.onboarded;
  document.getElementById('onboarding').hidden = !onboarding;
  document.getElementById('app').hidden = onboarding;
  document.getElementById('boot').hidden = true;

  if (onboarding) {
    updateLitersHint('onboard-goal', 'onboard-hint', 'Você pode mudar isso depois, em Ajustes.');
    return;
  }

  document.getElementById('today-date').textContent = formatLongDate(new Date());
  renderToday(state);
  renderHistory(state);
  renderSettings(state, env);
  renderToast(env.toast);
  if (!booted) booted = true;
}

function bindStatic() {
  document.getElementById('onboard-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const message = handlers.onOnboard(document.getElementById('onboard-goal').value);
    document.getElementById('onboard-error').textContent = message || '';
  });
  document.getElementById('onboard-goal').addEventListener('input', () => {
    updateLitersHint('onboard-goal', 'onboard-hint', 'Você pode mudar isso depois, em Ajustes.');
  });
  document.getElementById('onboard-goal').addEventListener('focus', (event) => {
    event.target.select();
  });

  document.querySelector('.adds').addEventListener('click', (event) => {
    const button = event.target.closest('[data-add]');
    if (!button) return;
    handlers.onAdd(Number(button.dataset.add));
  });

  document.getElementById('custom-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.getElementById('custom-ml');
    const message = handlers.onCustom(input.value);
    document.getElementById('custom-error').textContent = message || '';
    if (!message) input.value = '';
  });

  document.getElementById('undo').addEventListener('click', () => handlers.onUndo());
  document.getElementById('btn-creatine').addEventListener('click', () => {
    const next = document.getElementById('btn-creatine').getAttribute('aria-checked') !== 'true';
    handlers.onToggle('creatine', next);
  });
  document.getElementById('btn-vitamin').addEventListener('click', () => {
    const next = document.getElementById('btn-vitamin').getAttribute('aria-checked') !== 'true';
    handlers.onToggle('vitaminD', next);
  });

  document.querySelectorAll('.tabbar button').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view, { focus: true }));
  });

  document.getElementById('goal-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const message = handlers.onSaveGoal(document.getElementById('goal-input').value);
    document.getElementById('goal-error').textContent = message || '';
  });
  document.getElementById('goal-input').addEventListener('input', () => {
    updateLitersHint('goal-input', 'goal-hint', '');
  });

  document.getElementById('remind-water').addEventListener('change', (event) => {
    handlers.onToggleReminder('water', event.target.checked);
  });
  document.getElementById('remind-creatine').addEventListener('change', (event) => {
    handlers.onToggleReminder('creatine', event.target.checked);
  });
  document.getElementById('remind-vitamin').addEventListener('change', (event) => {
    handlers.onToggleReminder('vitaminD', event.target.checked);
  });
  document.getElementById('creatine-time').addEventListener('change', (event) => {
    handlers.onReminderTime('creatine', event.target.value);
  });
  document.getElementById('vitamin-time').addEventListener('change', (event) => {
    handlers.onReminderTime('vitaminD', event.target.value);
  });
  document.getElementById('add-time').addEventListener('click', () => {
    handlers.onWaterTimeAdd(document.getElementById('new-time').value);
  });
  document.getElementById('water-times').addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-time]');
    if (!button) return;
    handlers.onWaterTimeRemove(button.dataset.removeTime);
  });
  document.getElementById('enable-notifications').addEventListener('click', () => handlers.onEnableNotifications());
  document.getElementById('test-notification').addEventListener('click', () => handlers.onTestNotification());
  document.getElementById('install-button').addEventListener('click', () => handlers.onInstall());
}

function showView(name, { focus }) {
  view = name;
  for (const id of ['today', 'history', 'settings']) {
    document.getElementById(`view-${id}`).hidden = id !== name;
  }
  document.body.dataset.view = name;
  document.querySelectorAll('.tabbar button').forEach((button) => {
    const current = button.dataset.view === name;
    if (current) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (focus) {
    const heading = document.querySelector(`#view-${name} h2`);
    heading?.focus();
  }
}

function renderToday(state) {
  const key = todayKey();
  const day = state.days[key];
  const total = dayTotal(day);
  const goal = day?.goalMl || state.settings.goalMl;
  const percent = percentOf(total, goal);
  const complete = total >= goal && goal > 0;
  const ratio = goal > 0 ? Math.min(total / goal, 1) : 0;

  document.getElementById('total').textContent = formatMl(total);
  document.getElementById('goal-line').textContent = `de ${formatMl(goal)} ml`;
  const status = document.getElementById('hero-status');
  status.textContent = complete ? 'Meta batida' : `${percent}% da meta`;
  document.getElementById('hero-card').classList.toggle('is-complete', complete);
  status.classList.toggle('is-complete', complete);

  const meter = document.getElementById('meter');
  meter.setAttribute('aria-valuemax', String(goal));
  meter.setAttribute('aria-valuenow', String(Math.min(total, goal)));
  meter.setAttribute('aria-valuetext', `${formatMl(total)} de ${formatMl(goal)} mililitros`);
  document.getElementById('meter-bar').style.width = `${Math.min(percent, 100)}%`;

  const entries = day?.entries || [];
  const count = document.getElementById('entry-count');
  if (!entries.length) {
    count.textContent = 'Nenhum gole registrado hoje';
  } else {
    const last = entries[entries.length - 1];
    const records = entries.length === 1 ? '1 registro' : `${entries.length} registros`;
    count.textContent = `${records} · último ${formatMl(last.ml)} ml`;
  }

  const undo = document.getElementById('undo');
  undo.disabled = entries.length === 0;

  setCheck('btn-creatine', Boolean(day?.creatine), 'Marcado hoje', 'Toque para marcar o dia');
  setCheck('btn-vitamin', Boolean(day?.vitaminD), 'Marcado hoje', 'Toque para marcar o dia');
  animateFill(ratio, booted);

  if (booted) {
    const phrase = complete
      ? `${formatMl(total)} mililitros. Meta de ${formatMl(goal)} batida.`
      : `${formatMl(total)} mililitros de ${formatMl(goal)}. ${percent}% da meta.`;
    announce(phrase);
  }
}

function renderHistory(state) {
  const list = document.getElementById('history-list');
  const days = historyDays(state, new Date());
  if (!days.length) {
    list.innerHTML = '<p class="empty">Nenhum dia anterior ainda. A partir de amanhã, o que você registrar aparece aqui.</p>';
    return;
  }
  list.innerHTML = days
    .map((day) => {
      const percent = percentOf(day.total, day.goalMl);
      const width = Math.min(percent, 100);
      return `<article class="day">
        <header class="day-top">
          <h3>${escapeHtml(formatHistoryDate(day.key))}</h3>
          <p>${formatMl(day.total)} ml <span>de ${formatMl(day.goalMl)}</span></p>
        </header>
        <div class="mini-meter" aria-hidden="true"><span style="width:${width}%"></span></div>
        <p class="day-meta">${percent}% da meta</p>
        <div class="chips">
          <span class="chip ${day.creatine ? 'on' : ''}">Creatina ${day.creatine ? '✓' : '—'}</span>
          <span class="chip ${day.vitaminD ? 'on vitamin' : ''}">Vitamina D ${day.vitaminD ? '✓' : '—'}</span>
        </div>
      </article>`;
    })
    .join('');
}

function renderSettings(state, env) {
  const goalInput = document.getElementById('goal-input');
  if (document.activeElement !== goalInput) goalInput.value = String(state.settings.goalMl);
  if (document.activeElement !== goalInput) {
    updateLitersHint('goal-input', 'goal-hint', '');
  }

  const reminders = state.settings.reminders;
  setSwitch('remind-water', reminders.water.enabled);
  setSwitch('remind-creatine', reminders.creatine.enabled);
  setSwitch('remind-vitamin', reminders.vitaminD.enabled);

  const creatineTime = document.getElementById('creatine-time');
  const vitaminTime = document.getElementById('vitamin-time');
  if (document.activeElement !== creatineTime) creatineTime.value = reminders.creatine.time;
  if (document.activeElement !== vitaminTime) vitaminTime.value = reminders.vitaminD.time;

  const times = reminders.water.times;
  const list = document.getElementById('water-times');
  if (!times.length) {
    list.innerHTML = '<li class="time-empty">Nenhum horário. Adicione um para avisar.</li>';
  } else {
    list.innerHTML = times
      .map(
        (time) => `<li>
          <span>${escapeHtml(time)}</span>
          <button type="button" data-remove-time="${escapeHtml(time)}" aria-label="Remover horário ${escapeHtml(time)}">Remover</button>
        </li>`,
      )
      .join('');
  }

  const permissionText = document.getElementById('permission-text');
  const enable = document.getElementById('enable-notifications');
  const test = document.getElementById('test-notification');
  if (env.permission === 'unsupported') {
    permissionText.textContent = 'Este navegador não mostra notificações. O restante do app funciona normalmente.';
    enable.hidden = true;
    test.hidden = true;
  } else if (env.permission === 'denied') {
    permissionText.textContent = 'As notificações estão bloqueadas para este site. Libere nas configurações do navegador para receber os lembretes.';
    enable.hidden = true;
    test.hidden = true;
  } else if (env.permission === 'granted') {
    permissionText.textContent = 'Notificações permitidas. Com o Hidrata aberto, o aviso sai no horário marcado.';
    enable.hidden = true;
    test.hidden = false;
  } else {
    permissionText.textContent = 'Permita as notificações para receber os lembretes nos horários abaixo.';
    enable.hidden = false;
    test.hidden = true;
  }

  const installText = document.getElementById('install-text');
  const installButton = document.getElementById('install-button');
  if (env.standalone) {
    installText.textContent = 'O Hidrata já está na sua tela de início.';
    installButton.hidden = true;
  } else if (env.installAvailable) {
    installText.textContent = 'Instale para abrir em tela cheia, como um aplicativo.';
    installButton.hidden = false;
  } else if (env.ios) {
    installText.textContent = 'No iPhone, abra no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.';
    installButton.hidden = true;
  } else {
    installText.textContent = 'No Chrome ou no Edge, abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial.';
    installButton.hidden = true;
  }
}

function renderToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message || '';
  toast.hidden = !message;
}

function setCheck(id, on, onText, offText) {
  const button = document.getElementById(id);
  button.setAttribute('aria-checked', on ? 'true' : 'false');
  button.querySelector('small').textContent = on ? onText : offText;
}

function setSwitch(id, on) {
  const input = document.getElementById(id);
  if (document.activeElement === input) return;
  input.checked = on;
}

function updateLitersHint(inputId, hintId, suffix) {
  const parsed = parseGoal(document.getElementById(inputId).value);
  const hint = document.getElementById(hintId);
  if (!parsed.ok) {
    hint.textContent = suffix || 'Entre 250 e 8.000 ml.';
    return;
  }
  const liters = litersLabel(parsed.value);
  hint.textContent = suffix ? `${liters}. ${suffix}` : liters;
}

function announce(text) {
  if (text === lastAnnouncement) return;
  lastAnnouncement = text;
  document.getElementById('live').textContent = text;
}

function animateFill(target, animate) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const to = Math.max(0, Math.min(1, target));
  if (!animate || reduce) {
    cancelAnimationFrame(fillFrame);
    shownRatio = to;
    applyFill(to);
    return;
  }
  const from = shownRatio;
  if (Math.abs(from - to) < 0.001) {
    applyFill(to);
    return;
  }
  cancelAnimationFrame(fillFrame);
  const start = performance.now();
  const duration = 700;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    shownRatio = from + (to - from) * eased;
    applyFill(shownRatio);
    if (t < 1) fillFrame = requestAnimationFrame(step);
  };
  fillFrame = requestAnimationFrame(step);
}

function applyFill(ratio) {
  const height = (BOTTLE_BOTTOM - BOTTLE_TOP) * ratio;
  const y = BOTTLE_BOTTOM - height;
  const group = document.getElementById('water');
  const rect = document.getElementById('water-rect');
  group.setAttribute('transform', `translate(0 ${y})`);
  rect.setAttribute('height', String(Math.max(height, 0) + 30));
  group.style.opacity = ratio <= 0.001 ? '0' : '1';
}

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

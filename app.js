'use strict';
/* ============================================================
   app.js  — UI controller for Turing Machine Simulator
   ============================================================ */

// ── State ─────────────────────────────────────────────────────
let currentMachineKey = 'palindrome';
let sim               = null;
let runTimer          = null;
let isRunning         = false;

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  buildMachineCards();
  selectMachine('palindrome');
  renderTapeInit();
  updateSpeedLabel();
});

// ── Machine cards ─────────────────────────────────────────────
function buildMachineCards() {
  const grid = document.getElementById('machine-grid');
  grid.innerHTML = '';
  Object.entries(Machines).forEach(([key, m]) => {
    const card = document.createElement('div');
    card.className = 'machine-card' + (key === currentMachineKey ? ' active' : '');
    card.id = `card-${key}`;
    card.onclick = () => selectMachine(key);
    card.innerHTML = `
      <div class="mc-emoji">${m.emoji}</div>
      <div class="mc-info">
        <div class="mc-label">${m.label}</div>
        <div class="mc-alpha">Σ = { ${m.alphabet} }</div>
      </div>`;
    grid.appendChild(card);
  });
}

function selectMachine(key) {
  stopRun();
  currentMachineKey = key;
  sim = null;

  // highlight card
  document.querySelectorAll('.machine-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`card-${key}`)?.classList.add('active');

  const m = Machines[key];

  // description
  document.getElementById('machine-desc').textContent = m.description;

  // alphabet hint
  document.getElementById('alpha-hint').textContent = `Allowed: ${m.alphabet}`;

  // examples
  const ul = document.getElementById('examples-list');
  ul.innerHTML = m.examples.map(e =>
    `<li><code>${e.input || 'ε'}</code> <span class="arrow">→</span> <span class="ex-result">${e.expected}</span></li>`
  ).join('');

  // transition table
  buildTransitionTable(key);

  // reset tape & log
  renderTapeInit();
  clearLog();
  setBadge('READY', '');
  document.getElementById('result-banner').className = 'result-banner hidden';
  setButtons(false);
}

// ── Transition table ──────────────────────────────────────────
function buildTransitionTable(key) {
  const machine = Machines[key].build();
  const tbody   = document.getElementById('trans-body');
  tbody.innerHTML = '';
  for (const [k, t] of machine.transitions) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="state-chip">${t.fromState.name}</span></td>
      <td><span class="sym">${esc(t.readSymbol)}</span></td>
      <td><span class="state-chip">${t.toState.name}</span></td>
      <td><span class="sym">${esc(t.writeSymbol)}</span></td>
      <td><span class="dir dir-${t.direction}">${t.direction}</span></td>`;
    tbody.appendChild(tr);
  }
}

// ── Tab navigation ────────────────────────────────────────────
function showTab(id) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${id}`).classList.add('active');
  document.getElementById(`nav-${id}`).classList.add('active');
}

// ── Simulation controls ───────────────────────────────────────
function initSim() {
  const input = document.getElementById('input-string').value.trim();
  const limit = parseInt(document.getElementById('step-limit').value) || 10000;
  const machine = Machines[currentMachineKey].build();
  sim = new Simulator(machine, limit);
  sim.initialise(input);
  clearLog();
  document.getElementById('result-banner').className = 'result-banner hidden';
  setBadge('RUNNING', 'running');
}

function startRun() {
  try { initSim(); } catch (e) { showError(e.message); return; }
  setButtons(true);
  isRunning = true;
  tick();
}

function tick() {
  if (!isRunning || !sim || sim.halted) { finishRun(); return; }
  const delay = 1050 - parseInt(document.getElementById('speed-range').value);
  const rec = sim.step();
  if (rec) { renderTape(sim); appendLog(rec, sim.machine); }
  if (sim.halted) { finishRun(); return; }
  runTimer = setTimeout(tick, delay);
}

function finishRun() {
  isRunning = false;
  clearTimeout(runTimer);
  setButtons(false);
  if (!sim) return;
  if (sim.aborted) {
    setBadge('LIMIT', 'limit');
    showBanner('Step limit reached — possible infinite loop', 'limit');
  } else if (sim.isAccepted()) {
    setBadge('ACCEPTED ✓', 'accept');
    showBanner('✓  ACCEPTED', 'accept');
  } else {
    setBadge('REJECTED ✗', 'reject');
    showBanner('✗  REJECTED', 'reject');
  }
}

function doStep() {
  if (!sim) {
    try { initSim(); } catch (e) { showError(e.message); return; }
    setButtons(false);
    document.getElementById('btn-pause').disabled = true;
  }
  if (sim.halted) return;
  const rec = sim.step();
  if (rec) { renderTape(sim); appendLog(rec, sim.machine); }
  if (sim.halted) finishRun();
}

function pauseRun() {
  isRunning = false;
  clearTimeout(runTimer);
  setButtons(false);
  setBadge('PAUSED', 'paused');
}

function resetSim() {
  stopRun();
  sim = null;
  renderTapeInit();
  clearLog();
  setBadge('READY', '');
  document.getElementById('result-banner').className = 'result-banner hidden';
}

function stopRun() {
  isRunning = false;
  clearTimeout(runTimer);
}

function setButtons(running) {
  document.getElementById('btn-run').disabled   = running;
  document.getElementById('btn-step').disabled  = running;
  document.getElementById('btn-pause').disabled = !running;
  document.getElementById('btn-reset').disabled = false;
}

// ── Tape renderer ─────────────────────────────────────────────
function renderTapeInit() {
  const input = document.getElementById('input-string').value.trim();
  if (!input) { renderBlankTape(); return; }
  // show input on tape without simulating
  const fakeCells = [];
  for (let i = -2; i < input.length + 2; i++) {
    const ch = (i >= 0 && i < input.length) ? input[i] : BLANK;
    fakeCells.push({ pos: i, symbol: ch, isHead: i === 0 });
  }
  drawTape(fakeCells);
  document.getElementById('meta-state').textContent = 'State: start';
  document.getElementById('meta-step').textContent  = 'Step: 0';
  document.getElementById('meta-head').textContent  = 'Head: 0';
  document.getElementById('meta-read').textContent  = 'Read: —';
}

function renderBlankTape() {
  const cells = [];
  for (let i = -4; i <= 4; i++) cells.push({ pos: i, symbol: BLANK, isHead: i === 0 });
  drawTape(cells);
  document.getElementById('meta-state').textContent = 'State: —';
  document.getElementById('meta-step').textContent  = 'Step: 0';
  document.getElementById('meta-head').textContent  = 'Head: 0';
  document.getElementById('meta-read').textContent  = 'Read: —';
}

function renderTape(s) {
  drawTape(s.tape.getWindow(4));
  document.getElementById('meta-state').textContent = `State: ${s.currentState.name}`;
  document.getElementById('meta-step').textContent  = `Step: ${s.stepCount}`;
  document.getElementById('meta-head').textContent  = `Head: ${s.tape.getHeadPosition()}`;
  const last = s.history[s.history.length - 1];
  document.getElementById('meta-read').textContent  = `Read: ${last ? dispSym(last.read) : '—'}`;
}

function drawTape(cells) {
  const container = document.getElementById('tape-cells');
  container.innerHTML = '';
  cells.forEach(c => {
    const div = document.createElement('div');
    div.className = 'tape-cell' + (c.isHead ? ' head' : '') + (c.symbol === BLANK ? ' blank' : '');
    div.dataset.pos = c.pos;
    if (c.isHead) {
      div.innerHTML = `<span class="cell-sym">${dispSym(c.symbol)}</span><span class="head-arrow">▲</span>`;
    } else {
      div.innerHTML = `<span class="cell-sym">${dispSym(c.symbol)}</span>`;
    }
    container.appendChild(div);
  });
  // scroll head into view
  const headEl = container.querySelector('.head');
  if (headEl) headEl.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' });
}

// ── Execution log ─────────────────────────────────────────────
function appendLog(rec, machine) {
  const tbody  = document.getElementById('log-body');
  const empty  = document.getElementById('log-empty');
  if (empty) empty.style.display = 'none';

  const stateRole = rec.state.role;
  const roleClass = stateRole === Role.ACCEPT ? 'accept' : stateRole === Role.REJECT ? 'reject' : '';

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="log-num">${rec.step}</td>
    <td><span class="state-chip ${roleClass}">${rec.state.name}</span></td>
    <td><span class="sym">${dispSym(rec.read)}</span></td>
    <td>${rec.head}</td>
    <td class="log-tape"><code>${rec.tape}</code></td>
    <td class="log-trans">${rec.transition ? `→ ${rec.transition.toState.name}, write '${dispSym(rec.transition.writeSymbol)}', ${rec.transition.direction}` : '<span class="no-trans">no rule</span>'}</td>`;

  // highlight accepted/rejected row
  if (stateRole === Role.ACCEPT) tr.style.background = 'rgba(52,211,153,0.08)';
  if (stateRole === Role.REJECT) tr.style.background = 'rgba(248,113,113,0.08)';

  tbody.appendChild(tr);
  const logContainer = document.getElementById('log-container');
  logContainer.scrollTop = logContainer.scrollHeight;
}

function clearLog() {
  document.getElementById('log-body').innerHTML = '';
  document.getElementById('log-empty').style.display = 'block';
}

// ── UI helpers ─────────────────────────────────────────────────
function setBadge(text, cls) {
  const b = document.getElementById('status-badge');
  b.textContent = text;
  b.className   = `status-badge${cls ? ' ' + cls : ''}`;
}

function showBanner(msg, type) {
  const b = document.getElementById('result-banner');
  b.textContent = msg;
  b.className   = `result-banner ${type}`;
}

function showError(msg) {
  const b = document.getElementById('result-banner');
  b.textContent = '⚠ ' + msg;
  b.className   = 'result-banner error';
}

function updateSpeedLabel() {
  const v   = parseInt(document.getElementById('speed-range').value);
  const ms  = 1050 - v;
  document.getElementById('speed-val').textContent = ms + ' ms/step';
}

function clearInput() {
  document.getElementById('input-string').value = '';
  resetSim();
}

function dispSym(s) {
  if (!s || s === BLANK) return '⎵';
  return esc(s);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Input preview on type ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('input-string').addEventListener('input', () => {
    if (!isRunning) renderTapeInit();
  });
});

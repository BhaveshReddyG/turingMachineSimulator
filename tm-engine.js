'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const BLANK = '_';
const Role = Object.freeze({ NORMAL: 'NORMAL', ACCEPT: 'ACCEPT', REJECT: 'REJECT' });

// ─── TMState ──────────────────────────────────────────────────────────────────
class TMState {
  constructor(name, role = Role.NORMAL) {
    this.name = name.trim();
    this.role = role;
  }
  isAccept()  { return this.role === Role.ACCEPT; }
  isReject()  { return this.role === Role.REJECT; }
  isHalting() { return this.isAccept() || this.isReject(); }
  toString()  { return this.name; }
}

// ─── Tape ─────────────────────────────────────────────────────────────────────
class Tape {
  constructor(input = '') {
    this._cells = new Map();
    this._head  = 0;
    for (let i = 0; i < input.length; i++) this._cells.set(i, input[i]);
  }

  read()   { return this._cells.get(this._head) ?? BLANK; }
  write(s) { s === BLANK ? this._cells.delete(this._head) : this._cells.set(this._head, s); }
  move(d)  { if (d === 'L') this._head--; else if (d === 'R') this._head++; }

  getHeadPosition() { return this._head; }

  getTapeContent() {
    if (this._cells.size === 0) return BLANK;
    const keys = [...this._cells.keys()];
    let s = '';
    for (let i = Math.min(...keys); i <= Math.max(...keys); i++)
      s += this._cells.get(i) ?? BLANK;
    return s;
  }

  getWindow(padding = 4) {
    const keys = [...this._cells.keys()];
    let min = this._head, max = this._head;
    if (keys.length > 0) {
      min = Math.min(this._head, Math.min(...keys));
      max = Math.max(this._head, Math.max(...keys));
    }
    min -= padding; max += padding;
    const cells = [];
    for (let i = min; i <= max; i++)
      cells.push({ pos: i, symbol: this._cells.get(i) ?? BLANK, isHead: i === this._head });
    return cells;
  }

  clone() {
    const t = new Tape();
    t._cells = new Map(this._cells);
    t._head  = this._head;
    return t;
  }
}

// ─── Transition ───────────────────────────────────────────────────────────────
class Transition {
  constructor(fromState, readSymbol, toState, writeSymbol, direction) {
    this.fromState   = fromState;
    this.readSymbol  = readSymbol;
    this.toState     = toState;
    this.writeSymbol = writeSymbol;
    this.direction   = direction;
  }
  static parseDir(s) {
    const u = s.trim().toUpperCase();
    if (u === 'L' || u === 'LEFT')  return 'L';
    if (u === 'R' || u === 'RIGHT') return 'R';
    if (u === 'S' || u === 'STAY')  return 'S';
    throw new Error(`Invalid direction '${s}'.`);
  }
  toString() {
    return `(${this.fromState.name}, '${this.readSymbol}') → (${this.toState.name}, '${this.writeSymbol}', ${this.direction})`;
  }
}

// ─── TuringMachine + Builder ──────────────────────────────────────────────────
class TuringMachine {
  constructor(cfg) { Object.assign(this, cfg); }
  getTransition(state, symbol) {
    return this.transitions.get(`${state.name}|${symbol}`) ?? null;
  }
  validateInput(input) {
    for (const c of input)
      if (!this.inputAlphabet.has(c))
        throw new Error(`'${c}' is not in Σ = {${[...this.inputAlphabet].join(', ')}}`);
  }
  static builder() { return new TMBuilder(); }
}

class TMBuilder {
  constructor() {
    this._name = 'TM'; this._states = new Map(); this._inputAlpha = new Set();
    this._tapeAlpha = new Set(); this._transitions = new Map();
    this._start = null; this._accept = null; this._reject = null;
  }
  name(n)  { this._name = n; return this; }
  addState(n, role = Role.NORMAL) { this._states.set(n, new TMState(n, role)); return this; }
  setStartState(n)  { this._resolve(n); this._start  = this._states.get(n); return this; }
  setAcceptState(n) { this._states.set(n, new TMState(n, Role.ACCEPT)); this._accept = this._states.get(n); return this; }
  setRejectState(n) { this._states.set(n, new TMState(n, Role.REJECT)); this._reject = this._states.get(n); return this; }
  addInputSymbol(c) { this._inputAlpha.add(c); this._tapeAlpha.add(c); return this; }
  addTapeSymbol(c)  { this._tapeAlpha.add(c); return this; }
  addTransition(from, read, to, write, dir) {
    const key = `${from}|${read}`;
    if (this._transitions.has(key)) throw new Error(`Duplicate transition (${from}, '${read}')`);
    this._transitions.set(key, new Transition(this._resolve(from), read, this._resolve(to), write, Transition.parseDir(dir)));
    return this;
  }
  build() {
    if (!this._start || !this._accept || !this._reject) throw new Error('Missing start/accept/reject state.');
    this._tapeAlpha.add(BLANK);
    return new TuringMachine({
      name: this._name, states: new Map(this._states),
      inputAlphabet: new Set(this._inputAlpha), tapeAlphabet: new Set(this._tapeAlpha),
      transitions: new Map(this._transitions),
      startState: this._start, acceptState: this._accept, rejectState: this._reject,
    });
  }
  _resolve(n) { if (!this._states.has(n)) this._states.set(n, new TMState(n)); return this._states.get(n); }
}

// ─── Simulator ────────────────────────────────────────────────────────────────
class Simulator {
  constructor(machine, stepLimit = 10000) {
    this.machine = machine; this.stepLimit = stepLimit; this._clear();
  }
  _clear() { this.tape = null; this.currentState = null; this.stepCount = 0; this.halted = false; this.aborted = false; this.history = []; }
  initialise(input) {
    this.machine.validateInput(input);
    this.tape = new Tape(input); this.currentState = this.machine.startState;
    this.stepCount = 0; this.halted = false; this.aborted = false; this.history = [];
  }
  step() {
    if (!this.tape) throw new Error('Call initialise() first.');
    if (this.halted) return null;
    const read = this.tape.read();
    const t    = this.machine.getTransition(this.currentState, read);
    const rec  = { step: ++this.stepCount, state: this.currentState, tape: this.tape.getTapeContent(), head: this.tape.getHeadPosition(), read, transition: t };
    this.history.push(rec);
    if (this.currentState.isHalting()) { this.halted = true; return rec; }
    if (t) { this.tape.write(t.writeSymbol); this.tape.move(t.direction); this.currentState = t.toState; }
    else   { this.currentState = this.machine.rejectState; this.halted = true; }
    if (this.stepCount >= this.stepLimit && !this.currentState.isHalting()) { this.halted = true; this.aborted = true; }
    if (this.currentState.isHalting()) this.halted = true;
    return rec;
  }
  isAccepted() { return this.halted && this.currentState?.isAccept(); }
  isRejected() { return this.halted && !this.currentState?.isAccept(); }
}

// ─── 4 Predefined Machines ────────────────────────────────────────────────────
const Machines = {

  // ① Palindrome Checker {a, b}
  palindrome: {
    label: 'Palindrome Checker',
    alphabet: 'a, b',
    emoji: '🔁',
    description: 'Accepts strings over {a,b} that read the same forwards and backwards.',
    examples: [
      { input: 'abba',  expected: 'ACCEPT' },
      { input: 'aba',   expected: 'ACCEPT' },
      { input: 'abab',  expected: 'REJECT' },
      { input: 'a',     expected: 'ACCEPT' },
    ],
    build: () => TuringMachine.builder()
      .name('Palindrome Checker')
      .addState('q0').addState('scan_a').addState('scan_b').addState('check_a').addState('check_b').addState('ret')
      .setStartState('q0').setAcceptState('qA').setRejectState('qR')
      .addInputSymbol('a').addInputSymbol('b').addTapeSymbol('X')
      // q0
      .addTransition('q0',     'X', 'q0',     'X', 'R')
      .addTransition('q0',     '_', 'qA',     '_', 'S')
      .addTransition('q0',     'a', 'scan_a', 'X', 'R')
      .addTransition('q0',     'b', 'scan_b', 'X', 'R')
      // scan_a
      .addTransition('scan_a', 'a', 'scan_a', 'a', 'R')
      .addTransition('scan_a', 'b', 'scan_a', 'b', 'R')
      .addTransition('scan_a', 'X', 'scan_a', 'X', 'R')
      .addTransition('scan_a', '_', 'check_a','_', 'L')
      // check_a
      .addTransition('check_a','a', 'ret',    'X', 'L')
      .addTransition('check_a','b', 'qR',     'b', 'S')
      .addTransition('check_a','X', 'check_a','X', 'L')
      .addTransition('check_a','_', 'qA',     '_', 'S')
      // scan_b
      .addTransition('scan_b', 'a', 'scan_b', 'a', 'R')
      .addTransition('scan_b', 'b', 'scan_b', 'b', 'R')
      .addTransition('scan_b', 'X', 'scan_b', 'X', 'R')
      .addTransition('scan_b', '_', 'check_b','_', 'L')
      // check_b
      .addTransition('check_b','b', 'ret',    'X', 'L')
      .addTransition('check_b','a', 'qR',     'a', 'S')
      .addTransition('check_b','X', 'check_b','X', 'L')
      .addTransition('check_b','_', 'qA',     '_', 'S')
      // ret
      .addTransition('ret',    'a', 'ret',    'a', 'L')
      .addTransition('ret',    'b', 'ret',    'b', 'L')
      .addTransition('ret',    'X', 'ret',    'X', 'L')
      .addTransition('ret',    '_', 'q0',     '_', 'R')
      .build(),
  },

  // ② Binary Incrementer {0, 1}
  binary: {
    label: 'Binary Incrementer',
    alphabet: '0, 1',
    emoji: '➕',
    description: 'Adds 1 to a binary number written on the tape (MSB left, LSB right).',
    examples: [
      { input: '101',  expected: '→ 110' },
      { input: '111',  expected: '→ 1000' },
      { input: '0',    expected: '→ 1' },
      { input: '1000', expected: '→ 1001' },
    ],
    build: () => TuringMachine.builder()
      .name('Binary Incrementer')
      .addState('start').addState('inc').addState('done')
      .setStartState('start').setAcceptState('qA').setRejectState('qR')
      .addInputSymbol('0').addInputSymbol('1')
      .addTransition('start','0','start','0','R')
      .addTransition('start','1','start','1','R')
      .addTransition('start','_','inc',  '_','L')
      .addTransition('inc',  '1','inc',  '0','L')
      .addTransition('inc',  '0','done', '1','R')
      .addTransition('inc',  '_','done', '1','R')
      .addTransition('done', '0','done', '0','R')
      .addTransition('done', '1','done', '1','R')
      .addTransition('done', '_','qA',   '_','L')
      .build(),
  },

  // ③ aⁿbⁿ Recognizer {a, b}
  anbn: {
    label: 'aⁿbⁿ Recognizer',
    alphabet: 'a, b',
    emoji: '⚖️',
    description: 'Accepts strings of the form aⁿbⁿ (n ≥ 1) — exactly n copies of a followed by n copies of b.',
    examples: [
      { input: 'ab',     expected: 'ACCEPT' },
      { input: 'aabb',   expected: 'ACCEPT' },
      { input: 'aaabbb', expected: 'ACCEPT' },
      { input: 'aab',    expected: 'REJECT' },
    ],
    build: () => TuringMachine.builder()
      .name('aⁿbⁿ Recognizer')
      .addState('q0').addState('start').addState('matchB').addState('goBack')
      .setStartState('q0').setAcceptState('qA').setRejectState('qR')
      .addInputSymbol('a').addInputSymbol('b').addTapeSymbol('X')
      // q0
      .addTransition('q0',    'a','matchB','X','R')
      .addTransition('q0',    'b','qR',   'b','S')
      .addTransition('q0',    '_','qR',   '_','S')
      .addTransition('q0',    'X','q0',   'X','R')
      // start
      .addTransition('start', 'X','start','X','R')
      .addTransition('start', 'a','matchB','X','R')
      .addTransition('start', 'b','qR',   'b','S')
      .addTransition('start', '_','qA',   '_','S')
      // matchB
      .addTransition('matchB','a','matchB','a','R')
      .addTransition('matchB','X','matchB','X','R')
      .addTransition('matchB','b','goBack','X','L')
      .addTransition('matchB','_','qR',   '_','S')
      // goBack
      .addTransition('goBack','a','goBack','a','L')
      .addTransition('goBack','X','goBack','X','L')
      .addTransition('goBack','b','goBack','b','L')
      .addTransition('goBack','_','start', '_','R')
      .build(),
  },

  // ④ Unary Copy Machine {a}
  unarycopy: {
    label: 'Unary Copy Machine',
    alphabet: 'a',
    emoji: '📋',
    description: 'Copies a unary string over {a} — result is the original a\'s followed by separator b then a duplicate.',
    examples: [
      { input: 'aaa',   expected: 'AAAbaaa' },
      { input: 'aaaaa', expected: 'AAAAAbaaaaa' },
      { input: 'a',     expected: 'Aba' },
      { input: 'aa',    expected: 'AAbbaa' },
    ],
    build: () => TuringMachine.builder()
      .name('Unary Copy Machine')
      .addState('findA').addState('goEnd').addState('intSep').addState('goCopyEnd').addState('goStart')
      .setStartState('findA').setAcceptState('qA').setRejectState('qR')
      .addInputSymbol('a').addTapeSymbol('A').addTapeSymbol('b')
      // findA
      .addTransition('findA',     'A','findA',    'A','R')
      .addTransition('findA',     'a','goEnd',    'A','R')
      .addTransition('findA',     'b','qA',       'b','S')
      .addTransition('findA',     '_','qA',       '_','S')
      // goEnd
      .addTransition('goEnd',     'a','goEnd',    'a','R')
      .addTransition('goEnd',     'A','goEnd',    'A','R')
      .addTransition('goEnd',     'b','goCopyEnd','b','R')
      .addTransition('goEnd',     '_','intSep',   'b','R')
      // intSep
      .addTransition('intSep',    '_','goStart',  'a','L')
      // goCopyEnd
      .addTransition('goCopyEnd', 'a','goCopyEnd','a','R')
      .addTransition('goCopyEnd', '_','goStart',  'a','L')
      // goStart
      .addTransition('goStart',   'a','goStart',  'a','L')
      .addTransition('goStart',   'A','goStart',  'A','L')
      .addTransition('goStart',   'b','goStart',  'b','L')
      .addTransition('goStart',   '_','findA',    '_','R')
      .build(),
  },
};

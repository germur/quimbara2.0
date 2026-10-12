import test from 'node:test';
import assert from 'node:assert/strict';
import { initRoundCursor } from '../src/lib/round-cursor.mjs';
import { initWordmarkMotion } from '../src/lib/wordmark-motion.mjs';

function browser() {
  const classes = () => {
    const values = new Set();
    return {
      add: (...names) => names.forEach(name => values.add(name)),
      remove: (...names) => names.forEach(name => values.delete(name)),
      contains: name => values.has(name),
      toggle: (name, on) => on ? values.add(name) : values.delete(name),
    };
  };
  const element = () => ({ classList: classes(), style: {}, textContent: '' });
  const elements = Object.fromEntries(['rc-cursor', 'rc-pill-position', 'rc-dot', 'rc-time'].map(id => [id, element()]));
  const marks = [element(), element()];
  const doc = Object.assign(new EventTarget(), {
    hidden: false, readyState: 'loading', modal: false,
    documentElement: element(),
    getElementById: id => elements[id],
    querySelector: () => doc.modal ? {} : null,
    querySelectorAll: () => marks,
  });
  const reduce = Object.assign(new EventTarget(), { matches: false });
  const fine = Object.assign(new EventTarget(), { matches: true });
  const frames = new Map();
  let sequence = 0;
  const win = Object.assign(new EventTarget(), {
    matchMedia: query => query.includes('reduced-motion') ? reduce : fine,
    requestAnimationFrame: callback => { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  let intersect;
  const observed = [];
  class Observer {
    constructor(callback) { intersect = callback; }
    observe(mark) { observed.push(mark); }
  }
  const original = { window: globalThis.window, document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver };
  Object.assign(globalThis, { window: win, document: doc, IntersectionObserver: Observer });
  const move = (x, y) => {
    const event = new Event('mousemove');
    Object.assign(event, { clientX: x, clientY: y });
    win.dispatchEvent(event);
  };
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback()); };
  return { doc, win, elements, marks, reduce, fine, frames, move, flush, observed,
    intersect: entries => intersect(entries), restore: () => Object.assign(globalThis, original) };
}

test('cursor starts on movement, settles, and wakes again without a permanent loop', () => {
  const b = browser();
  try {
    initRoundCursor();
    assert.equal(b.frames.size, 0);
    b.move(100, 100); b.flush();
    assert.equal(b.frames.size, 0);
    b.move(500, 400);
    let frames = 0;
    while (b.frames.size && frames++ < 60) b.flush();
    assert.ok(frames < 60, 'cursor should stop scheduling when settled');
    assert.equal(b.elements['rc-pill-position'].style.transform, 'translate3d(516px, 416px, 0)');
    assert.equal(b.elements['rc-pill-position'].style.left, undefined);
    b.move(501, 400);
    assert.equal(b.frames.size, 1);
  } finally { b.restore(); }
});

test('cursor cancels pending work and restores native cursor on hidden tabs, dialogs and preferences', () => {
  const b = browser();
  try {
    initRoundCursor(); b.move(100, 100); b.flush(); b.move(400, 300);
    b.doc.hidden = true; b.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(b.frames.size, 0);
    assert.equal(b.doc.documentElement.classList.contains('rc-on'), false);
    b.doc.hidden = false; b.move(20, 20);
    b.doc.modal = true; b.doc.dispatchEvent(new Event('focusin'));
    assert.equal(b.frames.size, 0);
    assert.equal(b.elements['rc-cursor'].classList.contains('visible'), false);
    b.doc.modal = false; b.reduce.matches = true; b.reduce.dispatchEvent(new Event('change')); b.move(30, 30);
    assert.equal(b.frames.size, 0);
    b.reduce.matches = false; b.fine.matches = false; b.move(40, 40);
    assert.equal(b.frames.size, 0);
  } finally { b.restore(); }
});

test('wordmarks wait for load, animate only in view, and pause for hidden tabs or reduced motion', () => {
  const b = browser();
  try {
    initWordmarkMotion(); assert.equal(b.observed.length, 0);
    b.win.dispatchEvent(new Event('load')); assert.equal(b.observed.length, 2);
    b.intersect([{ target: b.marks[0], isIntersecting: true }, { target: b.marks[1], isIntersecting: false }]);
    assert.equal(b.marks[0].classList.contains('qb-paused'), false);
    assert.equal(b.marks[1].classList.contains('qb-animated'), false);
    b.doc.hidden = true; b.doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(b.marks[0].classList.contains('qb-paused'), true);
    b.doc.hidden = false; b.reduce.matches = true; b.reduce.dispatchEvent(new Event('change'));
    assert.equal(b.marks[0].classList.contains('qb-paused'), true);
    b.reduce.matches = false; b.reduce.dispatchEvent(new Event('change'));
    assert.equal(b.marks[0].classList.contains('qb-paused'), false);
    b.doc.modal = true; b.doc.dispatchEvent(new Event('focusin'));
    assert.equal(b.marks[0].classList.contains('qb-paused'), true);
    b.doc.modal = false; b.doc.dispatchEvent(new Event('focusin'));
    assert.equal(b.marks[0].classList.contains('qb-paused'), false);
    b.intersect([{ target: b.marks[0], isIntersecting: false }]);
    assert.equal(b.marks[0].classList.contains('qb-paused'), true);
    assert.equal(b.frames.size, 0, 'wordmarks should not create a JavaScript animation loop');
  } finally { b.restore(); }
});

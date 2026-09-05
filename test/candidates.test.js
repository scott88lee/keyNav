// Unit test for the candidate-collection logic in content/hints.js.
// Runs the REAL hints.js in a VM with a minimal DOM stub — no browser needed.
//
//   node test/candidates.test.js

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'content', 'hints.js'), 'utf8');

// ---------- minimal DOM stub ----------
const POINTER_TAGS = new Set([
  'A', 'DIV', 'SPAN', 'LI', 'IMG', 'SVG', 'ARTICLE', 'SECTION',
  'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P',
]);

function makeEl(tag, opts = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    disabled: !!opts.disabled,
    parentElement: null,
    children: [],
    _base: !!opts.base, // matches CANDIDATE_SELECTOR
    _cursor: opts.cursor || 'default',
    _w: opts.w ?? 100,
    _h: opts.h ?? 30,
    _display: opts.display || 'block',
    _visibility: opts.visibility || 'visible',
  };
  el.getBoundingClientRect = () => ({
    width: el._w, height: el._h, top: opts.top ?? 0, left: opts.left ?? 0,
  });
  el.querySelectorAll = (sel) => collectDesc(el, sel);
  el.querySelector = (sel) => collectDesc(el, sel)[0] || null;
  el.appendChild = (c) => { c.parentElement = el; el.children.push(c); return c; };
  el.append = (...cs) => cs.forEach((c) => el.appendChild(c));
  return el;
}

function collectDesc(root, sel) {
  const isBase = sel.includes('contenteditable'); // the CANDIDATE_SELECTOR
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (isBase ? c._base : POINTER_TAGS.has(c.tagName)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

function buildCollect(root, viewport = { w: 1280, h: 900 }) {
  const doc = {
    documentElement: { clientWidth: viewport.w, clientHeight: viewport.h },
    body: root,
    querySelectorAll: (sel) => collectDesc(root, sel),
  };
  const ctx = {
    document: doc,
    window: {},
    getComputedStyle: (el) => ({
      cursor: el._cursor,
      display: el._display,
      visibility: el._visibility,
    }),
    chrome: { runtime: {} },
  };
  vm.createContext(ctx);
  // expose the internal collector for testing
  const patched = src.replace(
    'ns.hints = { open, close, next, prev, typeDigit, isOpen, PAGE_SIZE, DIGITS };',
    'ns.hints = { open, close, next, prev, typeDigit, isOpen, PAGE_SIZE, DIGITS, _collect: collectCandidates };'
  );
  if (patched === src) throw new Error('could not patch hints.js export line');
  vm.runInContext(patched, ctx);
  return ctx.window.keyNav.hints._collect;
}

// ---------- tests ----------
let failures = 0;
function check(name, els, expectedTags) {
  const got = els.map((e) => e.tagName + (e._cursor === 'pointer' ? '*' : '') + (e._base ? 'b' : ''));
  const want = expectedTags.slice();
  const ok = got.length === want.length && got.every((g, i) => g === want[i]);
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) {
    failures++;
    console.log('      got:  [' + got.join(', ') + ']');
    console.log('      want: [' + want.join(', ') + ']');
  }
}

// 1. samima.link-style Semantic UI menu bar: <a href>, JS-wired <div class=item>,
//    <a class=item> without href, and a disabled item (cursor: default).
{
  const root = makeEl('BODY');
  const menu = makeEl('div', { w: 1280, h: 50 }); // .ui.menu container (no pointer)
  const aHref = makeEl('a', { base: true, w: 80, h: 30 });
  const divItem = makeEl('div', { cursor: 'pointer', w: 80, h: 30 });
  const aNoHref = makeEl('a', { cursor: 'pointer', w: 80, h: 30 });
  const disabledItem = makeEl('div', { w: 80, h: 30 }); // cursor: default
  menu.append(aHref, divItem, aNoHref, disabledItem);
  root.append(menu);
  const collect = buildCollect(root);
  check('semantic-ui menu: a[href] + div.item + a.item(no href), skip disabled',
    collect(), ['Ab', 'DIV*', 'A*']);
}

// 2. cursor is inherited: pointer parent + pointer child span -> parent only.
{
  const root = makeEl('BODY');
  const outer = makeEl('div', { cursor: 'pointer', w: 200, h: 40 });
  const inner = makeEl('span', { cursor: 'pointer', w: 20, h: 20 });
  outer.append(inner);
  root.append(outer);
  const collect = buildCollect(root);
  check('inherited cursor: outermost clickable unit wins', collect(), ['DIV*']);
}

// 3. pointer card containing a real link -> only the link (no double labeling).
{
  const root = makeEl('BODY');
  const card = makeEl('div', { cursor: 'pointer', w: 300, h: 100 });
  const link = makeEl('a', { base: true, w: 100, h: 20 });
  card.append(link);
  root.append(card);
  const collect = buildCollect(root);
  check('pointer container with nested real link -> link only', collect(), ['Ab']);
}

// 4. pointer div covering the whole viewport -> treated as container, skipped.
{
  const root = makeEl('BODY');
  const big = makeEl('div', { cursor: 'pointer', w: 1280, h: 900 });
  root.append(big);
  const collect = buildCollect(root);
  check('full-viewport pointer element skipped', collect(), []);
}

// 5. hidden pointer element -> skipped.
{
  const root = makeEl('BODY');
  const hidden = makeEl('div', { cursor: 'pointer', display: 'none', w: 100, h: 30 });
  root.append(hidden);
  const collect = buildCollect(root);
  check('display:none pointer element skipped', collect(), []);
}

// 6. disabled button -> skipped; enabled button kept.
{
  const root = makeEl('BODY');
  const off = makeEl('button', { base: true, disabled: true });
  const on = makeEl('button', { base: true });
  root.append(off, on);
  const collect = buildCollect(root);
  check('disabled button skipped, enabled kept', collect(), ['BUTTONb']);
}

// 7. pointer div > pointer div > real link -> only the link.
{
  const root = makeEl('BODY');
  const A = makeEl('div', { cursor: 'pointer', w: 400, h: 200 });
  const B = makeEl('div', { cursor: 'pointer', w: 100, h: 40 });
  const L = makeEl('a', { base: true, w: 50, h: 20 });
  B.append(L);
  A.append(B);
  root.append(A);
  const collect = buildCollect(root);
  check('nested pointer wrappers around a link -> link only', collect(), ['Ab']);
}

// 8. pointer row wrapping pointer items (no base candidates) -> row only.
{
  const root = makeEl('BODY');
  const row = makeEl('div', { cursor: 'pointer', w: 400, h: 60 });
  const it1 = makeEl('div', { cursor: 'pointer', w: 90, h: 40 });
  const it2 = makeEl('div', { cursor: 'pointer', w: 90, h: 40 });
  row.append(it1, it2);
  root.append(row);
  const collect = buildCollect(root);
  check('pointer row of pointer items -> outermost only', collect(), ['DIV*']);
}

// 9. zero-size pointer element -> skipped.
{
  const root = makeEl('BODY');
  const tiny = makeEl('div', { cursor: 'pointer', w: 1, h: 0 });
  root.append(tiny);
  const collect = buildCollect(root);
  check('zero-size pointer element skipped', collect(), []);
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

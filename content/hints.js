// keyNav: link-hint engine.
// Scans the viewport for clickable elements in reading order and shows them
// ten at a time, labeled 1-9 and 0. p/o cycle through the pages; typing a
// digit activates the matching element; shift+digit opens it in a new tab.

(() => {
  const ns = (window.keyNav = window.keyNav || {});

  const PAGE_SIZE = 10;
  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  const CANDIDATE_SELECTOR = [
    'a[href]',
    'area[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="menuitemcheckbox"]',
    '[role="menuitemradio"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="option"]',
    '[role="combobox"]',
    '[onclick]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  // ---------- candidate collection ----------
  // Tags scanned by the cursor:pointer heuristic pass (pass 2).
  const POINTER_SELECTOR =
    'a, div, span, li, img, svg, article, section, td, th, h1, h2, h3, h4, h5, h6, p';
  // A pointer element covering more than this fraction of the viewport is
  // treated as a container, not a control.
  const MAX_POINTER_AREA = 0.25;

  function isVisible(el, cs) {
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    return true;
  }

  function collectCandidates() {
    const out = [];
    const inSet = new Set();

    // Pass 1: standard interactive elements.
    for (const el of document.querySelectorAll(CANDIDATE_SELECTOR)) {
      if (el.disabled) continue;
      if (!isVisible(el, getComputedStyle(el))) continue;
      inSet.add(el);
      out.push(el);
    }

    // Pass 2: elements that look clickable to the mouse (cursor: pointer)
    // but aren't standard interactive elements — e.g. <div>/<a> menu items
    // wired up with JS (jQuery, React, ...).
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const maxArea = vw * vh * MAX_POINTER_AREA;
    for (const el of document.querySelectorAll(POINTER_SELECTOR)) {
      if (inSet.has(el) || el.disabled) continue;
      // Keep the outermost clickable unit: cursor is inherited, so the
      // children of a clickable container also report pointer.
      let anc = el.parentElement;
      let shadowed = false;
      while (anc) {
        if (inSet.has(anc)) { shadowed = true; break; }
        anc = anc.parentElement;
      }
      if (shadowed) continue;
      const cs = getComputedStyle(el);
      if (cs.cursor !== 'pointer') continue;
      if (!isVisible(el, cs)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width * rect.height > maxArea) continue;
      // Don't shadow a real link/button nested inside a clickable area.
      if (el.querySelector(CANDIDATE_SELECTOR)) continue;
      inSet.add(el);
      out.push(el);
    }

    return out;
  }

  function readingOrder(els) {
    const rowTolerance = 8;
    return els.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) > rowTolerance) return ra.top - rb.top;
      return ra.left - rb.left;
    });
  }

  // Only hint what's on screen right now (partially visible counts).
  function inViewport(el) {
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  }

  // ---------- overlay ----------
  let host = null;
  let canvas = null;
  let indicator = null;
  let onScroll = null;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('keynav-hints');
    host.style.cssText =
      'all:initial; position:fixed; top:0; left:0; z-index:2147483647;';
    (document.body || document.documentElement).appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .canvas { position: absolute; top: 0; left: 0; width: 0; height: 0; }
      .label {
        position: absolute;
        background: #ffdb00;
        color: #1a1a1a;
        font: 700 14px/1.4 ui-monospace, monospace;
        padding: 0 5px;
        border-radius: 4px;
        pointer-events: none;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        user-select: none;
      }
      .page {
        position: fixed;
        bottom: 16px; right: 16px;
        background: #202124; color: #fff;
        font: 12px/1.4 ui-monospace, monospace;
        padding: 3px 8px;
        border-radius: 4px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }
    `;
    const c = document.createElement('div');
    c.className = 'canvas';
    const p = document.createElement('div');
    p.className = 'page';
    shadow.append(style, c, p);
    canvas = c;
    indicator = p;
  }

  function syncCanvas() {
    canvas.style.transform = `translate(${-window.scrollX}px, ${-window.scrollY}px)`;
  }

  // ---------- hint session ----------
  let items = []; // all candidates, in reading order
  let page = 0;

  const pageCount = () => Math.ceil(items.length / PAGE_SIZE);

  function open() {
    if (items.length) return false;
    items = readingOrder(collectCandidates().filter(inViewport));
    if (!items.length) return false;
    ensureHost();
    page = 0;
    renderPage();
    onScroll = syncCanvas;
    syncCanvas();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return true;
  }

  function close() {
    if (onScroll) window.removeEventListener('scroll', onScroll, { capture: true });
    onScroll = null;
    if (host) host.remove();
    host = null;
    canvas = null;
    indicator = null;
    items = [];
    page = 0;
  }

  function isOpen() {
    return items.length > 0;
  }

  function next() {
    if (!items.length) return;
    page = (page + 1) % pageCount();
    renderPage();
  }

  function prev() {
    if (!items.length) return;
    page = (page - 1 + pageCount()) % pageCount();
    renderPage();
  }

  function renderPage() {
    canvas.replaceChildren();
    const start = page * PAGE_SIZE;
    for (let i = 0; i < PAGE_SIZE && start + i < items.length; i++) {
      const el = items[start + i];
      const rect = el.getBoundingClientRect();
      const d = document.createElement('div');
      d.className = 'label';
      d.textContent = DIGITS[i];
      // Clamp so partly-visible elements still get an on-screen label.
      d.style.left = Math.round(Math.max(0, rect.left) + window.scrollX) + 'px';
      d.style.top = Math.round(Math.max(0, rect.top) + window.scrollY) + 'px';
      canvas.appendChild(d);
    }
    indicator.textContent = (page + 1) + ' / ' + pageCount();
  }

  function typeDigit(d, newTab = false) {
    const idx = DIGITS.indexOf(d);
    if (idx < 0) return;
    const el = items[page * PAGE_SIZE + idx];
    if (!el) return;
    activate(el, newTab);
  }

  // YouTube ignores script-generated clicks on its player controls (the Skip
  // button), so those get a real click from the background worker instead.
  const needsRealClick = (el) =>
    window === window.top &&
    /(^|\.)youtube\.com$/.test(location.hostname) &&
    !!el.closest('#movie_player');

  async function realClick(el) {
    try {
      const a = await chrome.runtime.sendMessage({ type: 'debugAttach' });
      if (!a || !a.ok) return false;
      // Attaching shows an infobar that shifts the page; re-measure after.
      await new Promise((r) => setTimeout(r, 200));
      const r = el.getBoundingClientRect();
      const res = await chrome.runtime.sendMessage({
        type: 'debugClick',
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      });
      return !!(res && res.ok);
    } catch {
      return false;
    }
  }

  async function activate(el, newTab) {
    close();
    el.scrollIntoView({ block: 'center' });
    if (newTab) {
      const a = el.tagName === 'A' ? el : el.closest('a[href]');
      if (a && a.href) {
        chrome.runtime.sendMessage({ type: 'openUrl', url: a.href });
        return;
      }
    }
    if (needsRealClick(el) && (await realClick(el))) return;
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
    }));
  }

  ns.hints = { open, close, next, prev, typeDigit, isOpen, PAGE_SIZE, DIGITS };
})();

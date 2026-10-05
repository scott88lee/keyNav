// keyNav: key capture for link hints.
// Ctrl+G toggles the hint overlay; nothing else is captured when it's closed.
// Hint mode: 1-9/0 click the labeled element, Shift+1-9/0 open it in a new
// tab, p/o cycle pages, Esc or Ctrl+G closes.
(() => {
  const { hints } = window.keyNav;

  let hintMode = false;

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.isComposing) return; // IME in progress

      const isToggle =
        e.code === 'KeyG' && e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey;

      if (hintMode && !hints.isOpen()) {
        // A digit already activated a hint and closed the overlay.
        hintMode = false;
      }

      if (isToggle) {
        if (e.repeat) return;
        e.preventDefault();
        if (hintMode) exitHints();
        else openHints();
        return;
      }

      if (hintMode && !e.ctrlKey && !e.metaKey && !e.altKey) handleHintKey(e);
    },
    true
  );

  function handleHintKey(e) {
    const key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      exitHints();
      return;
    }
    if (key.toLowerCase() === 'p') {
      e.preventDefault();
      hints.next();
      return;
    }
    if (key.toLowerCase() === 'o') {
      e.preventDefault();
      hints.prev();
      return;
    }
    // e.code, not e.key: Shift turns the digit into a symbol (!, @, ...).
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (m) {
      e.preventDefault();
      hints.typeDigit(m[1], e.shiftKey);
    }
  }

  function openHints() {
    hints.open();
    hintMode = hints.isOpen();
  }

  function exitHints() {
    hints.close();
    hintMode = false;
  }

  // dev hook: ?keynav=N auto-opens hints on page N (for testing)
  const params = new URLSearchParams(location.search);
  if (params.has('keynav')) {
    const go = () => {
      openHints();
      const p = parseInt(params.get('keynav'), 10);
      for (let i = 1; i < (Number.isFinite(p) ? p : 1); i++) hints.next();
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  }
})();

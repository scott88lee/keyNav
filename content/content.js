// keyNav: key capture for link hints.
// Normal mode: only f/F do anything, and never inside a form field.
// Hint mode: 1-9/0 activate the labeled element, p/o cycle pages, Esc closes.
(() => {
  const { hints } = window.keyNav;

  let hintMode = false;

  const isEditable = (t) =>
    !!(
      t &&
      t.closest &&
      t.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
      )
    );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return; // browser/page shortcuts
      if (e.isComposing) return; // IME in progress

      if (hintMode) {
        if (!hints.isOpen()) {
          // A digit already activated a hint and closed the overlay.
          hintMode = false;
        } else {
          handleHintKey(e);
          return;
        }
      }

      if (e.key === 'f' || e.key === 'F') {
        if (e.repeat || isEditable(e.target)) return;
        e.preventDefault();
        openHints(e.key === 'F');
      }
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
    if (/^[0-9]$/.test(key)) {
      e.preventDefault();
      hints.typeDigit(key);
    }
  }

  function openHints(newTab) {
    hints.open({ newTab });
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
      openHints(false);
      const p = parseInt(params.get('keynav'), 10);
      for (let i = 1; i < (Number.isFinite(p) ? p : 1); i++) hints.next();
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  }
})();

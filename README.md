# keyNav

Numbered link hints for Chrome: press `Ctrl+G`, the first 10 clickable elements
get labeled `1-9` and `0`, type a number to activate. `p`/`o` cycle through
the rest, ten at a time.

## Install (dev)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. Open any https page and press `Ctrl+G`

## Keys

| Key | Action |
|-----|--------|
| `Ctrl+G` | show hints (number the first 10 clickable elements); press again to hide |

While hints are shown:

| Key | Action |
|-----|--------|
| `1-9`, `0` | activate the element with that number |
| `Shift` + `1-9`, `0` | open that element in a new tab |
| `p` | next 10 |
| `o` | previous 10 (wraps around) |
| `Esc` / `Ctrl+G` | close hints |

Notes:

- Elements are ordered top-to-bottom, left-to-right (reading order)
- A small `n / total` counter shows which page of 10 you're on
- Plain keys (including `f`) are untouched outside hint mode, so typing and site shortcuts (e.g. fullscreen) are never hijacked
- Only `Ctrl+G` is claimed; other `Ctrl`/`Alt`/`Meta` shortcuts pass through

## Test page

Content scripts don't run on `file://` by default, so serve it:

```sh
cd test && python3 -m http.server
# → http://localhost:8000/test-page.html
```

Append `?keynav=N` to any URL to auto-open hints on page N (dev hook).

## How it works

- `content/hints.js` — finds clickable elements (links, buttons, inputs,
  `[role=…]`, `[onclick]`, `[tabindex]`, plus anything else with
  `cursor: pointer` — e.g. `<div>`/`<a>` menu items wired up with JS, as in
  Semantic UI / jQuery / React nav bars), orders them in reading order, pages
  them ten at a time, and renders digit labels in a closed Shadow-DOM
  overlay (page CSS can't touch it), kept aligned while the page scrolls
- `content/content.js` — capture-phase `keydown` listener, hint mode state
- `background.js` — opens the picked link in a new tab (`Shift`+number) via `chrome.tabs`
  (only `http:`/`https:` URLs are opened; `data:`, `file:`, `javascript:`
  and friends are rejected)

## Limitations

- Hints re-scan on each trigger (no incremental updates for dynamic content)
- Elements fully covered by others still get hints (no hit-test filtering)
- Shift+number only knows the URL for anchors; other elements fall back to a same-tab click
- Doesn't run on `chrome://` pages or the Chrome Web Store

// keyNav background service worker.
// 1. Opens URLs in new tabs (for Shift+number hints).
// 2. Sends real (trusted) mouse clicks on the YouTube player via
//    chrome.debugger — YouTube ignores script-generated clicks on its Skip
//    button. Attach, wait for the content script to re-measure, click, detach.

const DEBUGGER_VERSION = '1.3';
const ATTACH_TIMEOUT_MS = 3000; // safety net: never stay attached
const attached = new Map(); // tabId -> timeout handle

const isYouTubeTopFrame = (sender) => {
  if (!sender || !sender.tab || sender.frameId !== 0) return false;
  try {
    const h = new URL(sender.url).hostname;
    return h === 'youtube.com' || h.endsWith('.youtube.com');
  } catch {
    return false;
  }
};

async function detach(tabId) {
  clearTimeout(attached.get(tabId));
  attached.delete(tabId);
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // already detached (tab closed, user dismissed the bar, ...)
  }
}

async function attach(tabId) {
  if (attached.has(tabId)) await detach(tabId);
  await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
  attached.set(tabId, setTimeout(() => detach(tabId), ATTACH_TIMEOUT_MS));
}

async function click(tabId, x, y) {
  const target = { tabId };
  const point = { x, y, button: 'left', clickCount: 1 };
  try {
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...point });
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...point });
  } finally {
    await detach(tabId);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'openUrl' && typeof msg.url === 'string') {
    let u;
    try {
      u = new URL(msg.url);
    } catch {
      return; // unparseable URL
    }
    // Only open web pages — never data:, file:, javascript:, etc.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    chrome.tabs.create({ url: u.href, active: true });
    return;
  }

  if (msg.type === 'debugAttach' && isYouTubeTopFrame(sender)) {
    attach(sender.tab.id).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false }) // e.g. DevTools already attached
    );
    return true; // async response
  }

  if (msg.type === 'debugClick' && isYouTubeTopFrame(sender) && attached.has(sender.tab.id)) {
    if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) {
      detach(sender.tab.id).then(() => sendResponse({ ok: false }));
      return true;
    }
    click(sender.tab.id, msg.x, msg.y).then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    );
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (attached.has(tabId)) detach(tabId);
});

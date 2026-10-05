// keyNav background service worker.
// Opens URLs in new tabs (for Shift+number hints).

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'openUrl' || typeof msg.url !== 'string') return;
  let u;
  try {
    u = new URL(msg.url);
  } catch {
    return; // unparseable URL
  }
  // Only open web pages — never data:, file:, javascript:, etc.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  chrome.tabs.create({ url: u.href, active: true });
});

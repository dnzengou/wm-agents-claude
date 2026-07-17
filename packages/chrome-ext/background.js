// Open the live WorldMonitor terminal in a new tab. Re-use an existing tab if open.
const WM_URL = 'https://worldmonitor-core.vercel.app/';

chrome.action.onClicked.addListener(async () => {
  const existing = await chrome.tabs.query({ url: `${WM_URL}*` });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url: WM_URL });
});

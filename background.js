// background.js
// Runs permanently as a service worker.
// Manages settings and tab states.

const DEFAULT_SETTINGS = {
  enabled:       true,
  hideMethod:    "blur",
  blurStrength:  20,
  sensitivity:   "medium",
  showIndicator: true,
};

const tabState = {};

// Save default settings on first install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

// Handle all messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  switch (message.type) {

    case "TAB_ACTIVE":
      tabState[tabId] = {
        active:         true,
        protecting:     false,
        sensitiveCount: 0,
        url:            sender.tab?.url || "",
      };
      sendResponse({ ok: true });
      break;

    case "SHARING_STARTED":
      if (tabState[tabId]) tabState[tabId].protecting = true;
      sendResponse({ ok: true });
      break;

    case "SHARING_STOPPED":
      if (tabState[tabId]) tabState[tabId].protecting = false;
      sendResponse({ ok: true });
      break;

    case "REGIONS_UPDATE":
      if (tabState[tabId]) tabState[tabId].sensitiveCount = message.count || 0;
      sendResponse({ ok: true });
      break;

    case "GET_STATE":
      chrome.storage.local.get("settings", (data) => {
        sendResponse({
          settings: data.settings || DEFAULT_SETTINGS,
          tabState: tabState[message.tabId] || null,
        });
      });
      return true;

    case "SAVE_SETTINGS":
      chrome.storage.local.set({ settings: message.settings }, () => {
        // Tell all active meeting tabs about the new settings
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            if (tabState[tab.id]) {
              chrome.tabs.sendMessage(tab.id, {
                type:     "SETTINGS_UPDATED",
                settings: message.settings,
              }).catch(() => {});
            }
          });
        });
        sendResponse({ ok: true });
      });
      return true;

    default:
      sendResponse({ ok: false });
  }

  return true;
});

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabState[tabId];
});
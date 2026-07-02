(function () {
  "use strict";

  const target = document.head || document.documentElement;

  // Pass URLs via dataset
  document.documentElement.dataset.ssBundle = chrome.runtime.getURL("ocr_bundle.js");

  // Load OCR bundle FIRST as regular script — allowed by Trusted Types
  const bundle    = document.createElement("script");
  bundle.src      = chrome.runtime.getURL("ocr_bundle.js");
  bundle.onload   = () => {
    bundle.remove();
    // THEN load injected.js after bundle is ready
    const script   = document.createElement("script");
    script.src     = chrome.runtime.getURL("injected.js");
    script.onload  = () => script.remove();
    target.insertBefore(script, target.firstChild);
  };
  target.insertBefore(bundle, target.firstChild);

  // Tell background this tab is active
  chrome.runtime.sendMessage({ type: "TAB_ACTIVE" }).catch(() => {});

  // Send initial settings
  chrome.storage.local.get("settings", (data) => {
    window.postMessage(
      { source: "SCREENSAFE_CONTENT", type: "INIT", settings: data.settings || {} },
      "*"
    );
  });

  // Relay messages from page to background
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== "SCREENSAFE_INJECTED") return;
    const msg = event.data;
    if (msg.type === "SHARING_STARTED")
      chrome.runtime.sendMessage({ type: "SHARING_STARTED" }).catch(() => {});
    if (msg.type === "SHARING_STOPPED")
      chrome.runtime.sendMessage({ type: "SHARING_STOPPED" }).catch(() => {});
    if (msg.type === "REGIONS_UPDATE")
      chrome.runtime.sendMessage({ type: "REGIONS_UPDATE", count: msg.count }).catch(() => {});
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SETTINGS_UPDATED") {
      window.postMessage(
        { source: "SCREENSAFE_CONTENT", type: "SETTINGS_UPDATED", settings: message.settings },
        "*"
      );
    }
  });

})();
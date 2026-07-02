// popup.js
(function(){
  "use strict";

  const $ = id => document.getElementById(id);
  const enabledEl  = $("enabled");
  const statusEl   = $("status");
  const dotEl      = $("dot");
  const titleEl    = $("st-title");
  const subEl      = $("st-sub");
  const blurWrap   = $("blur-wrap");
  const brangeEl   = $("brange");
  const bvalEl     = $("bval");
  const badgeEl    = $("badge");
  const methodBtns = document.querySelectorAll("[data-method]");
  const sensBtns   = document.querySelectorAll("[data-sens]");

  let cfg = {};

  // Load state
  chrome.tabs.query({active:true,currentWindow:true}, ([tab]) => {
    chrome.runtime.sendMessage({type:"GET_STATE",tabId:tab?.id}, res => {
      if (!res) return;
      cfg = res.settings || {};
      applyUI(cfg);
      updateStatus(res.tabState, cfg.enabled);
      updateBadge(tab?.url);
    });
  });

  function applyUI(s) {
    enabledEl.checked = s.enabled !== false;
    methodBtns.forEach(b => b.classList.toggle("on", b.dataset.method === s.hideMethod));
    brangeEl.value    = s.blurStrength || 20;
    bvalEl.textContent = s.blurStrength || 20;
    blurWrap.classList.toggle("off", s.hideMethod !== "blur");
    sensBtns.forEach(b => b.classList.toggle("on", b.dataset.sens === s.sensitivity));
  }

  function updateStatus(tab, enabled) {
    if (!enabled) {
      titleEl.textContent = "Disabled";
      subEl.textContent   = "Toggle on to protect";
      dotEl.className     = "dot";
      return;
    }
    if (tab?.protecting) {
      const n = tab.sensitiveCount || 0;
      statusEl.className  = "status on";
      dotEl.className     = "dot on";
      titleEl.textContent = "Actively protecting";
      subEl.textContent   = n > 0 ? `${n} sensitive region${n>1?"s":""} hidden` : "Monitoring screen share";
    } else {
      statusEl.className  = "status";
      dotEl.className     = "dot on";
      titleEl.textContent = "Ready to protect";
      subEl.textContent   = "Start a screen share to activate";
    }
  }

  function updateBadge(url) {
    const platforms = [
      ["meet.google.com","Google Meet"],
      ["zoom.us","Zoom"],
      ["teams.microsoft.com","Teams"],
      ["whereby.com","Whereby"],
      ["slack.com","Slack"],
      ["webex.com","Webex"],
    ];
    const match = platforms.find(([host]) => url?.includes(host));
    if (match) { badgeEl.textContent=match[1]; badgeEl.className="badge on"; }
    else        { badgeEl.textContent="No meeting"; badgeEl.className="badge"; }
  }

  function save() {
    chrome.runtime.sendMessage({type:"SAVE_SETTINGS",settings:cfg});
  }

  enabledEl.addEventListener("change", () => {
    cfg.enabled = enabledEl.checked;
    save();
  });

  methodBtns.forEach(b => b.addEventListener("click", () => {
    methodBtns.forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    cfg.hideMethod = b.dataset.method;
    blurWrap.classList.toggle("off", cfg.hideMethod !== "blur");
    save();
  }));

  brangeEl.addEventListener("input", () => {
    const v = parseInt(brangeEl.value);
    bvalEl.textContent  = v;
    cfg.blurStrength    = v;
    save();
  });

  sensBtns.forEach(b => b.addEventListener("click", () => {
    sensBtns.forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    cfg.sensitivity = b.dataset.sens;
    save();
  }));

})();
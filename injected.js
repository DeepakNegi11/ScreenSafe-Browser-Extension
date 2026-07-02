// injected.js
// THIS is the core file. Runs inside the real page context.
// Overrides getDisplayMedia so we intercept every screen share.
// Builds the canvas pipeline that blurs sensitive regions.

(function () {
  "use strict";

  // Settings received from content_script
  let settings = {
    enabled:       true,
    hideMethod:    "blur",
    blurStrength:  20,
    sensitivity:   "medium",
    showIndicator: true,
  };

  let sensitiveRegions = [];  // Latest bounding boxes from OCR
  let isSharing        = false;
  let ocrReady = false
  let animFrameId      = null;
  let indicator        = null;

  // ── Listen for settings AND OCR regions from content_script ───
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.source !== "SCREENSAFE_CONTENT") return;

    if (event.data.type === "INIT" || event.data.type === "SETTINGS_UPDATED") {
      settings = { ...settings, ...event.data.settings };
    }

    if (event.data.type === "OCR_REGIONS") {
      sensitiveRegions = event.data.regions || [];
      notify("REGIONS_UPDATE", { count: sensitiveRegions.length });
    }
  });

  // ── THE KEY OVERRIDE ──────────────────────────────────────────
  const originalGetDisplayMedia =
    navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getDisplayMedia = async function (constraints) {

    if (!settings.enabled) {
      return originalGetDisplayMedia(constraints);
    }

    const realStream = await originalGetDisplayMedia(constraints);

    try {
      const cleanStream = await buildPipeline(realStream);
      notify("SHARING_STARTED");
      return cleanStream;
    } catch (err) {
      console.error("[ScreenSafe] Pipeline error:", err);
      return realStream;
    }
  };

  // ── BUILD THE CANVAS PIPELINE ─────────────────────────────────
  async function buildPipeline(realStream) {
    const track    = realStream.getVideoTracks()[0];
    const trackCfg = track.getSettings();
    const W = trackCfg.width  || window.screen.width  || 1920;
    const H = trackCfg.height || window.screen.height || 1080;

    const video         = document.createElement("video");
    video.srcObject     = new MediaStream([track]);
    video.muted         = true;
    video.playsInline   = true;
    video.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;";
    document.body.appendChild(video);
    await video.play();

    const canvas         = document.createElement("canvas");
    canvas.width         = W;
    canvas.height        = H;
    canvas.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    startWorker(W, H);

    let lastOCR = 0;
    isSharing   = true;

    function loop(ts) {
      if (!isSharing) return;

      ctx.drawImage(video, 0, 0, W, H);

      if (sensitiveRegions.length > 0) {
        hideRegions(ctx, canvas, sensitiveRegions, W, H);
      }

      if (ts - lastOCR > 500) {
        lastOCR = ts;
        sendToWorker(ctx, W, H);
      }

      animFrameId = requestAnimationFrame(loop);
    }

    animFrameId = requestAnimationFrame(loop);

    if (settings.showIndicator) showIndicator();

    const cleanStream = canvas.captureStream(20);
    realStream.getAudioTracks().forEach((t) => cleanStream.addTrack(t));

    track.addEventListener("ended", () => {
      isSharing = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.postMessage({ source: "SCREENSAFE_INJECTED", type: "OCR_STOP" }, "*");
      video.remove();
      canvas.remove();
      hideIndicator();
      sensitiveRegions = [];
      notify("SHARING_STOPPED");
    });

    return cleanStream;
  }

  // ── HIDE REGIONS ON CANVAS ────────────────────────────────────
  function hideRegions(ctx, canvas, regions, W, H) {
    const method   = settings.hideMethod   || "blur";
    const strength = settings.blurStrength || 20;

    for (const r of regions) {
      const x  = Math.max(0, Math.round(r.x));
      const y  = Math.max(0, Math.round(r.y));
      const x2 = Math.min(W, Math.round(r.x + r.w));
      const y2 = Math.min(H, Math.round(r.y + r.h));
      const rw = x2 - x;
      const rh = y2 - y;
      if (rw <= 0 || rh <= 0) continue;

      ctx.save();

      if (method === "blur") {
        ctx.filter = `blur(${strength}px)`;
        const pad  = strength * 2;
        ctx.drawImage(
          canvas,
          Math.max(0, x - pad), Math.max(0, y - pad),
          rw + pad * 2,         rh + pad * 2,
          Math.max(0, x - pad), Math.max(0, y - pad),
          rw + pad * 2,         rh + pad * 2
        );

      } else if (method === "blackbox") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(x, y, rw, rh);

      } else if (method === "pixelate") {
        const ps   = 12;
        const sw   = Math.max(1, Math.floor(rw / ps));
        const sh   = Math.max(1, Math.floor(rh / ps));
        const tmp  = document.createElement("canvas");
        tmp.width  = sw;
        tmp.height = sh;
        const tc   = tmp.getContext("2d");
        tc.drawImage(canvas, x, y, rw, rh, 0, 0, sw, sh);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, sw, sh, x, y, rw, rh);
        ctx.imageSmoothingEnabled = true;
      }

      ctx.restore();
    }
  }

  // ── OCR BRIDGE (worker itself lives in content_script.js) ─────
  // Replace startWorker entirely
async function startWorker(W, H) {
  // No Worker needed — OCR runs directly via window.ScreenSafeOCR
  // which was loaded by content_script.js as a regular script tag
  try {
    if (!window.ScreenSafeOCR) {
      console.error("[ScreenSafe] ScreenSafeOCR not found on window");
      return;
    }
    const ok = await window.ScreenSafeOCR.init();
    if (ok) {
      console.log("[ScreenSafe] OCR ready — running inline");
      ocrReady = true;
    }
  } catch (err) {
    console.error("[ScreenSafe] OCR init error:", err);
  }
}

  async function sendToWorker(ctx, W, H) {
    if (!ocrReady || !window.ScreenSafeOCR) return;
    if (window.ScreenSafeOCR._processing) return;
    window.ScreenSafeOCR._processing = true;

    try {
      const sw = Math.floor(W / 2);
      const sh = Math.floor(H / 2);
      const imageData = ctx.getImageData(0, 0, sw, sh);

      // Run OCR directly — no worker needed
      const regions = await window.ScreenSafeOCR.recognize(
        imageData, 2, 2, H
      );
      sensitiveRegions = regions;

      if (regions.length > 0) {
        notify("REGIONS_UPDATE", { count: regions.length });
        console.log(`[ScreenSafe] ${regions.length} region(s) found`);
      }
    } catch (err) {
      console.error("[ScreenSafe] OCR error:", err);
    } finally {
      window.ScreenSafeOCR._processing = false;
    }
  }

  // ── STATUS INDICATOR ──────────────────────────────────────────
  function showIndicator() {
    if (indicator) return;
    indicator = document.createElement("div");
    indicator.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:2147483647;
      background:rgba(0,0,0,0.82); color:#fff;
      font-family:-apple-system,sans-serif; font-size:12px; font-weight:600;
      padding:8px 14px; border-radius:20px;
      display:flex; align-items:center; gap:7px;
      pointer-events:none;
      border:1px solid rgba(255,255,255,0.12);
      box-shadow:0 4px 20px rgba(0,0,0,0.4);
    `;

    const dot = document.createElement("span");
    dot.style.cssText = `
      width:8px;height:8px;border-radius:50%;
      background:#22c55e;display:inline-block;
      animation:__ss_pulse 2s infinite;
    `;
    const label = document.createTextNode("ScreenSafe Active");

    indicator.appendChild(dot);
    indicator.appendChild(label);

    const style = document.createElement("style");
    style.textContent = `@keyframes __ss_pulse {
      0%,100%{opacity:1;transform:scale(1)}
      50%{opacity:0.5;transform:scale(0.8)}
    }`;
    document.head.appendChild(style);
    document.body.appendChild(indicator);
  }

  function hideIndicator() {
    if (indicator) { indicator.remove(); indicator = null; }
  }

  // ── NOTIFY CONTENT SCRIPT ─────────────────────────────────────
  function notify(type, extra = {}) {
    window.postMessage({ source: "SCREENSAFE_INJECTED", type, ...extra }, "*");
  }

  console.log("[ScreenSafe] Injected — getDisplayMedia is intercepted");

})();
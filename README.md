# ScreenSafe Browser Extension
## Complete Setup Guide

---

## Project Structure

```
screensafe-extension/
├── manifest.json          ← Extension config, permissions, URLs
├── background.js          ← Service worker, manages global state
├── content_script.js      ← Injected into meeting pages, bridges messages
├── injected.js            ← Core interceptor, overrides getDisplayMedia()
├── ocr_worker.js          ← Web Worker, runs Tesseract OCR off main thread
├── popup.html             ← Extension popup UI (html)
├── popup.js               ← Extension popup logic
├── tesseract.min.js       ← Tesseract.js OCR library (download separately)
├── tesseract-worker.min.js
├── tesseract-core.wasm.js
├── eng.traineddata.gz     ← English language OCR model
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Step 1 — Download Tesseract.js

The extension needs the Tesseract.js browser OCR library.
Download all 4 files from:

https://github.com/naptha/tesseract.js/releases/tag/v4.1.1

Download these exact files and place them in the extension folder:
- tesseract.min.js
- tesseract-worker.min.js  
- tesseract-core.wasm.js
- eng.traineddata.gz

Or run this in your terminal inside the extension folder:

```bash
# Using npm to get the files
npm install tesseract.js

# Then copy from node_modules
copy node_modules\tesseract.js\dist\tesseract.min.js .
copy node_modules\tesseract.js\dist\worker.min.js tesseract-worker.min.js
copy node_modules\tesseract.js\dist\tesseract-core.wasm.js .

# Download language data
curl -L "https://github.com/naptha/tessdata/raw/main/lang/eng.traineddata.gz" -o eng.traineddata.gz
```

---

## Step 2 — Create Icons

Create simple PNG icons (or use any image editor):
- icons/icon16.png  → 16x16 pixels
- icons/icon48.png  → 48x48 pixels  
- icons/icon128.png → 128x128 pixels

Quick way — create them with Python:
```bash
pip install Pillow
python -c "
from PIL import Image, ImageDraw
for size in [16, 48, 128]:
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    d.ellipse([2,2,size-2,size-2], fill=(110,231,183,255))
    img.save(f'icons/icon{size}.png')
print('Icons created')
"
```

---

## Step 3 — Pass Worker URL to Injected Script

Because of Chrome extension security, the injected.js script cannot
directly call chrome.runtime.getURL(). We need to pass the worker URL
via content_script.js.

Add this to content_script.js BEFORE the inject script block:

```javascript
// Set worker URL as a global on the page so injected.js can access it
const urlScript = document.createElement('script');
urlScript.textContent = `
  document.__screensafeWorkerURL = "${chrome.runtime.getURL('ocr_worker.js')}";
  document.__screensafeTesseractWorker = "${chrome.runtime.getURL('tesseract-worker.min.js')}";
  document.__screensafeTesseractCore = "${chrome.runtime.getURL('tesseract-core.wasm.js')}";
  document.__screensafeLangPath = "${chrome.runtime.getURL('./')}";
`;
target.insertBefore(urlScript, target.firstChild);
```

---

## Step 4 — Load Extension in Chrome

1. Open Chrome
2. Go to: chrome://extensions/
3. Turn ON "Developer mode" (top right toggle)
4. Click "Load unpacked"
5. Select your screensafe-extension folder
6. Extension appears in toolbar

---

## Step 5 — Test It

1. Open https://meet.google.com
2. Click the ScreenSafe icon — it should show "Google Meet" badge
3. Start or join a meeting
4. Click "Present now" → "Your entire screen" or a window
5. Open Notepad and type: OTP: 482910
6. The viewer's stream should show it blurred
7. Your screen stays completely normal

---

## How It Works — Data Flow

```
1. You open Google Meet
         ↓
2. content_script.js loads at document_start
         ↓
3. Injects injected.js into page context
         ↓
4. injected.js overrides navigator.mediaDevices.getDisplayMedia
         ↓
5. You click "Share Screen" in Meet
         ↓
6. Meet calls getDisplayMedia() → our interceptor runs
         ↓
7. We get the real stream from OS
         ↓
8. Create hidden <video> reading from real stream
         ↓
9. Create hidden <canvas> 
         ↓
10. Draw real frames onto canvas at 20fps
         ↓
11. Every 500ms: send frame snapshot to OCR Web Worker
         ↓
12. Worker runs Tesseract.js, finds sensitive words
         ↓
13. Worker returns bounding boxes of sensitive regions
         ↓
14. Main thread blurs those regions on canvas
         ↓
15. canvas.captureStream() creates a new video stream
         ↓
16. We return THIS stream to Google Meet
         ↓
17. Meet sends the blurred stream to other participants
         ↓
18. Your actual screen: completely untouched
```

---

## Supported Platforms

| Platform        | Works? | URL                           |
|-----------------|--------|-------------------------------|
| Google Meet     | ✅     | meet.google.com               |
| Zoom Web        | ✅     | zoom.us/wc/                   |
| Microsoft Teams | ✅     | teams.microsoft.com           |
| Whereby         | ✅     | whereby.com                   |
| Slack           | ✅     | app.slack.com                 |
| Webex           | ✅     | webex.com                     |
| Zoom Desktop    | ❌     | Native app (not browser)      |
| Teams Desktop   | ❌     | Native app (not browser)      |

---

## What Gets Detected and Hidden

Triggered by keyword + value:
- OTP is 482910           → 482910 blurred
- Password: Secret@123    → Secret@123 blurred
- CVV: 234                → 234 blurred
- Card: 4111 1111 1111 1111 → all 4 blocks blurred

Detected standalone (no keyword needed):
- Full 16-digit card numbers
- Email addresses
- Phone numbers (10-13 digits)
- PAN card (ABCDE1234F)
- IFSC codes (HDFC0001234)
- SSN (123-45-6789)
- API keys (sk-..., ghp_...)

Never blocked:
- Dates, times, years
- Temperatures, percentages
- Prices, file sizes
- Regular short numbers

---

## Troubleshooting

**Extension not loading:**
Check chrome://extensions for errors. Usually missing files.

**OCR not working:**
Check browser console for Tesseract errors.
Make sure tesseract.min.js and eng.traineddata.gz are present.

**Blur not appearing:**
Open DevTools console on meet.google.com
Look for [ScreenSafe] log messages.

**Performance issues:**
Reduce blur strength in popup, or switch to blackbox mode.
OCR runs every 500ms — this is the main CPU cost.

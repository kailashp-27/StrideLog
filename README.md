# StrideLog — Personal Treadmill Run Tracker

A fully offline-capable PWA for manually logging treadmill runs. No backend, no accounts, no cloud — data lives on your device.

## Features

- **Console hero** — LED-style readouts for distance, sessions, avg pace
- **Monthly goal** — set a target km, track progress with a lane-striped progress bar
- **Run calendar** — day grid with red tick markers proportional to distance
- **Log a run** — date, distance, duration, incline, notes; pace auto-calculated
- **Run history** — this month's runs, most recent first, each deletable
- **All-time stats** — lifetime km, run count, longest streak, best pace
- **Export / Import** — download your data as JSON, reimport on another device

## File Structure

```
stridelog/
├── index.html      # App shell + PWA meta
├── styles.css      # Design system (treadmill console aesthetic)
├── app.js          # All app logic
├── manifest.json   # PWA manifest
├── sw.js           # Service worker (cache-first, offline-ready)
├── icon-192.png    # PWA icon
├── icon-512.png    # PWA icon
└── README.md       # This file
```

---

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository (e.g., `your-username/stridelog`).
2. Go to **Settings → Pages**.
3. Under **Source**, choose `main` branch / `/ (root)` and click **Save**.
4. Your app will be live at `https://your-username.github.io/stridelog/` within ~1 minute.

> **Important for service worker**: GitHub Pages serves over HTTPS, so the service worker will register correctly. The app will be fully installable.

---

## Deploying to Netlify (Drag & Drop — easiest)

1. Go to [app.netlify.com](https://app.netlify.com) and log in (free account).
2. On the dashboard, drag the entire `stridelog/` folder into the deploy zone.
3. Netlify gives you a URL like `https://amazing-name-12345.netlify.app`.
4. Optionally set a custom domain in **Site Settings → Domain management**.

---

## Installing to Your Phone's Home Screen

### Android / Chrome
1. Open the app URL in Chrome.
2. Tap the **⋮ (three-dot menu)** → **"Add to Home screen"**.
3. Confirm — the app appears as a standalone icon on your home screen.
4. When opened from the home screen, it runs in standalone mode (no browser chrome) and works **fully offline**.

### iPhone / Safari
1. Open the app URL in **Safari** (not Chrome — only Safari supports "Add to Home Screen" on iOS).
2. Tap the **Share button** (square with arrow) at the bottom.
3. Scroll down and tap **"Add to Home Screen"**.
4. Edit the name if you like, then tap **Add**.
5. The app launches in standalone mode and works offline.

---

## Local Development

No build step needed — open `index.html` directly in a browser for a quick look. 

For the service worker to register (required for full PWA testing), you need to serve files over HTTP:

```bash
# Option 1: Python (built-in)
python -m http.server 8080

# Option 2: Node http-server
npx -y http-server . -p 8080

# Option 3: VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

Then open `http://localhost:8080` in Chrome.

To inspect the service worker and cached assets:
- Open DevTools → **Application** tab
- Check **Service Workers** (should show "activated and is running")
- Check **Cache Storage** → `stridelog-v1` (all assets listed)
- Check **Local Storage** → `stridelog:runs`, `stridelog:goal`

---

## Data Backup

Your data is stored in `localStorage` — it persists through app closes and phone restarts, but is tied to one browser/device.

**To move data to a new device:**
1. Tap **Export** — downloads `stridelog-export-YYYY-MM-DD.json`
2. Transfer the file to the new device (AirDrop, email, Google Drive, etc.)
3. Open StrideLog on the new device, tap **Import**, and select the file
4. Your runs merge automatically (no duplicates)

---

## PWA Checklist

| Item | Status |
|------|--------|
| `manifest.json` with name, icons, display:standalone | ✅ |
| `start_url: "/"` | ✅ |
| `theme_color` + `background_color` | ✅ |
| 192×192 and 512×512 icons | ✅ |
| Service worker registered | ✅ |
| Cache-first offline strategy | ✅ |
| iOS meta tags (`apple-mobile-web-app-capable`, etc.) | ✅ |
| HTTPS required (GitHub Pages / Netlify) | ✅ |

# StrideLog

A small app for logging treadmill runs and checking progress over time. Enter a run's distance and duration, and StrideLog calculates the pace and adds it to your history.

It is built with plain HTML, CSS, and JavaScript. Runs are saved in the browser, so there is no account or backend to set up.

## Features

- Add, edit, and delete runs, including incline, notes, and target pace.
- Set weekly and monthly distance goals.
- Review a run calendar, weekly volume, pace trends, and yearly distance.
- Track totals, streaks, best pace, and estimated personal records.
- Export and import runs as JSON.
- Install the app as a PWA and use cached pages offline.

## Run locally

From the repository root:

```bash
python -m http.server 8080
```

Open [localhost:8080](http://localhost:8080). There are no packages to install or build commands to run.

Use localhost or an HTTPS host to test the service worker. After a successful first load and cache installation, the app can work offline.

## Your data

Runs and goals are stored in `localStorage` for the current browser and site address. There is no automatic sync between devices. Clearing the site's browser data removes your saved runs.

Use **Export JSON** to keep a backup or move runs to another device. **Import JSON** merges runs using their IDs and restores the monthly goal when present. The current export does not include the separate weekly goal.

Estimated short-distance records are calculated from logged run pace, rather than measured splits.

## Hosting and installation

Serve the repository files from the root of a static HTTPS site. The manifest and service worker use absolute paths such as `/app.js` and `/index.html`. Hosting under a subdirectory, including a GitHub project Pages URL, needs those paths and `start_url` adjusted first.

On a phone, use the browser's install or Add to Home Screen option. Availability depends on the browser and platform.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App screens and forms |
| `app.js` | Run storage, statistics, charts, and import/export |
| `styles.css` | Layout and styling |
| `manifest.json` | App name, icons, and installation settings |
| `sw.js` | Static asset caching and offline handling |

When changing cached assets, update the cache version in `sw.js` so installed copies can pick up the new files.

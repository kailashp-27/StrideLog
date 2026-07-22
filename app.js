/* =========================================================
   STRIDELOG — app.js
   All app logic: data layer, UI rendering, features
   ========================================================= */

'use strict';

// ── Storage Keys ──────────────────────────────────────────
const KEY_RUNS        = 'stridelog:runs';
const KEY_GOAL        = 'stridelog:goal';
const KEY_WEEKLY_GOAL = 'stridelog:weeklyGoal';

// ── State ─────────────────────────────────────────────────
let viewYear  = new Date().getFullYear();
let viewMonth = new Date().getMonth(); // 0-indexed
let activeTab = 'dashboard';
let editingRunId = null;

// ── Utility: localStorage wrappers ───────────────────────
function loadRuns() {
  try {
    const raw = localStorage.getItem(KEY_RUNS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[StrideLog] Failed to load runs:', e);
    return [];
  }
}

function saveRuns(runs) {
  try {
    localStorage.setItem(KEY_RUNS, JSON.stringify(runs));
  } catch (e) {
    console.error('[StrideLog] Failed to save runs:', e);
    showToast('Could not save run — storage may be full.', 'error');
  }
}

function loadGoal() {
  try {
    const raw = localStorage.getItem(KEY_GOAL);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed.monthlyKm === 'number') ? parsed : { monthlyKm: 30 };
  } catch (e) {
    return { monthlyKm: 30 };
  }
}

function saveGoal(goal) {
  try {
    localStorage.setItem(KEY_GOAL, JSON.stringify(goal));
  } catch (e) {
    console.error('[StrideLog] Failed to save goal:', e);
  }
}

function loadWeeklyGoal() {
  try {
    const raw = localStorage.getItem(KEY_WEEKLY_GOAL);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed.weeklyKm === 'number') ? parsed : { weeklyKm: 20 };
  } catch (e) {
    return { weeklyKm: 20 };
  }
}

function saveWeeklyGoal(goal) {
  try {
    localStorage.setItem(KEY_WEEKLY_GOAL, JSON.stringify(goal));
  } catch (e) {
    console.error('[StrideLog] Failed to save weekly goal:', e);
  }
}

// ── Utility: ID + date helpers ────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatPace(durationMin, distanceKm) {
  if (!distanceKm || distanceKm <= 0 || !durationMin || durationMin <= 0) return '—:——';
  const total = durationMin / distanceKm;
  const mins  = Math.floor(total);
  const secs  = Math.round((total - mins) * 60);
  return `${mins}:${String(secs).padStart(2,'0')}`;
}

function parsePaceToMinutes(paceStr) {
  if (!paceStr || paceStr === '—:——') return Infinity;
  const parts = paceStr.split(':');
  if (parts.length !== 2) return Infinity;
  return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
}

/**
 * parseDuration(str) — interprets user input as MM.SS
 * Examples:
 *   '30'     → 30.0  (30 minutes)
 *   '30.45'  → 30.75 (30 min 45 sec)
 *   '30.5'   → 30.5  (30 min 5 sec → 30 + 5/60 ≈ 30.0833)
 *   '1.3045' → invalid / ignored beyond two decimal places
 * The decimal part is ALWAYS treated as seconds (00–59).
 */
function parseDuration(str) {
  if (str === '' || str == null) return NaN;
  const s = String(str).trim();
  const dotIdx = s.indexOf('.');
  if (dotIdx === -1) {
    // No decimal — plain minutes
    const mins = parseFloat(s);
    return isNaN(mins) ? NaN : mins;
  }
  const minPart = parseFloat(s.substring(0, dotIdx));
  const secStr  = s.substring(dotIdx + 1).padEnd(2, '0').substring(0, 2); // take up to 2 digits
  const secPart = parseInt(secStr, 10);
  if (isNaN(minPart) || isNaN(secPart) || secPart >= 60) return NaN;
  return minPart + secPart / 60;
}

/**
 * formatDurationDisplay(durationMin) — converts stored decimal minutes → 'MM.SS'
 * e.g. 30.75 → '30.45'  (30 min 45 sec)
 */
function formatDurationDisplay(durationMin) {
  if (durationMin == null || isNaN(durationMin)) return '';
  const mins = Math.floor(durationMin);
  const secs = Math.round((durationMin - mins) * 60);
  if (secs === 0) return String(mins);
  return `${mins}.${String(secs).padStart(2, '0')}`;
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

// ── Utility: consecutive-streak calculator ────────────────
function longestStreak(runs) {
  return longestStreakWithDates(runs).count;
}

function longestStreakWithDates(runs) {
  if (!runs.length) return { count: 0, startDate: null, endDate: null };
  const dates = [...new Set(runs.map(r => r.date))].sort();
  let best = 1, cur = 1;
  let bestStart = dates[0], bestEnd = dates[0];
  let curStart = dates[0];
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i-1]);
    const curr = new Date(dates[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) {
      cur++;
      if (cur > best) {
        best = cur;
        bestStart = curStart;
        bestEnd = dates[i];
      }
    } else {
      cur = 1;
      curStart = dates[i];
    }
  }
  return { count: best, startDate: bestStart, endDate: bestEnd };
}

// ── Utility: format ISO date as short readable label ───────
function formatDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Utility: parse pace string "M:SS" → decimal minutes ────
function parsePaceInput(str) {
  if (!str || !str.trim()) return NaN;
  const s = str.trim();
  const parts = s.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const sec = parseInt(parts[1], 10);
    if (!isNaN(m) && !isNaN(sec) && sec >= 0 && sec < 60) return m + sec / 60;
  }
  // plain decimal minutes
  const val = parseFloat(s);
  return isNaN(val) ? NaN : val;
}

// ── Personal Records ──────────────────────────────────────
function computePRs(runs) {
  const validRuns = runs.filter(r => r.distanceKm > 0 && r.durationMin > 0);

  // Best average pace (any run)
  let bestAvgPace = null;
  if (validRuns.length) {
    const sorted = [...validRuns].sort((a, b) =>
      (a.durationMin / a.distanceKm) - (b.durationMin / b.distanceKm)
    );
    const r = sorted[0];
    bestAvgPace = {
      paceDecimal: r.durationMin / r.distanceKm,
      paceStr: formatPace(r.durationMin, r.distanceKm),
      date: r.date
    };
  }

  // Best 1 km (runs with distanceKm >= 1): fastest pace → pace × 1
  let best1km = null;
  const runs1k = validRuns.filter(r => r.distanceKm >= 1);
  if (runs1k.length) {
    const sorted = [...runs1k].sort((a, b) =>
      (a.durationMin / a.distanceKm) - (b.durationMin / b.distanceKm)
    );
    const r = sorted[0];
    const paceDecimal = r.durationMin / r.distanceKm;
    const estMin = Math.floor(paceDecimal);
    const estSec = Math.round((paceDecimal - estMin) * 60);
    best1km = {
      paceDecimal,
      paceStr: formatPace(r.durationMin, r.distanceKm),
      estTime: `${estMin}:${String(estSec).padStart(2, '0')}`,
      date: r.date
    };
  }

  // Best 2 km (runs with distanceKm >= 2): fastest pace → pace × 2
  let best2km = null;
  const runs2k = validRuns.filter(r => r.distanceKm >= 2);
  if (runs2k.length) {
    const sorted = [...runs2k].sort((a, b) =>
      (a.durationMin / a.distanceKm) - (b.durationMin / b.distanceKm)
    );
    const r = sorted[0];
    const paceDecimal = r.durationMin / r.distanceKm;
    const est2 = paceDecimal * 2;
    const estMin = Math.floor(est2);
    const estSec = Math.round((est2 - estMin) * 60);
    best2km = {
      paceDecimal,
      paceStr: formatPace(r.durationMin, r.distanceKm),
      estTime: `${estMin}:${String(estSec).padStart(2, '0')}`,
      date: r.date
    };
  }

  // Best streak
  const streakInfo = longestStreakWithDates(runs);

  return { bestAvgPace, best1km, best2km, streak: streakInfo };
}

function checkAndToastPRs(newRun, prevRuns) {
  if (!newRun.distanceKm || !newRun.durationMin) return;
  const oldPRs = computePRs(prevRuns);
  const newPace = newRun.durationMin / newRun.distanceKm;

  // Check best avg pace
  if (!oldPRs.bestAvgPace || newPace < oldPRs.bestAvgPace.paceDecimal) {
    const pStr = formatPace(newRun.durationMin, newRun.distanceKm);
    showToast(`New PR! Best pace — ${pStr}/km`, 'pr');
  }

  // Check best 1km
  if (newRun.distanceKm >= 1) {
    if (!oldPRs.best1km || newPace < oldPRs.best1km.paceDecimal) {
      showToast(`New PR! Best 1 km estimate`, 'pr');
    }
  }

  // Check best 2km
  if (newRun.distanceKm >= 2) {
    if (!oldPRs.best2km || newPace < oldPRs.best2km.paceDecimal) {
      showToast(`New PR! Best 2 km estimate`, 'pr');
    }
  }
}

function renderPRCard() {
  const runs = loadRuns();
  const prs = computePRs(runs);
  const container = document.getElementById('pr-card-content');
  if (!container) return;

  const items = [];

  // Best 1 km
  if (prs.best1km) {
    items.push(`
      <div class="pr-item">
        <div class="pr-item__label">Best 1 km</div>
        <div class="pr-item__value">${prs.best1km.estTime}</div>
        <div class="pr-item__sub">${prs.best1km.paceStr}/km</div>
        <div class="pr-item__date">${formatDateShort(prs.best1km.date)}</div>
      </div>`);
  } else {
    items.push(`<div class="pr-item pr-item--empty"><div class="pr-item__label">Best 1 km</div><div class="pr-item__value">—</div><div class="pr-item__date">Log a 1km+ run</div></div>`);
  }

  // Best 2 km
  if (prs.best2km) {
    items.push(`
      <div class="pr-item">
        <div class="pr-item__label">Best 2 km</div>
        <div class="pr-item__value">${prs.best2km.estTime}</div>
        <div class="pr-item__sub">${prs.best2km.paceStr}/km</div>
        <div class="pr-item__date">${formatDateShort(prs.best2km.date)}</div>
      </div>`);
  } else {
    items.push(`<div class="pr-item pr-item--empty"><div class="pr-item__label">Best 2 km</div><div class="pr-item__value">—</div><div class="pr-item__date">Log a 2km+ run</div></div>`);
  }

  // Best avg pace
  if (prs.bestAvgPace) {
    items.push(`
      <div class="pr-item">
        <div class="pr-item__label">Best pace</div>
        <div class="pr-item__value">${prs.bestAvgPace.paceStr}</div>
        <div class="pr-item__sub">min/km</div>
        <div class="pr-item__date">${formatDateShort(prs.bestAvgPace.date)}</div>
      </div>`);
  } else {
    items.push(`<div class="pr-item pr-item--empty"><div class="pr-item__label">Best pace</div><div class="pr-item__value">—</div><div class="pr-item__date">No runs yet</div></div>`);
  }

  // Best streak
  const sc = prs.streak;
  let streakDateRange = '';
  if (sc.count > 0 && sc.startDate && sc.endDate && sc.startDate !== sc.endDate) {
    streakDateRange = `${formatDateShort(sc.startDate)}–${formatDateShort(sc.endDate)}`;
  } else if (sc.count > 0 && sc.startDate) {
    streakDateRange = formatDateShort(sc.startDate);
  }
  if (sc.count > 0) {
    items.push(`
      <div class="pr-item">
        <div class="pr-item__label">Best streak</div>
        <div class="pr-item__value">${sc.count}<span class="pr-item__unit"> days</span></div>
        <div class="pr-item__sub">${streakDateRange}</div>
        <div class="pr-item__date">&nbsp;</div>
      </div>`);
  } else {
    items.push(`<div class="pr-item pr-item--empty"><div class="pr-item__label">Best streak</div><div class="pr-item__value">—</div><div class="pr-item__date">No runs yet</div></div>`);
  }

  container.innerHTML = items.join('');
}

// ── Suggested Pace ────────────────────────────────────────
// How much faster than the monthly average to suggest (3% nudge)
const PACE_NUDGE = 0.97;

function getSuggestedPace() {
  const runs = loadRuns();
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth();

  function monthAvg(year, month) {
    const mRuns = runs.filter(r => {
      const [ry, rm] = r.date.split('-').map(Number);
      return ry === year && (rm - 1) === month && r.distanceKm > 0 && r.durationMin > 0;
    });
    if (mRuns.length < 2) return null;
    const totalKm  = mRuns.reduce((s, r) => s + r.distanceKm, 0);
    const totalMin = mRuns.reduce((s, r) => s + r.durationMin, 0);
    const avgPace  = totalMin / totalKm;
    // Apply nudge: suggest slightly faster than average to be motivating
    return { paceDecimal: avgPace * PACE_NUDGE, avgPaceDecimal: avgPace, count: mRuns.length };
  }

  const thisMo = monthAvg(cy, cm);
  if (thisMo) {
    thisMo.label = `avg this month (${thisMo.count} runs) · beat by ~3%`;
    return thisMo;
  }

  let py = cy, pm = cm - 1;
  if (pm < 0) { pm = 11; py--; }
  const prevMo = monthAvg(py, pm);
  if (prevMo) {
    prevMo.label = `last month's avg · beat by ~3%`;
    return prevMo;
  }

  return null;
}

function renderPaceSuggestion() {
  const el = document.getElementById('pace-suggestion');
  if (!el) return;
  const sug = getSuggestedPace();
  if (!sug) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  const targetStr = formatPace(sug.paceDecimal, 1);
  const avgStr    = formatPace(sug.avgPaceDecimal, 1);
  el.hidden = false;
  el.innerHTML = `
    <span class="pace-sug__label">Target pace:</span>
    <span class="pace-sug__value">${targetStr}/km</span>
    <span class="pace-sug__basis">${sug.label} (${avgStr}/km)</span>
  `;
}

// ── Toast System ──────────────────────────────────────────
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'pr' ? '★' : 'ℹ';
  toast.innerHTML = `<span style="font-weight:700;font-family:var(--font-mono)">${icon}</span> ${msg}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}

// ══════════════════════════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════════════════════════
function switchTab(tabId) {
  // Hide all panels
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  // Deactivate all nav buttons
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  // Show target panel
  const panel = document.getElementById(`tab-${tabId}`);
  if (panel) panel.classList.add('active');

  // Activate nav button
  const btn = document.getElementById(`nav-${tabId}`);
  if (btn) {
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
  }

  activeTab = tabId;

  // Lazy-render analytics charts on tab switch
  if (tabId === 'analytics') {
    renderWeeklyVolumeChart();
    renderPaceTrendChart();
    renderYearlyStats();
  }
}

// Wire up bottom nav buttons
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

// ── Render: Console Hero ──────────────────────────────────
function renderConsoleHero() {
  const runs = loadRuns();
  const monthRuns = runs.filter(r => {
    const [y, m] = r.date.split('-').map(Number);
    return y === viewYear && (m - 1) === viewMonth;
  });

  const totalKm  = monthRuns.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const sessions = monthRuns.length;
  const avgPace  = (sessions > 0)
    ? formatPace(
        monthRuns.reduce((s, r) => s + (r.durationMin || 0), 0),
        totalKm
      )
    : '—:——';

  document.getElementById('stat-distance').textContent = totalKm.toFixed(1);
  document.getElementById('stat-sessions').textContent = sessions;
  document.getElementById('stat-pace').textContent = avgPace;
}

// ── Render: Goal ──────────────────────────────────────────
function renderGoal() {
  const goal = loadGoal();
  const runs = loadRuns();
  const monthRuns = runs.filter(r => {
    const [y, m] = r.date.split('-').map(Number);
    return y === viewYear && (m - 1) === viewMonth;
  });
  const totalKm = monthRuns.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const pct = Math.min(100, (totalKm / goal.monthlyKm) * 100);

  document.getElementById('goal-display').textContent = `${goal.monthlyKm} km`;
  document.getElementById('goal-progress-text').textContent =
    `${totalKm.toFixed(1)} / ${goal.monthlyKm} km`;
  document.getElementById('goal-pct-text').textContent = `${Math.round(pct)}%`;
  document.getElementById('progress-fill').style.width = `${pct}%`;

  const bar = document.querySelector('.progress-track');
  bar.setAttribute('aria-valuenow', Math.round(pct));
}

// ── Render: Calendar ──────────────────────────────────────
function renderCalendar() {
  const runs = loadRuns();
  const monthRuns = runs.filter(r => {
    const [y, m] = r.date.split('-').map(Number);
    return y === viewYear && (m - 1) === viewMonth;
  });

  const runMap = {};
  monthRuns.forEach(r => {
    const d = r.date.split('-')[2];
    runMap[d] = (runMap[d] || 0) + (r.distanceKm || 0);
  });

  const totalDays   = daysInMonth(viewYear, viewMonth);
  const startOffset = firstDayOfWeek(viewYear, viewMonth);

  const grid = document.getElementById('cal-grid');
  const existing = grid.querySelectorAll('.cal-day');
  existing.forEach(el => el.remove());

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement('div');
    const dayStr = String(day).padStart(2, '0');
    const dateISO = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${dayStr}`;
    const km = runMap[dayStr];

    cell.className = 'cal-day';
    if (km !== undefined) cell.classList.add('has-run');

    const num = document.createElement('div');
    num.className = 'cal-day__num';
    num.textContent = day;
    cell.appendChild(num);

    cell.setAttribute('aria-label', `${dateISO}${km ? `: ${km.toFixed(1)} km` : ''}`);
    grid.appendChild(cell);
  }
}

// ── Render: History ───────────────────────────────────────
function renderHistory() {
  const runs = loadRuns();
  const monthRuns = runs
    .filter(r => {
      const [y, m] = r.date.split('-').map(Number);
      return y === viewYear && (m - 1) === viewMonth;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Update history tab header label
  const histLabel = document.getElementById('history-month-label');
  if (histLabel) histLabel.textContent = monthLabel(viewYear, viewMonth);

  const list = document.getElementById('run-list');
  list.innerHTML = '';

  if (!monthRuns.length) {
    list.innerHTML = `
      <div class="empty-state" aria-label="No runs this month">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#7A8290" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <p>No runs logged this month.</p>
        <p style="margin-top:4px;opacity:0.6;font-size:0.8rem">Tap <strong>Log Run</strong> below to get started.</p>
      </div>`;
    return;
  }

  monthRuns.forEach(run => {
    const pace = formatPace(run.durationMin, run.distanceKm);
    const card = document.createElement('article');
    card.className = 'run-card';
    card.setAttribute('data-id', run.id);

    // Under-target indicator: only show if target set AND pace beat it
    let underTargetBadge = '';
    if (run.targetPaceMinPerKm && run.distanceKm > 0 && run.durationMin > 0) {
      const actualPace = run.durationMin / run.distanceKm;
      if (actualPace < run.targetPaceMinPerKm) {
        underTargetBadge = `<span class="under-target" title="Beat target pace">↓ under target</span>`;
      }
    }

    card.innerHTML = `
      <div class="run-card__top">
        <div class="run-card__date">${formatDate(run.date)}${underTargetBadge}</div>
        <div class="run-card__actions">
          <button class="btn-edit" data-id="${run.id}" aria-label="Edit run on ${run.date}">Edit</button>
          <button class="btn-delete" data-id="${run.id}" aria-label="Delete run on ${run.date}">Delete</button>
        </div>
      </div>
      <div class="run-card__metrics">
        <div class="metric">
          <span class="metric__value dist">${run.distanceKm.toFixed(2)}</span>
          <span class="metric__unit">km</span>
        </div>
        <div class="metric">
          <span class="metric__value pace">${pace}</span>
          <span class="metric__unit">min/km</span>
        </div>
        ${run.durationMin ? `<div class="metric">
          <span class="metric__value dur">${formatDurationDisplay(run.durationMin)}</span>
          <span class="metric__unit">min</span>
        </div>` : ''}
        ${run.incline ? `<div class="metric">
          <span class="metric__value incl">${run.incline}%</span>
          <span class="metric__unit">incline</span>
        </div>` : ''}
      </div>
      ${run.notes ? `<div class="run-card__notes">${escapeHtml(run.notes)}</div>` : ''}
    `;
    list.appendChild(card);
  });
}

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render: All-time Stats ────────────────────────────────
function renderStats() {
  const runs = loadRuns();

  const lifetimeKm   = runs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const lifetimeRuns = runs.length;
  const streak       = runs.length ? longestStreak(runs) : 0;

  let bestPace = '—:——';
  if (runs.length) {
    const paces = runs
      .filter(r => r.distanceKm > 0 && r.durationMin > 0)
      .map(r => ({ val: r.durationMin / r.distanceKm, run: r }));
    if (paces.length) {
      paces.sort((a, b) => a.val - b.val);
      bestPace = formatPace(paces[0].run.durationMin, paces[0].run.distanceKm);
    }
  }

  document.getElementById('stat-lifetime-km').textContent  = lifetimeKm.toFixed(1);
  document.getElementById('stat-lifetime-runs').textContent = lifetimeRuns;
  document.getElementById('stat-streak').textContent        = streak;
  document.getElementById('stat-best-pace').textContent     = bestPace;

  renderPRCard();
}

// ── Render: Weekly Goal ───────────────────────────────────
function renderWeeklyGoal() {
  const wgoal   = loadWeeklyGoal();
  const weeklyKm = wgoal.weeklyKm;
  const runs    = loadRuns();

  document.getElementById('wgoal-display').textContent = `${weeklyKm} km`;

  const year  = viewYear;
  const month = viewMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  const startSun = new Date(firstDay);
  startSun.setDate(firstDay.getDate() - firstDay.getDay());

  const weeks = [];
  let cursor = new Date(startSun);
  while (cursor <= lastDay) {
    const wStart = new Date(cursor);
    const wEnd   = new Date(cursor);
    wEnd.setDate(wEnd.getDate() + 6);
    weeks.push({ start: wStart, end: wEnd });
    cursor.setDate(cursor.getDate() + 7);
  }

  const today = new Date();
  today.setHours(0,0,0,0);

  const weekStats = weeks.map((w, idx) => {
    let km = 0;
    runs.forEach(r => {
      const [ry, rm, rd] = r.date.split('-').map(Number);
      const d = new Date(ry, rm - 1, rd);
      d.setHours(0, 0, 0, 0);
      // Count ALL runs that fall within this week's range (not just current month)
      if (d >= w.start && d <= w.end) km += (r.distanceKm || 0);
    });

    const hit     = km >= weeklyKm;
    // A week is only "future" if its END is still ahead of today (i.e. hasn't started yet)
    const future  = w.end < today ? false : w.start > today;
    const current = today >= w.start && today <= w.end;

    return { idx, km, hit, future, current, start: w.start, end: w.end };
  });

  const container = document.getElementById('week-lanes');
  container.innerHTML = '';

  weekStats.forEach((w, i) => {
    const row = document.createElement('div');
    const pct = Math.min(100, (w.km / weeklyKm) * 100);

    let state = 'partial';
    if (w.hit)    state = 'hit';
    if (w.future) state = 'future';

    row.className = `week-row ${state}`;

    const label = document.createElement('div');
    label.className = 'week-row__label';
    label.textContent = `Wk ${i + 1}`;

    const barWrap = document.createElement('div');
    barWrap.className = 'week-row__bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'week-row__bar';
    bar.style.width = `${pct}%`;
    barWrap.appendChild(bar);

    const kmEl = document.createElement('div');
    kmEl.className = 'week-row__km';
    kmEl.textContent = w.km > 0 ? `${w.km.toFixed(1)} km` : (w.future ? '—' : '0.0 km');

    row.appendChild(label);
    row.appendChild(barWrap);
    row.appendChild(kmEl);
    container.appendChild(row);
  });

  const completedWeeks  = weekStats.filter(w => !w.future);
  const hitsCount       = completedWeeks.filter(w => w.hit).length;
  const totalPast       = completedWeeks.length;
  const isPerfect       = totalPast > 0 && hitsCount === totalPast;

  const summary = document.getElementById('week-summary');
  summary.innerHTML = ''; // removed per user request
}

// ── Render: Yearly Stats ──────────────────────────────────
function renderYearlyStats() {
  const runs = loadRuns();
  const year = viewYear;

  document.getElementById('yearly-year-label').textContent = year;

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today  = new Date();

  const monthData = MONTHS.map((label, m) => {
    const mRuns = runs.filter(r => {
      const [ry, rm] = r.date.split('-').map(Number);
      return ry === year && (rm - 1) === m;
    });
    const totalKm  = mRuns.reduce((s, r) => s + (r.distanceKm || 0), 0);
    const totalMin = mRuns.reduce((s, r) => s + (r.durationMin || 0), 0);
    const pace     = formatPace(totalMin, totalKm);
    return { label, m, totalKm, pace, isEmpty: totalKm === 0 };
  });

  const maxKm = Math.max(...monthData.map(d => d.totalKm), 1);
  const chart = document.getElementById('yearly-chart');
  chart.innerHTML = '';

  monthData.forEach(data => {
    const isCurrentMonth = (data.m === today.getMonth() && year === today.getFullYear());
    const row = document.createElement('div');
    row.className = [
      'month-row',
      data.isEmpty    ? 'empty-month'    : '',
      isCurrentMonth  ? 'current-month'  : ''
    ].join(' ').trim();

    const barPct = data.isEmpty ? 0 : Math.max(2, (data.totalKm / maxKm) * 100);

    row.innerHTML = `
      <div class="month-row__label">${data.label}</div>
      <div class="month-row__bar-wrap">
        <div class="month-row__bar" style="width:${barPct}%"></div>
      </div>
      <div class="month-row__km">${data.isEmpty ? '—' : data.totalKm.toFixed(1) + ' km'}</div>
      <div class="month-row__pace">${data.isEmpty ? '—' : data.pace}</div>
    `;
    chart.appendChild(row);
  });
}

// ══════════════════════════════════════════════════════════
// ANALYTICS: WEEKLY VOLUME CHART (8-week paginated window)
// ══════════════════════════════════════════════════════════
let volOffset = 0; // pages back from current 8-week window (0 = most recent)

function renderWeeklyVolumeChart() {
  const runs = loadRuns();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start of the current week (Sunday)
  const currentSunday = new Date(today);
  currentSunday.setDate(today.getDate() - today.getDay());

  // Anchor: end of the displayed window. Offset 0 = this week is the last col.
  // Each page steps back 8 weeks.
  const anchorSunday = new Date(currentSunday);
  anchorSunday.setDate(currentSunday.getDate() - volOffset * 8 * 7);

  // Build 8 weeks ending at anchorSunday (oldest → newest)
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(anchorSunday);
    wStart.setDate(anchorSunday.getDate() - i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    const isCurrent = volOffset === 0 && i === 0;
    weeks.push({ start: wStart, end: wEnd, isCurrent });
  }

  // Sum km per week
  const weekData = weeks.map(w => {
    let km = 0;
    runs.forEach(r => {
      const [ry, rm, rd] = r.date.split('-').map(Number);
      const d = new Date(ry, rm - 1, rd);
      d.setHours(0,0,0,0);
      if (d >= w.start && d <= w.end) km += (r.distanceKm || 0);
    });

    const m = w.start.getMonth();
    const d = w.start.getDate();
    return {
      km,
      isCurrent: w.isCurrent,
      label: `${MONTH_ABBR[m]}\n${d}`
    };
  });

  const maxKm = Math.max(...weekData.map(w => w.km), 1);
  const container = document.getElementById('weekly-volume-chart');
  container.innerHTML = '';

  weekData.forEach(w => {
    const pct = w.km > 0 ? Math.max(3, (w.km / maxKm) * 100) : 0;
    const col = document.createElement('div');
    col.className = `vol-col${w.isCurrent ? ' current' : ''}`;

    const [month, day] = w.label.split('\n');
    col.innerHTML = `
      <div class="vol-km">${w.km > 0 ? w.km.toFixed(1) : '—'}</div>
      <div class="vol-bar-wrap">
        <div class="vol-bar" style="height:${pct}%"></div>
      </div>
      <div class="vol-label">${month}<br>${day}</div>
    `;
    container.appendChild(col);
  });

  // Update the range label
  const rangeStart = weeks[0].start;
  const rangeEnd   = weeks[7].end;
  const fmt = d => `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
  const rangeEl = document.getElementById('vol-range-label');
  if (rangeEl) {
    rangeEl.textContent = volOffset === 0
      ? 'Last 8 weeks'
      : `${fmt(rangeStart)} – ${fmt(rangeEnd)}`;
  }

  // Enable/disable next button (can't go forward past current window)
  const nextBtn = document.getElementById('vol-next');
  if (nextBtn) nextBtn.disabled = volOffset === 0;

  // Disable prev if there are no runs older than the window start
  const prevBtn = document.getElementById('vol-prev');
  if (prevBtn) {
    const windowStart = weeks[0].start;
    const hasOlder = runs.some(r => {
      const [ry, rm, rd] = r.date.split('-').map(Number);
      return new Date(ry, rm - 1, rd) < windowStart;
    });
    prevBtn.disabled = !hasOlder;
  }
}

// Wire up vol-nav buttons (once DOM is ready)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('vol-prev')?.addEventListener('click', () => {
    volOffset++;
    renderWeeklyVolumeChart();
  });
  document.getElementById('vol-next')?.addEventListener('click', () => {
    if (volOffset > 0) { volOffset--; renderWeeklyVolumeChart(); }
  });
});


// ══════════════════════════════════════════════════════════
// ANALYTICS: PACE TREND CHART (last 20 runs, SVG line chart)
// ══════════════════════════════════════════════════════════
function renderPaceTrendChart() {
  const runs = loadRuns();

  // Last 20 valid runs, sorted chronologically oldest→newest
  const validRuns = runs
    .filter(r => r.distanceKm > 0 && r.durationMin > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-20);

  const container = document.getElementById('pace-chart');
  container.innerHTML = '';

  if (validRuns.length < 2) {
    container.innerHTML = `<div class="chart-empty">Log at least 2 runs to see your pace trend</div>`;
    return;
  }

  // Pace in decimal minutes per km
  const paces = validRuns.map(r => r.durationMin / r.distanceKm);
  const minPace = Math.min(...paces);
  const maxPace = Math.max(...paces);
  const range   = maxPace - minPace || 0.5;

  // SVG dimensions (viewBox units)
  const W = 340;
  const H = 160;
  const PAD = { top: 24, right: 16, bottom: 36, left: 46 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const n = validRuns.length;
  const xStep = chartW / Math.max(n - 1, 1);

  // Map run index → SVG coords (Y inverted: lower pace = higher on chart)
  const pts = paces.map((p, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top + ((maxPace - p) / range) * chartH,
    pace: p,
    run: validRuns[i]
  }));

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('aria-label', 'Pace trend chart');
  svg.style.overflow = 'visible';

  // ── Defs: gradient fill under line ──
  const defs = document.createElementNS(SVG_NS, 'defs');

  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', 'paceAreaGrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  const s1 = document.createElementNS(SVG_NS, 'stop');
  s1.setAttribute('offset', '0%');
  s1.setAttribute('stop-color', '#29B6A8');
  s1.setAttribute('stop-opacity', '0.25');
  const s2 = document.createElementNS(SVG_NS, 'stop');
  s2.setAttribute('offset', '100%');
  s2.setAttribute('stop-color', '#29B6A8');
  s2.setAttribute('stop-opacity', '0.0');
  grad.appendChild(s1); grad.appendChild(s2);
  defs.appendChild(grad);

  const clipPath = document.createElementNS(SVG_NS, 'clipPath');
  clipPath.setAttribute('id', 'chartClip');
  const clipRect = document.createElementNS(SVG_NS, 'rect');
  clipRect.setAttribute('x', PAD.left);
  clipRect.setAttribute('y', PAD.top);
  clipRect.setAttribute('width', chartW);
  clipRect.setAttribute('height', chartH);
  clipPath.appendChild(clipRect);
  defs.appendChild(clipPath);

  svg.appendChild(defs);

  // ── Y-axis grid lines & labels (4 levels) ──
  const yLevels = 4;
  for (let i = 0; i <= yLevels; i++) {
    const y = PAD.top + (i / yLevels) * chartH;
    const paceVal = maxPace - (i / yLevels) * range;

    // Grid line
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', PAD.left);
    line.setAttribute('x2', PAD.left + chartW);
    line.setAttribute('y1', y);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', 'rgba(241,239,234,0.06)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    // Y label
    const mins = Math.floor(paceVal);
    const secs = Math.round((paceVal - mins) * 60);
    const lbl = document.createElementNS(SVG_NS, 'text');
    lbl.setAttribute('x', PAD.left - 6);
    lbl.setAttribute('y', y + 3.5);
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('fill', 'rgba(122,130,144,0.75)');
    lbl.setAttribute('font-size', '9');
    lbl.setAttribute('font-family', 'JetBrains Mono, monospace');
    lbl.textContent = `${mins}:${String(secs).padStart(2,'0')}`;
    svg.appendChild(lbl);
  }

  // ── Area fill ──
  const bottomY = PAD.top + chartH;
  const areaD = `M${pts[0].x},${bottomY} ` +
    pts.map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${pts[pts.length-1].x},${bottomY} Z`;
  const area = document.createElementNS(SVG_NS, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', 'url(#paceAreaGrad)');
  area.setAttribute('clip-path', 'url(#chartClip)');
  svg.appendChild(area);

  // ── Trend line ──
  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#29B6A8');
  polyline.setAttribute('stroke-width', '2');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  // ── X-axis labels (show ~5 evenly spaced) ──
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const labelStep = Math.max(1, Math.floor(n / 5));
  pts.forEach((p, i) => {
    if (i % labelStep !== 0 && i !== n - 1) return;
    const [, rm, rd] = validRuns[i].date.split('-').map(Number);
    const xLbl = document.createElementNS(SVG_NS, 'text');
    xLbl.setAttribute('x', p.x);
    xLbl.setAttribute('y', PAD.top + chartH + 18);
    xLbl.setAttribute('text-anchor', 'middle');
    xLbl.setAttribute('fill', 'rgba(122,130,144,0.7)');
    xLbl.setAttribute('font-size', '8');
    xLbl.setAttribute('font-family', 'Inter, sans-serif');
    xLbl.textContent = `${rd} ${MONTHS[rm-1]}`;
    svg.appendChild(xLbl);
  });

  // ── Data points ──
  const bestIdx = paces.indexOf(minPace);
  pts.forEach((p, i) => {
    const isBest = i === bestIdx;
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', isBest ? '5.5' : '3');
    circle.setAttribute('fill', isBest ? '#29B6A8' : '#1C1F26');
    circle.setAttribute('stroke', '#29B6A8');
    circle.setAttribute('stroke-width', isBest ? '2' : '1.5');
    svg.appendChild(circle);

    // Best pace annotation
    if (isBest) {
      const bpMins = Math.floor(p.pace);
      const bpSecs = Math.round((p.pace - bpMins) * 60);
      const annotY = p.y - 12;

      const rect = document.createElementNS(SVG_NS, 'rect');
      const txtX = Math.min(Math.max(p.x, PAD.left + 24), PAD.left + chartW - 24);
      rect.setAttribute('x', txtX - 22);
      rect.setAttribute('y', annotY - 11);
      rect.setAttribute('width', '44');
      rect.setAttribute('height', '14');
      rect.setAttribute('rx', '3');
      rect.setAttribute('fill', 'rgba(41,182,168,0.18)');
      rect.setAttribute('stroke', 'rgba(41,182,168,0.4)');
      rect.setAttribute('stroke-width', '1');
      svg.appendChild(rect);

      const annot = document.createElementNS(SVG_NS, 'text');
      annot.setAttribute('x', txtX);
      annot.setAttribute('y', annotY - 0.5);
      annot.setAttribute('text-anchor', 'middle');
      annot.setAttribute('fill', '#29B6A8');
      annot.setAttribute('font-size', '8.5');
      annot.setAttribute('font-weight', '700');
      annot.setAttribute('font-family', 'JetBrains Mono, monospace');
      annot.textContent = `★ ${bpMins}:${String(bpSecs).padStart(2,'0')}`;
      svg.appendChild(annot);
    }
  });

  container.appendChild(svg);
}

// ── Render: All ───────────────────────────────────────────
function renderAll() {
  document.getElementById('month-label').textContent = monthLabel(viewYear, viewMonth);
  renderConsoleHero();
  renderGoal();
  renderWeeklyGoal();
  renderCalendar();
  renderHistory();
  renderStats(); // also calls renderPRCard()
  renderPaceSuggestion();
  // Charts only render when analytics tab is active (performance)
  if (activeTab === 'analytics') {
    renderWeeklyVolumeChart();
    renderPaceTrendChart();
    renderYearlyStats();
  }
}

// ══════════════════════════════════════════════════════════
// FEATURE: ADD RUN
// ══════════════════════════════════════════════════════════
document.getElementById('run-form').addEventListener('submit', e => {
  e.preventDefault();

  const dateVal       = document.getElementById('f-date').value.trim();
  const distanceVal   = parseFloat(document.getElementById('f-distance').value);
  const durationVal   = parseDuration(document.getElementById('f-duration').value);
  const inclineVal    = parseFloat(document.getElementById('f-incline').value) || 0;
  const notesVal      = document.getElementById('f-notes').value.trim();
  const targetPaceStr = (document.getElementById('f-target-pace')?.value || '').trim();
  const targetPaceVal = parsePaceInput(targetPaceStr);

  if (!dateVal) { showToast('Please enter a date.', 'error'); return; }
  if (!distanceVal || distanceVal <= 0) { showToast('Please enter a valid distance.', 'error'); return; }
  if (isNaN(durationVal) || durationVal <= 0) { showToast('Please enter a valid duration (e.g. 30 or 30.45 for 30 min 45 sec).', 'error'); return; }

  const prevRuns = loadRuns();

  const run = {
    id:          uid(),
    date:        dateVal,
    distanceKm:  distanceVal,
    durationMin: durationVal,
    incline:     inclineVal,
    notes:       notesVal || ''
  };
  if (!isNaN(targetPaceVal) && targetPaceVal > 0) {
    run.targetPaceMinPerKm = targetPaceVal;
  }

  // Check PRs before adding the new run
  checkAndToastPRs(run, prevRuns);

  prevRuns.push(run);
  saveRuns(prevRuns);

  // Jump to the month of the added run on dashboard
  const [runYear, runMonth] = dateVal.split('-').map(Number);
  viewYear  = runYear;
  viewMonth = runMonth - 1;

  renderAll();

  // Reset form
  document.getElementById('run-form').reset();
  document.getElementById('f-date').value = todayISO();
  document.getElementById('pace-preview').textContent = '—:——';
  renderPaceSuggestion();

  const dispSecs = Math.round((durationVal - Math.floor(durationVal)) * 60);
  const durLabel = dispSecs > 0
    ? `${Math.floor(durationVal)} min ${dispSecs} sec`
    : `${Math.floor(durationVal)} min`;
  showToast(`Run logged — ${distanceVal.toFixed(2)} km in ${durLabel}`, 'success');

  // Switch to dashboard to see the run in context
  switchTab('dashboard');
});

// ══════════════════════════════════════════════════════════
// FEATURE: DELETE + EDIT RUN (unified list click handler)
// ══════════════════════════════════════════════════════════
document.getElementById('run-list').addEventListener('click', e => {
  const editBtn   = e.target.closest('.btn-edit');
  const deleteBtn = e.target.closest('.btn-delete');

  if (editBtn) {
    openEditModal(editBtn.dataset.id);
    return;
  }

  if (deleteBtn) {
    const id   = deleteBtn.dataset.id;
    const runs = loadRuns();
    const idx  = runs.findIndex(r => r.id === id);
    if (idx === -1) return;

    const deleted = runs.splice(idx, 1)[0];
    saveRuns(runs);
    renderAll();
    showToast(`Run on ${formatDate(deleted.date)} deleted.`, 'info');
  }
});

// ══════════════════════════════════════════════════════════
// FEATURE: EDIT RUN MODAL
// ══════════════════════════════════════════════════════════
function openEditModal(runId) {
  const runs = loadRuns();
  const run  = runs.find(r => r.id === runId);
  if (!run) return;

  editingRunId = runId;

  document.getElementById('e-date').value     = run.date;
  document.getElementById('e-distance').value = run.distanceKm;
  document.getElementById('e-duration').value = formatDurationDisplay(run.durationMin);
  document.getElementById('e-incline').value  = run.incline || '';
  document.getElementById('e-notes').value    = run.notes || '';

  // Populate target pace field if present
  const tpEl = document.getElementById('e-target-pace');
  if (tpEl) {
    if (run.targetPaceMinPerKm) {
      tpEl.value = formatPace(run.targetPaceMinPerKm, 1);
    } else {
      tpEl.value = '';
    }
  }

  updateEditPacePreview();

  const overlay = document.getElementById('edit-overlay');
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  // Focus first input for accessibility
  setTimeout(() => document.getElementById('e-date').focus(), 350);
}

function closeEditModal() {
  editingRunId = null;
  const overlay = document.getElementById('edit-overlay');
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function updateEditPacePreview() {
  const dist = parseFloat(document.getElementById('e-distance').value);
  const dur  = parseDuration(document.getElementById('e-duration').value);
  document.getElementById('edit-pace-preview').textContent = formatPace(dur, dist);
}

// Edit form submit
document.getElementById('edit-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!editingRunId) return;

  const dateVal       = document.getElementById('e-date').value.trim();
  const distanceVal   = parseFloat(document.getElementById('e-distance').value);
  const durationVal   = parseDuration(document.getElementById('e-duration').value);
  const inclineVal    = parseFloat(document.getElementById('e-incline').value) || 0;
  const notesVal      = document.getElementById('e-notes').value.trim();
  const targetPaceStr = (document.getElementById('e-target-pace')?.value || '').trim();
  const targetPaceVal = parsePaceInput(targetPaceStr);

  if (!dateVal) { showToast('Please enter a date.', 'error'); return; }
  if (!distanceVal || distanceVal <= 0) { showToast('Please enter a valid distance.', 'error'); return; }
  if (isNaN(durationVal) || durationVal <= 0) { showToast('Please enter a valid duration (e.g. 30 or 30.45 for 30 min 45 sec).', 'error'); return; }

  const runs = loadRuns();
  const idx  = runs.findIndex(r => r.id === editingRunId);
  if (idx === -1) {
    showToast('Run not found.', 'error');
    closeEditModal();
    return;
  }

  const updatedRun = {
    ...runs[idx],
    date:        dateVal,
    distanceKm:  distanceVal,
    durationMin: durationVal,
    incline:     inclineVal,
    notes:       notesVal
  };
  if (!isNaN(targetPaceVal) && targetPaceVal > 0) {
    updatedRun.targetPaceMinPerKm = targetPaceVal;
  } else {
    delete updatedRun.targetPaceMinPerKm;
  }
  runs[idx] = updatedRun;

  saveRuns(runs);

  // Update view month to the edited run's month
  const [runYear, runMonth] = dateVal.split('-').map(Number);
  viewYear  = runYear;
  viewMonth = runMonth - 1;

  closeEditModal();
  renderAll();
  showToast(`Run updated — ${distanceVal.toFixed(2)} km`, 'success');
});

// Edit modal close triggers
document.getElementById('edit-close').addEventListener('click', closeEditModal);
document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
document.getElementById('edit-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeEditModal(); // backdrop tap
});

// Edit pace preview
document.getElementById('e-distance').addEventListener('input', updateEditPacePreview);
document.getElementById('e-duration').addEventListener('input', updateEditPacePreview);

// ── Feature: Month Navigation ─────────────────────────────
document.getElementById('prev-month').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderAll();
});

document.getElementById('next-month').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderAll();
});

// ── Feature: Monthly Goal Editing ─────────────────────────
const goalDisplay = document.getElementById('goal-display');
const goalInput   = document.getElementById('goal-input');

function enterGoalEdit() {
  const goal = loadGoal();
  goalInput.value = goal.monthlyKm;
  goalDisplay.style.display = 'none';
  goalInput.style.display   = 'block';
  goalInput.focus();
  goalInput.select();
}

function commitGoalEdit() {
  const val = parseFloat(goalInput.value);
  if (val > 0) {
    saveGoal({ monthlyKm: val });
    renderGoal();
    showToast(`Monthly goal set to ${val} km`, 'success');
  }
  goalInput.style.display   = 'none';
  goalDisplay.style.display = '';
}

goalDisplay.addEventListener('click', enterGoalEdit);
goalDisplay.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') enterGoalEdit(); });
goalInput.addEventListener('blur', commitGoalEdit);
goalInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { goalInput.blur(); }
  if (e.key === 'Escape') {
    goalInput.style.display   = 'none';
    goalDisplay.style.display = '';
  }
});

// ── Feature: Weekly Goal Editing ─────────────────────────
const wgoalDisplay = document.getElementById('wgoal-display');
const wgoalInput   = document.getElementById('wgoal-input');

function enterWGoalEdit() {
  const wgoal = loadWeeklyGoal();
  wgoalInput.value = wgoal.weeklyKm;
  wgoalDisplay.style.display = 'none';
  wgoalInput.style.display   = 'block';
  wgoalInput.focus();
  wgoalInput.select();
}

function commitWGoalEdit() {
  const val = parseFloat(wgoalInput.value);
  if (val > 0) {
    saveWeeklyGoal({ weeklyKm: val });
    renderWeeklyGoal();
    showToast(`Weekly goal set to ${val} km`, 'success');
  }
  wgoalInput.style.display   = 'none';
  wgoalDisplay.style.display = '';
}

wgoalDisplay.addEventListener('click', enterWGoalEdit);
wgoalDisplay.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') enterWGoalEdit(); });
wgoalInput.addEventListener('blur', commitWGoalEdit);
wgoalInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { wgoalInput.blur(); }
  if (e.key === 'Escape') {
    wgoalInput.style.display   = 'none';
    wgoalDisplay.style.display = '';
  }
});

// ── Feature: Log Form Pace Preview ────────────────────────
function updatePacePreview() {
  const dist = parseFloat(document.getElementById('f-distance').value);
  const dur  = parseDuration(document.getElementById('f-duration').value);
  document.getElementById('pace-preview').textContent = formatPace(dur, dist);
}

document.getElementById('f-distance').addEventListener('input', updatePacePreview);
document.getElementById('f-duration').addEventListener('input', updatePacePreview);

// Render pace suggestion whenever log tab is shown
document.getElementById('nav-log').addEventListener('click', () => {
  renderPaceSuggestion();
});

// ── Feature: Export ───────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  const runs = loadRuns();
  const goal = loadGoal();
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'StrideLog',
    version: '1.0',
    goal,
    runs
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `stridelog-export-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Exported ${runs.length} run${runs.length !== 1 ? 's' : ''} to JSON`, 'success');
});

// ── Feature: Import ───────────────────────────────────────
document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', e => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);

      let imported;
      if (Array.isArray(data)) {
        imported = data;
      } else if (data.runs && Array.isArray(data.runs)) {
        imported = data.runs;
        if (data.goal && typeof data.goal.monthlyKm === 'number') {
          saveGoal(data.goal);
        }
      } else {
        throw new Error('Unrecognised format');
      }

      const valid = imported.filter(r =>
        r && typeof r.date === 'string' &&
        typeof r.distanceKm === 'number' &&
        typeof r.durationMin === 'number'
      );

      if (!valid.length) {
        showToast('No valid runs found in the file.', 'error');
        return;
      }

      const existing    = loadRuns();
      const existingIds = new Set(existing.map(r => r.id));
      let added = 0;
      valid.forEach(r => {
        if (!r.id) r.id = uid();
        if (!existingIds.has(r.id)) {
          existing.push(r);
          added++;
        }
      });
      saveRuns(existing);
      renderAll();
      showToast(`Imported ${added} new run${added !== 1 ? 's' : ''}`, 'success');
    } catch (err) {
      console.error('[StrideLog] Import error:', err);
      showToast('Import failed — invalid JSON or format.', 'error');
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
});

// ── Init ──────────────────────────────────────────────────
(function init() {
  document.getElementById('f-date').value = todayISO();
  switchTab('dashboard'); // ensure dashboard is active on load
  renderAll();
  renderPaceSuggestion();
})();

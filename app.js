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
  if (!runs.length) return 0;
  const dates = [...new Set(runs.map(r => r.date))].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i-1]);
    const curr = new Date(dates[i]);
    const diff = (curr - prev) / 86400000;
    if (diff === 1) { cur++; best = Math.max(best, cur); }
    else cur = 1;
  }
  return best;
}

// ── Toast System ──────────────────────────────────────────
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ';
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

    card.innerHTML = `
      <div class="run-card__top">
        <div class="run-card__date">${formatDate(run.date)}</div>
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
          <span class="metric__value" style="font-size:0.95rem;color:var(--chalk)">${run.durationMin}</span>
          <span class="metric__unit">min</span>
        </div>` : ''}
        ${run.incline ? `<div class="metric">
          <span class="metric__value" style="font-size:0.95rem;color:var(--muted)">${run.incline}%</span>
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
      if (ry === year && (rm - 1) === month) {
        const d = new Date(ry, rm - 1, rd);
        if (d >= w.start && d <= w.end) km += (r.distanceKm || 0);
      }
    });

    const hit     = km >= weeklyKm;
    const future  = w.start > today;
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
  if (!totalPast) {
    summary.innerHTML = `<span class="week-summary__hits">—</span><span>No weeks completed yet this month</span>`;
  } else {
    const badge = isPerfect
      ? `<span class="week-summary__badge perfect">Perfect Month!</span>`
      : '';
    summary.innerHTML = `
      <span class="week-summary__hits">${hitsCount}/${totalPast}</span>
      <span>weeks hit this month</span>
      ${badge}
    `;
  }
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
// ANALYTICS: WEEKLY VOLUME CHART (last 8 weeks)
// ══════════════════════════════════════════════════════════
function renderWeeklyVolumeChart() {
  const runs = loadRuns();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start of the current week (Sunday)
  const currentSunday = new Date(today);
  currentSunday.setDate(today.getDate() - today.getDay());

  // Build last 8 weeks (oldest → newest)
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(currentSunday);
    wStart.setDate(currentSunday.getDate() - i * 7);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    weeks.push({ start: wStart, end: wEnd, isCurrent: i === 0 });
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
      label: `${MONTH_ABBR[m]}\n${d}`  // two-line label
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
}

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
  renderStats();
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

  const dateVal     = document.getElementById('f-date').value.trim();
  const distanceVal = parseFloat(document.getElementById('f-distance').value);
  const durationVal = parseInt(document.getElementById('f-duration').value, 10);
  const inclineVal  = parseFloat(document.getElementById('f-incline').value) || 0;
  const notesVal    = document.getElementById('f-notes').value.trim();

  if (!dateVal) { showToast('Please enter a date.', 'error'); return; }
  if (!distanceVal || distanceVal <= 0) { showToast('Please enter a valid distance.', 'error'); return; }
  if (!durationVal || durationVal <= 0) { showToast('Please enter a valid duration.', 'error'); return; }

  const run = {
    id:          uid(),
    date:        dateVal,
    distanceKm:  distanceVal,
    durationMin: durationVal,
    incline:     inclineVal,
    notes:       notesVal || ''
  };

  const runs = loadRuns();
  runs.push(run);
  saveRuns(runs);

  // Jump to the month of the added run on dashboard
  const [runYear, runMonth] = dateVal.split('-').map(Number);
  viewYear  = runYear;
  viewMonth = runMonth - 1;

  renderAll();

  // Reset form
  document.getElementById('run-form').reset();
  document.getElementById('f-date').value = todayISO();
  document.getElementById('pace-preview').textContent = '—:——';

  showToast(`Run logged — ${distanceVal.toFixed(2)} km in ${durationVal} min`, 'success');

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
  document.getElementById('e-duration').value = run.durationMin;
  document.getElementById('e-incline').value  = run.incline || '';
  document.getElementById('e-notes').value    = run.notes || '';
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
  const dur  = parseInt(document.getElementById('e-duration').value, 10);
  document.getElementById('edit-pace-preview').textContent = formatPace(dur, dist);
}

// Edit form submit
document.getElementById('edit-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!editingRunId) return;

  const dateVal     = document.getElementById('e-date').value.trim();
  const distanceVal = parseFloat(document.getElementById('e-distance').value);
  const durationVal = parseInt(document.getElementById('e-duration').value, 10);
  const inclineVal  = parseFloat(document.getElementById('e-incline').value) || 0;
  const notesVal    = document.getElementById('e-notes').value.trim();

  if (!dateVal) { showToast('Please enter a date.', 'error'); return; }
  if (!distanceVal || distanceVal <= 0) { showToast('Please enter a valid distance.', 'error'); return; }
  if (!durationVal || durationVal <= 0) { showToast('Please enter a valid duration.', 'error'); return; }

  const runs = loadRuns();
  const idx  = runs.findIndex(r => r.id === editingRunId);
  if (idx === -1) {
    showToast('Run not found.', 'error');
    closeEditModal();
    return;
  }

  runs[idx] = {
    ...runs[idx],
    date:        dateVal,
    distanceKm:  distanceVal,
    durationMin: durationVal,
    incline:     inclineVal,
    notes:       notesVal
  };

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
  const dur  = parseInt(document.getElementById('f-duration').value, 10);
  document.getElementById('pace-preview').textContent = formatPace(dur, dist);
}

document.getElementById('f-distance').addEventListener('input', updatePacePreview);
document.getElementById('f-duration').addEventListener('input', updatePacePreview);

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
})();

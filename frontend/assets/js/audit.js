(function () {
  'use strict';

  /* ── Category config ─────────────────────────────────────────────────────── */
  const CAT = {
    AUTH:      { icon: 'bi-shield-lock-fill', color: '#3B82F6', bg: '#EFF6FF', label: 'Auth' },
    CUSTOMER:  { icon: 'bi-person-fill',      color: '#10B981', bg: '#ECFDF5', label: 'Customer' },
    LOAN:      { icon: 'bi-currency-rupee',   color: '#F59E0B', bg: '#FFFBEB', label: 'Loan' },
    PAYMENT:   { icon: 'bi-credit-card-fill', color: '#8B5CF6', bg: '#F5F3FF', label: 'Payment' },
    WALLET:    { icon: 'bi-wallet2',          color: '#06B6D4', bg: '#ECFEFF', label: 'Wallet' },
    EXPENSE:   { icon: 'bi-receipt',          color: '#EF4444', bg: '#FEF2F2', label: 'Expense' },
    REPORT:    { icon: 'bi-bar-chart-fill',   color: '#6366F1', bg: '#EEF2FF', label: 'Report' },
    USER:      { icon: 'bi-people-fill',      color: '#EC4899', bg: '#FDF2F8', label: 'User' },
    PARTNER:   { icon: 'bi-handshake-fill',   color: '#D97706', bg: '#FFFBEB', label: 'Partner' },
    ORG:       { icon: 'bi-building',         color: '#6B7280', bg: '#F9FAFB', label: 'Org' },
    DASHBOARD: { icon: 'bi-grid-fill',        color: '#059669', bg: '#ECFDF5', label: 'Dashboard' },
    OTHER:     { icon: 'bi-lightning-fill',   color: '#9CA3AF', bg: '#F9FAFB', label: 'Other' },
  };

  const ROLE_COLORS = { 0: '#DC2626', 1: '#7C3AED', 2: '#2563EB', 3: '#16A34A', 4: '#D97706', 5: '#0891B2' };
  const ROLE_NAMES  = { 0: 'Super Admin', 1: 'Admin', 2: 'Manager', 3: 'Staff', 4: 'Collector', 5: 'Accountant' };

  function cat(category) {
    return CAT[category] || CAT.OTHER;
  }

  /* ── State ───────────────────────────────────────────────────────────────── */
  let _animTimer   = null;
  let _sessionsMap = {};   // session_id → session object

  /* ── Bootstrap ───────────────────────────────────────────────────────────── */
  function init() {
    if (!auth.requireLogin()) return;
    const user = auth.getUser();
    if (!user || user.role_id > 1) {
      window.location.href = '/frontend/dashboard.html';
      return;
    }
    if (typeof initPage === 'function') initPage({ title: 'Audit Log', subtitle: 'User activity grouped by session' });
    if (typeof initAutoLogout === 'function') initAutoLogout();
    renderPage();
    loadUsers();
    loadSessions();
  }

  /* ── Page HTML ───────────────────────────────────────────────────────────── */
  function renderPage() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('page-content').innerHTML = `
      <style>
        /* ── Session cards ── */
        .session-card {
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 18px 20px;
          background: #fff;
          cursor: pointer;
          transition: box-shadow .2s, transform .15s;
          position: relative;
          overflow: hidden;
        }
        .session-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.1); transform: translateY(-2px); }
        .session-card::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 4px;
          border-radius: 4px 0 0 4px;
        }
        .session-avatar {
          width: 42px; height: 42px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 15px; color: #fff;
          flex-shrink: 0;
        }
        .session-meta span { font-size: 13px; color: #64748B; }
        .action-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 20px;
          font-size: 12px; font-weight: 600;
        }

        /* ── Drawer ── */
        #audit-overlay {
          position: fixed; inset: 0;
          background: rgba(15,23,42,.35);
          z-index: 1040; display: none;
          backdrop-filter: blur(2px);
          animation: fadeIn .2s ease;
        }
        #audit-drawer {
          position: fixed; top: 0; right: -520px; bottom: 0;
          width: min(520px, 100vw);
          background: #fff;
          box-shadow: -6px 0 32px rgba(0,0,0,.18);
          z-index: 1050;
          transition: right .35s cubic-bezier(.4,0,.2,1);
          display: flex; flex-direction: column;
        }
        #audit-drawer.open { right: 0; }
        .drawer-header {
          padding: 18px 20px 14px;
          border-bottom: 1px solid #F1F5F9;
          background: #F8FAFC;
        }
        .drawer-body {
          flex: 1; overflow-y: auto;
          padding: 24px 24px 40px;
        }

        /* ── Timeline ── */
        .timeline-wrap { position: relative; }
        .timeline-step {
          display: flex; gap: 0;
          opacity: 0;
          transform: translateX(32px);
          transition: opacity .35s ease, transform .35s ease;
        }
        .timeline-step.visible { opacity: 1; transform: translateX(0); }

        .tl-left {
          display: flex; flex-direction: column; align-items: center;
          width: 44px; flex-shrink: 0;
        }
        .tl-dot {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; flex-shrink: 0;
          box-shadow: 0 0 0 0 transparent;
          transition: box-shadow .4s;
        }
        .tl-dot.pulse { animation: dotPulse .6s ease forwards; }
        .tl-line {
          flex: 1; width: 2px;
          background: linear-gradient(to bottom, #CBD5E1, #E2E8F0);
          min-height: 32px;
          transform: scaleY(0);
          transform-origin: top;
          transition: transform .25s ease .1s;
        }
        .tl-line.visible { transform: scaleY(1); }

        .tl-content {
          flex: 1; padding: 2px 0 28px 14px;
        }
        .tl-action {
          font-weight: 600; font-size: 13.5px; color: #1E293B;
          margin-bottom: 4px;
        }
        .tl-meta {
          font-size: 12.5px; color: #64748B;
          display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
        }
        .tl-status {
          display: inline-block; padding: 2px 9px;
          border-radius: 10px; font-size: 12px; font-weight: 600;
        }
        .tl-time-badge {
          font-size: 12px; color: #94A3B8;
          background: #F1F5F9; padding: 3px 9px; border-radius: 10px;
        }

        @keyframes dotPulse {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,.5); }
          60%  { box-shadow: 0 0 0 10px rgba(99,102,241,0); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
        }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

        /* ── Replay button ── */
        .replay-btn {
          border: 1.5px solid #6366F1; color: #6366F1;
          background: transparent; border-radius: 8px;
          padding: 5px 14px; font-size: 12px; font-weight: 600;
          transition: background .15s, color .15s;
          cursor: pointer;
        }
        .replay-btn:hover { background: #6366F1; color: #fff; }

        /* ── Empty / loading ── */
        .audit-empty { text-align: center; padding: 60px 20px; color: #94A3B8; }
      </style>

      <!-- Filter bar -->
      <div class="filter-bar mb-4">
        <div class="form-group">
          <label class="form-label">From</label>
          <input type="date" id="flt-from" class="form-control" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">To</label>
          <input type="date" id="flt-to" class="form-control" value="${today}">
        </div>
        <div class="form-group">
          <label class="form-label">User</label>
          <select id="flt-user" class="form-select">
            <option value="">All users</option>
          </select>
        </div>
        <div class="d-flex gap-2 align-items-end flex-wrap">
          <button class="btn btn-primary" onclick="auditPage.search()">
            <i class="bi bi-search me-1"></i>Search
          </button>
          <button class="btn btn-outline-secondary" onclick="auditPage.clearFilters()">
            <i class="bi bi-x-circle me-1"></i>Clear
          </button>
        </div>
        <span id="session-count" class="small text-secondary align-self-center ms-auto"></span>
      </div>

      <!-- Session grid -->
      <div id="session-grid" class="row g-3">
        <div class="col-12">
          <div class="audit-empty"><div class="spinner-border text-primary" role="status"></div></div>
        </div>
      </div>

      <!-- Drawer overlay -->
      <div id="audit-overlay" onclick="auditPage.closeDrawer()"></div>

      <!-- Detail drawer -->
      <div id="audit-drawer">
        <div class="drawer-header">
          <div class="d-flex align-items-start justify-content-between">
            <div id="drawer-user-info"></div>
            <div class="d-flex gap-2 align-items-center">
              <button class="replay-btn" onclick="auditPage.replay()">
                <i class="bi bi-arrow-repeat me-1"></i>Replay
              </button>
              <button class="btn btn-sm btn-light" onclick="auditPage.closeDrawer()">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>
          <div id="drawer-session-meta" class="mt-2"></div>
        </div>
        <div class="drawer-body">
          <div id="timeline-wrap"></div>
        </div>
      </div>
    `;
  }

  /* ── Data loaders ────────────────────────────────────────────────────────── */
  async function loadUsers() {
    try {
      const res = await api.get('/api/audit/users');
      const sel = document.getElementById('flt-user');
      (res.data.users || []).forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.user_id;
        opt.textContent = u.user_name;
        sel.appendChild(opt);
      });
    } catch (_) {}
  }

  async function loadSessions() {
    const grid = document.getElementById('session-grid');
    grid.innerHTML = `<div class="col-12"><div class="audit-empty"><div class="spinner-border text-primary" role="status"></div></div></div>`;

    const params = {
      date_from: document.getElementById('flt-from').value || undefined,
      date_to:   document.getElementById('flt-to').value   || undefined,
      user_id:   document.getElementById('flt-user').value  || undefined,
      per_page:  50,
    };

    try {
      const res = await api.get('/api/audit/sessions', params);
      const sessions = res.data.sessions || [];
      const total    = res.data.total || 0;
      document.getElementById('session-count').textContent =
        total === 0 ? 'No sessions found' : `${total} session${total !== 1 ? 's' : ''} found`;

      if (sessions.length === 0) {
        grid.innerHTML = `<div class="col-12"><div class="audit-empty"><i class="bi bi-journal-x fs-2 d-block mb-2"></i>No sessions for this period</div></div>`;
        return;
      }

      _sessionsMap = {};
      sessions.forEach(s => { _sessionsMap[s.session_id] = s; });
      grid.innerHTML = sessions.map(s => sessionCardHTML(s)).join('');
    } catch (err) {
      grid.innerHTML = `<div class="col-12"><div class="audit-empty text-danger"><i class="bi bi-exclamation-triangle fs-2 d-block mb-2"></i>${err.message}</div></div>`;
    }
  }

  /* ── Session card HTML ───────────────────────────────────────────────────── */
  function sessionCardHTML(s) {
    const roleColor  = ROLE_COLORS[s.role_id] || '#64748B';
    const roleName   = ROLE_NAMES[s.role_id]  || 'User';
    const initials   = (s.user_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const startStr   = s.started_at ? fmtDateTime(s.started_at) : '—';
    const durStr     = fmtDuration(s.duration_seconds);
    const sid        = s.session_id;
    const sidShort   = sid ? sid.slice(0, 8) + '…' : '—';

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="session-card" style="--role-color:${roleColor}; border-left: 4px solid ${roleColor};"
             onclick="auditPage.openSession('${sid}')">
          <div class="d-flex align-items-center gap-3 mb-3">
            <div class="session-avatar" style="background:${roleColor}">${initials}</div>
            <div class="flex-1">
              <div class="fw-semibold text-dark lh-1 mb-1">${esc(s.user_name)}</div>
              <span class="badge rounded-pill" style="background:${roleColor}20; color:${roleColor}; font-size:10px;">${roleName}</span>
            </div>
          </div>
          <div class="row g-2 mb-3">
            <div class="col-6">
              <div class="small text-secondary">Started</div>
              <div class="fw-semibold small">${startStr}</div>
            </div>
            <div class="col-6">
              <div class="small text-secondary">Duration</div>
              <div class="fw-semibold small">${durStr}</div>
            </div>
          </div>
          <div class="d-flex align-items-center justify-content-between">
            <div class="d-flex gap-2">
              <span class="action-badge" style="background:#EEF2FF; color:#6366F1;">
                <i class="bi bi-activity"></i> ${s.action_count} actions
              </span>
              ${s.ip_address ? `<span class="action-badge" style="background:#F1F5F9; color:#64748B;"><i class="bi bi-router"></i> ${esc(s.ip_address)}</span>` : ''}
            </div>
            <i class="bi bi-chevron-right text-secondary"></i>
          </div>
          <div class="mt-2" style="font-size:11.5px; color:#CBD5E1; font-family:monospace;">${sidShort}</div>
        </div>
      </div>`;
  }

  /* ── Open session detail ─────────────────────────────────────────────────── */
  async function openSession(sessionId) {
    const sessionMeta = _sessionsMap[sessionId] || {};
    const drawer  = document.getElementById('audit-drawer');
    const overlay = document.getElementById('audit-overlay');
    const wrap    = document.getElementById('timeline-wrap');

    // Show drawer immediately with loading state
    document.getElementById('drawer-user-info').innerHTML = drawerUserHTML(sessionMeta);
    document.getElementById('drawer-session-meta').innerHTML = drawerMetaHTML(sessionMeta);
    wrap.innerHTML = `<div class="audit-empty"><div class="spinner-border text-primary" role="status"></div></div>`;

    overlay.style.display = 'block';
    requestAnimationFrame(() => drawer.classList.add('open'));

    try {
      const res = await api.get(`/api/audit/sessions/${sessionId}`);
      const actions = res.data.actions || [];
      wrap.innerHTML = buildTimelineHTML(actions);
      playAnimation();
    } catch (err) {
      wrap.innerHTML = `<div class="audit-empty text-danger"><i class="bi bi-exclamation-triangle fs-2 d-block mb-2"></i>${err.message}</div>`;
    }
  }

  function closeDrawer() {
    clearTimeout(_animTimer);
    const drawer  = document.getElementById('audit-drawer');
    const overlay = document.getElementById('audit-overlay');
    drawer.classList.remove('open');
    setTimeout(() => { overlay.style.display = 'none'; }, 350);
  }

  /* ── Drawer header ───────────────────────────────────────────────────────── */
  function drawerUserHTML(s) {
    const roleColor = ROLE_COLORS[s.role_id] || '#64748B';
    const roleName  = ROLE_NAMES[s.role_id]  || 'User';
    const initials  = (s.user_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    return `
      <div class="d-flex align-items-center gap-3">
        <div class="session-avatar" style="background:${roleColor}; width:46px; height:46px; font-size:16px;">${initials}</div>
        <div>
          <div class="fw-bold fs-6">${esc(s.user_name)}</div>
          <span class="badge rounded-pill" style="background:${roleColor}20; color:${roleColor}; font-size:11px;">${roleName}</span>
        </div>
      </div>`;
  }

  function drawerMetaHTML(s) {
    const dur     = fmtDuration(s.duration_seconds);
    const sidStr  = s.session_id ? s.session_id.slice(0, 16) + '…' : '—';
    const items   = [
      `<span><i class="bi bi-activity me-1"></i>${s.action_count} actions</span>`,
      `<span><i class="bi bi-clock me-1"></i>${dur}</span>`,
      s.ip_address ? `<span><i class="bi bi-router me-1"></i>${esc(s.ip_address)}</span>` : '',
      `<span style="font-family:monospace; font-size:10px; color:#94A3B8;">${sidStr}</span>`,
    ].filter(Boolean).join('<span class="mx-1 text-secondary">·</span>');
    return `<div class="d-flex flex-wrap gap-1 align-items-center small text-secondary">${items}</div>`;
  }

  /* ── Timeline HTML ───────────────────────────────────────────────────────── */
  function buildTimelineHTML(actions) {
    if (!actions.length) return '<div class="audit-empty">No actions recorded</div>';

    return `<div class="timeline-wrap">${actions.map((a, i) => {
      const c   = cat(a.action_category);
      const isLast = i === actions.length - 1;
      const sc  = a.status_code || 0;
      const scColor = sc >= 500 ? '#EF4444' : sc >= 400 ? '#F59E0B' : '#10B981';
      const scBg    = sc >= 500 ? '#FEF2F2' : sc >= 400 ? '#FFFBEB' : '#ECFDF5';
      const timeStr = a.created_at ? fmtTime(a.created_at) : '';
      const elStr   = a.elapsed_seconds > 0 ? `+${fmtDuration(a.elapsed_seconds)}` : 'start';

      return `
        <div class="timeline-step" data-index="${i}">
          <div class="tl-left">
            <div class="tl-dot" style="background:${c.bg}; color:${c.color};">
              <i class="bi ${c.icon}"></i>
            </div>
            ${!isLast ? `<div class="tl-line" data-line="${i}"></div>` : ''}
          </div>
          <div class="tl-content">
            <div class="tl-action">${esc(a.action)}</div>
            <div class="tl-meta">
              ${a.endpoint ? `<span class="text-truncate" style="max-width:200px; font-family:monospace; font-size:12.5px;">${esc(a.http_method || '')} ${esc(a.endpoint)}</span>` : ''}
              ${sc ? `<span class="tl-status" style="background:${scBg}; color:${scColor};">${sc}</span>` : ''}
              <span class="tl-time-badge">${timeStr}</span>
              <span class="tl-time-badge" style="color:#6366F1;">${elStr}</span>
              ${a.action_category ? `<span class="tl-time-badge" style="background:${c.bg}; color:${c.color};">${c.label}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('')}</div>`;
  }

  /* ── Staggered animation ─────────────────────────────────────────────────── */
  function playAnimation() {
    clearTimeout(_animTimer);
    const steps = document.querySelectorAll('#timeline-wrap .timeline-step');
    const lines = document.querySelectorAll('#timeline-wrap .tl-line');

    // Reset first
    steps.forEach(s => s.classList.remove('visible'));
    lines.forEach(l => l.classList.remove('visible'));

    let delay = 80;
    steps.forEach((step, i) => {
      _animTimer = setTimeout(() => {
        step.classList.add('visible');
        // Show connecting line ~120ms after the step dot appears
        const line = step.querySelector('.tl-line');
        if (line) {
          setTimeout(() => line.classList.add('visible'), 120);
        }
      }, delay);
      delay += 180;
    });
  }

  function replay() {
    const steps = document.querySelectorAll('#timeline-wrap .timeline-step');
    if (!steps.length) return;
    clearTimeout(_animTimer);
    steps.forEach(s => s.classList.remove('visible'));
    document.querySelectorAll('#timeline-wrap .tl-line').forEach(l => l.classList.remove('visible'));
    setTimeout(playAnimation, 80);
  }

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12: true });
  }

  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false });
  }

  function fmtDuration(sec) {
    if (!sec || sec < 1) return '< 1s';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(m / 60), rm = m % 60;
    return rm ? `${h}h ${rm}m` : `${h}h`;
  }

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function search() { loadSessions(); }

  function clearFilters() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('flt-from').value = today;
    document.getElementById('flt-to').value   = today;
    document.getElementById('flt-user').value = '';
    loadSessions();
  }

  /* ── Public API (called from inline onclick) ─────────────────────────────── */
  window.auditPage = { openSession, closeDrawer, replay, search, clearFilters };

  /* ── Boot ────────────────────────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', init);
})();

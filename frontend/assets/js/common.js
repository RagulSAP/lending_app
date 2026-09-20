// LendTrack Common Utilities — IIFE, exposes window globals
(function () {
  'use strict';

  const ROLES = { SUPER_ADMIN: 0, ADMIN: 1, MANAGER: 2, STAFF: 3, COLLECTOR: 4, ACCOUNTANT: 5 };
  const ROLE_NAMES = { 0: 'Super Admin', 1: 'Admin', 2: 'Manager', 3: 'Staff', 4: 'Collector', 5: 'Accountant' };

  const NAV_ITEMS = [
    { label: 'Dashboard',      icon: 'bi-speedometer2',   href: 'dashboard.html',      roles: [1,2,4,5] },
    { label: 'Organizations',  icon: 'bi-building',       href: 'organizations.html',  roles: [0] },
    { label: 'Customers',      icon: 'bi-people',         href: 'customers.html',      roles: [1,2,3,4,5] },
    { label: 'Collect Payment',icon: 'bi-cash-coin',      href: 'collect-payment.html',roles: [1,2,3,4] },
    { label: 'App Users',      icon: 'bi-person-badge',   href: 'users.html',          roles: [1,2] },
    { label: 'Expenses',       icon: 'bi-receipt',        href: 'expenses.html',       roles: [1,2,3,5] },
    { label: 'Reports',        icon: 'bi-bar-chart-line', href: 'reports.html',        roles: [1,2,5] },
  ];

  // Priority order for bottom nav (max 4 shown) — most used actions first per role
  const BOTTOM_NAV_PRIORITY = {
    0: ['organizations.html'],
    1: ['dashboard.html','customers.html','collect-payment.html','expenses.html'],
    2: ['dashboard.html','customers.html','collect-payment.html','expenses.html'],
    3: ['customers.html','collect-payment.html','expenses.html'],
    4: ['customers.html','collect-payment.html','dashboard.html'],
    5: ['dashboard.html','expenses.html','reports.html'],
  };

  function renderSidebar() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    const user = auth.getUser();
    if (!user) return;
    const cur = window.location.pathname.split('/').pop() || 'index.html';
    const items = NAV_ITEMS.filter(i => i.roles.includes(user.role_id));
    const navHTML = items.map(i => `
      <li class="nav-item">
        <a class="nav-link${cur === i.href ? ' active' : ''}" href="${i.href}">
          <i class="bi ${i.icon}"></i><span>${i.label}</span>
        </a>
      </li>`).join('');

    el.innerHTML = `
      <a class="sidebar-brand" href="#">
        <div class="brand-icon"><i class="bi bi-currency-rupee"></i></div>
        <div class="brand-name">Lend<span>Track</span></div>
      </a>
      <nav class="sidebar-nav">
        <ul class="nav flex-column" style="list-style:none;padding:0;margin:0;">${navHTML}</ul>
      </nav>
      <div class="sidebar-footer">
        <a class="nav-link" id="logout-btn" style="cursor:pointer;">
          <i class="bi bi-box-arrow-right"></i><span>Logout</span>
        </a>
      </div>`;

    document.getElementById('logout-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      try { await api.post('/api/auth/logout'); } catch {}
      auth.logout();
    });
  }

  function renderTopbar(pageTitle) {
    const el = document.getElementById('topbar');
    if (!el) return;
    const user = auth.getUser();
    const name = user ? (user.name || '') : '';
    const initials = name.split(' ').map(n => n[0] || '').join('').toUpperCase().slice(0,2) || 'U';
    el.innerHTML = `
      <button class="topbar-hamburger" id="topbar-hamburger" type="button" aria-label="Toggle sidebar">
        <i class="bi bi-list"></i>
      </button>
      <div class="topbar-title">${pageTitle || ''}</div>
      <div class="topbar-user">
        <div class="topbar-user-info d-none d-sm-block">
          <div class="topbar-user-name">${name}</div>
          <div class="topbar-user-role">${roleName(user ? user.role_id : null)}</div>
        </div>
        <div class="topbar-avatar">${initials}</div>
      </div>`;
    const hb = document.getElementById('topbar-hamburger');
    if (hb) hb.addEventListener('click', toggleSidebar);
  }

  function renderBottomNav() {
    // Only inject if the element exists (all pages have it via initPage)
    let el = document.getElementById('bottom-nav');
    if (!el) {
      el = document.createElement('nav');
      el.id = 'bottom-nav';
      el.setAttribute('aria-label', 'Mobile navigation');
      document.body.appendChild(el);
    }
    const user = auth.getUser();
    if (!user) return;
    const cur = window.location.pathname.split('/').pop() || 'index.html';
    const priority = BOTTOM_NAV_PRIORITY[user.role_id] || [];
    const items = priority
      .map(href => NAV_ITEMS.find(n => n.href === href))
      .filter(Boolean);

    // If more nav items exist beyond bottom nav slots, add a "More" button
    const allRoleItems = NAV_ITEMS.filter(i => i.roles.includes(user.role_id));
    const hasMore = allRoleItems.length > items.length;

    const btnHTML = items.map(i => `
      <a class="bottom-nav-item${cur === i.href ? ' active' : ''}" href="${i.href}" aria-label="${i.label}">
        <i class="bi ${i.icon}"></i>
        <span>${i.label.replace('Collect Payment','Collect').replace('Organizations','Orgs')}</span>
      </a>`).join('');

    const moreBtn = hasMore ? `
      <button class="bottom-nav-item" id="bnav-more" aria-label="More">
        <i class="bi bi-grid-3x3-gap"></i>
        <span>More</span>
      </button>` : '';

    el.innerHTML = `<div class="bottom-nav-inner">${btnHTML}${moreBtn}</div>`;

    if (hasMore) {
      document.getElementById('bnav-more').addEventListener('click', toggleSidebar);
    }
  }

  function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    let ov = document.getElementById('sidebar-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'sidebar-overlay';
      ov.className = 'sidebar-overlay';
      document.body.appendChild(ov);
      ov.addEventListener('click', closeSidebar);
    }
    sb.classList.toggle('show');
    ov.classList.toggle('show');
  }

  function closeSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (sb) sb.classList.remove('show');
    if (ov) ov.classList.remove('show');
  }

  function showToast(message, type) {
    type = type || 'success';
    let c = document.getElementById('toast-container');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toast-container';
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    const icons = { success:'bi-check-circle-fill', danger:'bi-x-circle-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
    const icon = icons[type] || icons.info;
    const t = document.createElement('div');
    t.className = 'toast-item toast-' + type;
    t.innerHTML = `<i class="bi ${icon} toast-icon"></i><span class="toast-text">${message}</span><button class="toast-close" onclick="this.closest('.toast-item').remove()"><i class="bi bi-x"></i></button>`;
    c.appendChild(t);
    setTimeout(() => { if (t.parentNode) { t.style.cssText='opacity:0;transform:translateX(100%);transition:all 0.3s ease'; setTimeout(()=>t.remove(),300); } }, 4000);
  }

  function showLoading() {
    let ov = document.getElementById('loading-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'loading-overlay';
      ov.innerHTML = '<div class="loading-spinner"><div class="spinner-border" role="status"></div><p>Loading...</p></div>';
      document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
  }

  function hideLoading() {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.style.display = 'none';
  }

  function formatCurrency(n) {
    if (n === null || n === undefined || n === '') return '₹ 0.00';
    const num = parseFloat(n);
    if (isNaN(num)) return '₹ 0.00';
    return '₹ ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return String(dt.getDate()).padStart(2,'0') + ' ' + mo[dt.getMonth()] + ' ' + dt.getFullYear();
  }

  function formatDateTime(d) {
    if (!d) return '-';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const hh = String(dt.getHours()).padStart(2,'0');
    const mm = String(dt.getMinutes()).padStart(2,'0');
    return String(dt.getDate()).padStart(2,'0') + ' ' + mo[dt.getMonth()] + ' ' + dt.getFullYear() + ' ' + hh + ':' + mm;
  }

  function roleName(id) { return ROLE_NAMES[id] || 'Unknown'; }

  function statusBadge(status) {
    const s = String(status || '').toUpperCase();
    const m = {
      'ACTIVE':   '<span class="badge-status badge-active"><i class="bi bi-check-circle-fill"></i> Active</span>',
      'INACTIVE': '<span class="badge-status badge-inactive"><i class="bi bi-x-circle-fill"></i> Inactive</span>',
      'OVERDUE':  '<span class="badge-status badge-overdue"><i class="bi bi-exclamation-triangle-fill"></i> Overdue</span>',
      'CLOSED':   '<span class="badge-status badge-closed"><i class="bi bi-dash-circle"></i> Closed</span>',
      'PENDING':  '<span class="badge-status badge-pending"><i class="bi bi-clock-fill"></i> Pending</span>',
      'PARTIAL':  '<span class="badge-status badge-partial"><i class="bi bi-circle-half"></i> Partial</span>',
      'PAID':     '<span class="badge-status badge-paid"><i class="bi bi-check-circle-fill"></i> Paid</span>',
      '1':        '<span class="badge-status badge-active"><i class="bi bi-check-circle-fill"></i> Active</span>',
      '0':        '<span class="badge-status badge-inactive"><i class="bi bi-x-circle-fill"></i> Inactive</span>',
    };
    return m[s] || '<span class="badge-status badge-closed">' + status + '</span>';
  }

  function confirmDialog(message) {
    return new Promise((resolve) => {
      let modal = document.getElementById('confirm-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'confirm-modal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = `
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header border-0 pb-0">
                <h6 class="modal-title fw-600"><i class="bi bi-exclamation-triangle-fill text-warning me-2"></i>Confirm Action</h6>
              </div>
              <div class="modal-body"><p id="confirm-message" class="mb-0" style="font-size:14px;"></p></div>
              <div class="modal-footer border-0 pt-0">
                <button type="button" class="btn btn-sm btn-outline-secondary" id="confirm-no">Cancel</button>
                <button type="button" class="btn btn-sm btn-danger" id="confirm-yes">Confirm</button>
              </div>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }
      document.getElementById('confirm-message').textContent = message;
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
      let resolved = false;
      function done(v) {
        if (resolved) return; resolved = true;
        bsModal.hide(); resolve(v);
      }
      document.getElementById('confirm-yes').onclick = () => done(true);
      document.getElementById('confirm-no').onclick = () => done(false);
      modal.addEventListener('hidden.bs.modal', () => done(false), { once: true });
    });
  }

  async function initPage(pageTitle, allowedRoles) {
    if (!auth.requireLogin()) return;
    const user = auth.getUser();
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role_id)) {
      if (user.role_id === 0) { window.location.href = 'organizations.html'; }
      else { window.location.href = 'dashboard.html'; }
      return;
    }
    renderTopbar(pageTitle);
    renderSidebar();
    renderBottomNav();
  }

  window.ROLES = ROLES;
  window.roleName = roleName;
  window.statusBadge = statusBadge;
  window.formatCurrency = formatCurrency;
  window.formatDate = formatDate;
  window.formatDateTime = formatDateTime;
  window.showToast = showToast;
  window.showLoading = showLoading;
  window.hideLoading = hideLoading;
  window.confirmDialog = confirmDialog;
  window.initPage = initPage;
  window.renderSidebar = renderSidebar;
  window.renderTopbar = renderTopbar;
  window.renderBottomNav = renderBottomNav;
})();

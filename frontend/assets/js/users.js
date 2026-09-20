(function () {
  'use strict';

  let currentPage = 1;
  const perPage = 20;
  let totalPages = 1;
  let currentUser = null;

  async function init() {
    await initPage('App Users', [1, 2]);
    currentUser = auth.getUser();
    renderPage();
    await loadUsers();
  }

  function renderPage() {
    const isAdmin = currentUser && currentUser.role_id === ROLES.ADMIN;
    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div>
          <h1>App Users</h1>
          <p>Manage staff, collectors, and accountant accounts</p>
        </div>
        ${isAdmin ? '<a href="user-onboard.html" class="btn btn-primary"><i class="bi bi-person-plus"></i> Add User</a>' : ''}
      </div>
      <div class="filter-bar">
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-select" id="f-role">
            <option value="">All Roles</option>
            <option value="1">Admin</option>
            <option value="2">Manager</option>
            <option value="3">Staff</option>
            <option value="4">Collector</option>
            <option value="5">Accountant</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="f-status">
            <option value="">All</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Search</label>
          <input type="text" class="form-control" id="f-search" placeholder="Name or phone...">
        </div>
        <div class="form-group d-flex align-items-end">
          <button class="btn btn-primary" id="search-btn"><i class="bi bi-search"></i> Search</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title">Users List</h6>
          <span id="count-badge" class="badge bg-light text-dark" style="font-size:12px;"></span>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                ${isAdmin ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody id="users-tbody"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-center mt-3 mb-2" id="pagination-wrap"></div>
      </div>`;

    document.getElementById('search-btn').addEventListener('click', () => { currentPage = 1; loadUsers(); });
    document.getElementById('f-search').addEventListener('keydown', e => { if (e.key === 'Enter') { currentPage = 1; loadUsers(); } });
  }

  async function loadUsers() {
    const role_id = document.getElementById('f-role').value;
    const status = document.getElementById('f-status').value;
    const search = document.getElementById('f-search').value.trim();
    try {
      showLoading();
      const res = await api.get('/api/users', { role_id, status, search, page: currentPage, per_page: perPage });
      const users = res.data || [];
      const pagination = res.pagination || {};
      totalPages = pagination.total_pages || 1;
      const total = pagination.total || users.length;
      const badge = document.getElementById('count-badge');
      if (badge) badge.textContent = total + ' user' + (total !== 1 ? 's' : '');

      const isAdmin = currentUser && currentUser.role_id === ROLES.ADMIN;
      const tbody = document.getElementById('users-tbody');
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 7 : 6}" class="table-empty"><i class="bi bi-people"></i>No users found</td></tr>`;
      } else {
        const offset = (currentPage - 1) * perPage;
        tbody.innerHTML = users.map((u, i) => `
          <tr>
            <td>${offset + i + 1}</td>
            <td><div class="fw-600">${u.name}</div></td>
            <td>${u.phone || '-'}</td>
            <td><span class="badge bg-light text-dark" style="font-size:12px;">${roleName(u.role_id)}</span></td>
            <td>${statusBadge(u.status !== undefined ? u.status : 'ACTIVE')}</td>
            <td>${formatDate(u.created_at)}</td>
            ${isAdmin ? `<td>
              <div class="d-flex gap-1 flex-nowrap">
                <button class="btn btn-sm ${u.status == 1 || u.status === 'ACTIVE' ? 'btn-warning' : 'btn-success'}" onclick="toggleUserStatus(${u.user_id}, ${u.status})" title="${u.status == 1 || u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}">
                  <i class="bi ${u.status == 1 || u.status === 'ACTIVE' ? 'bi-pause-fill' : 'bi-play-fill'}"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${u.user_id}, '${u.name}')" title="Delete">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </td>` : ''}
          </tr>`).join('');
      }
      renderPagination();
    } catch (err) {
      document.getElementById('users-tbody').innerHTML = `<tr><td colspan="7" class="table-empty"><i class="bi bi-exclamation-circle"></i>${err.message}</td></tr>`;
      showToast('Failed to load users: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  function renderPagination() {
    const wrap = document.getElementById('pagination-wrap');
    if (!wrap || totalPages <= 1) { if (wrap) wrap.innerHTML = ''; return; }
    let html = '<nav><ul class="pagination mb-0">';
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" onclick="goPage(${currentPage - 1})">&#8249;</a></li>`;
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
      html += `<li class="page-item${p === currentPage ? ' active' : ''}"><a class="page-link" href="#" onclick="goPage(${p})">${p}</a></li>`;
    }
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" onclick="goPage(${currentPage + 1})">&#8250;</a></li>`;
    html += '</ul></nav>';
    wrap.innerHTML = html;
  }

  window.goPage = function(p) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    loadUsers();
  };

  window.toggleUserStatus = async function(userId, currentStatus) {
    const newStatus = (currentStatus == 1 || currentStatus === 'ACTIVE') ? 0 : 1;
    const action = newStatus === 1 ? 'activate' : 'deactivate';
    const ok = await confirmDialog(`Are you sure you want to ${action} this user?`);
    if (!ok) return;
    try {
      await api.patch(`/api/users/${userId}/status`, { status: newStatus });
      showToast(`User ${action}d successfully`, 'success');
      await loadUsers();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  window.deleteUser = async function(userId, name) {
    const ok = await confirmDialog(`Delete user "${name}"? This action cannot be undone.`);
    if (!ok) return;
    try {
      await api.delete(`/api/users/${userId}`);
      showToast('User deleted successfully', 'success');
      await loadUsers();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  init();
})();

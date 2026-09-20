(function () {
  'use strict';

  let currentPage = 1;
  const perPage = 20;
  let totalPages = 1;
  let currentUser = null;
  let editingUserId = null;
  let editModal = null;

  async function init() {
    await initPage('App Users', [1, 2]);
    currentUser = auth.getUser();
    renderPage();
    if (currentUser && currentUser.role_id === ROLES.ADMIN) injectEditModal();
    await loadUsers();
  }

  // ---------------------------------------------------------------------------
  // Page skeleton
  // ---------------------------------------------------------------------------
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
          <button type="button" class="btn btn-primary" id="search-btn">
            <i class="bi bi-search"></i> Search
          </button>
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
                <th>#</th><th>Name</th><th>Phone</th><th>Role</th>
                <th>Status</th><th>Created</th>
                ${isAdmin ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody id="users-tbody"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-center mt-3 mb-2" id="pagination-wrap"></div>
      </div>`;

    document.getElementById('search-btn').addEventListener('click', () => { currentPage = 1; loadUsers(); });
    document.getElementById('f-search').addEventListener('keydown', e => {
      if (e.key === 'Enter') { currentPage = 1; loadUsers(); }
    });
  }

  // ---------------------------------------------------------------------------
  // Edit modal (Admin only)
  // ---------------------------------------------------------------------------
  function injectEditModal() {
    if (document.getElementById('edit-user-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="edit-user-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fw-600" style="font-size:16px;">
                <i class="bi bi-pencil-square me-2 text-primary"></i>Edit User
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="eu-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Full Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="eu-name" placeholder="Full name">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Phone <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="eu-phone" placeholder="10-digit phone" maxlength="10">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Role <span class="text-danger">*</span></label>
                  <select class="form-select" id="eu-role">
                    <option value="1">Admin</option>
                    <option value="2">Manager</option>
                    <option value="3">Staff</option>
                    <option value="4">Collector</option>
                    <option value="5">Accountant</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">New Password</label>
                  <input type="password" class="form-control" id="eu-password" placeholder="Leave blank to keep current">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="eu-save-btn">
                <span id="eu-save-txt"><i class="bi bi-check-lg me-1"></i>Save Changes</span>
                <span id="eu-save-load" class="d-none">
                  <span class="spinner-border spinner-border-sm me-2"></span>Saving...
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);

    document.getElementById('eu-phone').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 10);
    });
    document.getElementById('eu-save-btn').addEventListener('click', saveUserEdit);
    editModal = new bootstrap.Modal(document.getElementById('edit-user-modal'));
  }

  // ---------------------------------------------------------------------------
  // Load users
  // ---------------------------------------------------------------------------
  async function loadUsers() {
    const role_id = document.getElementById('f-role').value;
    const status = document.getElementById('f-status').value;
    const search = document.getElementById('f-search').value.trim();
    const isAdmin = currentUser && currentUser.role_id === ROLES.ADMIN;
    try {
      showLoading();
      const res = await api.get('/api/users', { role_id, status, search, page: currentPage, per_page: perPage });
      const users = res.data || [];
      const total = res.total || users.length;
      totalPages = Math.ceil(total / perPage) || 1;

      const badge = document.getElementById('count-badge');
      if (badge) badge.textContent = total + ' user' + (total !== 1 ? 's' : '');

      const tbody = document.getElementById('users-tbody');
      const colSpan = isAdmin ? 7 : 6;
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty"><i class="bi bi-people"></i>No users found</td></tr>`;
      } else {
        const offset = (currentPage - 1) * perPage;
        tbody.innerHTML = users.map((u, i) => {
          const isActive = u.status == 1 || u.status === 'ACTIVE';
          const safeName = (u.name || '').replace(/'/g, "\\'");
          return `<tr>
            <td>${offset + i + 1}</td>
            <td><div class="fw-600">${u.name}</div></td>
            <td>${u.phone || '-'}</td>
            <td><span class="badge bg-light text-dark" style="font-size:12px;">${roleName(u.role_id)}</span></td>
            <td>${statusBadge(u.status !== undefined ? u.status : 'ACTIVE')}</td>
            <td>${formatDate(u.created_at)}</td>
            ${isAdmin ? `<td>
              <div class="d-flex gap-1 flex-nowrap">
                <button type="button" class="btn btn-sm btn-outline-primary"
                  onclick="openEditModal('${u.user_id}')" title="Edit">
                  <i class="bi bi-pencil"></i>
                </button>
                <button type="button" class="btn btn-sm ${isActive ? 'btn-warning' : 'btn-success'}"
                  onclick="toggleUserStatus('${u.user_id}', ${u.status})"
                  title="${isActive ? 'Deactivate' : 'Activate'}">
                  <i class="bi ${isActive ? 'bi-pause-fill' : 'bi-play-fill'}"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger"
                  onclick="deleteUser('${u.user_id}', '${safeName}')" title="Delete">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </td>` : ''}
          </tr>`;
        }).join('');
      }
      renderPagination();
    } catch (err) {
      document.getElementById('users-tbody').innerHTML =
        `<tr><td colspan="7" class="table-empty"><i class="bi bi-exclamation-circle"></i>${err.message}</td></tr>`;
      showToast('Failed to load users: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------
  function renderPagination() {
    const wrap = document.getElementById('pagination-wrap');
    if (!wrap || totalPages <= 1) { if (wrap) wrap.innerHTML = ''; return; }
    let html = '<nav><ul class="pagination mb-0">';
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" onclick="goPage(${currentPage - 1});return false;">&#8249;</a></li>`;
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
      html += `<li class="page-item${p === currentPage ? ' active' : ''}"><a class="page-link" href="#" onclick="goPage(${p});return false;">${p}</a></li>`;
    }
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" onclick="goPage(${currentPage + 1});return false;">&#8250;</a></li>`;
    html += '</ul></nav>';
    wrap.innerHTML = html;
  }

  window.goPage = function (p) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    loadUsers();
  };

  // ---------------------------------------------------------------------------
  // Open edit modal — fetch user details then populate
  // ---------------------------------------------------------------------------
  window.openEditModal = async function (userId) {
    editingUserId = userId;
    const errEl = document.getElementById('eu-error');
    errEl.classList.add('d-none');
    document.getElementById('eu-password').value = '';
    document.getElementById('eu-save-btn').disabled = false;
    document.getElementById('eu-save-txt').classList.remove('d-none');
    document.getElementById('eu-save-load').classList.add('d-none');

    try {
      showLoading();
      // Fetch from the list (already in memory from the last load)
      const res = await api.get('/api/users', { per_page: 1000 });
      const users = res.data || [];
      const u = users.find(x => x.user_id === userId);
      if (!u) { showToast('User not found', 'danger'); return; }

      document.getElementById('eu-name').value = u.name || '';
      document.getElementById('eu-phone').value = u.phone || '';
      document.getElementById('eu-role').value = String(u.role_id || 2);

      editModal.show();
    } catch (err) {
      showToast('Failed to load user: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  };

  // ---------------------------------------------------------------------------
  // Save edit
  // ---------------------------------------------------------------------------
  async function saveUserEdit() {
    const errEl = document.getElementById('eu-error');
    errEl.classList.add('d-none');

    const name = document.getElementById('eu-name').value.trim();
    const phone = document.getElementById('eu-phone').value.trim();
    const role_id = parseInt(document.getElementById('eu-role').value, 10);
    const password = document.getElementById('eu-password').value;

    if (!name) { showEuError('Full name is required.'); return; }
    if (!/^\d{10}$/.test(phone)) { showEuError('Phone must be exactly 10 digits.'); return; }
    if (!role_id) { showEuError('Please select a role.'); return; }

    const btn = document.getElementById('eu-save-btn');
    btn.disabled = true;
    document.getElementById('eu-save-txt').classList.add('d-none');
    document.getElementById('eu-save-load').classList.remove('d-none');

    const body = { name, phone, role_id };
    if (password) body.password = password;

    try {
      await api.patch(`/api/users/${editingUserId}`, body);
      editModal.hide();
      showToast('User updated successfully', 'success');
      await loadUsers();
    } catch (err) {
      showEuError(err.message);
      btn.disabled = false;
      document.getElementById('eu-save-txt').classList.remove('d-none');
      document.getElementById('eu-save-load').classList.add('d-none');
    }
  }

  function showEuError(msg) {
    const errEl = document.getElementById('eu-error');
    errEl.textContent = msg;
    errEl.classList.remove('d-none');
  }

  // ---------------------------------------------------------------------------
  // Toggle status
  // ---------------------------------------------------------------------------
  window.toggleUserStatus = async function (userId, currentStatus) {
    const isActive = currentStatus == 1 || currentStatus === 'ACTIVE';
    const action = isActive ? 'deactivate' : 'activate';
    const ok = await confirmDialog(`Are you sure you want to ${action} this user?`);
    if (!ok) return;
    try {
      await api.patch(`/api/users/${userId}/status`, { status: isActive ? 0 : 1 });
      showToast(`User ${action}d successfully`, 'success');
      await loadUsers();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  window.deleteUser = async function (userId, name) {
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

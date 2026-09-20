(function () {
  'use strict';

  let orgList = [];

  async function init() {
    await initPage('Organizations', [0]);
    renderPage();
    await loadOrgs();
  }

  function renderPage() {
    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div>
          <h1>Organizations</h1>
          <p>Manage all lending organizations on the platform</p>
        </div>
        <button class="btn btn-primary" id="add-org-btn"><i class="bi bi-plus-lg"></i> Add Organization</button>
      </div>
      <div class="row g-3 mb-4" id="org-stats">
        <div class="col-md-4"><div class="stat-card"><div class="stat-icon blue"><i class="bi bi-building"></i></div><div class="stat-body"><div class="stat-value" id="stat-orgs">-</div><div class="stat-label">Total Organizations</div></div></div></div>
        <div class="col-md-4"><div class="stat-card"><div class="stat-icon green"><i class="bi bi-person-badge"></i></div><div class="stat-body"><div class="stat-value" id="stat-users">-</div><div class="stat-label">Total Users</div></div></div></div>
        <div class="col-md-4"><div class="stat-card"><div class="stat-icon cyan"><i class="bi bi-people"></i></div><div class="stat-body"><div class="stat-value" id="stat-borrowers">-</div><div class="stat-label">Total Borrowers</div></div></div></div>
      </div>
      <div class="card">
        <div class="card-header-flex"><h6 class="card-title">All Organizations</h6></div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr><th>#</th><th>Organization Name</th><th>Phone</th><th>Users</th><th>Borrowers</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody id="org-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Add Org Modal -->
      <div class="modal fade" id="addOrgModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title fw-600"><i class="bi bi-building-add me-2 text-primary"></i>Add New Organization</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="org-form-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <h6 class="mb-3" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">Organization Details</h6>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Organization Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="org-name" placeholder="e.g. ABC Finance Pvt Ltd" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Phone Number <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="org-phone" placeholder="10-digit phone" maxlength="10" required>
                </div>
                <div class="col-12">
                  <label class="form-label">Address</label>
                  <textarea class="form-control" id="org-address" rows="2" placeholder="Full address"></textarea>
                </div>
              </div>
              <h6 class="mb-3 mt-4" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">Admin User Details</h6>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Admin Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="admin-name" placeholder="Full name" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Admin Phone <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="admin-phone" placeholder="10-digit phone" maxlength="10" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Password <span class="text-danger">*</span></label>
                  <input type="password" class="form-control" id="admin-pass" placeholder="Min 6 characters" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Confirm Password <span class="text-danger">*</span></label>
                  <input type="password" class="form-control" id="admin-pass2" placeholder="Repeat password" required>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="save-org-btn">
                <span id="save-org-txt"><i class="bi bi-plus-lg me-1"></i>Create Organization</span>
                <span id="save-org-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Creating...</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('add-org-btn').addEventListener('click', () => {
      new bootstrap.Modal(document.getElementById('addOrgModal')).show();
    });
    document.getElementById('save-org-btn').addEventListener('click', saveOrg);
    document.getElementById('org-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
    document.getElementById('admin-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
  }

  async function loadOrgs() {
    try {
      showLoading();
      const res = await api.get('/api/organizations');
      orgList = (res.data || []);
      // Stats
      const totalUsers = orgList.reduce((a,o) => a + (o.user_count || 0), 0);
      const totalBorrowers = orgList.reduce((a,o) => a + (o.borrower_count || 0), 0);
      document.getElementById('stat-orgs').textContent = orgList.length;
      document.getElementById('stat-users').textContent = totalUsers;
      document.getElementById('stat-borrowers').textContent = totalBorrowers;

      const tbody = document.getElementById('org-tbody');
      if (!orgList.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><i class="bi bi-building"></i>No organizations found</td></tr>';
        return;
      }
      tbody.innerHTML = orgList.map((o, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><div class="fw-600">${o.name}</div><div style="font-size:12px;color:#64748B;">${o.address || ''}</div></td>
          <td>${o.phone || '-'}</td>
          <td><span class="fw-600">${o.user_count || 0}</span></td>
          <td><span class="fw-600">${o.borrower_count || 0}</span></td>
          <td>${statusBadge(o.status || 'ACTIVE')}</td>
          <td><button class="btn btn-sm btn-outline-secondary" onclick="viewOrg(${o.org_id})"><i class="bi bi-eye"></i></button></td>
        </tr>`).join('');
    } catch (err) {
      document.getElementById('org-tbody').innerHTML = `<tr><td colspan="7" class="table-empty"><i class="bi bi-exclamation-circle"></i>${err.message}</td></tr>`;
      showToast('Failed to load organizations: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  async function saveOrg() {
    const name = document.getElementById('org-name').value.trim();
    const phone = document.getElementById('org-phone').value.trim();
    const address = document.getElementById('org-address').value.trim();
    const admin_name = document.getElementById('admin-name').value.trim();
    const admin_phone = document.getElementById('admin-phone').value.trim();
    const admin_password = document.getElementById('admin-pass').value;
    const admin_pass2 = document.getElementById('admin-pass2').value;
    const errEl = document.getElementById('org-form-error');
    errEl.classList.add('d-none');

    if (!name || !phone || !admin_name || !admin_phone || !admin_password) { errEl.textContent = 'All required fields must be filled.'; errEl.classList.remove('d-none'); return; }
    if (!/^\d{10}$/.test(phone)) { errEl.textContent = 'Organization phone must be 10 digits.'; errEl.classList.remove('d-none'); return; }
    if (!/^\d{10}$/.test(admin_phone)) { errEl.textContent = 'Admin phone must be 10 digits.'; errEl.classList.remove('d-none'); return; }
    if (admin_password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('d-none'); return; }
    if (admin_password !== admin_pass2) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('save-org-btn');
    btn.disabled = true;
    document.getElementById('save-org-txt').classList.add('d-none');
    document.getElementById('save-org-load').classList.remove('d-none');

    try {
      await api.post('/api/organizations', { name, address, phone, admin_name, admin_phone, admin_password });
      bootstrap.Modal.getInstance(document.getElementById('addOrgModal')).hide();
      showToast('Organization created successfully!', 'success');
      ['org-name','org-phone','org-address','admin-name','admin-phone','admin-pass','admin-pass2'].forEach(id => { document.getElementById(id).value = ''; });
      await loadOrgs();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      document.getElementById('save-org-txt').classList.remove('d-none');
      document.getElementById('save-org-load').classList.add('d-none');
    }
  }

  window.viewOrg = function(orgId) {
    const org = orgList.find(o => o.org_id === orgId);
    if (!org) return;
    showToast(`${org.name}: ${org.user_count || 0} users, ${org.borrower_count || 0} borrowers`, 'info');
  };

  init();
})();

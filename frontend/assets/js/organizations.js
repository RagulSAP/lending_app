(function () {
  'use strict';

  let orgList = [];

  async function init() {
    await initPage(t('org.title'), [0]);
    renderPage();
    await loadOrgs();
  }

  function renderPage() {
    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-center justify-content-end">
        <button class="btn btn-primary" id="add-org-btn"><i class="bi bi-plus-lg"></i> ${t('org.add')}</button>
      </div>
      <div class="row g-3 mb-4" id="org-stats">
        <div class="col-md-4"><div class="stat-card"><div class="stat-icon blue"><i class="bi bi-building"></i></div><div class="stat-body"><div class="stat-value" id="stat-orgs">-</div><div class="stat-label">${t('org.total')}</div></div></div></div>
        <div class="col-md-4"><div class="stat-card"><div class="stat-icon green"><i class="bi bi-person-badge"></i></div><div class="stat-body"><div class="stat-value" id="stat-users">-</div><div class="stat-label">${t('org.total_users')}</div></div></div></div>
        <div class="col-md-4"><div class="stat-card"><div class="stat-icon cyan"><i class="bi bi-people"></i></div><div class="stat-body"><div class="stat-value" id="stat-borrowers">-</div><div class="stat-label">${t('org.total_borrowers')}</div></div></div></div>
      </div>
      <div class="card">
        <div class="card-header-flex"><h6 class="card-title">${t('org.title')}</h6></div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr><th>#</th><th>${t('org.col_org')}</th><th>${t('org.col_phone')}</th><th>${t('org.col_users')}</th><th>${t('org.col_borrowers')}</th><th>${t('common.status')}</th><th>${t('common.actions')}</th></tr>
            </thead>
            <tbody id="org-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Edit Org Modal -->
      <div class="modal fade" id="editOrgModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title fw-600"><i class="bi bi-pencil me-2 text-primary"></i>${t('org.edit_title')}</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="edit-org-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <input type="hidden" id="edit-org-id">
              <h6 class="mb-3" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">${t('org.section_org')}</h6>
              <div class="row g-3">
                <div class="col-12">
                  <label class="form-label">${t('org.org_name')} <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="edit-org-name" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('org.org_phone')}</label>
                  <input type="tel" class="form-control" id="edit-org-phone" maxlength="10">
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('common.status')}</label>
                  <select class="form-select" id="edit-org-status">
                    <option value="ACTIVE">${t('org.status_active')}</option>
                    <option value="INACTIVE">${t('org.status_inactive')}</option>
                  </select>
                </div>
                <div class="col-12">
                  <label class="form-label">${t('org.address')}</label>
                  <textarea class="form-control" id="edit-org-address" rows="2"></textarea>
                </div>
              </div>
              <h6 class="mb-3 mt-4" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">${t('org.section_admin')}</h6>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">${t('org.admin_name')} <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="edit-admin-name">
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('org.admin_phone')}</label>
                  <input type="tel" class="form-control" id="edit-admin-phone" maxlength="10">
                </div>
                <div class="col-12">
                  <label class="form-label">${t('org.new_password')} <span style="font-size:12px;color:#64748B;">(${t('org.pass_hint')})</span></label>
                  <div class="input-group">
                    <input type="password" class="form-control" id="edit-admin-password" placeholder="Min 6 characters">
                    <button type="button" class="btn btn-outline-secondary" onclick="togglePass('edit-admin-password', this)" tabindex="-1"><i class="bi bi-eye"></i></button>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary" id="save-edit-org-btn">
                <span id="save-edit-txt"><i class="bi bi-check-lg me-1"></i>${t('common.save')}</span>
                <span id="save-edit-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('common.saving')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div class="modal fade" id="deleteOrgModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header bg-danger text-white">
              <h6 class="modal-title fw-600"><i class="bi bi-exclamation-triangle me-2"></i>${t('org.delete_title')}</h6>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="del-org-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <input type="hidden" id="del-org-id">
              <p class="mb-1" id="del-org-body"></p>
              <p class="text-danger mb-3" style="font-size:13px;"><i class="bi bi-exclamation-circle me-1"></i>${t('org.delete_warning')}</p>
              <label class="form-label">${t('org.enter_password')} <span class="text-danger">*</span></label>
              <div class="input-group">
                <input type="password" class="form-control" id="del-org-password" placeholder="Your password">
                <button type="button" class="btn btn-outline-secondary" onclick="togglePass('del-org-password', this)" tabindex="-1"><i class="bi bi-eye"></i></button>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-danger" id="confirm-del-btn">
                <span id="confirm-del-txt"><i class="bi bi-trash me-1"></i>${t('common.delete')}</span>
                <span id="confirm-del-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('org.deleting')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Org Modal -->
      <div class="modal fade" id="addOrgModal" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title fw-600"><i class="bi bi-building-add me-2 text-primary"></i>${t('org.add_title')}</h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="org-form-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <h6 class="mb-3" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">${t('org.section_org')}</h6>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">${t('org.org_name')} <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="org-name" placeholder="e.g. ABC Finance Pvt Ltd" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('org.org_phone')} <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="org-phone" placeholder="10-digit phone" maxlength="10" required>
                </div>
                <div class="col-12">
                  <label class="form-label">${t('org.address')}</label>
                  <textarea class="form-control" id="org-address" rows="2" placeholder="Full address"></textarea>
                </div>
              </div>
              <h6 class="mb-3 mt-4" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">${t('org.section_admin')}</h6>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">${t('org.admin_name')} <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="admin-name" placeholder="Full name" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('org.admin_phone')} <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="admin-phone" placeholder="10-digit phone" maxlength="10" required>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('useronboard.password')} <span class="text-danger">*</span></label>
                  <div class="input-group">
                    <input type="password" class="form-control" id="admin-pass" placeholder="Min 6 characters" required>
                    <button type="button" class="btn btn-outline-secondary" onclick="togglePass('admin-pass', this)" tabindex="-1">
                      <i class="bi bi-eye"></i>
                    </button>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('org.confirm_password')} <span class="text-danger">*</span></label>
                  <div class="input-group">
                    <input type="password" class="form-control" id="admin-pass2" placeholder="Repeat password" required>
                    <button type="button" class="btn btn-outline-secondary" onclick="togglePass('admin-pass2', this)" tabindex="-1">
                      <i class="bi bi-eye"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary" id="save-org-btn">
                <span id="save-org-txt"><i class="bi bi-plus-lg me-1"></i>${t('org.create')}</span>
                <span id="save-org-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('org.creating')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('add-org-btn').addEventListener('click', () => {
      new bootstrap.Modal(document.getElementById('addOrgModal')).show();
    });
    document.getElementById('save-org-btn').addEventListener('click', saveOrg);
    document.getElementById('save-edit-org-btn').addEventListener('click', saveEditOrg);
    document.getElementById('confirm-del-btn').addEventListener('click', confirmDelete);
    document.getElementById('org-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
    document.getElementById('admin-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
    document.getElementById('edit-org-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
    document.getElementById('edit-admin-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
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
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="bi bi-building"></i>${t('org.no_orgs')}</td></tr>`;
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
          <td class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" title="${t('common.edit')}" onclick="editOrg('${o.org_id}')"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" title="${t('common.delete')}" onclick="deleteOrg('${o.org_id}')"><i class="bi bi-trash"></i></button>
          </td>
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
      showToast(t('org.created'), 'success');
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

  window.editOrg = function(orgId) {
    const org = orgList.find(o => o.org_id === orgId);
    if (!org) return;
    document.getElementById('edit-org-id').value = org.org_id;
    document.getElementById('edit-org-name').value = org.name || '';
    document.getElementById('edit-org-phone').value = org.phone || '';
    document.getElementById('edit-org-address').value = org.address || '';
    document.getElementById('edit-org-status').value = org.status || 'ACTIVE';
    document.getElementById('edit-admin-name').value = org.admin_user?.name || '';
    document.getElementById('edit-admin-phone').value = org.admin_user?.phone || '';
    document.getElementById('edit-admin-password').value = org.admin_user?.password || '';
    document.getElementById('edit-org-error').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('editOrgModal')).show();
  };

  async function saveEditOrg() {
    const orgId = document.getElementById('edit-org-id').value;
    const name = document.getElementById('edit-org-name').value.trim();
    const phone = document.getElementById('edit-org-phone').value.trim();
    const address = document.getElementById('edit-org-address').value.trim();
    const status = document.getElementById('edit-org-status').value;
    const admin_name = document.getElementById('edit-admin-name').value.trim();
    const admin_phone = document.getElementById('edit-admin-phone').value.trim();
    const admin_password = document.getElementById('edit-admin-password').value;
    const errEl = document.getElementById('edit-org-error');
    errEl.classList.add('d-none');

    if (!name) { errEl.textContent = 'Organization name is required.'; errEl.classList.remove('d-none'); return; }
    if (!admin_name) { errEl.textContent = 'Admin name is required.'; errEl.classList.remove('d-none'); return; }
    if (phone && !/^\d{10}$/.test(phone)) { errEl.textContent = 'Organization phone must be 10 digits.'; errEl.classList.remove('d-none'); return; }
    if (admin_phone && !/^\d{10}$/.test(admin_phone)) { errEl.textContent = 'Admin phone must be 10 digits.'; errEl.classList.remove('d-none'); return; }
    if (admin_password && admin_password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('d-none'); return; }

    const payload = { name, phone, address, status, admin_name, admin_phone };
    if (admin_password) payload.admin_password = admin_password;

    const btn = document.getElementById('save-edit-org-btn');
    btn.disabled = true;
    document.getElementById('save-edit-txt').classList.add('d-none');
    document.getElementById('save-edit-load').classList.remove('d-none');
    try {
      await api.patch(`/api/organizations/${orgId}`, payload);
      bootstrap.Modal.getInstance(document.getElementById('editOrgModal')).hide();
      showToast(t('org.updated'), 'success');
      await loadOrgs();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      document.getElementById('save-edit-txt').classList.remove('d-none');
      document.getElementById('save-edit-load').classList.add('d-none');
    }
  }

  window.deleteOrg = function(orgId) {
    const org = orgList.find(o => o.org_id === orgId);
    if (!org) return;
    document.getElementById('del-org-id').value = org.org_id;
    document.getElementById('del-org-body').textContent = t('org.delete_body', {name: org.name});
    document.getElementById('del-org-password').value = '';
    document.getElementById('del-org-error').classList.add('d-none');
    new bootstrap.Modal(document.getElementById('deleteOrgModal')).show();
  };

  async function confirmDelete() {
    const orgId = document.getElementById('del-org-id').value;
    const password = document.getElementById('del-org-password').value;
    const errEl = document.getElementById('del-org-error');
    errEl.classList.add('d-none');

    if (!password) { errEl.textContent = 'Password is required.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('confirm-del-btn');
    btn.disabled = true;
    document.getElementById('confirm-del-txt').classList.add('d-none');
    document.getElementById('confirm-del-load').classList.remove('d-none');
    try {
      await api.delete(`/api/organizations/${orgId}`, { password });
      bootstrap.Modal.getInstance(document.getElementById('deleteOrgModal')).hide();
      showToast(t('org.deleted'), 'success');
      await loadOrgs();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      document.getElementById('confirm-del-txt').classList.remove('d-none');
      document.getElementById('confirm-del-load').classList.add('d-none');
    }
  }

  init();
})();

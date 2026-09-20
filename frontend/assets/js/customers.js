(function () {
  'use strict';

  let currentPage = 1;
  const perPage = 20;
  let totalPages = 1;
  let currentUser = null;
  let editingCustomerId = null;
  let collectors = [];
  let editModal = null;
  let photoModal = null;

  async function init() {
    await initPage('Customers', [1, 2, 3, 4, 5]);
    currentUser = auth.getUser();
    injectPhotoModal();
    if (currentUser.role_id === ROLES.COLLECTOR) {
      renderCollectorView();
    } else {
      renderFullView();
      const canEdit = [ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role_id);
      if (canEdit) await loadCollectors();
      await loadCustomers();
    }
  }

  async function loadCollectors() {
    try {
      const res = await api.get('/api/users', { role_id: 4, status: 1, per_page: 100 });
      collectors = res.data || [];
    } catch (_) {
      collectors = [];
    }
  }

  function renderCollectorView() {
    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h1>Find Customer</h1>
        <p>Search customer by phone number to collect payment</p>
      </div>
      <div class="row justify-content-center">
        <div class="col-lg-5">
          <div class="card">
            <div class="card-header-flex"><h6 class="card-title"><i class="bi bi-search me-2 text-primary"></i>Phone Search</h6></div>
            <div class="input-group mb-3">
              <span class="input-group-text"><i class="bi bi-phone"></i></span>
              <input type="tel" class="form-control form-control-lg" id="phone-search" placeholder="Enter 10-digit phone number" maxlength="10">
              <button type="button" class="btn btn-primary" id="phone-search-btn"><i class="bi bi-search"></i></button>
            </div>
            <div id="search-result"></div>
          </div>
        </div>
      </div>`;

    document.getElementById('phone-search').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    document.getElementById('phone-search-btn').addEventListener('click', searchByPhone);
    document.getElementById('phone-search').addEventListener('keydown', e => { if (e.key === 'Enter') searchByPhone(); });
  }

  async function searchByPhone() {
    const phone = document.getElementById('phone-search').value.trim();
    const resultEl = document.getElementById('search-result');
    if (!/^\d{10}$/.test(phone)) {
      resultEl.innerHTML = '<div class="alert alert-warning" style="font-size:13px;"><i class="bi bi-exclamation-triangle me-2"></i>Enter a valid 10-digit phone number.</div>';
      return;
    }
    try {
      showLoading();
      const res = await api.get('/api/customers', { phone });
      const customers = res.data || [];
      if (!customers.length) {
        resultEl.innerHTML = '<div class="alert alert-info" style="font-size:13px;"><i class="bi bi-info-circle me-2"></i>No customer found with this phone number.</div>';
        return;
      }
      const c = customers[0];
      const initials = (c.name || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      const photoUrl = c.photo ? `/api/kyc/${c.photo}` : null;
      const safeName = (c.name || '').replace(/'/g, "\\'");
      const avatarEl = photoUrl
        ? `<img src="${photoUrl}" alt="${c.name}"
            style="width:52px;height:52px;border-radius:50%;object-fit:cover;cursor:pointer;border:2px solid #e2e8f0;"
            onclick="viewPhoto('${photoUrl}','${safeName}')"
            onerror="this.outerHTML='<div class=\\'customer-avatar\\'>${initials}</div>'">`
        : `<div class="customer-avatar">${initials}</div>`;
      resultEl.innerHTML = `
        <div class="search-result-card">
          <div class="d-flex align-items-center gap-3 mb-3">
            ${avatarEl}
            <div>
              <div class="fw-600" style="font-size:15px;">${c.name}</div>
              <div style="font-size:13px;color:#64748B;">${c.phone}</div>
              <div class="mt-1">${statusBadge(c.status || 'ACTIVE')}</div>
            </div>
          </div>
          <div class="row g-2 mb-3" style="font-size:13px;">
            <div class="col-6"><span style="color:#64748B;">City:</span> ${c.city || '-'}</div>
            <div class="col-6"><span style="color:#64748B;">State:</span> ${c.state || '-'}</div>
          </div>
          <a href="collect-payment.html?customer_id=${c.customer_id}" class="btn btn-primary w-100">
            <i class="bi bi-cash-coin me-2"></i>Collect Payment
          </a>
        </div>`;
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger" style="font-size:13px;"><i class="bi bi-x-circle me-2"></i>${err.message}</div>`;
    } finally {
      hideLoading();
    }
  }

  function renderFullView() {
    const canOnboard = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(currentUser.role_id);
    const canEdit = [ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role_id);
    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div><h1>Customers</h1><p>Manage and view all customer accounts and loans</p></div>
        <div class="d-flex gap-2 flex-wrap">
          <button type="button" class="btn btn-outline-success" id="export-btn">
            <i class="bi bi-file-earmark-excel me-1"></i>Export Excel
          </button>
          ${canOnboard ? '<a href="customer-onboard.html" class="btn btn-primary"><i class="bi bi-person-plus"></i> Onboard Customer</a>' : ''}
        </div>
      </div>
      <div class="filter-bar">
        <div class="form-group">
          <label class="form-label">Search</label>
          <input type="text" class="form-control" id="f-search" placeholder="Name or phone...">
        </div>
        <div class="form-group">
          <label class="form-label">City</label>
          <input type="text" class="form-control" id="f-city" placeholder="City name">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="f-status">
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div class="form-group d-flex align-items-end">
          <button type="button" class="btn btn-primary" id="search-btn"><i class="bi bi-search"></i> Search</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title">Customers List</h6>
          <span id="count-badge" class="badge bg-light text-dark" style="font-size:12px;"></span>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>#</th><th>Customer</th><th>Phone</th><th>City</th><th>Status</th><th>Assigned To</th><th>Created</th>
                ${canEdit ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody id="cust-tbody"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-center mt-3 mb-2" id="pagination-wrap"></div>
      </div>`;

    if (canEdit) injectEditModal();

    document.getElementById('search-btn').addEventListener('click', () => { currentPage = 1; loadCustomers(); });
    document.getElementById('f-search').addEventListener('keydown', e => { if (e.key === 'Enter') { currentPage = 1; loadCustomers(); } });
    document.getElementById('export-btn').addEventListener('click', exportToExcel);
  }

  function injectEditModal() {
    if (document.getElementById('edit-customer-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="edit-customer-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" style="font-size:16px;font-weight:600;">
                <i class="bi bi-pencil-square me-2 text-primary"></i>Edit Customer
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="edit-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">Full Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="e-name" placeholder="Customer full name">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Phone Number <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="e-phone" placeholder="10-digit phone" maxlength="10">
                </div>
                <div class="col-12">
                  <label class="form-label">Address</label>
                  <textarea class="form-control" id="e-address" rows="2" placeholder="Full residential address"></textarea>
                </div>
                <div class="col-md-4">
                  <label class="form-label">City <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="e-city" placeholder="City">
                </div>
                <div class="col-md-4">
                  <label class="form-label">State</label>
                  <input type="text" class="form-control" id="e-state" placeholder="State">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Pincode</label>
                  <input type="text" class="form-control" id="e-pincode" placeholder="6-digit pincode" maxlength="6">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Aadhaar Number</label>
                  <input type="text" class="form-control" id="e-aadhaar" placeholder="12-digit Aadhaar" maxlength="12">
                </div>
                <div class="col-md-6">
                  <label class="form-label">PAN Number</label>
                  <input type="text" class="form-control" id="e-pan" placeholder="10-char PAN" maxlength="10" style="text-transform:uppercase;">
                </div>
                <div class="col-12">
                  <label class="form-label">Assigned Collector</label>
                  <select class="form-select" id="e-collector">
                    <option value="">None (unassigned)</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="save-edit-btn">
                <span id="save-edit-txt"><i class="bi bi-check-lg me-1"></i>Save Changes</span>
                <span id="save-edit-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Saving...</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);

    // Input masks
    document.getElementById('e-phone').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    document.getElementById('e-aadhaar').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 12); });
    document.getElementById('e-pincode').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
    document.getElementById('e-pan').addEventListener('input', function () { this.value = this.value.toUpperCase().slice(0, 10); });
    document.getElementById('save-edit-btn').addEventListener('click', saveCustomerEdit);

    editModal = new bootstrap.Modal(document.getElementById('edit-customer-modal'));
  }

  function injectPhotoModal() {
    if (document.getElementById('photo-view-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="photo-view-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered" style="max-width:360px;">
          <div class="modal-content">
            <div class="modal-header py-2 px-3">
              <h6 class="modal-title fw-600" id="photo-modal-name" style="font-size:14px;"></h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-2 text-center">
              <img id="photo-modal-img" src="" alt="Customer Photo"
                style="max-width:100%;max-height:420px;border-radius:8px;object-fit:contain;">
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    photoModal = new bootstrap.Modal(document.getElementById('photo-view-modal'));
  }

  window.viewPhoto = function (url, name) {
    document.getElementById('photo-modal-name').textContent = name + ' — Photo';
    document.getElementById('photo-modal-img').src = url;
    photoModal.show();
  };

  async function loadCustomers() {
    const search = document.getElementById('f-search').value.trim();
    const city = document.getElementById('f-city').value.trim();
    const status = document.getElementById('f-status').value;
    const canEdit = [ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role_id);
    const isAdmin = currentUser.role_id === ROLES.ADMIN;
    try {
      showLoading();
      const res = await api.get('/api/customers', { search, city, status, page: currentPage, per_page: perPage });
      const customers = res.data || [];
      const pagination = res.pagination || {};
      totalPages = pagination.total_pages || 1;
      const total = pagination.total || customers.length;
      const badge = document.getElementById('count-badge');
      if (badge) badge.textContent = total + ' customer' + (total !== 1 ? 's' : '');

      const tbody = document.getElementById('cust-tbody');
      const offset = (currentPage - 1) * perPage;
      const colSpan = canEdit ? 8 : 7;
      if (!customers.length) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty"><i class="bi bi-people"></i>No customers found</td></tr>`;
      } else {
        tbody.innerHTML = customers.map((c, i) => {
          const initials = (c.name || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const safeName = (c.name || '').replace(/'/g, "\\'");
          const photoUrl = c.photo ? `/api/kyc/${c.photo}` : null;
          const avatarHtml = photoUrl
            ? `<img src="${photoUrl}" alt="${c.name}" title="View photo"
                style="width:32px;height:32px;border-radius:50%;object-fit:cover;cursor:pointer;flex-shrink:0;border:2px solid #e2e8f0;"
                onclick="viewPhoto('${photoUrl}','${safeName}');event.stopPropagation();"
                onerror="this.outerHTML='<div style=\\'width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#2563EB,#7C3AED);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:600;flex-shrink:0;\\'>${initials}</div>'">`
            : `<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#2563EB,#7C3AED);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:600;flex-shrink:0;">${initials}</div>`;
          const actionsCell = canEdit ? `
            <td onclick="event.stopPropagation()">
              <div class="d-flex gap-1">
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditModal('${c.customer_id}')" title="Edit">
                  <i class="bi bi-pencil"></i>
                </button>
                ${isAdmin ? `
                <button type="button" class="btn btn-sm ${c.status === 'ACTIVE' ? 'btn-warning' : 'btn-success'}" onclick="toggleStatus('${c.customer_id}','${c.status}')" title="${c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}">
                  <i class="bi ${c.status === 'ACTIVE' ? 'bi-pause-fill' : 'bi-play-fill'}"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteCustomer('${c.customer_id}','${c.name.replace(/'/g, "\\'")}')" title="Delete">
                  <i class="bi bi-trash"></i>
                </button>` : ''}
              </div>
            </td>` : '';
          return `<tr class="clickable" onclick="viewCustomer('${c.customer_id}')">
            <td>${offset + i + 1}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                ${avatarHtml}
                <div><div class="fw-600">${c.name}</div><div style="font-size:11px;color:#64748B;">#${c.customer_id}</div></div>
              </div>
            </td>
            <td>${c.phone || '-'}</td>
            <td>${c.city || '-'}</td>
            <td>${statusBadge(c.status || 'ACTIVE')}</td>
            <td>${c.assigned_user_name || c.assigned_to || '-'}</td>
            <td>${formatDate(c.created_at)}</td>
            ${actionsCell}
          </tr>`;
        }).join('');
      }
      renderPagination();
    } catch (err) {
      document.getElementById('cust-tbody').innerHTML = `<tr><td colspan="8" class="table-empty"><i class="bi bi-exclamation-circle"></i>${err.message}</td></tr>`;
      showToast('Failed to load customers: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

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

  window.goPage = function (p) { if (p < 1 || p > totalPages) return; currentPage = p; loadCustomers(); };

  async function exportToExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Please refresh the page.', 'danger');
      return;
    }
    const btn = document.getElementById('export-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exporting...';

    try {
      const search = document.getElementById('f-search').value.trim();
      const city = document.getElementById('f-city').value.trim();
      const status = document.getElementById('f-status').value;

      // Fetch all pages with current filters
      let all = [];
      let page = 1;
      while (true) {
        const res = await api.get('/api/customers', { search, city, status, page, per_page: 100 });
        const batch = res.data || [];
        all = all.concat(batch);
        if (batch.length < 100 || all.length >= (res.total || 0)) break;
        page++;
      }

      if (!all.length) { showToast('No customers to export.', 'warning'); return; }

      const headers = [
        '#', 'Name', 'Phone', 'City', 'State', 'Pincode',
        'Aadhaar', 'PAN', 'ID Proof Type', 'Status',
        'Assigned To', 'Created At'
      ];
      const rows = all.map((c, i) => [
        i + 1,
        c.name || '',
        c.phone || '',
        c.city || '',
        c.state || '',
        c.pincode || '',
        c.aadhaar || '',
        c.pan || '',
        c.id_proof_type || '',
        c.status || '',
        c.assigned_user_name || c.assigned_to || '',
        c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 4 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
        { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 16 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Customers');
      const filename = `Customers_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      showToast(`Exported ${all.length} customer${all.length !== 1 ? 's' : ''} to Excel`, 'success');
    } catch (err) {
      showToast('Export failed: ' + err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-file-earmark-excel me-1"></i>Export Excel';
    }
  }

  window.viewCustomer = function (customerId) {
    window.location.href = 'collect-payment.html?customer_id=' + customerId;
  };

  window.openEditModal = async function (customerId) {
    editingCustomerId = customerId;
    const errEl = document.getElementById('edit-error');
    errEl.classList.add('d-none');

    // Populate collector dropdown
    const sel = document.getElementById('e-collector');
    sel.innerHTML = '<option value="">None (unassigned)</option>' +
      collectors.map(c => `<option value="${c.user_id}">${c.name}${c.phone ? ' (' + c.phone + ')' : ''}</option>`).join('');

    // Reset save button
    document.getElementById('save-edit-btn').disabled = false;
    document.getElementById('save-edit-txt').classList.remove('d-none');
    document.getElementById('save-edit-load').classList.add('d-none');

    try {
      showLoading();
      const res = await api.get(`/api/customers/${customerId}`);
      const c = res.data;

      document.getElementById('e-name').value = c.name || '';
      document.getElementById('e-phone').value = c.phone || '';
      document.getElementById('e-address').value = c.address || '';
      document.getElementById('e-city').value = c.city || '';
      document.getElementById('e-state').value = c.state || '';
      document.getElementById('e-pincode').value = c.pincode || '';
      document.getElementById('e-aadhaar').value = c.aadhaar || '';
      document.getElementById('e-pan').value = c.pan || '';
      sel.value = c.user_id || '';

      editModal.show();
    } catch (err) {
      showToast('Failed to load customer: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  };

  async function saveCustomerEdit() {
    const errEl = document.getElementById('edit-error');
    errEl.classList.add('d-none');

    const name = document.getElementById('e-name').value.trim();
    const phone = document.getElementById('e-phone').value.trim();
    const city = document.getElementById('e-city').value.trim();
    const aadhaar = document.getElementById('e-aadhaar').value.trim();
    const pincode = document.getElementById('e-pincode').value.trim();
    const pan = document.getElementById('e-pan').value.trim();

    if (!name) { showEditError('Full name is required.'); return; }
    if (!/^\d{10}$/.test(phone)) { showEditError('Phone must be exactly 10 digits.'); return; }
    if (!city) { showEditError('City is required.'); return; }
    if (aadhaar && !/^\d{12}$/.test(aadhaar)) { showEditError('Aadhaar must be exactly 12 digits.'); return; }
    if (pincode && !/^\d{6}$/.test(pincode)) { showEditError('Pincode must be exactly 6 digits.'); return; }
    if (pan && pan.length !== 10) { showEditError('PAN must be exactly 10 characters.'); return; }

    const btn = document.getElementById('save-edit-btn');
    btn.disabled = true;
    document.getElementById('save-edit-txt').classList.add('d-none');
    document.getElementById('save-edit-load').classList.remove('d-none');

    try {
      await api.patch(`/api/customers/${editingCustomerId}`, {
        name,
        phone,
        address: document.getElementById('e-address').value.trim(),
        city,
        state: document.getElementById('e-state').value.trim(),
        pincode,
        aadhaar_number: aadhaar,
        pan_number: pan,
        assigned_user_id: document.getElementById('e-collector').value || null,
      });
      editModal.hide();
      showToast('Customer updated successfully', 'success');
      await loadCustomers();
    } catch (err) {
      showEditError(err.message);
      btn.disabled = false;
      document.getElementById('save-edit-txt').classList.remove('d-none');
      document.getElementById('save-edit-load').classList.add('d-none');
    }
  }

  function showEditError(msg) {
    const errEl = document.getElementById('edit-error');
    errEl.textContent = msg;
    errEl.classList.remove('d-none');
  }

  window.toggleStatus = async function (customerId, currentStatus) {
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const ok = await confirmDialog(`${newStatus === 'ACTIVE' ? 'Activate' : 'Deactivate'} this customer?`);
    if (!ok) return;
    try {
      await api.patch(`/api/customers/${customerId}/status`, { status: newStatus });
      showToast('Customer status updated', 'success');
      await loadCustomers();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  window.deleteCustomer = async function (customerId, name) {
    const ok = await confirmDialog(`Delete customer "${name}"? This action cannot be undone.`);
    if (!ok) return;
    try {
      await api.delete(`/api/customers/${customerId}`);
      showToast('Customer deleted', 'success');
      await loadCustomers();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  init();
})();

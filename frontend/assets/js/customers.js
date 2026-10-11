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
  let ePhotoFile = null;
  let eIdFile = null;

  async function init() {
    await initPage(t('cust.title'), [1, 2, 3, 4, 5]);
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
            <div class="col-6"><span style="color:#64748B;">${t('common.city')}:</span> ${c.city || '-'}</div>
            <div class="col-6"><span style="color:#64748B;">State:</span> ${c.state || '-'}</div>
          </div>
          <a href="collect-payment.html?customer_id=${c.customer_id}" class="btn btn-primary w-100">
            <i class="bi bi-cash-coin me-2"></i>${t('pay.collect')}
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
      <div class="card">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;border-bottom:1px solid var(--border);">
          <h6 style="margin:0;font-size:14px;font-weight:600;color:var(--text-primary);white-space:nowrap;">Customers List</h6>
          <input type="text" class="form-control form-control-sm" id="f-search" placeholder="${t('cust.filter_name')}" style="flex:1;min-width:120px;">
          <input type="text" class="form-control form-control-sm" id="f-city" placeholder="${t('cust.filter_city')}" style="flex:1;min-width:90px;">
          <select class="form-select form-select-sm" id="f-status" style="flex:1;min-width:100px;">
            <option value="">${t('common.all_status')}</option>
            <option value="ACTIVE">${t('common.active')}</option>
            <option value="INACTIVE">${t('common.inactive')}</option>
          </select>
          <button type="button" class="btn btn-sm btn-primary" id="search-btn"><i class="bi bi-search me-1"></i>${t('common.search')}</button>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-left:auto;">
            <span id="count-badge" class="badge bg-light text-dark" style="font-size:12px;"></span>
            <button type="button" class="btn btn-sm btn-outline-success" id="export-btn">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            ${canOnboard ? `<a href="customer-onboard.html" class="btn btn-sm btn-primary"><i class="bi bi-person-plus me-1"></i>${t('cust.onboard')}</a>` : ''}
          </div>
        </div>
        <div class="table-container">
          <table class="table table-xwide">
            <thead>
              <tr>
                <th>#</th><th>${t('cust.col_customer')}</th><th>${t('cust.col_phone')}</th><th>${t('cust.col_city')}</th><th>${t('common.status')}</th><th>${t('cust.col_disbursed')}</th><th>${t('cust.col_outstanding')}</th><th>${t('cust.col_installment')}</th><th>${t('cust.col_next_due')}</th>
                ${canEdit ? `<th>${t('common.actions')}</th>` : ''}
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
                <i class="bi bi-pencil-square me-2 text-primary"></i>${t('cust.edit_title')}
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
                  <label class="form-label">${t('pay.phone')} <span class="text-danger">*</span></label>
                  <input type="tel" class="form-control" id="e-phone" placeholder="10-digit phone" maxlength="10">
                </div>
                <div class="col-md-3">
                  <label class="form-label">Pincode</label>
                  <input type="text" class="form-control" id="e-pincode" placeholder="6-digit" maxlength="6">
                  <span id="e-pincode-feedback" style="font-size:12px;"></span>
                </div>
                <div class="col-md-3">
                  <label class="form-label">Area / Locality</label>
                  <select class="form-select" id="e-area">
                    <option value="">-- Select Area --</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label">${t('common.city')} <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="e-city" placeholder="City">
                </div>
                <div class="col-md-3">
                  <label class="form-label">State</label>
                  <input type="text" class="form-control" id="e-state" placeholder="State">
                </div>
                <div class="col-12">
                  <label class="form-label">Address</label>
                  <textarea class="form-control" id="e-address" rows="2" placeholder="Full residential address"></textarea>
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
                <div class="col-12">
                  <hr class="my-1">
                  <div style="font-size:13px;font-weight:600;">Documents <span style="font-size:11px;font-weight:400;color:#64748B;">(upload only if you want to replace)</span></div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Profile Photo</label>
                  <div id="e-photo-current" class="mb-2"></div>
                  <div id="e-photo-preview" class="d-none mb-2"></div>
                  <input type="file" id="e-photo-input" class="d-none" accept="image/jpeg,image/png">
                  <button type="button" class="btn btn-sm btn-outline-primary" id="e-photo-btn"><i class="bi bi-camera me-1"></i>Change Photo</button>
                  <div style="font-size:11px;color:#94A3B8;" class="mt-1">JPG or PNG, max 5 MB</div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">ID Proof</label>
                  <div id="e-id-current" class="mb-2"></div>
                  <select class="form-select form-select-sm mb-2 d-none" id="e-id-type">
                    <option value="">-- Select ID type --</option>
                    <option value="AADHAAR">Aadhaar Card</option>
                    <option value="PAN">PAN Card</option>
                    <option value="VOTER_ID">Voter ID</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="DL">Driving Licence</option>
                  </select>
                  <div id="e-id-preview" class="d-none mb-2"></div>
                  <input type="file" id="e-id-input" class="d-none" accept="image/jpeg,image/png,application/pdf">
                  <button type="button" class="btn btn-sm btn-outline-primary" id="e-id-btn"><i class="bi bi-file-earmark-arrow-up me-1"></i>Change ID Proof</button>
                  <div style="font-size:11px;color:#94A3B8;" class="mt-1">JPG, PNG or PDF, max 5 MB</div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary" id="save-edit-btn">
                <span id="save-edit-txt"><i class="bi bi-check-lg me-1"></i>${t('common.save')}</span>
                <span id="save-edit-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('common.saving')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);

    // Input masks
    document.getElementById('e-phone').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    document.getElementById('e-aadhaar').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 12); });
    document.getElementById('e-pincode').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
      const fb = document.getElementById('e-pincode-feedback');
      if (fb) fb.textContent = '';
      if (this.value.length === 6) lookupPincode(this.value, 'e-city', 'e-state', 'e-pincode-feedback', 'e-area');
    });
    document.getElementById('e-pan').addEventListener('input', function () { this.value = this.value.toUpperCase().slice(0, 10); });
    document.getElementById('save-edit-btn').addEventListener('click', saveCustomerEdit);

    document.getElementById('e-photo-btn').addEventListener('click', () => document.getElementById('e-photo-input').click());
    document.getElementById('e-id-btn').addEventListener('click', () => document.getElementById('e-id-input').click());
    document.getElementById('e-photo-input').addEventListener('change', function () { handleEditFile(this, 'photo'); });
    document.getElementById('e-id-input').addEventListener('change', function () { handleEditFile(this, 'id'); });

    editModal = new bootstrap.Modal(document.getElementById('edit-customer-modal'));
  }

  function handleEditFile(input, kind) {
    const file = input.files[0];
    if (!file) return;
    const allowed = kind === 'photo' ? ['image/jpeg', 'image/png'] : ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      showEditError(kind === 'photo' ? 'Photo must be a JPG or PNG image.' : 'ID proof must be a JPG, PNG or PDF file.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showEditError('File size must be 5 MB or less.');
      input.value = '';
      return;
    }
    document.getElementById('edit-error').classList.add('d-none');

    const previewEl = document.getElementById(kind === 'photo' ? 'e-photo-preview' : 'e-id-preview');
    const kb = Math.round(file.size / 1024);
    const label = document.createElement('div');
    label.style.cssText = 'font-size:12px;';
    label.textContent = `New: ${file.name} (${kb} KB)`;
    previewEl.innerHTML = '';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid #E2E8F0;margin-right:8px;';
      previewEl.style.display = 'flex';
      previewEl.style.alignItems = 'center';
      previewEl.appendChild(img);
    } else {
      previewEl.style.display = '';
    }
    previewEl.appendChild(label);
    previewEl.classList.remove('d-none');

    if (kind === 'photo') {
      ePhotoFile = file;
    } else {
      eIdFile = file;
      document.getElementById('e-id-type').classList.remove('d-none');
    }
  }

  function resetEditFiles() {
    ePhotoFile = null;
    eIdFile = null;
    ['e-photo-input', 'e-id-input'].forEach(id => { document.getElementById(id).value = ''; });
    ['e-photo-preview', 'e-id-preview'].forEach(id => {
      const el = document.getElementById(id);
      el.innerHTML = '';
      el.classList.add('d-none');
    });
    document.getElementById('e-id-type').classList.add('d-none');
  }

  function injectPhotoModal() {
    if (document.getElementById('photo-view-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="photo-view-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header py-2 px-3">
              <h6 class="modal-title fw-600" id="photo-modal-name" style="font-size:14px;"></h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body p-2 text-center">
              <img id="photo-modal-img" src="" alt="Customer Photo"
                style="max-width:100%;max-height:420px;border-radius:8px;object-fit:contain;">
              <iframe id="photo-modal-pdf" class="d-none" title="Document" style="width:100%;height:420px;border:0;"></iframe>
            </div>
            <div class="modal-footer py-2 px-3">
              <a id="photo-modal-download" class="btn btn-sm btn-outline-primary" href="#" download>
                <i class="bi bi-download me-1"></i>Download
              </a>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    const modalEl = document.getElementById('photo-view-modal');
    modalEl.style.zIndex = 1070;
    modalEl.addEventListener('shown.bs.modal', () => {
      const backs = document.querySelectorAll('.modal-backdrop');
      if (backs.length) backs[backs.length - 1].style.zIndex = 1065;
    });
    photoModal = new bootstrap.Modal(modalEl);
  }

  function openViewer(url, title, filename) {
    const isPdf = /\.pdf($|\?)/i.test(url);
    const img = document.getElementById('photo-modal-img');
    const pdf = document.getElementById('photo-modal-pdf');
    document.getElementById('photo-modal-name').textContent = title;
    img.classList.toggle('d-none', isPdf);
    pdf.classList.toggle('d-none', !isPdf);
    img.src = isPdf ? '' : url;
    pdf.src = isPdf ? url : '';
    const dl = document.getElementById('photo-modal-download');
    dl.href = url.split('?')[0];
    dl.setAttribute('download', filename);
    photoModal.show();
  }

  window.viewPhoto = function (url, name) {
    const ext = (url.split('?')[0].match(/\.(\w+)$/) || [])[1] || 'jpg';
    openViewer(url, name + ' — Photo', `${name}_photo.${ext}`);
  };

  window.viewProof = function (url, name, typeLabel) {
    const ext = (url.split('?')[0].match(/\.(\w+)$/) || [])[1] || 'jpg';
    openViewer(url, `${name} — ${typeLabel}`, `${name}_${typeLabel.replace(/\s+/g, '_')}.${ext}`);
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
      const colSpan = canEdit ? 10 : 9;
      if (!customers.length) {
        tbody.innerHTML = `<tr><td colspan="${colSpan}" class="table-empty"><i class="bi bi-people"></i>${t('cust.no_customers')}</td></tr>`;
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
              <div class="d-flex gap-1 action-btns">
                <button type="button" class="btn btn-sm btn-outline-primary" onclick="openEditModal('${c.customer_id}')" title="${t('common.edit')}">
                  <i class="bi bi-pencil"></i>
                </button>
                ${isAdmin ? `
                <button type="button" class="btn btn-sm ${c.status === 'ACTIVE' ? 'btn-warning' : 'btn-success'}" onclick="toggleStatus('${c.customer_id}','${c.status}')" title="${c.status === 'ACTIVE' ? t('common.deactivate') : t('common.activate')}">
                  <i class="bi ${c.status === 'ACTIVE' ? 'bi-pause-fill' : 'bi-play-fill'}"></i>
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="deleteCustomer('${c.customer_id}','${c.name.replace(/'/g, "\\'")}')" title="${t('common.delete')}">
                  <i class="bi bi-trash"></i>
                </button>` : ''}
              </div>
            </td>` : '';
          const nextDueCell = c.next_due_date
            ? `<div style="font-size:13px;">${formatDate(c.next_due_date)}</div>
               <div style="font-size:12px;font-weight:600;color:#DC2626;">${formatCurrency(c.next_due_amount || 0)}</div>`
            : `<span style="font-size:12px;color:var(--text-secondary);">—</span>`;
          return `<tr class="clickable" onclick="viewCustomer('${c.customer_id}')">
            <td>${offset + i + 1}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                ${avatarHtml}
                <div><div class="fw-600">${c.name}</div></div>
              </div>
            </td>
            <td onclick="event.stopPropagation()">
              <div class="d-flex align-items-center gap-2">
                <span>${c.phone || '-'}</span>
                ${c.phone ? `<a href="tel:${c.phone}" title="Call ${c.name}" style="color:var(--text-secondary);line-height:1;" onclick="event.stopPropagation()"><i class="bi bi-telephone-fill" style="font-size:13px;"></i></a>` : ''}
              </div>
            </td>
            <td>${c.city || '-'}</td>
            <td>${statusBadge(c.status || 'ACTIVE')}</td>
            <td>${c.disbursement_amount != null ? formatCurrency(c.disbursement_amount) : '<span style="color:var(--text-secondary);font-size:12px;">—</span>'}</td>
            <td>${c.outstanding_amount != null ? `<span class="fw-600" style="color:#DC2626;">${formatCurrency(c.outstanding_amount)}</span>` : '<span style="color:var(--text-secondary);font-size:12px;">—</span>'}</td>
            <td>${c.num_installments != null ? `<span class="fw-600">${c.paid_installments || 0}/${c.num_installments}</span><span style="font-size:11px;color:var(--text-secondary);margin-left:4px;">${t('cust.completed')}</span>` : '<span style="color:var(--text-secondary);font-size:12px;">—</span>'}</td>
            <td>${nextDueCell}</td>
            ${actionsCell}
          </tr>`;
        }).join('');
      }
      renderPagination();
    } catch (err) {
      document.getElementById('cust-tbody').innerHTML = `<tr><td colspan="10" class="table-empty"><i class="bi bi-exclamation-circle"></i>${err.message}</td></tr>`;
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
        'Assigned To', 'Created At',
        'Disbursed (₹)', 'Outstanding (₹)', 'Instalment (Paid/Total)',
        'Next Due Date', 'Next Due Amount (₹)',
      ];
      const rows = all.map((c, i) => {
        const instalment = c.num_installments != null
          ? `${c.paid_installments || 0}/${c.num_installments}`
          : '';
        return [
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
          c.disbursement_amount != null ? Math.round((parseFloat(c.disbursement_amount)||0)*100)/100 : '',
          c.outstanding_amount  != null ? Math.round((parseFloat(c.outstanding_amount) ||0)*100)/100 : '',
          instalment,
          c.next_due_date   || '',
          c.next_due_amount != null ? Math.round((parseFloat(c.next_due_amount)||0)*100)/100 : '',
        ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 4 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 8 },
        { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 22 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 20 },
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
      btn.innerHTML = `<i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}`;
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
      document.getElementById('e-pincode').value = c.pincode || '';
      const areaEl = document.getElementById('e-area');
      if (c.area) {
        const existing = areaEl.querySelector(`option[value="${c.area}"]`);
        if (!existing) {
          const opt = document.createElement('option');
          opt.value = c.area; opt.textContent = c.area;
          areaEl.appendChild(opt);
        }
        areaEl.value = c.area;
      }
      document.getElementById('e-city').value = c.city || '';
      document.getElementById('e-state').value = c.state || '';
      document.getElementById('e-address').value = c.address || '';
      document.getElementById('e-aadhaar').value = c.aadhaar || '';
      document.getElementById('e-pan').value = c.pan || '';
      sel.value = c.user_id || '';

      resetEditFiles();
      document.getElementById('e-id-type').value = c.id_proof_type || '';
      const safeName = (c.name || 'Customer').replace(/[^\w\- ]/g, '').trim() || 'Customer';
      const photoCur = document.getElementById('e-photo-current');
      photoCur.innerHTML = '';
      if (c.photo) {
        const img = document.createElement('img');
        img.src = `/api/kyc/${c.photo}?t=${Date.now()}`;
        img.alt = 'Current photo';
        img.title = 'View photo';
        img.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:50%;border:2px solid #E2E8F0;cursor:pointer;';
        img.addEventListener('click', () => window.viewPhoto(`/api/kyc/${c.photo}?t=${Date.now()}`, safeName));
        photoCur.appendChild(img);
      } else {
        photoCur.innerHTML = '<span style="font-size:12px;color:#94A3B8;">No photo uploaded</span>';
      }

      const idLabels = { AADHAAR: 'Aadhaar Card', PAN: 'PAN Card', VOTER_ID: 'Voter ID', PASSPORT: 'Passport', DL: 'Driving Licence' };
      const idLabel = idLabels[c.id_proof_type] || c.id_proof_type || 'ID Proof';
      const idCur = document.getElementById('e-id-current');
      idCur.innerHTML = '';
      if (c.id_proof) {
        const idUrl = `/api/kyc/${c.id_proof}?t=${Date.now()}`;
        const isPdf = /\.pdf$/i.test(c.id_proof);
        let tile;
        if (isPdf) {
          tile = document.createElement('div');
          tile.innerHTML = '<i class="bi bi-file-earmark-pdf" style="font-size:28px;color:#DC2626;"></i>';
          tile.style.cssText = 'width:56px;height:56px;border-radius:50%;border:2px solid #E2E8F0;display:flex;align-items:center;justify-content:center;background:#FEF2F2;cursor:pointer;';
        } else {
          tile = document.createElement('img');
          tile.src = idUrl;
          tile.style.cssText = 'width:56px;height:56px;object-fit:cover;border-radius:50%;border:2px solid #E2E8F0;cursor:pointer;';
        }
        tile.title = 'View ' + idLabel;
        tile.addEventListener('click', () => window.viewProof(idUrl, safeName, idLabel));
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const cap = document.createElement('span');
        cap.style.cssText = 'font-size:12px;color:#64748B;';
        cap.textContent = idLabel;
        wrap.appendChild(tile);
        wrap.appendChild(cap);
        idCur.appendChild(wrap);
      } else {
        idCur.innerHTML = '<span style="font-size:12px;color:#94A3B8;">No ID proof uploaded</span>';
      }

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
    if (eIdFile && !document.getElementById('e-id-type').value) { showEditError('Select the ID type for the new ID proof.'); return; }

    const btn = document.getElementById('save-edit-btn');
    btn.disabled = true;
    document.getElementById('save-edit-txt').classList.add('d-none');
    document.getElementById('save-edit-load').classList.remove('d-none');

    try {
      await api.patch(`/api/customers/${editingCustomerId}`, {
        name,
        phone,
        pincode,
        area: document.getElementById('e-area').value.trim(),
        city,
        state: document.getElementById('e-state').value.trim(),
        address: document.getElementById('e-address').value.trim(),
        aadhaar_number: aadhaar,
        pan_number: pan,
        assigned_user_id: document.getElementById('e-collector').value || null,
      });
      if (ePhotoFile || eIdFile) {
        const fd = new FormData();
        if (ePhotoFile) fd.append('photo', ePhotoFile);
        if (eIdFile) {
          fd.append('id_proof', eIdFile);
          fd.append('id_proof_type', document.getElementById('e-id-type').value);
        }
        await api.patchForm(`/api/customers/${editingCustomerId}/kyc`, fd);
      }
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
    const ok = await confirmDialog(newStatus === 'ACTIVE' ? t('cust.activate_confirm') : t('cust.deactivate_confirm'));
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

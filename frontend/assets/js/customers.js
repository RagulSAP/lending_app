(function () {
  'use strict';

  let currentPage = 1;
  const perPage = 20;
  let totalPages = 1;
  let currentUser = null;

  async function init() {
    await initPage('Customers', [1, 2, 3, 4, 5]);
    currentUser = auth.getUser();
    if (currentUser.role_id === ROLES.COLLECTOR) {
      renderCollectorView();
    } else {
      renderFullView();
      await loadCustomers();
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
              <button class="btn btn-primary" id="phone-search-btn"><i class="bi bi-search"></i></button>
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
      resultEl.innerHTML = `
        <div class="search-result-card">
          <div class="d-flex align-items-center gap-3 mb-3">
            <div class="customer-avatar">${initials}</div>
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
    const isAdmin = currentUser.role_id === ROLES.ADMIN;
    const canOnboard = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(currentUser.role_id);
    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div><h1>Customers</h1><p>Manage and view all customer accounts and loans</p></div>
        ${canOnboard ? '<a href="customer-onboard.html" class="btn btn-primary"><i class="bi bi-person-plus"></i> Onboard Customer</a>' : ''}
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
          <button class="btn btn-primary" id="search-btn"><i class="bi bi-search"></i> Search</button>
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
                ${isAdmin ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody id="cust-tbody"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-center mt-3 mb-2" id="pagination-wrap"></div>
      </div>`;

    document.getElementById('search-btn').addEventListener('click', () => { currentPage = 1; loadCustomers(); });
    document.getElementById('f-search').addEventListener('keydown', e => { if (e.key === 'Enter') { currentPage = 1; loadCustomers(); } });
  }

  async function loadCustomers() {
    const search = document.getElementById('f-search').value.trim();
    const city = document.getElementById('f-city').value.trim();
    const status = document.getElementById('f-status').value;
    try {
      showLoading();
      const res = await api.get('/api/customers', { search, city, status, page: currentPage, per_page: perPage });
      const customers = res.data || [];
      const pagination = res.pagination || {};
      totalPages = pagination.total_pages || 1;
      const total = pagination.total || customers.length;
      const badge = document.getElementById('count-badge');
      if (badge) badge.textContent = total + ' customer' + (total !== 1 ? 's' : '');

      const isAdmin = currentUser.role_id === ROLES.ADMIN;
      const tbody = document.getElementById('cust-tbody');
      const offset = (currentPage - 1) * perPage;
      if (!customers.length) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" class="table-empty"><i class="bi bi-people"></i>No customers found</td></tr>`;
      } else {
        tbody.innerHTML = customers.map((c, i) => {
          const initials = (c.name || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          return `<tr class="clickable" onclick="viewCustomer(${c.customer_id})">
            <td>${offset + i + 1}</td>
            <td>
              <div class="d-flex align-items-center gap-2">
                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#2563EB,#7C3AED);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:600;flex-shrink:0;">${initials}</div>
                <div><div class="fw-600">${c.name}</div><div style="font-size:11px;color:#64748B;">#${c.customer_id}</div></div>
              </div>
            </td>
            <td>${c.phone || '-'}</td>
            <td>${c.city || '-'}</td>
            <td>${statusBadge(c.status || 'ACTIVE')}</td>
            <td>${c.assigned_user_name || c.assigned_to || '-'}</td>
            <td>${formatDate(c.created_at)}</td>
            ${isAdmin ? `<td onclick="event.stopPropagation()">
              <div class="d-flex gap-1">
                <button class="btn btn-sm ${c.status === 'ACTIVE' ? 'btn-warning' : 'btn-success'}" onclick="toggleStatus(${c.customer_id},'${c.status}')" title="${c.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}">
                  <i class="bi ${c.status === 'ACTIVE' ? 'bi-pause-fill' : 'bi-play-fill'}"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteCustomer(${c.customer_id},'${c.name}')" title="Delete">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </td>` : ''}
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

  window.viewCustomer = function (customerId) {
    window.location.href = 'collect-payment.html?customer_id=' + customerId;
  };

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

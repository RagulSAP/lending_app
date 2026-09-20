// LendTrack Reports Page
(function () {
  'use strict';

  let activeTab = 'transactions';
  let currentPage = 1;
  const perPage = 20;
  let totalPages = 1;
  let expenseCategories = [];

  async function init() {
    await initPage('Reports', [1, 2, 5]);
    await loadCategories();
    renderPage();
  }

  async function loadCategories() {
    try {
      const res = await api.get('/api/expenses/categories');
      expenseCategories = res.data || [];
    } catch (_) {
      expenseCategories = [];
    }
  }

  function renderPage() {
    const today = new Date().toISOString().split('T')[0];
    const d = new Date();
    const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    const catOpts = '<option value="">All Categories</option>' +
      expenseCategories.map(c => `<option value="${c.category_id}">${c.name}</option>`).join('');

    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h1>Reports</h1>
        <p>View, filter and export financial reports</p>
      </div>

      <!-- Tab Navigation -->
      <ul class="nav nav-tabs" id="report-tabs" style="margin-bottom:0;border-bottom:none;">
        <li class="nav-item">
          <a class="nav-link active" href="#" data-tab="transactions" onclick="switchTab('transactions');return false;">
            <i class="bi bi-arrow-left-right me-1"></i>Transactions
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="loans" onclick="switchTab('loans');return false;">
            <i class="bi bi-file-earmark-text me-1"></i>Loans
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="expenses" onclick="switchTab('expenses');return false;">
            <i class="bi bi-receipt me-1"></i>Expenses
          </a>
        </li>
      </ul>

      <!-- Transactions Tab -->
      <div id="tab-transactions">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">Date From <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="txn-from" value="${firstOfMonth}">
          </div>
          <div class="form-group">
            <label class="form-label">Date To <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="txn-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Mode</label>
            <select class="form-select" id="txn-mode">
              <option value="">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="txn-type">
              <option value="">All Types</option>
              <option value="PAYMENT">Payment</option>
              <option value="DISBURSEMENT">Disbursement</option>
            </select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('transactions')">
              <i class="bi bi-search me-1"></i>Search
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','transactions')">
              <i class="bi bi-file-earmark-excel me-1"></i>Excel
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','transactions')">
              <i class="bi bi-file-earmark-pdf me-1"></i>PDF
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">Transaction Records</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="txn-total" class="fw-600 text-primary" style="font-size:13px;"></span>
              <span id="txn-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr><th>#</th><th>Date</th><th>Customer</th><th>Loan #</th><th>Amount</th><th>Mode</th><th>Type</th></tr>
              </thead>
              <tbody id="txn-tbody">
                <tr><td colspan="7" class="table-empty"><i class="bi bi-search"></i>Select filters and click Search to view records</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="txn-pag"></div>
        </div>
      </div>

      <!-- Loans Tab -->
      <div id="tab-loans" class="d-none">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">Date From</label>
            <input type="date" class="form-control" id="loan-from" value="${firstOfMonth}">
          </div>
          <div class="form-group">
            <label class="form-label">Date To</label>
            <input type="date" class="form-control" id="loan-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="loan-status">
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="OVERDUE">Overdue</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Interest Type</label>
            <select class="form-select" id="loan-int">
              <option value="">All Types</option>
              <option value="FLAT">Flat</option>
              <option value="REDUCING">Reducing</option>
            </select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('loans')">
              <i class="bi bi-search me-1"></i>Search
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','loans')">
              <i class="bi bi-file-earmark-excel me-1"></i>Excel
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','loans')">
              <i class="bi bi-file-earmark-pdf me-1"></i>PDF
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">Loan Records</h6>
            <span id="loan-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr><th>#</th><th>Customer</th><th>Loan #</th><th>Disbursed</th><th>Outstanding</th><th>Rate</th><th>Int. Type</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody id="loan-tbody">
                <tr><td colspan="9" class="table-empty"><i class="bi bi-search"></i>Select filters and click Search to view records</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="loan-pag"></div>
        </div>
      </div>

      <!-- Expenses Tab -->
      <div id="tab-expenses" class="d-none">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">Date From</label>
            <input type="date" class="form-control" id="rep-exp-from" value="${firstOfMonth}">
          </div>
          <div class="form-group">
            <label class="form-label">Date To</label>
            <input type="date" class="form-control" id="rep-exp-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Category</label>
            <select class="form-select" id="rep-exp-cat">${catOpts}</select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('expenses')">
              <i class="bi bi-search me-1"></i>Search
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','expenses')">
              <i class="bi bi-file-earmark-excel me-1"></i>Excel
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','expenses')">
              <i class="bi bi-file-earmark-pdf me-1"></i>PDF
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">Expense Records</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="exp-total" class="fw-600 text-danger" style="font-size:13px;"></span>
              <span id="exp-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr><th>#</th><th>Date</th><th>Category</th><th>Amount</th><th>By</th><th>Remark</th></tr>
              </thead>
              <tbody id="exp-rep-tbody">
                <tr><td colspan="6" class="table-empty"><i class="bi bi-search"></i>Select filters and click Search to view records</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="exp-pag"></div>
        </div>
      </div>`;
  }

  window.switchTab = function (tab) {
    activeTab = tab;
    currentPage = 1;
    ['transactions', 'loans', 'expenses'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      const link = document.querySelector('[data-tab="' + t + '"]');
      if (el) el.classList.toggle('d-none', t !== tab);
      if (link) link.classList.toggle('active', t === tab);
    });
  };

  window.searchReport = async function (tab) {
    currentPage = 1;
    await fetchReportData(tab);
  };

  async function fetchReportData(tab) {
    try {
      showLoading();
      const params = { page: currentPage, per_page: perPage };
      let tbodyId, colCount, pagId, countId;

      if (tab === 'transactions') {
        params.date_from = document.getElementById('txn-from').value;
        params.date_to = document.getElementById('txn-to').value;
        params.payment_mode = document.getElementById('txn-mode').value;
        params.transaction_type = document.getElementById('txn-type').value;
        tbodyId = 'txn-tbody'; colCount = 7; pagId = 'txn-pag'; countId = 'txn-count';
      } else if (tab === 'loans') {
        params.date_from = document.getElementById('loan-from').value;
        params.date_to = document.getElementById('loan-to').value;
        params.status = document.getElementById('loan-status').value;
        params.interest_type = document.getElementById('loan-int').value;
        tbodyId = 'loan-tbody'; colCount = 9; pagId = 'loan-pag'; countId = 'loan-count';
      } else {
        params.date_from = document.getElementById('rep-exp-from').value;
        params.date_to = document.getElementById('rep-exp-to').value;
        params.category_id = document.getElementById('rep-exp-cat').value;
        tbodyId = 'exp-rep-tbody'; colCount = 6; pagId = 'exp-pag'; countId = 'exp-count';
      }

      const res = await api.get('/api/reports/' + tab, params);
      const rows = res.data || [];
      const pagination = res.pagination || {};
      totalPages = pagination.total_pages || 1;
      const total = pagination.total || rows.length;

      const badge = document.getElementById(countId);
      if (badge) badge.textContent = total + ' record' + (total !== 1 ? 's' : '');

      const tbody = document.getElementById(tbodyId);
      const offset = (currentPage - 1) * perPage;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty"><i class="bi bi-inbox"></i>No records found for selected filters</td></tr>`;
      } else if (tab === 'transactions') {
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totEl = document.getElementById('txn-total');
        if (totEl) totEl.textContent = 'Total: ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.transaction_date || r.created_at)}</td>
          <td>${r.customer_name || '-'}</td>
          <td>#${r.loan_id || '-'}</td>
          <td class="fw-600">${formatCurrency(r.amount)}</td>
          <td><span class="badge bg-light text-dark">${r.payment_mode || '-'}</span></td>
          <td>
            <span class="badge ${r.transaction_type === 'PAYMENT' ? 'bg-success bg-opacity-10 text-success' : 'bg-info bg-opacity-10 text-info'}">
              ${r.transaction_type || '-'}
            </span>
          </td>
        </tr>`).join('');
      } else if (tab === 'loans') {
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${r.customer_name || '-'}</td>
          <td>#${r.loan_id}</td>
          <td>${formatCurrency(r.disbursement_amount)}</td>
          <td class="fw-600 text-danger">${formatCurrency(r.outstanding_amount || r.balance_amount || 0)}</td>
          <td>${r.interest_rate || 0}%</td>
          <td><span class="badge bg-light text-dark">${r.interest_type || '-'}</span></td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatDate(r.disbursement_date || r.created_at)}</td>
        </tr>`).join('');
      } else {
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.expense_amount || 0), 0);
        const totEl = document.getElementById('exp-total');
        if (totEl) totEl.textContent = 'Total: ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.expense_date || r.created_at)}</td>
          <td>${r.category_name || '-'}</td>
          <td class="fw-600 text-danger">${formatCurrency(r.expense_amount)}</td>
          <td>${r.entered_by || r.user_name || '-'}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.expense_remark || r.remark || '-'}</td>
        </tr>`).join('');
      }

      renderPagination(tab, pagId);
    } catch (err) {
      showToast('Failed to load report: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  function renderPagination(tab, wrapperId) {
    const wrap = document.getElementById(wrapperId);
    if (!wrap || totalPages <= 1) { if (wrap) wrap.innerHTML = ''; return; }
    let html = '<nav><ul class="pagination mb-0">';
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" onclick="repGoPage('${tab}',${currentPage - 1});return false;">&#8249;</a></li>`;
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
      html += `<li class="page-item${p === currentPage ? ' active' : ''}"><a class="page-link" href="#" onclick="repGoPage('${tab}',${p});return false;">${p}</a></li>`;
    }
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" onclick="repGoPage('${tab}',${currentPage + 1});return false;">&#8250;</a></li>`;
    html += '</ul></nav>';
    wrap.innerHTML = html;
  }

  window.repGoPage = function (tab, p) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    fetchReportData(tab);
  };

  window.exportReport = async function (type, report) {
    try {
      const params = { type, report };
      if (report === 'transactions') {
        params.date_from = document.getElementById('txn-from').value;
        params.date_to = document.getElementById('txn-to').value;
        params.payment_mode = document.getElementById('txn-mode').value;
        params.transaction_type = document.getElementById('txn-type').value;
      } else if (report === 'loans') {
        params.date_from = document.getElementById('loan-from').value;
        params.date_to = document.getElementById('loan-to').value;
        params.status = document.getElementById('loan-status').value;
        params.interest_type = document.getElementById('loan-int').value;
      } else {
        params.date_from = document.getElementById('rep-exp-from').value;
        params.date_to = document.getElementById('rep-exp-to').value;
        params.category_id = document.getElementById('rep-exp-cat').value;
      }
      showToast('Preparing ' + type.toUpperCase() + ' export...', 'info');
      const ext = type === 'excel' ? 'xlsx' : 'pdf';
      const filename = report + '_report_' + new Date().toISOString().split('T')[0] + '.' + ext;
      await api.download('/api/reports/export', params, filename);
    } catch (err) {
      showToast('Export failed: ' + err.message, 'danger');
    }
  };

  init();
})();

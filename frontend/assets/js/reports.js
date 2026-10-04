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
    await fetchReportData(activeTab);
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
    const catOpts = `<option value="">${t('exp.all_cats')}</option>` +
      expenseCategories.map(c => `<option value="${c.category_id}">${c.name}</option>`).join('');

    document.getElementById('page-content').innerHTML = `
      <!-- Tab Navigation -->
      <ul class="nav nav-tabs" id="report-tabs" style="margin-bottom:0;border-bottom:none;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px;">
        <li class="nav-item">
          <a class="nav-link active" href="#" data-tab="transactions" onclick="switchTab('transactions');return false;">
            <i class="bi bi-arrow-left-right me-1"></i>${t('rep.tab_tx')}
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="collection" onclick="switchTab('collection');return false;">
            <i class="bi bi-cash-coin me-1"></i>${t('rep.tab_coll')}
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="loans" onclick="switchTab('loans');return false;">
            <i class="bi bi-file-earmark-text me-1"></i>${t('rep.tab_loans')}
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="expenses" onclick="switchTab('expenses');return false;">
            <i class="bi bi-receipt me-1"></i>${t('rep.tab_exp')}
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="topup" onclick="switchTab('topup');return false;">
            <i class="bi bi-arrow-down-circle me-1"></i>${t('rep.tab_topup')}
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link" href="#" data-tab="withdrawal" onclick="switchTab('withdrawal');return false;">
            <i class="bi bi-box-arrow-up me-1"></i>${t('rep.tab_withdraw')}
          </a>
        </li>
      </ul>

      <!-- Transactions Tab -->
      <div id="tab-transactions">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">${t('common.date_from')} <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="txn-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('common.date_to')} <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="txn-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('rep.mode')}</label>
            <select class="form-select" id="txn-mode">
              <option value="">${t('rep.all_modes')}</option>
              <option value="CASH">${t('rep.cash')}</option>
              <option value="UPI">${t('rep.upi')}</option>
              <option value="BANK_TRANSFER">${t('rep.bank')}</option>
              <option value="CHEQUE">${t('rep.cheque')}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${t('rep.type')}</label>
            <select class="form-select" id="txn-type">
              <option value="">${t('rep.all_types')}</option>
              <option value="LOAN_COLLECTION">${t('rep.payment')}</option>
              <option value="LOAN_DISBURSEMENT">${t('rep.disbursement')}</option>
              <option value="EXPENSE">${t('rep.expense')}</option>
              <option value="WALLET_DEPOSIT">${t('rep.topup')}</option>
              <option value="WALLET_WITHDRAWAL">${t('rep.withdrawal')}</option>
            </select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('transactions')">
              <i class="bi bi-search me-1"></i>${t('common.search')}
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','transactions')">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','transactions')">
              <i class="bi bi-file-earmark-pdf me-1"></i>${t('common.pdf')}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">${t('rep.tx_title')}</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="txn-total" class="fw-600 text-primary" style="font-size:13px;"></span>
              <span id="txn-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table table-wide">
              <thead>
                <tr><th>#</th><th>${t('rep.col_date')}</th><th>${t('rep.col_customer')}</th><th>${t('rep.col_done_by')}</th><th>${t('rep.col_loan')}</th><th>${t('rep.col_amount')}</th><th>${t('rep.col_mode')}</th><th>${t('rep.type')}</th></tr>
              </thead>
              <tbody id="txn-tbody">
                <tr><td colspan="8" class="table-empty"><i class="bi bi-search"></i>${t('rep.initial')}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="txn-pag"></div>
        </div>
      </div>

      <!-- Collection Tab -->
      <div id="tab-collection" class="d-none">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">${t('common.date_from')} <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="col-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('common.date_to')} <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="col-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('rep.mode')}</label>
            <select class="form-select" id="col-mode">
              <option value="">${t('rep.all_modes')}</option>
              <option value="CASH">${t('rep.cash')}</option>
              <option value="UPI">${t('rep.upi')}</option>
              <option value="BANK_TRANSFER">${t('rep.bank')}</option>
              <option value="CHEQUE">${t('rep.cheque')}</option>
            </select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('collection')">
              <i class="bi bi-search me-1"></i>${t('common.search')}
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','collection')">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','collection')">
              <i class="bi bi-file-earmark-pdf me-1"></i>${t('common.pdf')}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">${t('rep.coll_title')}</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="col-total" class="fw-600 text-success" style="font-size:13px;"></span>
              <span id="col-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table table-wide">
              <thead>
                <tr><th>#</th><th>${t('rep.col_date')}</th><th>${t('rep.col_customer')}</th><th>${t('rep.col_loan')}</th><th>${t('rep.col_amount')}</th><th>${t('rep.col_mode')}</th><th>${t('rep.col_collected_by')}</th></tr>
              </thead>
              <tbody id="col-tbody">
                <tr><td colspan="7" class="table-empty"><i class="bi bi-search"></i>${t('rep.initial')}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="col-pag"></div>
        </div>
      </div>

      <!-- Loans Tab -->
      <div id="tab-loans" class="d-none">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">${t('common.date_from')}</label>
            <input type="date" class="form-control" id="loan-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('common.date_to')}</label>
            <input type="date" class="form-control" id="loan-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="loan-status">
              <option value="">${t('rep.all_statuses')}</option>
              <option value="ACTIVE">Active</option>
              <option value="OVERDUE">Overdue</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${t('rep.interest_type')}</label>
            <select class="form-select" id="loan-int">
              <option value="">${t('rep.all_types')}</option>
              <option value="FLAT">${t('rep.flat')}</option>
              <option value="REDUCING">${t('rep.reducing')}</option>
            </select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('loans')">
              <i class="bi bi-search me-1"></i>${t('common.search')}
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','loans')">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','loans')">
              <i class="bi bi-file-earmark-pdf me-1"></i>${t('common.pdf')}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">${t('rep.loans_title')}</h6>
            <span id="loan-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
          </div>
          <div class="table-container">
            <table class="table table-wide">
              <thead>
                <tr><th>#</th><th>${t('rep.col_customer')}</th><th>Onboarded By</th><th>Disbursed</th><th>${t('rep.col_outstanding')}</th><th>${t('rep.col_installments')}</th><th>${t('rep.col_coll_amt')}</th><th>Status</th><th>${t('rep.col_date')}</th></tr>
              </thead>
              <tbody id="loan-tbody">
                <tr><td colspan="9" class="table-empty"><i class="bi bi-search"></i>${t('rep.initial')}</td></tr>
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
            <label class="form-label">${t('common.date_from')}</label>
            <input type="date" class="form-control" id="rep-exp-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('common.date_to')}</label>
            <input type="date" class="form-control" id="rep-exp-to" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('exp.category')}</label>
            <select class="form-select" id="rep-exp-cat">${catOpts}</select>
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('expenses')">
              <i class="bi bi-search me-1"></i>${t('common.search')}
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','expenses')">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','expenses')">
              <i class="bi bi-file-earmark-pdf me-1"></i>${t('common.pdf')}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">${t('rep.exp_title')}</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="exp-total" class="fw-600 text-danger" style="font-size:13px;"></span>
              <span id="exp-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr><th>#</th><th>${t('rep.col_date')}</th><th>${t('exp.col_category')}</th><th>${t('rep.col_amount')}</th><th>${t('rep.col_by')}</th><th>${t('exp.col_remark')}</th></tr>
              </thead>
              <tbody id="exp-rep-tbody">
                <tr><td colspan="6" class="table-empty"><i class="bi bi-search"></i>${t('rep.initial')}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="exp-pag"></div>
        </div>
      </div>

      <!-- Top Up Tab -->
      <div id="tab-topup" class="d-none">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">${t('common.date_from')}</label>
            <input type="date" class="form-control" id="tu-rep-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('common.date_to')}</label>
            <input type="date" class="form-control" id="tu-rep-to" value="${today}">
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('topup')">
              <i class="bi bi-search me-1"></i>${t('common.search')}
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','topup')">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','topup')">
              <i class="bi bi-file-earmark-pdf me-1"></i>${t('common.pdf')}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">${t('rep.topup_title')}</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="tu-rep-total" class="fw-600 text-success" style="font-size:13px;"></span>
              <span id="tu-rep-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead><tr><th>#</th><th>${t('rep.col_date')}</th><th>${t('rep.col_amount')}</th><th>${t('rep.col_done_by')}</th><th>Remarks</th></tr></thead>
              <tbody id="tu-rep-tbody">
                <tr><td colspan="5" class="table-empty"><i class="bi bi-search"></i>${t('rep.initial')}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="tu-rep-pag"></div>
        </div>
      </div>

      <!-- Withdrawal Tab -->
      <div id="tab-withdrawal" class="d-none">
        <div class="filter-bar" style="border-radius:0 12px 12px 12px;">
          <div class="form-group">
            <label class="form-label">${t('common.date_from')}</label>
            <input type="date" class="form-control" id="wd-rep-from" value="${today}">
          </div>
          <div class="form-group">
            <label class="form-label">${t('common.date_to')}</label>
            <input type="date" class="form-control" id="wd-rep-to" value="${today}">
          </div>
          <div class="form-group d-flex align-items-end gap-2 flex-wrap">
            <button class="btn btn-primary" onclick="searchReport('withdrawal')">
              <i class="bi bi-search me-1"></i>${t('common.search')}
            </button>
            <button class="btn btn-outline-success" onclick="exportReport('excel','withdrawal')">
              <i class="bi bi-file-earmark-excel me-1"></i>${t('common.excel')}
            </button>
            <button class="btn btn-outline-danger" onclick="exportReport('pdf','withdrawal')">
              <i class="bi bi-file-earmark-pdf me-1"></i>${t('common.pdf')}
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-header-flex">
            <h6 class="card-title">${t('rep.withdraw_title')}</h6>
            <div class="d-flex gap-2 align-items-center">
              <span id="wd-rep-total" class="fw-600 text-warning" style="font-size:13px;"></span>
              <span id="wd-rep-count" class="badge bg-light text-dark" style="font-size:12px;"></span>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead><tr><th>#</th><th>${t('rep.col_date')}</th><th>${t('rep.col_amount')}</th><th>${t('rep.col_done_by')}</th><th>${t('wallet.partner')}</th><th>Remarks</th></tr></thead>
              <tbody id="wd-rep-tbody">
                <tr><td colspan="6" class="table-empty"><i class="bi bi-search"></i>${t('rep.initial')}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="d-flex justify-content-center mt-3 mb-2" id="wd-rep-pag"></div>
        </div>
      </div>`;
  }

  window.switchTab = function (tab) {
    activeTab = tab;
    currentPage = 1;
    ['transactions', 'collection', 'loans', 'expenses', 'topup', 'withdrawal'].forEach(tabKey => {
      const el = document.getElementById('tab-' + tabKey);
      const link = document.querySelector('[data-tab="' + tabKey + '"]');
      if (el) el.classList.toggle('d-none', tabKey !== tab);
      if (link) link.classList.toggle('active', tabKey === tab);
    });
    fetchReportData(tab);
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
        tbodyId = 'txn-tbody'; colCount = 8; pagId = 'txn-pag'; countId = 'txn-count';
      } else if (tab === 'collection') {
        params.date_from = document.getElementById('col-from').value;
        params.date_to   = document.getElementById('col-to').value;
        params.payment_mode = document.getElementById('col-mode').value;
        params.transaction_type = 'LOAN_COLLECTION';
        tbodyId = 'col-tbody'; colCount = 7; pagId = 'col-pag'; countId = 'col-count';
      } else if (tab === 'loans') {
        params.date_from = document.getElementById('loan-from').value;
        params.date_to = document.getElementById('loan-to').value;
        params.status = document.getElementById('loan-status').value;
        params.interest_type = document.getElementById('loan-int').value;
        tbodyId = 'loan-tbody'; colCount = 9; pagId = 'loan-pag'; countId = 'loan-count';
      } else if (tab === 'expenses') {
        params.date_from = document.getElementById('rep-exp-from').value;
        params.date_to = document.getElementById('rep-exp-to').value;
        params.category_id = document.getElementById('rep-exp-cat').value;
        tbodyId = 'exp-rep-tbody'; colCount = 6; pagId = 'exp-pag'; countId = 'exp-count';
      } else if (tab === 'topup') {
        params.date_from = document.getElementById('tu-rep-from').value;
        params.date_to   = document.getElementById('tu-rep-to').value;
        tbodyId = 'tu-rep-tbody'; colCount = 5; pagId = 'tu-rep-pag'; countId = 'tu-rep-count';
      } else {  // withdrawal
        params.date_from = document.getElementById('wd-rep-from').value;
        params.date_to   = document.getElementById('wd-rep-to').value;
        tbodyId = 'wd-rep-tbody'; colCount = 6; pagId = 'wd-rep-pag'; countId = 'wd-rep-count';
      }

      const apiTab = tab === 'collection' ? 'transactions' : tab;
      const res = await api.get('/api/reports/' + apiTab, params);
      const rows = res.data || [];
      const pagination = res.pagination || {};
      totalPages = pagination.total_pages || 1;
      const total = pagination.total || rows.length;

      const badge = document.getElementById(countId);
      if (badge) badge.textContent = total + ' record' + (total !== 1 ? 's' : '');

      const tbody = document.getElementById(tbodyId);
      const offset = (currentPage - 1) * perPage;

      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="table-empty"><i class="bi bi-inbox"></i>${t('rep.no_records')}</td></tr>`;
      } else if (tab === 'transactions') {
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totEl = document.getElementById('txn-total');
        if (totEl) totEl.textContent = t('common.total') + ': ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.transaction_date || r.created_at)}</td>
          <td>${r.customer_name || '-'}</td>
          <td style="font-size:12px;color:#64748B;">${r.collected_by || '-'}</td>
          <td style="font-size:12px;">${r.loan_id ? r.loan_id.slice(0, 8) + '…' : '-'}</td>
          <td class="fw-600">${formatCurrency(r.amount)}</td>
          <td><span class="badge bg-light text-dark">${r.payment_mode || '-'}</span></td>
          <td><span class="badge bg-secondary bg-opacity-10 text-secondary">${r.transaction_type || '-'}</span></td>
        </tr>`).join('');
      } else if (tab === 'collection') {
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totEl = document.getElementById('col-total');
        if (totEl) totEl.textContent = t('common.total') + ': ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.transaction_date || r.created_at)}</td>
          <td>${r.customer_name || '-'}</td>
          <td style="font-size:12px;color:#64748B;">${r.loan_id ? r.loan_id.slice(0, 8) + '…' : '-'}</td>
          <td class="fw-600 text-success">${formatCurrency(r.amount)}</td>
          <td><span class="badge bg-light text-dark">${r.payment_mode || '-'}</span></td>
          <td style="font-size:12px;color:#64748B;">${r.collected_by || '-'}</td>
        </tr>`).join('');
      } else if (tab === 'loans') {
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${r.customer_name || '-'}</td>
          <td style="font-size:12px;color:#64748B;">${r.onboarded_by || '-'}</td>
          <td>${formatCurrency(r.disbursement_amount)}</td>
          <td class="fw-600 text-danger">${formatCurrency(r.outstanding_amount || r.balance_amount || 0)}</td>
          <td class="fw-600">${r.num_installments || '-'}</td>
          <td class="fw-600">${r.installment_amount ? formatCurrency(r.installment_amount) : '-'}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatDate(r.disbursement_date || r.created_at)}</td>
        </tr>`).join('');
      } else if (tab === 'expenses') {
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.expense_amount || 0), 0);
        const totEl = document.getElementById('exp-total');
        if (totEl) totEl.textContent = t('common.total') + ': ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.expense_date || r.created_at)}</td>
          <td>${r.category_name || '-'}</td>
          <td class="fw-600 text-danger">${formatCurrency(r.expense_amount)}</td>
          <td>${r.entered_by || r.user_name || '-'}</td>
          <td style="max-width:200px;word-break:break-word;white-space:normal;">${r.expense_remark || r.remark || '-'}</td>
        </tr>`).join('');
      } else if (tab === 'topup') {
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totEl = document.getElementById('tu-rep-total');
        if (totEl) totEl.textContent = t('common.total') + ': ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.transaction_date)}</td>
          <td class="text-success fw-600">${formatCurrency(r.amount)}</td>
          <td>${r.collected_by || '-'}</td>
          <td style="max-width:220px;word-break:break-word;white-space:normal;">${r.remarks || '-'}</td>
        </tr>`).join('');
      } else {
        // withdrawal
        const totalAmt = pagination.total_amount || rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
        const totEl = document.getElementById('wd-rep-total');
        if (totEl) totEl.textContent = t('common.total') + ': ' + formatCurrency(totalAmt);
        tbody.innerHTML = rows.map((r, i) => `<tr>
          <td>${offset + i + 1}</td>
          <td>${formatDate(r.transaction_date)}</td>
          <td class="text-warning fw-600">${formatCurrency(r.amount)}</td>
          <td>${r.collected_by || '-'}</td>
          <td>${r.partner_name ? `<span class="fw-600">${r.partner_name}</span>` : '<span style="color:#CBD5E1;">—</span>'}</td>
          <td style="max-width:200px;word-break:break-word;white-space:normal;">${r.remarks || '-'}</td>
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
      } else if (report === 'collection') {
        params.report = 'transactions';
        params.date_from = document.getElementById('col-from').value;
        params.date_to   = document.getElementById('col-to').value;
        params.payment_mode = document.getElementById('col-mode').value;
        params.transaction_type = 'LOAN_COLLECTION';
      } else if (report === 'loans') {
        params.date_from = document.getElementById('loan-from').value;
        params.date_to = document.getElementById('loan-to').value;
        params.status = document.getElementById('loan-status').value;
        params.interest_type = document.getElementById('loan-int').value;
      } else if (report === 'expenses') {
        params.date_from = document.getElementById('rep-exp-from').value;
        params.date_to = document.getElementById('rep-exp-to').value;
        params.category_id = document.getElementById('rep-exp-cat').value;
      } else if (report === 'topup') {
        params.date_from = document.getElementById('tu-rep-from').value;
        params.date_to   = document.getElementById('tu-rep-to').value;
      } else if (report === 'withdrawal') {
        params.date_from = document.getElementById('wd-rep-from').value;
        params.date_to   = document.getElementById('wd-rep-to').value;
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

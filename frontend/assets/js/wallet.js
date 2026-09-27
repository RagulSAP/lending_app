(function () {
  'use strict';

  let partners = [];
  let walletData = null;
  let topupModal = null;
  let topupConfirmModal = null;
  let addPartnerModal = null;
  let allTransactions = [];
  let txnSortDir = 'desc';
  let _confirmResolve = null;

  function amountToWords(n) {
    n = Math.round(n);
    if (!n || n <= 0) return '';
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
               'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
               'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function two(x) { return x < 20 ? a[x] : b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : ''); }
    function three(x) { return x >= 100 ? a[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x); }
    let w = '';
    if (n >= 10000000) { w += three(Math.floor(n / 10000000)) + ' Crore '; n %= 10000000; }
    if (n >= 100000)   { w += two(Math.floor(n / 100000)) + ' Lakh '; n %= 100000; }
    if (n >= 1000)     { w += two(Math.floor(n / 1000)) + ' Thousand '; n %= 1000; }
    if (n >= 100)      { w += a[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
    if (n > 0)         { w += two(n); }
    return w.trim() + ' Rupees Only';
  }

  async function init() {
    await initPage('Wallet', [1, 2, 5]);
    renderPage();
    await loadAll();
  }

  function renderPage() {
    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div><h1>Wallet</h1><p>Manage wallet balance, top-ups and partners</p></div>
        <button type="button" class="btn btn-primary" id="topup-btn">
          <i class="bi bi-plus-circle me-1"></i>Top Up Wallet
        </button>
      </div>

      <!-- Balance + stats cards -->
      <div class="row g-3 mb-4" id="stats-row">
        <div class="col-6 col-md-3">
          <div class="card text-center" style="background:linear-gradient(135deg,#2563EB,#7C3AED);color:#fff;border:none;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-bottom:4px;">Current Balance</div>
            <div id="stat-balance" style="font-size:22px;font-weight:700;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Total Topped Up</div>
            <div id="stat-topup" style="font-size:18px;font-weight:700;color:#16A34A;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Total Disbursed</div>
            <div id="stat-disburse" style="font-size:18px;font-weight:700;color:#DC2626;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Total Collected</div>
            <div id="stat-collect" style="font-size:18px;font-weight:700;color:#2563EB;">—</div>
          </div>
        </div>
      </div>

      <!-- Partners section -->
      <div class="card mb-4">
        <div class="card-header-flex">
          <h6 class="card-title"><i class="bi bi-people me-2 text-primary"></i>Partners</h6>
          <button type="button" class="btn btn-sm btn-outline-primary" id="add-partner-btn">
            <i class="bi bi-plus me-1"></i>Add Partner
          </button>
        </div>
        <div id="partners-list"></div>
      </div>

      <!-- Transaction history -->
      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title"><i class="bi bi-clock-history me-2 text-primary"></i>Transaction History</h6>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="txn-clear-btn" style="font-size:11px;">
            <i class="bi bi-x-circle me-1"></i>Clear Filters
          </button>
        </div>
        <div class="row g-2 mb-3 align-items-end">
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">Type</label>
            <select class="form-select form-select-sm" id="txn-type-filter">
              <option value="">All Types</option>
              <option value="WALLET_DEPOSIT">Top Up</option>
              <option value="LOAN_DISBURSEMENT">Disbursed</option>
              <option value="LOAN_COLLECTION">Collected</option>
              <option value="EXPENSE">Expense</option>
            </select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">From Date</label>
            <input type="date" class="form-control form-control-sm" id="txn-from-date">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">To Date</label>
            <input type="date" class="form-control form-control-sm" id="txn-to-date">
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">Partner / Customer</label>
            <input type="text" class="form-control form-control-sm" id="txn-search" placeholder="Search name…">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">Sort By</label>
            <select class="form-select form-select-sm" id="txn-sort-by">
              <option value="date">Date</option>
              <option value="amount">Amount</option>
            </select>
          </div>
          <div class="col-6 col-md-1 d-flex flex-column">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">Order</label>
            <button type="button" class="btn btn-sm btn-outline-secondary w-100" id="txn-sort-dir-btn" title="Toggle sort order">
              <i class="bi bi-sort-down" id="txn-sort-dir-icon"></i>
            </button>
          </div>
        </div>
        <div id="txn-result-count" style="font-size:12px;color:#64748B;margin-bottom:8px;"></div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th><th>Type</th><th>Amount</th><th>Partner</th><th>Customer</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody id="txn-tbody"></tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('topup-btn').addEventListener('click', openTopupModal);
    document.getElementById('add-partner-btn').addEventListener('click', openAddPartnerModal);
    injectModals();

    ['txn-type-filter', 'txn-from-date', 'txn-to-date', 'txn-sort-by'].forEach(id => {
      document.getElementById(id).addEventListener('change', applyFiltersAndSort);
    });
    document.getElementById('txn-search').addEventListener('input', applyFiltersAndSort);
    document.getElementById('txn-sort-dir-btn').addEventListener('click', function () {
      txnSortDir = txnSortDir === 'desc' ? 'asc' : 'desc';
      document.getElementById('txn-sort-dir-icon').className =
        txnSortDir === 'desc' ? 'bi bi-sort-down' : 'bi bi-sort-up';
      applyFiltersAndSort();
    });
    document.getElementById('txn-clear-btn').addEventListener('click', function () {
      document.getElementById('txn-type-filter').value = '';
      document.getElementById('txn-from-date').value = '';
      document.getElementById('txn-to-date').value = '';
      document.getElementById('txn-search').value = '';
      document.getElementById('txn-sort-by').value = 'date';
      txnSortDir = 'desc';
      document.getElementById('txn-sort-dir-icon').className = 'bi bi-sort-down';
      applyFiltersAndSort();
    });
  }

  async function loadAll() {
    try {
      showLoading();
      const [walletResult, partnerResult] = await Promise.allSettled([
        api.get('/api/wallet'),
        api.get('/api/partners'),
      ]);

      if (partnerResult.status === 'fulfilled') {
        partners = partnerResult.value.data || [];
      }
      renderPartners();

      if (walletResult.status === 'fulfilled') {
        walletData = walletResult.value.data;
        renderStats(walletData);
        allTransactions = walletData.transactions || [];
      } else {
        allTransactions = [];
      }
      applyFiltersAndSort();
    } catch (err) {
      showToast('Failed to load data: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  function applyFiltersAndSort() {
    const type    = document.getElementById('txn-type-filter')?.value || '';
    const from    = document.getElementById('txn-from-date')?.value   || '';
    const to      = document.getElementById('txn-to-date')?.value     || '';
    const search  = (document.getElementById('txn-search')?.value     || '').toLowerCase().trim();
    const sortBy  = document.getElementById('txn-sort-by')?.value     || 'date';

    let txns = allTransactions.slice();

    if (type)   txns = txns.filter(t => t.transaction_type === type);
    if (from)   txns = txns.filter(t => (t.transaction_date || '') >= from);
    if (to)     txns = txns.filter(t => (t.transaction_date || '') <= to);
    if (search) txns = txns.filter(t =>
      (t.partner_name  || '').toLowerCase().includes(search) ||
      (t.customer_name || '').toLowerCase().includes(search) ||
      (t.remarks       || '').toLowerCase().includes(search)
    );

    txns.sort((a, b) => {
      const va = sortBy === 'amount' ? (parseFloat(a.amount) || 0)    : (a.transaction_date || '');
      const vb = sortBy === 'amount' ? (parseFloat(b.amount) || 0)    : (b.transaction_date || '');
      if (va < vb) return txnSortDir === 'asc' ? -1 : 1;
      if (va > vb) return txnSortDir === 'asc' ?  1 : -1;
      return 0;
    });

    const countEl = document.getElementById('txn-result-count');
    if (countEl) {
      const isFiltered = type || from || to || search;
      countEl.textContent = isFiltered
        ? `Showing ${txns.length} of ${allTransactions.length} transactions`
        : (allTransactions.length ? `${allTransactions.length} transactions` : '');
    }

    renderTransactions(txns);
  }

  function renderStats(data) {
    const w = data.wallet || {};
    const s = data.stats || {};
    document.getElementById('stat-balance').textContent  = formatCurrency(w.balance || 0);
    document.getElementById('stat-topup').textContent    = formatCurrency(s.total_topup || 0);
    document.getElementById('stat-disburse').textContent = formatCurrency(s.total_disbursed || 0);
    document.getElementById('stat-collect').textContent  = formatCurrency(s.total_collected || 0);
  }

  function renderPartners() {
    const el = document.getElementById('partners-list');
    if (!partners.length) {
      el.innerHTML = '<div style="padding:16px;font-size:13px;color:#64748B;">No partners yet. Add one to use in top-ups.</div>';
      return;
    }
    el.innerHTML = `<div class="table-container"><table class="table table-sm">
      <thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead>
      <tbody>${partners.map(p => `
        <tr>
          <td class="fw-600">${p.name}</td>
          <td>${p.phone || '-'}</td>
          <td onclick="event.stopPropagation()">
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removePartner('${p.partner_id}','${(p.name || '').replace(/'/g,"\\'")}')">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  }

  const TYPE_CONFIG = {
    WALLET_DEPOSIT:    { label: 'Top Up',    cls: 'badge-active',   icon: 'bi-arrow-down-circle-fill', sign: '+' },
    LOAN_DISBURSEMENT: { label: 'Disbursed', cls: 'badge-overdue',  icon: 'bi-arrow-up-circle-fill',   sign: '-' },
    LOAN_COLLECTION:   { label: 'Collected', cls: 'badge-paid',     icon: 'bi-cash-coin',              sign: '+' },
    EXPENSE:           { label: 'Expense',   cls: 'badge-inactive', icon: 'bi-receipt',                sign: '-' },
  };

  function renderTransactions(txns) {
    const tbody = document.getElementById('txn-tbody');
    if (!txns.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="bi bi-clock-history"></i>No transactions yet</td></tr>';
      return;
    }
    tbody.innerHTML = txns.map(t => {
      const cfg = TYPE_CONFIG[t.transaction_type] || { label: t.transaction_type, cls: 'badge-closed', icon: 'bi-circle', sign: '' };
      const isDebit = ['LOAN_DISBURSEMENT', 'EXPENSE'].includes(t.transaction_type);
      const amtColor = isDebit ? '#DC2626' : '#16A34A';
      const partner  = t.partner_name
        ? `<span class="fw-600">${t.partner_name}</span>`
        : `<span style="color:#CBD5E1;">—</span>`;
      const customer = t.customer_name
        ? `<span class="fw-600">${t.customer_name}</span>`
        : `<span style="color:#CBD5E1;">—</span>`;
      return `<tr>
        <td>${formatDate(t.transaction_date)}</td>
        <td><span class="badge-status ${cfg.cls}"><i class="bi ${cfg.icon} me-1"></i>${cfg.label}</span></td>
        <td style="font-weight:600;color:${amtColor};">${cfg.sign}${formatCurrency(t.amount)}</td>
        <td>${partner}</td>
        <td>${customer}</td>
        <td style="font-size:12px;color:#64748B;">${t.remarks || '-'}</td>
      </tr>`;
    }).join('');
  }

  // ─── Modals ───────────────────────────────────────────────────────────────

  function injectModals() {
    if (!document.getElementById('topup-modal')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="modal fade" id="topup-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-600" style="font-size:16px;"><i class="bi bi-plus-circle me-2 text-primary"></i>Top Up Wallet</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="topup-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label">Amount (₹) <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="tu-amount" placeholder="e.g. 50000" min="1" step="1">
                    <div id="tu-amount-words" style="font-size:12px;color:#4F46E5;font-style:italic;margin-top:4px;min-height:16px;"></div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">Partner <span class="text-danger">*</span></label>
                    <select class="form-select" id="tu-partner">
                      <option value="">Select partner</option>
                    </select>
                    <div style="font-size:11px;color:#64748B;margin-top:4px;">Add partners in the Partners section first.</div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" id="tu-date">
                  </div>
                  <div class="col-12">
                    <label class="form-label">Remarks</label>
                    <input type="text" class="form-control" id="tu-remarks" placeholder="Optional">
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="tu-save-btn">
                  <span id="tu-save-txt"><i class="bi bi-check-lg me-1"></i>Top Up</span>
                  <span id="tu-save-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Saving...</span>
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el.firstElementChild);
      topupModal = new bootstrap.Modal(document.getElementById('topup-modal'));
      document.getElementById('tu-save-btn').addEventListener('click', submitTopup);
      document.getElementById('tu-amount').addEventListener('input', function () {
        document.getElementById('tu-amount-words').textContent = amountToWords(parseFloat(this.value) || 0);
      });
    }

    if (!document.getElementById('topup-confirm-modal')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="modal fade" id="topup-confirm-modal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header" style="background:#FFFBEB;border-bottom:1px solid #FDE68A;">
                <h5 class="modal-title fw-600" style="font-size:15px;">
                  <i class="bi bi-shield-exclamation me-2 text-warning"></i>Confirm Top Up
                </h5>
              </div>
              <div class="modal-body">
                <p style="font-size:12.5px;color:#64748B;margin-bottom:12px;">
                  Verify the details below. Transactions <strong>cannot be edited</strong> after submission.
                </p>
                <div style="background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;padding:14px;">
                  <div class="mb-3">
                    <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Amount</div>
                    <div id="tc-amount" style="font-size:22px;font-weight:700;color:#2563EB;"></div>
                    <div id="tc-amount-words" style="font-size:11px;color:#4F46E5;font-style:italic;margin-top:2px;"></div>
                  </div>
                  <div class="mb-2" style="display:flex;gap:24px;">
                    <div>
                      <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Partner</div>
                      <div id="tc-partner" style="font-size:13px;font-weight:600;"></div>
                    </div>
                    <div>
                      <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">Date</div>
                      <div id="tc-date" style="font-size:13px;font-weight:600;"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" id="tc-cancel-btn">
                  <i class="bi bi-arrow-left me-1"></i>Go Back
                </button>
                <button type="button" class="btn btn-success" id="tc-confirm-btn">
                  <i class="bi bi-check-circle me-1"></i>Confirm Top Up
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el.firstElementChild);
      topupConfirmModal = new bootstrap.Modal(document.getElementById('topup-confirm-modal'));
      document.getElementById('tc-confirm-btn').addEventListener('click', () => {
        topupConfirmModal.hide();
        if (_confirmResolve) { _confirmResolve(true); _confirmResolve = null; }
      });
      document.getElementById('tc-cancel-btn').addEventListener('click', () => {
        topupConfirmModal.hide();
        if (_confirmResolve) { _confirmResolve(false); _confirmResolve = null; }
      });
    }

    if (!document.getElementById('add-partner-modal')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="modal fade" id="add-partner-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-600" style="font-size:16px;"><i class="bi bi-person-plus me-2 text-primary"></i>Add Partner</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="ap-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div class="mb-3">
                  <label class="form-label">Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="ap-name" placeholder="Partner name">
                </div>
                <div>
                  <label class="form-label">Phone</label>
                  <input type="tel" class="form-control" id="ap-phone" placeholder="Phone (optional)" maxlength="10">
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="ap-save-btn">
                  <span id="ap-save-txt"><i class="bi bi-check-lg me-1"></i>Add</span>
                  <span id="ap-save-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span></span>
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el.firstElementChild);
      addPartnerModal = new bootstrap.Modal(document.getElementById('add-partner-modal'));
      document.getElementById('ap-save-btn').addEventListener('click', submitAddPartner);
      document.getElementById('ap-phone').addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '').slice(0, 10);
      });
    }
  }

  function openTopupModal() {
    const sel = document.getElementById('tu-partner');
    sel.innerHTML = '<option value="">Select partner</option>' +
      partners.map(p => `<option value="${p.partner_id}">${p.name}${p.phone ? ' (' + p.phone + ')' : ''}</option>`).join('');
    document.getElementById('tu-amount').value = '';
    document.getElementById('tu-amount-words').textContent = '';
    document.getElementById('tu-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tu-remarks').value = '';
    document.getElementById('topup-error').classList.add('d-none');
    document.getElementById('tu-save-btn').disabled = false;
    document.getElementById('tu-save-txt').classList.remove('d-none');
    document.getElementById('tu-save-load').classList.add('d-none');
    topupModal.show();
  }

  function openAddPartnerModal() {
    document.getElementById('ap-name').value = '';
    document.getElementById('ap-phone').value = '';
    document.getElementById('ap-error').classList.add('d-none');
    document.getElementById('ap-save-btn').disabled = false;
    document.getElementById('ap-save-txt').classList.remove('d-none');
    document.getElementById('ap-save-load').classList.add('d-none');
    addPartnerModal.show();
  }

  function showTopupConfirm({ amount, partnerName, date }) {
    document.getElementById('tc-amount').textContent = formatCurrency(amount);
    document.getElementById('tc-amount-words').textContent = amountToWords(amount);
    document.getElementById('tc-partner').textContent = partnerName;
    document.getElementById('tc-date').textContent = date;
    topupConfirmModal.show();
    return new Promise(resolve => { _confirmResolve = resolve; });
  }

  async function submitTopup() {
    const errEl = document.getElementById('topup-error');
    errEl.classList.add('d-none');

    const amount = parseFloat(document.getElementById('tu-amount').value) || 0;
    const partner_id = document.getElementById('tu-partner').value;
    const date = document.getElementById('tu-date').value;

    if (amount <= 0) { errEl.textContent = 'Enter a valid amount.'; errEl.classList.remove('d-none'); return; }
    if (!partner_id) { errEl.textContent = 'Please select a partner.'; errEl.classList.remove('d-none'); return; }
    if (!date) { errEl.textContent = 'Date is required.'; errEl.classList.remove('d-none'); return; }

    const partnerName = document.getElementById('tu-partner').options[
      document.getElementById('tu-partner').selectedIndex
    ].text;

    const confirmed = await showTopupConfirm({ amount, partnerName, date });
    if (!confirmed) return;

    const btn = document.getElementById('tu-save-btn');
    btn.disabled = true;
    document.getElementById('tu-save-txt').classList.add('d-none');
    document.getElementById('tu-save-load').classList.remove('d-none');

    try {
      await api.post('/api/wallet/topup', {
        amount,
        partner_id,
        transaction_date: date,
        remarks: document.getElementById('tu-remarks').value.trim(),
      });
      topupModal.hide();
      showToast('Wallet topped up successfully!', 'success');
      await loadAll();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('tu-save-txt').classList.remove('d-none');
      document.getElementById('tu-save-load').classList.add('d-none');
    }
  }

  async function submitAddPartner() {
    const errEl = document.getElementById('ap-error');
    errEl.classList.add('d-none');
    const name = document.getElementById('ap-name').value.trim();
    if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('ap-save-btn');
    btn.disabled = true;
    document.getElementById('ap-save-txt').classList.add('d-none');
    document.getElementById('ap-save-load').classList.remove('d-none');

    try {
      const res = await api.post('/api/partners', {
        name,
        phone: document.getElementById('ap-phone').value.trim(),
      });
      partners.push(res.data);
      addPartnerModal.hide();
      showToast('Partner added!', 'success');
      renderPartners();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('ap-save-txt').classList.remove('d-none');
      document.getElementById('ap-save-load').classList.add('d-none');
    }
  }

  window.removePartner = async function (partnerId, name) {
    const ok = await confirmDialog(`Remove partner "${name}"?`);
    if (!ok) return;
    try {
      await api.delete(`/api/partners/${partnerId}`);
      partners = partners.filter(p => p.partner_id !== partnerId);
      showToast('Partner removed', 'success');
      renderPartners();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  init();
})();

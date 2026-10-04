(function () {
  'use strict';

  let partners = [];
  let walletData = null;
  let topupModal = null;
  let topupConfirmModal = null;
  let addPartnerModal = null;
  let withdrawModal = null;
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
      <div class="page-header d-flex align-items-center justify-content-end flex-wrap gap-2">
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-secondary" id="partners-btn">
            <i class="bi bi-people me-1"></i>${t('wallet.partners')}
          </button>
          <button type="button" class="btn btn-outline-warning" id="withdraw-btn">
            <i class="bi bi-box-arrow-up me-1"></i>${t('wallet.withdraw')}
          </button>
          <button type="button" class="btn btn-primary" id="topup-btn">
            <i class="bi bi-plus-circle me-1"></i>${t('wallet.topup')}
          </button>
        </div>
      </div>

      <!-- Balance + stats cards -->
      <div class="row g-3 mb-4" id="stats-row">
        <div class="col-6 col-md-3">
          <div class="card text-center" style="background:linear-gradient(135deg,#2563EB,#7C3AED);color:#fff;border:none;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-bottom:4px;">${t('wallet.invest_balance')}</div>
            <div id="stat-invest-balance" style="font-size:clamp(14px,4.5vw,22px);font-weight:700;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center" style="background:linear-gradient(135deg,#7C3AED,#A855F7);color:#fff;border:none;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-bottom:4px;">${t('wallet.rotation_balance')}</div>
            <div id="stat-rotation-balance" style="font-size:clamp(14px,4.5vw,22px);font-weight:700;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center" style="background:linear-gradient(135deg,#16A34A,#059669);color:#fff;border:none;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;opacity:.85;margin-bottom:4px;">${t('wallet.interest_balance')}</div>
            <div id="stat-interest-balance" style="font-size:clamp(14px,4.5vw,22px);font-weight:700;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${t('wallet.total_topped')}</div>
            <div id="stat-topup" style="font-size:clamp(13px,4vw,18px);font-weight:700;color:#16A34A;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${t('wallet.total_disbursed')}</div>
            <div id="stat-disburse" style="font-size:clamp(13px,4vw,18px);font-weight:700;color:#DC2626;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${t('wallet.total_collected')}</div>
            <div id="stat-collect" style="font-size:clamp(13px,4vw,18px);font-weight:700;color:#2563EB;">—</div>
          </div>
        </div>
        <div class="col-6 col-md-3">
          <div class="card text-center">
            <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${t('wallet.total_withdrawn')}</div>
            <div id="stat-withdraw" style="font-size:clamp(13px,4vw,18px);font-weight:700;color:#D97706;">—</div>
          </div>
        </div>
      </div>

      <!-- Transaction history -->
      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title"><i class="bi bi-clock-history me-2 text-primary"></i>${t('wallet.history')}</h6>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="txn-clear-btn" style="font-size:11px;">
            <i class="bi bi-x-circle me-1"></i>${t('wallet.clear_filters')}
          </button>
        </div>
        <div class="row g-2 mb-3 align-items-end">
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">${t('wallet.type')}</label>
            <select class="form-select form-select-sm" id="txn-type-filter">
              <option value="">All Types</option>
              <option value="WALLET_DEPOSIT">${t('wallet.type_topup')}</option>
              <option value="LOAN_DISBURSEMENT">${t('wallet.type_disbursed')}</option>
              <option value="LOAN_COLLECTION">${t('wallet.type_collected')}</option>
              <option value="EXPENSE">${t('wallet.type_expense')}</option>
              <option value="WALLET_WITHDRAWAL">${t('wallet.type_withdrawal')}</option>
            </select>
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">${t('common.date_from')}</label>
            <input type="date" class="form-control form-control-sm" id="txn-from-date">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">${t('common.date_to')}</label>
            <input type="date" class="form-control form-control-sm" id="txn-to-date">
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">${t('wallet.partner_cust')}</label>
            <input type="text" class="form-control form-control-sm" id="txn-search" placeholder="${t('common.search')}…">
          </div>
          <div class="col-6 col-md-2">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">${t('wallet.sort_by')}</label>
            <select class="form-select form-select-sm" id="txn-sort-by">
              <option value="date">${t('wallet.col_date')}</option>
              <option value="amount">${t('wallet.col_amount')}</option>
            </select>
          </div>
          <div class="col-6 col-md-1 d-flex flex-column">
            <label class="form-label" style="font-size:11px;color:#64748B;margin-bottom:3px;">${t('wallet.order')}</label>
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
                <th>${t('wallet.col_date')}</th><th>${t('wallet.col_type')}</th><th>${t('wallet.col_amount')}</th><th>${t('wallet.col_partner')}</th><th>${t('wallet.col_customer')}</th><th>${t('wallet.col_remarks')}</th>
              </tr>
            </thead>
            <tbody id="txn-tbody"></tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('topup-btn').addEventListener('click', openTopupModal);
    document.getElementById('withdraw-btn').addEventListener('click', openWithdrawModal);
    document.getElementById('partners-btn').addEventListener('click', openPartnersModal);
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

    if (type)   txns = txns.filter(tx => tx.transaction_type === type);
    if (from)   txns = txns.filter(tx => (tx.transaction_date || '') >= from);
    if (to)     txns = txns.filter(tx => (tx.transaction_date || '') <= to);
    if (search) txns = txns.filter(tx =>
      (tx.partner_name  || '').toLowerCase().includes(search) ||
      (tx.customer_name || '').toLowerCase().includes(search) ||
      (tx.remarks       || '').toLowerCase().includes(search)
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
    document.getElementById('stat-invest-balance').textContent    = formatCurrency(w.invest_balance    || 0);
    document.getElementById('stat-rotation-balance').textContent  = formatCurrency(w.rotation_balance  || 0);
    document.getElementById('stat-interest-balance').textContent  = formatCurrency(w.interest_balance  || 0);
    document.getElementById('stat-topup').textContent    = formatCurrency(s.total_topup || 0);
    document.getElementById('stat-disburse').textContent = formatCurrency(s.total_disbursed || 0);
    document.getElementById('stat-collect').textContent  = formatCurrency(s.total_collected || 0);
    document.getElementById('stat-withdraw').textContent = formatCurrency(s.total_withdrawn || 0);
  }

  function renderPartners() {
    const el = document.getElementById('partners-list-modal');
    if (!el) return;
    if (!partners.length) {
      el.innerHTML = `<div style="padding:20px 16px;font-size:13px;color:#64748B;text-align:center;"><i class="bi bi-people" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4;"></i>${t('wallet.no_partners')}</div>`;
      return;
    }
    el.innerHTML = `<div class="table-container" style="border-radius:0;"><table class="table table-sm mb-0">
      <thead><tr><th>${t('wallet.partner_name')}</th><th>${t('common.phone')}</th><th style="width:48px;"></th></tr></thead>
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

  function openPartnersModal() {
    renderPartners();
    window._partnersModal.show();
  }

  // Labels use getters so t() is evaluated at render time (module-level scope,
  // not shadowed by the `tx` parameter used in map/filter callbacks).
  const TYPE_CONFIG = {
    WALLET_DEPOSIT:    { get label() { return t('wallet.type_topup'); },     cls: 'badge-active',   icon: 'bi-arrow-down-circle-fill', sign: '+' },
    LOAN_DISBURSEMENT: { get label() { return t('wallet.type_disbursed'); }, cls: 'badge-overdue',  icon: 'bi-arrow-up-circle-fill',   sign: '-' },
    LOAN_COLLECTION:   { get label() { return t('wallet.type_collected'); }, cls: 'badge-paid',     icon: 'bi-cash-coin',              sign: '+' },
    EXPENSE:           { get label() { return t('wallet.type_expense'); },   cls: 'badge-inactive', icon: 'bi-receipt',                sign: '-' },
    WALLET_WITHDRAWAL: { get label() { return t('wallet.type_withdrawal'); },cls: 'badge-overdue',  icon: 'bi-box-arrow-up',           sign: '-' },
  };

  function renderTransactions(txns) {
    const tbody = document.getElementById('txn-tbody');
    if (!txns.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="bi bi-clock-history"></i>${t('wallet.no_tx')}</td></tr>`;
      return;
    }
    tbody.innerHTML = txns.map(tx => {
      const cfg = TYPE_CONFIG[tx.transaction_type] || { label: tx.transaction_type, cls: 'badge-closed', icon: 'bi-circle', sign: '' };
      const isDebit = ['LOAN_DISBURSEMENT', 'EXPENSE'].includes(tx.transaction_type);
      const amtColor = isDebit ? '#DC2626' : '#16A34A';
      const partner  = tx.partner_name
        ? `<span class="fw-600">${tx.partner_name}</span>`
        : `<span style="color:#CBD5E1;">—</span>`;
      const customer = tx.customer_name
        ? `<span class="fw-600">${tx.customer_name}</span>`
        : `<span style="color:#CBD5E1;">—</span>`;
      return `<tr>
        <td>${formatDate(tx.transaction_date)}</td>
        <td><span class="badge-status ${cfg.cls}"><i class="bi ${cfg.icon} me-1"></i>${cfg.label}</span></td>
        <td style="font-weight:600;color:${amtColor};">${cfg.sign}${formatCurrency(tx.amount)}</td>
        <td>${partner}</td>
        <td>${customer}</td>
        <td style="font-size:12px;color:#64748B;">${tx.remarks || '-'}</td>
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
                <h5 class="modal-title fw-600" style="font-size:16px;"><i class="bi bi-plus-circle me-2 text-primary"></i>${t('wallet.topup_title')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="topup-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label">${t('wallet.amount')} <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="tu-amount" placeholder="e.g. 50000" min="1" step="1">
                    <div id="tu-amount-words" style="font-size:12px;color:#4F46E5;font-style:italic;margin-top:4px;min-height:16px;"></div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('wallet.partner')} <span class="text-danger">*</span></label>
                    <select class="form-select" id="tu-partner">
                      <option value="">Select partner</option>
                    </select>
                    <div style="font-size:11px;color:#64748B;margin-top:4px;">Add partners in the Partners section first.</div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('common.date')} <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" id="tu-date">
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('wallet.remarks')}</label>
                    <input type="text" class="form-control" id="tu-remarks" placeholder="Optional">
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" id="tu-save-btn">
                  <span id="tu-save-txt"><i class="bi bi-check-lg me-1"></i>${t('wallet.doing_topup')}</span>
                  <span id="tu-save-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('common.saving')}</span>
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
                  <i class="bi bi-shield-exclamation me-2 text-warning"></i>${t('wallet.confirm_topup')}
                </h5>
              </div>
              <div class="modal-body">
                <p style="font-size:12.5px;color:#64748B;margin-bottom:12px;">
                  ${t('wallet.confirm_details')}
                </p>
                <div style="background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;padding:14px;">
                  <div class="mb-3">
                    <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('wallet.amount')}</div>
                    <div id="tc-amount" style="font-size:22px;font-weight:700;color:#2563EB;"></div>
                    <div id="tc-amount-words" style="font-size:11px;color:#4F46E5;font-style:italic;margin-top:2px;"></div>
                  </div>
                  <div class="mb-2" style="display:flex;gap:24px;flex-wrap:wrap;">
                    <div>
                      <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('wallet.partner')}</div>
                      <div id="tc-partner" style="font-size:13px;font-weight:600;"></div>
                    </div>
                    <div>
                      <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('common.date')}</div>
                      <div id="tc-date" style="font-size:13px;font-weight:600;"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" id="tc-cancel-btn">
                  <i class="bi bi-arrow-left me-1"></i>${t('wallet.go_back')}
                </button>
                <button type="button" class="btn btn-success" id="tc-confirm-btn">
                  <i class="bi bi-check-circle me-1"></i>${t('wallet.confirm_topup')}
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

    if (!document.getElementById('withdraw-modal')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="modal fade" id="withdraw-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header" style="background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-bottom:1px solid #FCD34D;">
                <h5 class="modal-title fw-600" style="font-size:16px;color:#92400E;">
                  <i class="bi bi-box-arrow-up me-2"></i>${t('wallet.withdraw_title')}
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="wd-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label">${t('wallet.withdraw_from')} <span class="text-danger">*</span></label>
                    <div style="display:flex;gap:12px;flex-wrap:wrap;">
                      <label class="d-flex align-items-center gap-2" style="cursor:pointer;padding:10px 16px;border:1.5px solid #E2E8F0;border-radius:8px;flex:1;min-width:120px;" id="wd-opt-invest">
                        <input type="radio" name="wd-source" value="invest" style="accent-color:#2563EB;">
                        <div>
                          <div style="font-size:13px;font-weight:600;color:#1E40AF;">${t('wallet.invest_bal')}</div>
                          <div id="wd-invest-bal" style="font-size:12px;color:#64748B;word-break:break-all;line-height:1.3;">—</div>
                        </div>
                      </label>
                      <label class="d-flex align-items-center gap-2" style="cursor:pointer;padding:10px 16px;border:1.5px solid #E2E8F0;border-radius:8px;flex:1;min-width:120px;" id="wd-opt-interest">
                        <input type="radio" name="wd-source" value="interest" style="accent-color:#16A34A;">
                        <div>
                          <div style="font-size:13px;font-weight:600;color:#166534;">${t('wallet.interest_bal')}</div>
                          <div id="wd-interest-bal" style="font-size:12px;color:#64748B;word-break:break-all;line-height:1.3;">—</div>
                        </div>
                      </label>
                    </div>
                    <div style="font-size:11px;color:#64748B;margin-top:6px;">
                      <i class="bi bi-info-circle me-1"></i>${t('wallet.rotation_bal')}: <strong id="wd-rotation-bal">—</strong> — ${t('wallet.withdraw_rotation_note')}
                    </div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('wallet.partner')}</label>
                    <select class="form-select" id="wd-partner">
                      <option value="">— ${t('wallet.no_partner')} —</option>
                    </select>
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('wallet.amount')} <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="wd-amount" placeholder="e.g. 10000" min="1" step="1">
                    <div id="wd-amount-words" style="font-size:12px;color:#4F46E5;font-style:italic;margin-top:4px;min-height:16px;"></div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('common.date')} <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" id="wd-date">
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('wallet.remarks')}</label>
                    <input type="text" class="form-control" id="wd-remarks" placeholder="Optional">
                  </div>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
                <button type="button" class="btn btn-warning" id="wd-save-btn" style="color:#fff;">
                  <span id="wd-save-txt"><i class="bi bi-box-arrow-up me-1"></i>${t('wallet.doing_withdraw')}</span>
                  <span id="wd-save-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('wallet.processing')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el.firstElementChild);
      withdrawModal = new bootstrap.Modal(document.getElementById('withdraw-modal'));
      document.getElementById('wd-save-btn').addEventListener('click', submitWithdraw);
      document.getElementById('wd-amount').addEventListener('input', function () {
        document.getElementById('wd-amount-words').textContent = amountToWords(parseFloat(this.value) || 0);
      });
      document.querySelectorAll('input[name="wd-source"]').forEach(r => {
        r.addEventListener('change', updateWithdrawSourceHighlight);
      });
    }

    if (!document.getElementById('partners-modal')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="modal fade" id="partners-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-600" style="font-size:16px;">
                  <i class="bi bi-people me-2 text-primary"></i>${t('wallet.partners_title')}
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body" style="padding:0;">
                <div id="partners-list-modal"></div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.close')}</button>
                <button type="button" class="btn btn-primary" id="add-partner-btn">
                  <i class="bi bi-plus me-1"></i>${t('wallet.add_partner')}
                </button>
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el.firstElementChild);
      window._partnersModal = new bootstrap.Modal(document.getElementById('partners-modal'));
      document.getElementById('add-partner-btn').addEventListener('click', () => {
        window._partnersModal.hide();
        openAddPartnerModal();
      });
    }

    if (!document.getElementById('add-partner-modal')) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="modal fade" id="add-partner-modal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-sm">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title fw-600" style="font-size:16px;"><i class="bi bi-person-plus me-2 text-primary"></i>${t('wallet.add_partner_title')}</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <div id="ap-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div class="mb-3">
                  <label class="form-label">${t('wallet.partner_name')} <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" id="ap-name" placeholder="Partner name">
                </div>
                <div>
                  <label class="form-label">${t('common.phone')}</label>
                  <input type="tel" class="form-control" id="ap-phone" placeholder="Phone (optional)" maxlength="10">
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
                <button type="button" class="btn btn-primary" id="ap-save-btn">
                  <span id="ap-save-txt"><i class="bi bi-check-lg me-1"></i>${t('common.add')}</span>
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
      showToast(t('wallet.topped_up'), 'success');
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
      showToast(t('wallet.partner_added'), 'success');
      renderPartners();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('ap-save-txt').classList.remove('d-none');
      document.getElementById('ap-save-load').classList.add('d-none');
    }
  }

  function updateWithdrawSourceHighlight() {
    const val = document.querySelector('input[name="wd-source"]:checked')?.value;
    const defBorder = document.body.getAttribute('data-theme') === 'dark' ? '#30363D' : '#E2E8F0';
    document.getElementById('wd-opt-invest').style.borderColor   = val === 'invest'   ? '#2563EB' : defBorder;
    document.getElementById('wd-opt-interest').style.borderColor = val === 'interest' ? '#16A34A' : defBorder;
  }

  function openWithdrawModal() {
    const w = (walletData && walletData.wallet) || {};
    document.getElementById('wd-invest-bal').textContent   = formatCurrency(w.invest_balance   || 0);
    document.getElementById('wd-interest-bal').textContent = formatCurrency(w.interest_balance || 0);
    document.getElementById('wd-rotation-bal').textContent = formatCurrency(w.rotation_balance || 0);

    const sel = document.getElementById('wd-partner');
    sel.innerHTML = `<option value="">— ${t('wallet.no_partner')} —</option>` +
      partners.map(p => `<option value="${p.partner_id}">${p.name}${p.phone ? ' (' + p.phone + ')' : ''}</option>`).join('');

    document.querySelectorAll('input[name="wd-source"]').forEach(r => r.checked = false);
    updateWithdrawSourceHighlight();
    document.getElementById('wd-amount').value = '';
    document.getElementById('wd-amount-words').textContent = '';
    document.getElementById('wd-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('wd-remarks').value = '';
    document.getElementById('wd-error').classList.add('d-none');
    document.getElementById('wd-save-btn').disabled = false;
    document.getElementById('wd-save-txt').classList.remove('d-none');
    document.getElementById('wd-save-load').classList.add('d-none');
    withdrawModal.show();
  }

  async function submitWithdraw() {
    const errEl = document.getElementById('wd-error');
    errEl.classList.add('d-none');

    const source = document.querySelector('input[name="wd-source"]:checked')?.value || '';
    const amount = parseFloat(document.getElementById('wd-amount').value) || 0;
    const date   = document.getElementById('wd-date').value;
    const partner_id = document.getElementById('wd-partner').value || null;

    if (!source) { errEl.textContent = 'Please select a source balance.'; errEl.classList.remove('d-none'); return; }
    if (amount <= 0) { errEl.textContent = 'Enter a valid amount.'; errEl.classList.remove('d-none'); return; }
    if (!date) { errEl.textContent = 'Date is required.'; errEl.classList.remove('d-none'); return; }

    const w = (walletData && walletData.wallet) || {};
    const available = source === 'invest' ? (w.invest_balance || 0) : (w.interest_balance || 0);
    if (amount > available + 0.005) {
      const label = source === 'invest' ? t('wallet.invest_bal') : t('wallet.interest_bal');
      errEl.textContent = `Amount exceeds ${label} (${formatCurrency(available)}).`;
      errEl.classList.remove('d-none');
      return;
    }

    const btn = document.getElementById('wd-save-btn');
    btn.disabled = true;
    document.getElementById('wd-save-txt').classList.add('d-none');
    document.getElementById('wd-save-load').classList.remove('d-none');

    try {
      await api.post('/api/wallet/withdraw', {
        amount,
        source,
        partner_id,
        transaction_date: date,
        remarks: document.getElementById('wd-remarks').value.trim(),
      });
      withdrawModal.hide();
      showToast(t('wallet.withdrawn'), 'success');
      await loadAll();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('wd-save-txt').classList.remove('d-none');
      document.getElementById('wd-save-load').classList.add('d-none');
    }
  }

  window.removePartner = async function (partnerId, name) {
    const ok = await confirmDialog(t('wallet.remove_partner', { name }));
    if (!ok) return;
    try {
      await api.delete(`/api/partners/${partnerId}`);
      partners = partners.filter(p => p.partner_id !== partnerId);
      showToast(t('wallet.partner_removed'), 'success');
      renderPartners();
    } catch (err) {
      showToast('Failed: ' + err.message, 'danger');
    }
  };

  init();
})();

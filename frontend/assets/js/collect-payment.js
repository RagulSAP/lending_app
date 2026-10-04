(function () {
  'use strict';

  let selectedCustomer = null;
  let selectedLoan = null;
  let selectedInstallment = null;
  let customerLoans = [];
  let installments = [];
  let paymentModal = null;

  async function init() {
    await initPage(t('pay.collect'), [1, 2, 3, 4]);
    renderPage();
    injectPaymentModal();

    const params = new URLSearchParams(window.location.search);
    const customerId = params.get('customer_id');
    if (customerId) await loadCustomerById(customerId);
  }

  // ---------------------------------------------------------------------------
  // Page skeleton (step 1 + 2 only; step 3/4 are in the modal)
  // ---------------------------------------------------------------------------
  function renderPage() {
    document.getElementById('page-content').innerHTML = `
      <!-- Step 1: Find Customer -->
      <div class="card mb-4" id="step1-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">1</span>${t('pay.find_customer')}</h6>
        </div>
        <div class="row g-2 align-items-end">
          <div class="col-md-5">
            <label class="form-label">${t('pay.phone')}</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-phone"></i></span>
              <input type="tel" class="form-control" id="cust-phone" placeholder="10-digit phone" maxlength="10">
            </div>
          </div>
          <div class="col-auto">
            <button type="button" class="btn btn-primary" id="search-cust-btn">
              <i class="bi bi-search me-1"></i>${t('pay.search')}
            </button>
          </div>
        </div>
        <div id="customer-result" class="mt-3"></div>
      </div>

      <!-- Step 2: Select Loan -->
      <div class="card d-none" id="step2-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">2</span>${t('pay.select_loan')}</h6>
          <div class="d-flex gap-2 align-items-center">
            <div id="loan-export-btns" style="display:none;gap:0.5rem;">
              <button type="button" class="btn btn-sm btn-outline-success" onclick="exportLoanExcel()">
                <i class="bi bi-file-earmark-excel me-1"></i>Excel
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger" onclick="exportLoanPdf()">
                <i class="bi bi-file-earmark-pdf me-1"></i>PDF
              </button>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary d-none" id="add-loan-btn">
              <i class="bi bi-plus-circle me-1"></i>${t('pay.add_loan')}
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="change-cust-btn">
              <i class="bi bi-arrow-left me-1"></i>${t('pay.change_customer')}
            </button>
          </div>
        </div>
        <div id="loans-list" class="row g-3"></div>
      </div>`;

    document.getElementById('cust-phone').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 10);
    });
    document.getElementById('search-cust-btn').addEventListener('click', searchCustomer);
    document.getElementById('cust-phone').addEventListener('keydown', e => {
      if (e.key === 'Enter') searchCustomer();
    });
    document.getElementById('change-cust-btn').addEventListener('click', resetToStep1);
    document.getElementById('add-loan-btn').addEventListener('click', openAddLoanModal);
  }

  // ---------------------------------------------------------------------------
  // Payment modal (injected once)
  // ---------------------------------------------------------------------------
  function injectPaymentModal() {
    if (document.getElementById('payment-modal')) return;
    const today = new Date().toISOString().split('T')[0];
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="payment-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <div>
                <h5 class="modal-title fw-600" style="font-size:16px;" id="pm-title">${t('pay.collect')}</h5>
                <div id="pm-subtitle" style="font-size:12px;color:var(--text-secondary);margin-top:2px;"></div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <!-- Loan summary -->
              <div class="row g-2 mb-4" id="pm-loan-summary"></div>

              <!-- Installment table -->
              <div class="fw-600 mb-2" style="font-size:13px;">
                <i class="bi bi-list-check me-1 text-primary"></i>Select an Installment
              </div>
              <div class="table-container mb-3" style="max-height:240px;overflow-y:auto;">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>#</th><th>Due Date</th><th>Total</th>
                      <th>Paid</th><th>${t('pay.balance')}</th><th>${t('common.status')}</th><th></th>
                    </tr>
                  </thead>
                  <tbody id="pm-inst-tbody"></tbody>
                </table>
              </div>

              <!-- Payment form — shown after installment selected -->
              <div id="pm-payment-form" class="d-none">
                <hr class="my-3">
                <div id="pm-selected-inst" class="alert alert-info mb-3" style="font-size:13px;"></div>
                <div id="pm-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">${t('pay.amount')} <span class="text-danger">*</span></label>
                    <div class="input-group">
                      <span class="input-group-text">&#8377;</span>
                      <input type="number" class="form-control" id="pm-amount" min="0.01" step="0.01">
                    </div>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">${t('pay.payment_mode')} <span class="text-danger">*</span></label>
                    <select class="form-select" id="pm-mode">
                      <option value="CASH">${t('pay.cash')}</option>
                      <option value="UPI">${t('pay.upi')}</option>
                      <option value="BANK_TRANSFER">${t('pay.bank')}</option>
                      <option value="CHEQUE">${t('pay.cheque')}</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">${t('pay.transaction_date')} <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" id="pm-date" value="${today}">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">${t('pay.remarks')}</label>
                    <input type="text" class="form-control" id="pm-remarks" placeholder="Optional">
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <div class="me-auto d-flex gap-2">
                <button type="button" class="btn btn-sm btn-outline-success" onclick="exportLoanExcel()">
                  <i class="bi bi-file-earmark-excel me-1"></i>Excel
                </button>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="exportLoanPdf()">
                  <i class="bi bi-file-earmark-pdf me-1"></i>PDF
                </button>
              </div>
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-success d-none" id="pm-submit-btn">
                <span id="pm-submit-txt"><i class="bi bi-check-circle me-2"></i>Record Payment</span>
                <span id="pm-submit-load" class="d-none">
                  <span class="spinner-border spinner-border-sm me-2"></span>Processing...
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    paymentModal = new bootstrap.Modal(document.getElementById('payment-modal'));
    document.getElementById('pm-submit-btn').addEventListener('click', submitPayment);
  }

  // ---------------------------------------------------------------------------
  // Customer lookup
  // ---------------------------------------------------------------------------
  async function loadCustomerById(customerId) {
    try {
      showLoading();
      const res = await api.get('/api/customers/' + customerId);
      const c = res.data || res;
      if (c) {
        selectedCustomer = c;
        showCustomerCard(c);
        await loadLoans(c.customer_id);
      }
    } catch (err) {
      document.getElementById('customer-result').innerHTML =
        `<div class="alert alert-danger" style="font-size:13px;">${err.message}</div>`;
    } finally {
      hideLoading();
    }
  }

  async function searchCustomer() {
    const phone = document.getElementById('cust-phone').value.trim();
    const resultEl = document.getElementById('customer-result');
    if (!/^\d{10}$/.test(phone)) {
      resultEl.innerHTML = '<div class="alert alert-warning" style="font-size:13px;">Enter a valid 10-digit phone number.</div>';
      return;
    }
    try {
      showLoading();
      const res = await api.get('/api/customers', { phone });
      const customers = res.data || [];
      if (!customers.length) {
        resultEl.innerHTML = '<div class="alert alert-info" style="font-size:13px;">No customer found with this phone number.</div>';
        return;
      }
      selectedCustomer = customers[0];
      showCustomerCard(selectedCustomer);
      await loadLoans(selectedCustomer.customer_id);
    } catch (err) {
      resultEl.innerHTML = `<div class="alert alert-danger" style="font-size:13px;">${err.message}</div>`;
    } finally {
      hideLoading();
    }
  }

  function showCustomerCard(c) {
    const initials = (c.name || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const photoUrl = c.photo ? `/api/kyc/${c.photo}` : null;
    const avatarEl = photoUrl
      ? `<img src="${photoUrl}" alt="${c.name}"
          style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--border);"
          onerror="this.outerHTML='<div class=\\'customer-avatar\\'>${initials}</div>'">`
      : `<div class="customer-avatar">${initials}</div>`;
    document.getElementById('customer-result').innerHTML = `
      <div class="search-result-card">
        <div class="d-flex align-items-center gap-3">
          ${avatarEl}
          <div>
            <div class="fw-600" style="font-size:15px;">${c.name}</div>
            <div style="font-size:13px;color:var(--text-secondary);">${c.phone}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${c.city || ''} ${c.state || ''}</div>
            ${c.onboarded_by ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;"><i class="bi bi-person-check me-1"></i>Onboarded by ${c.onboarded_by}</div>` : ''}
          </div>
          <div class="ms-auto">${statusBadge(c.status || 'ACTIVE')}</div>
        </div>
      </div>`;
  }

  // ---------------------------------------------------------------------------
  // Load & render loans
  // ---------------------------------------------------------------------------
  async function loadLoans(customerId) {
    try {
      showLoading();
      const res = await api.get('/api/loans/customer/' + customerId);
      customerLoans = (res.data || []).filter(l => l.status !== 'CLOSED');
      const step2 = document.getElementById('step2-card');
      step2.classList.remove('d-none');
      step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const exportBtns = document.getElementById('loan-export-btns');
      if (exportBtns) exportBtns.style.display = 'none';

      const listEl = document.getElementById('loans-list');
      const addLoanBtn = document.getElementById('add-loan-btn');
      if (!customerLoans.length) {
        if (addLoanBtn) addLoanBtn.classList.remove('d-none');
        listEl.innerHTML = `
          <div class="col-12 text-center py-3">
            <div style="font-size:32px;margin-bottom:8px;">💳</div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">${t('pay.no_active_loans')}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">This customer has no active or pending loans.</div>
            <button type="button" class="btn btn-primary" onclick="openAddLoanModal()">
              <i class="bi bi-plus-circle me-2"></i>${t('pay.add_loan')}
            </button>
          </div>`;
        return;
      }
      if (addLoanBtn) addLoanBtn.classList.remove('d-none');
      listEl.innerHTML = customerLoans.map(l => `
        <div class="col-md-6">
          <div class="loan-card">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div class="fw-600" style="font-size:13px;">${l.installment_type} · ${l.num_installments} installments</div>
              ${statusBadge(l.status)}
            </div>
            <div class="row g-1 mb-3" style="font-size:12.5px;">
              <div class="col-6"><span style="color:var(--text-secondary);">${t('pay.disbursed')}:</span> ${formatCurrency(l.disbursement_amount)}</div>
              <div class="col-6"><span style="color:var(--text-secondary);">${t('pay.balance')}:</span>
                <span class="fw-600 text-danger">${formatCurrency(l.balance_amount || 0)}</span>
              </div>
              <div class="col-6"><span style="color:var(--text-secondary);">${t('pay.collection')}:</span> <span class="fw-600">${formatCurrency(l.installment_amount)}</span></div>
              <div class="col-6"><span style="color:var(--text-secondary);">${t('pay.type')}:</span> ${l.installment_type}</div>
            </div>
            <button type="button" class="btn btn-success w-100" onclick="selectLoan('${l.loan_id}')">
              <i class="bi bi-cash-coin me-2"></i>${t('pay.collect')}
            </button>
          </div>
        </div>`).join('');
    } catch (err) {
      showToast('Failed to load loans: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  // ---------------------------------------------------------------------------
  // Select loan → open payment modal
  // ---------------------------------------------------------------------------
  window.selectLoan = async function (loanId) {
    selectedInstallment = null;
    selectedLoan = customerLoans.find(l => l.loan_id === loanId) || null;
    try {
      showLoading();
      const res = await api.get('/api/loans/' + loanId);
      const loanData = res.data || {};
      installments = loanData.installments || [];
      // Merge full API data (has total_paid, balance_amount, etc.) onto selected
      selectedLoan = Object.assign({}, selectedLoan, loanData);
      // Reveal export buttons in step2 header
      const exportBtns = document.getElementById('loan-export-btns');
      if (exportBtns) exportBtns.style.display = 'flex';
      delete selectedLoan.installments; // keep it in the separate array
      openPaymentModal();
    } catch (err) {
      showToast('Failed to load loan details: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  };

  // ---------------------------------------------------------------------------
  // Populate and show the payment modal
  // ---------------------------------------------------------------------------
  function openPaymentModal() {
    const l = selectedLoan;

    // Header
    document.getElementById('pm-title').textContent = t('pay.collect');
    document.getElementById('pm-subtitle').textContent =
      `${selectedCustomer ? selectedCustomer.name + ' · ' : ''}${l.installment_type} · ${l.num_installments} installments · ${formatCurrency(l.installment_amount)} each`;

    // Loan summary mini-cards
    document.getElementById('pm-loan-summary').innerHTML = `
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center loan-stat-neutral">
          <div class="fw-600" style="font-size:15px;">${formatCurrency(l.disbursement_amount)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">Total Loan</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center loan-stat-green">
          <div class="fw-600" style="font-size:15px;color:#16a34a;">${formatCurrency(l.total_paid || 0)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">Paid</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center balance-stat-box">
          <div class="fw-600" style="font-size:15px;color:#DC2626;">${formatCurrency(l.balance_amount || 0)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${t('pay.balance')}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center loan-stat-neutral">
          ${statusBadge(l.status)}
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${t('common.status')}</div>
        </div>
      </div>`;

    // Installments table
    const tbody = document.getElementById('pm-inst-tbody');
    const payable = installments.filter(i => ['PENDING', 'PARTIAL'].includes(i.status));
    if (!installments.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="bi bi-calendar-x"></i>No installments found</td></tr>`;
    } else {
      tbody.innerHTML = installments.map((inst, i) => {
        const selectable = ['PENDING', 'PARTIAL'].includes(inst.status);
        const balance = parseFloat(inst.balance_amount || 0) ||
          ((parseFloat(inst.total_amount) || 0) - (parseFloat(inst.paid_amount) || 0));
        return `<tr style="${selectable ? 'cursor:pointer;' : 'opacity:0.5;'}"
                    ${selectable ? `onclick="pmSelectInstallment(${i})" id="pm-inst-row-${i}"` : ''}>
          <td>${inst.installment_number || i + 1}</td>
          <td>${formatDate(inst.due_date)}</td>
          <td>${formatCurrency(inst.total_amount)}</td>
          <td>${formatCurrency(inst.paid_amount || 0)}</td>
          <td><strong>${formatCurrency(balance)}</strong></td>
          <td>${statusBadge(inst.status)}</td>
          <td>${selectable
            ? `<button type="button" class="btn btn-sm btn-outline-primary" onclick="pmSelectInstallment(${i});event.stopPropagation();">Select</button>`
            : ''}</td>
        </tr>`;
      }).join('');
    }

    // Reset payment form
    document.getElementById('pm-payment-form').classList.add('d-none');
    document.getElementById('pm-submit-btn').classList.add('d-none');
    document.getElementById('pm-error').classList.add('d-none');
    document.getElementById('pm-amount').value = '';
    document.getElementById('pm-remarks').value = '';
    document.getElementById('pm-date').value = new Date().toISOString().split('T')[0];

    paymentModal.show();

    // Auto-select first pending installment if only one unpaid
    if (payable.length === 1) {
      const idx = installments.indexOf(payable[0]);
      if (idx !== -1) setTimeout(() => pmSelectInstallment(idx), 150);
    }
  }

  // ---------------------------------------------------------------------------
  // Select installment inside modal
  // ---------------------------------------------------------------------------
  window.pmSelectInstallment = function (idx) {
    selectedInstallment = installments[idx];

    // Highlight row
    document.querySelectorAll('#pm-inst-tbody tr').forEach(r => r.classList.remove('table-active'));
    const row = document.getElementById('pm-inst-row-' + idx);
    if (row) row.classList.add('table-active');

    const balance = parseFloat(selectedInstallment.balance_amount || 0) ||
      ((parseFloat(selectedInstallment.total_amount) || 0) - (parseFloat(selectedInstallment.paid_amount) || 0));

    document.getElementById('pm-amount').value = balance.toFixed(2);
    document.getElementById('pm-selected-inst').innerHTML =
      `<i class="bi bi-check-circle-fill text-success me-2"></i>
       Installment #${selectedInstallment.installment_number || idx + 1} &nbsp;·&nbsp;
       Due: <strong>${formatDate(selectedInstallment.due_date)}</strong> &nbsp;·&nbsp;
       Balance: <strong>${formatCurrency(balance)}</strong>`;

    document.getElementById('pm-payment-form').classList.remove('d-none');
    document.getElementById('pm-submit-btn').classList.remove('d-none');
    document.getElementById('pm-error').classList.add('d-none');

    // Scroll to payment form within modal
    document.getElementById('pm-payment-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // ---------------------------------------------------------------------------
  // Submit payment
  // ---------------------------------------------------------------------------
  async function submitPayment() {
    const errEl = document.getElementById('pm-error');
    errEl.classList.add('d-none');

    const amount = parseFloat(document.getElementById('pm-amount').value);
    const mode = document.getElementById('pm-mode').value;
    const date = document.getElementById('pm-date').value;
    const remarks = document.getElementById('pm-remarks').value.trim();

    if (!selectedInstallment) {
      errEl.textContent = 'Please select an installment first.';
      errEl.classList.remove('d-none');
      return;
    }
    if (!amount || amount <= 0) {
      errEl.textContent = 'Please enter a valid amount.';
      errEl.classList.remove('d-none');
      return;
    }
    if (!date) {
      errEl.textContent = 'Transaction date is required.';
      errEl.classList.remove('d-none');
      return;
    }

    const btn = document.getElementById('pm-submit-btn');
    btn.disabled = true;
    document.getElementById('pm-submit-txt').classList.add('d-none');
    document.getElementById('pm-submit-load').classList.remove('d-none');

    try {
      await api.post('/api/payments/collect', {
        loan_id: selectedLoan.loan_id,
        installment_id: selectedInstallment.installment_id,
        amount,
        payment_mode: mode,
        remarks,
        transaction_date: date,
      });
      paymentModal.hide();
      showToast('Payment recorded successfully!', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      document.getElementById('pm-submit-txt').classList.remove('d-none');
      document.getElementById('pm-submit-load').classList.add('d-none');
    }
  }

  // ---------------------------------------------------------------------------
  // Add Loan modal
  // ---------------------------------------------------------------------------
  let addLoanModal = null;

  function injectAddLoanModal() {
    if (document.getElementById('add-loan-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="add-loan-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fw-600" style="font-size:16px;">
                <i class="bi bi-plus-circle me-2 text-primary"></i>${t('pay.add_loan_title')}
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="al-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">${t('pay.loan_amount')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="al-amount" placeholder="e.g. 10000" min="1" step="1">
                  <span id="al-wallet-balance" style="font-size:12px;"></span>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.inst_type')} <span class="text-danger">*</span></label>
                  <select class="form-select" id="al-inst-type">
                    <option value="WEEKLY">${t('pay.weekly')}</option>
                    <option value="DAILY">${t('pay.daily')}</option>
                    <option value="MONTHLY">${t('pay.monthly')}</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.num_inst')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="al-num-inst" placeholder="e.g. 12" min="1" step="1">
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.coll_amount')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="al-collection" placeholder="e.g. 1000" min="1" step="1">
                </div>
                <div class="col-12" id="al-summary" style="display:none;">
                  <div class="loan-summary-box" style="display:flex;flex-wrap:wrap;text-align:center;border-radius:8px;overflow:hidden;">
                    <div style="flex:1;min-width:120px;padding:10px 8px;border-right:1px solid #BFDBFE;">
                      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('pay.total_recover')}</div>
                      <div id="al-total" style="font-size:15px;font-weight:700;color:#1D4ED8;">₹ 0</div>
                    </div>
                    <div style="flex:1;min-width:120px;padding:10px 8px;">
                      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('pay.interest_earned')}</div>
                      <div id="al-interest" style="font-size:15px;font-weight:700;color:#16A34A;">₹ 0</div>
                    </div>
                    <div style="flex:1 0 100%;padding:8px 10px;border-top:1px solid #BFDBFE;">
                      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${t('pay.disb_date')}</div>
                      <input type="date" class="form-control text-center" id="al-date">
                    </div>
                  </div>
                </div>
                <div class="col-12">
                  <label class="form-label">${t('pay.remarks')}</label>
                  <input type="text" class="form-control" id="al-remarks" placeholder="Optional">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary" id="al-save-btn">
                <span id="al-save-txt"><i class="bi bi-check-lg me-1"></i>Create Loan</span>
                <span id="al-save-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Creating...</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    addLoanModal = new bootstrap.Modal(document.getElementById('add-loan-modal'));

    document.getElementById('al-save-btn').addEventListener('click', submitAddLoan);

    function updateSummary() {
      const amtEl = document.getElementById('al-amount');
      const amount = parseFloat(amtEl.value) || 0;
      const n = parseInt(document.getElementById('al-num-inst').value) || 0;
      const col = parseFloat(document.getElementById('al-collection').value) || 0;
      const summaryEl = document.getElementById('al-summary');

      // Wallet balance live check
      const walletBal = amtEl._walletBalance || 0;
      const balEl = document.getElementById('al-wallet-balance');
      if (balEl) {
        if (walletBal <= 0) {
          balEl.textContent = 'Wallet balance: ₹ 0.00 — wallet is empty!';
          balEl.style.color = '#DC2626';
          amtEl.style.borderColor = amount > 0 ? '#DC2626' : '';
        } else if (amount > walletBal) {
          balEl.textContent = 'Wallet balance: ' + formatCurrency(walletBal) + ' — exceeds balance!';
          balEl.style.color = '#DC2626';
          amtEl.style.borderColor = '#DC2626';
        } else {
          balEl.textContent = 'Wallet balance: ' + formatCurrency(walletBal);
          balEl.style.color = '#16A34A';
          amtEl.style.borderColor = '';
        }
      }

      if (amount > 0 && n > 0 && col > 0) {
        document.getElementById('al-total').textContent = '₹ ' + (col * n).toLocaleString('en-IN');
        document.getElementById('al-interest').textContent = '₹ ' + (col * n - amount).toLocaleString('en-IN');
        summaryEl.style.display = 'block';
      } else {
        summaryEl.style.display = 'none';
      }
    }
    ['al-amount', 'al-num-inst', 'al-collection'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateSummary);
    });
  }

  window.openAddLoanModal = async function () {
    injectAddLoanModal();
    const amtEl = document.getElementById('al-amount');
    amtEl.value = '';
    amtEl.style.borderColor = '';
    amtEl._walletBalance = 0;
    document.getElementById('al-num-inst').value = '';
    document.getElementById('al-collection').value = '';
    document.getElementById('al-remarks').value = '';
    document.getElementById('al-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('al-summary').style.display = 'none';
    document.getElementById('al-error').classList.add('d-none');
    document.getElementById('al-save-btn').disabled = false;
    document.getElementById('al-save-txt').classList.remove('d-none');
    document.getElementById('al-save-load').classList.add('d-none');
    addLoanModal.show();

    // Fetch and show wallet balance
    let balance = 0;
    try {
      const wres = await api.get('/api/wallet');
      balance = (wres.data && wres.data.wallet) ? parseFloat(wres.data.wallet.rotation_balance || 0) : 0;
    } catch (_) {}
    amtEl._walletBalance = balance;
    const balEl = document.getElementById('al-wallet-balance');
    if (balEl) {
      if (balance <= 0) {
        balEl.textContent = 'Wallet balance: ₹ 0.00 — wallet is empty!';
        balEl.style.color = '#DC2626';
        const errEl = document.getElementById('al-error');
        errEl.textContent = 'Wallet is empty. Please top up the wallet before creating a loan.';
        errEl.classList.remove('d-none');
        document.getElementById('al-save-btn').disabled = true;
      } else {
        balEl.textContent = 'Wallet balance: ' + formatCurrency(balance);
        balEl.style.color = '#16A34A';
      }
    }
  };

  async function submitAddLoan() {
    const errEl = document.getElementById('al-error');
    errEl.classList.add('d-none');

    const amount = parseFloat(document.getElementById('al-amount').value) || 0;
    const numInst = parseInt(document.getElementById('al-num-inst').value) || 0;
    const colAmt = parseFloat(document.getElementById('al-collection').value) || 0;

    const walletBal = document.getElementById('al-amount')._walletBalance || 0;
    if (!selectedCustomer) { errEl.textContent = 'No customer selected.'; errEl.classList.remove('d-none'); return; }
    if (amount <= 0) { errEl.textContent = 'Enter a valid loan amount.'; errEl.classList.remove('d-none'); return; }
    if (amount > walletBal) { errEl.textContent = walletBal <= 0 ? 'Wallet is empty. Please top up the wallet before creating a loan.' : `Loan amount exceeds wallet balance (${formatCurrency(walletBal)}).`; errEl.classList.remove('d-none'); return; }
    if (numInst < 1) { errEl.textContent = 'Enter number of installments.'; errEl.classList.remove('d-none'); return; }
    if (colAmt <= 0) { errEl.textContent = 'Enter a valid collection amount.'; errEl.classList.remove('d-none'); return; }
    if (colAmt * numInst < amount) { errEl.textContent = 'Total collections must be ≥ loan amount.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('al-save-btn');
    btn.disabled = true;
    document.getElementById('al-save-txt').classList.add('d-none');
    document.getElementById('al-save-load').classList.remove('d-none');

    try {
      await api.post('/api/loans/', {
        customer_id: selectedCustomer.customer_id,
        disbursement_amount: amount,
        installment_type: document.getElementById('al-inst-type').value,
        num_installments: numInst,
        collection_amount: colAmt,
        disbursement_date: document.getElementById('al-date').value || null,
        remarks: document.getElementById('al-remarks').value.trim(),
      });
      addLoanModal.hide();
      showToast('Loan created successfully!', 'success');
      await loadLoans(selectedCustomer.customer_id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('al-save-txt').classList.remove('d-none');
      document.getElementById('al-save-load').classList.add('d-none');
    }
  }

  // ---------------------------------------------------------------------------
  // Export helpers
  // ---------------------------------------------------------------------------
  function buildLoanSummaryRows() {
    const l = selectedLoan;
    const c = selectedCustomer;
    const totalPayable = l.total_payable || (parseFloat(l.installment_amount) * parseInt(l.num_installments));
    return [
      ['Customer Name', c ? c.name : ''],
      ['Phone', c ? c.phone : ''],
      ['City', c ? (c.city || '') : ''],
      [],
      ['Loan ID', l.loan_id],
      ['Disbursed Amount', parseFloat(l.disbursement_amount) || 0],
      ['Installment Type', l.installment_type],
      ['No. of Installments', l.num_installments],
      ['Installment Amount', parseFloat(l.installment_amount) || 0],
      ['Total Payable', parseFloat(totalPayable) || 0],
      ['Total Paid', parseFloat(l.total_paid) || 0],
      ['Balance Amount', parseFloat(l.balance_amount) || 0],
      ['Status', l.status],
      ['Disbursement Date', l.disbursement_date || ''],
    ];
  }

  function buildInstallmentRows() {
    return installments.map(inst => {
      const balance = parseFloat(inst.balance_amount || 0) ||
        ((parseFloat(inst.total_amount) || 0) - (parseFloat(inst.paid_amount) || 0));
      return [
        inst.installment_number,
        inst.due_date || '',
        parseFloat(inst.total_amount) || 0,
        parseFloat(inst.paid_amount) || 0,
        balance,
        inst.status,
      ];
    });
  }

  window.exportLoanExcel = function () {
    if (!selectedLoan || !selectedCustomer) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    let r = 0;

    // Title
    XLSX.utils.sheet_add_aoa(ws, [['LOAN DETAILS']], { origin: r++ });
    XLSX.utils.sheet_add_aoa(ws, [['']], { origin: r++ });

    // Summary
    const summaryRows = buildLoanSummaryRows();
    XLSX.utils.sheet_add_aoa(ws, summaryRows, { origin: r });
    r += summaryRows.length + 1;

    // Installment schedule header
    XLSX.utils.sheet_add_aoa(ws, [['INSTALLMENT SCHEDULE']], { origin: r++ });
    XLSX.utils.sheet_add_aoa(ws, [['#', 'Due Date', 'Total Amount (₹)', 'Paid Amount (₹)', 'Balance (₹)', 'Status']], { origin: r++ });
    const instRows = buildInstallmentRows();
    XLSX.utils.sheet_add_aoa(ws, instRows, { origin: r });

    // Column widths
    ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Loan Details');

    const name = selectedCustomer.name.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Loan_${name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // PDF-safe currency: jsPDF default font has no Rupee glyph, use "Rs." instead
  function pdfAmt(val) {
    const n = parseFloat(val) || 0;
    return 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Status fill colors for PDF cells
  function statusFill(status) {
    if (status === 'PAID') return [220, 252, 231];       // light green
    if (status === 'PARTIAL') return [254, 243, 199];    // light yellow
    if (status === 'PENDING') return [255, 255, 255];    // white
    return [255, 255, 255];
  }

  window.exportLoanPdf = function () {
    if (!selectedLoan || !selectedCustomer) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const l = selectedLoan;
    const c = selectedCustomer;
    const totalPayable = l.total_payable || (parseFloat(l.installment_amount) * parseInt(l.num_installments));
    const pageW = doc.internal.pageSize.getWidth();
    let y = 14;

    // Header bar
    doc.setFillColor(0, 51, 102);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Loan Statement', 14, 14);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, pageW - 14, 14, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y = 30;

    // Customer info row
    doc.setFillColor(240, 244, 255);
    doc.roundedRect(14, y, pageW - 28, 14, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text('Customer', 18, y + 5);
    doc.setFont(undefined, 'normal');
    doc.text(c.name, 18, y + 10);
    doc.setFont(undefined, 'bold');
    doc.text('Phone', 70, y + 5);
    doc.setFont(undefined, 'normal');
    doc.text(c.phone, 70, y + 10);
    if (c.city) {
      doc.setFont(undefined, 'bold');
      doc.text('City', 120, y + 5);
      doc.setFont(undefined, 'normal');
      doc.text(c.city, 120, y + 10);
    }
    y += 20;

    // Loan summary table (2-column key-value)
    doc.autoTable({
      startY: y,
      head: [['Loan Summary', '']],
      body: [
        ['Loan ID', '...' + l.loan_id.slice(-12)],
        ['Disbursement Date', l.disbursement_date || '—'],
        ['Disbursed Amount', pdfAmt(l.disbursement_amount)],
        ['Installment Type', l.installment_type],
        ['No. of Installments', String(l.num_installments)],
        ['Installment Amount', pdfAmt(l.installment_amount)],
        ['Total Payable', pdfAmt(totalPayable)],
        ['Total Paid', pdfAmt(l.total_paid || 0)],
        ['Balance Outstanding', pdfAmt(l.balance_amount || 0)],
        ['Status', l.status],
      ],
      theme: 'plain',
      headStyles: {
        fillColor: [0, 51, 102], textColor: 255, fontSize: 9, fontStyle: 'bold',
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
      },
      bodyStyles: { fontSize: 9, cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 } },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] },
        1: { cellWidth: 'auto' },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell(data) {
        if (data.row.index === 9 && data.column.index === 1) {
          const s = data.cell.raw;
          if (s === 'ACTIVE') data.cell.styles.textColor = [22, 163, 74];
          else if (s === 'CLOSED') data.cell.styles.textColor = [100, 116, 139];
        }
        if (data.row.index === 7 && data.column.index === 1) {
          data.cell.styles.textColor = [22, 163, 74];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.row.index === 8 && data.column.index === 1) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 14, right: 14 },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Section header
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 51, 102);
    doc.text('Installment Schedule', 14, y);
    doc.setTextColor(0, 0, 0);
    y += 3;

    const rawRows = buildInstallmentRows();
    const instBodyRows = rawRows.map(row => [
      String(row[0]),
      String(row[1]),
      pdfAmt(row[2]),
      pdfAmt(row[3]),
      pdfAmt(row[4]),
      String(row[5]),
    ]);

    doc.autoTable({
      startY: y,
      head: [['#', 'Due Date', 'Total', 'Paid', 'Balance', 'Status']],
      body: instBodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [0, 51, 102], textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center',
      },
      bodyStyles: { fontSize: 8, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 26, halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 20, halign: 'center' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 5) {
          const s = data.cell.raw;
          const fill = statusFill(s);
          data.cell.styles.fillColor = fill;
          if (s === 'PAID') data.cell.styles.textColor = [21, 128, 61];
          else if (s === 'PARTIAL') data.cell.styles.textColor = [146, 64, 14];
        }
        // Balance column: red if > 0
        if (data.section === 'body' && data.column.index === 4) {
          const rowIdx = data.row.index;
          if (rawRows[rowIdx] && parseFloat(rawRows[rowIdx][4]) > 0) {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
      margin: { left: 14, right: 14 },
    });

    // Footer line
    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, finalY, pageW - 14, finalY);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text('This is a system-generated document.', 14, finalY + 4);

    const name = c.name.replace(/\s+/g, '_');
    doc.save(`Loan_${name}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------
  function resetToStep1() {
    selectedCustomer = null;
    selectedLoan = null;
    selectedInstallment = null;
    customerLoans = [];
    installments = [];
    document.getElementById('customer-result').innerHTML = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('step2-card').classList.add('d-none');
    const addLoanBtn = document.getElementById('add-loan-btn');
    if (addLoanBtn) addLoanBtn.classList.add('d-none');
    const exportBtns = document.getElementById('loan-export-btns');
    if (exportBtns) exportBtns.style.display = 'none';
  }

  init();
})();

(function () {
  'use strict';

  let selectedCustomer = null;
  let selectedLoan = null;
  let selectedInstallment = null;
  let customerLoans = [];
  let installments = [];
  let paymentModal = null;

  async function init() {
    await initPage('Collect Payment', [1, 2, 3, 4]);
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
      <div class="page-header">
        <h1>Collect Payment</h1>
        <p>Search customer, select a loan and record the payment</p>
      </div>

      <!-- Step 1: Find Customer -->
      <div class="card mb-4" id="step1-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">1</span>Find Customer</h6>
        </div>
        <div class="row g-2 align-items-end">
          <div class="col-md-5">
            <label class="form-label">Phone Number</label>
            <div class="input-group">
              <span class="input-group-text"><i class="bi bi-phone"></i></span>
              <input type="tel" class="form-control" id="cust-phone" placeholder="10-digit phone" maxlength="10">
            </div>
          </div>
          <div class="col-auto">
            <button type="button" class="btn btn-primary" id="search-cust-btn">
              <i class="bi bi-search me-1"></i>Search
            </button>
          </div>
        </div>
        <div id="customer-result" class="mt-3"></div>
      </div>

      <!-- Step 2: Select Loan -->
      <div class="card d-none" id="step2-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">2</span>Select Loan</h6>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="change-cust-btn">
            <i class="bi bi-arrow-left me-1"></i>Change Customer
          </button>
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
                <h5 class="modal-title fw-600" style="font-size:16px;" id="pm-title">Collect Payment</h5>
                <div id="pm-subtitle" style="font-size:12px;color:#64748B;margin-top:2px;"></div>
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
                      <th>Paid</th><th>Balance</th><th>Status</th><th></th>
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
                    <label class="form-label">Amount (&#8377;) <span class="text-danger">*</span></label>
                    <div class="input-group">
                      <span class="input-group-text">&#8377;</span>
                      <input type="number" class="form-control" id="pm-amount" min="0.01" step="0.01">
                    </div>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Payment Mode <span class="text-danger">*</span></label>
                    <select class="form-select" id="pm-mode">
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Transaction Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" id="pm-date" value="${today}">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Remarks</label>
                    <input type="text" class="form-control" id="pm-remarks" placeholder="Optional">
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
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
          style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0;"
          onerror="this.outerHTML='<div class=\\'customer-avatar\\'>${initials}</div>'">`
      : `<div class="customer-avatar">${initials}</div>`;
    document.getElementById('customer-result').innerHTML = `
      <div class="search-result-card">
        <div class="d-flex align-items-center gap-3">
          ${avatarEl}
          <div>
            <div class="fw-600" style="font-size:15px;">${c.name}</div>
            <div style="font-size:13px;color:#64748B;">${c.phone}</div>
            <div style="font-size:12px;color:#64748B;">${c.city || ''} ${c.state || ''}</div>
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

      const listEl = document.getElementById('loans-list');
      if (!customerLoans.length) {
        listEl.innerHTML = `
          <div class="col-12">
            <div class="alert alert-info" style="font-size:13px;">
              <i class="bi bi-info-circle me-2"></i>No active loans found for this customer.
            </div>
          </div>`;
        return;
      }
      listEl.innerHTML = customerLoans.map(l => `
        <div class="col-md-6">
          <div class="loan-card" onclick="selectLoan('${l.loan_id}')" style="cursor:pointer;">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div class="fw-600" style="font-size:13px;">Loan #${l.loan_id.slice(0, 8)}…</div>
              ${statusBadge(l.status)}
            </div>
            <div class="row g-1" style="font-size:12.5px;">
              <div class="col-6"><span style="color:#64748B;">Disbursed:</span> ${formatCurrency(l.disbursement_amount)}</div>
              <div class="col-6"><span style="color:#64748B;">Balance:</span>
                <span class="fw-600 text-danger">${formatCurrency(l.balance_amount || 0)}</span>
              </div>
              <div class="col-6"><span style="color:#64748B;">Rate:</span> ${l.interest_rate}% (${l.interest_type})</div>
              <div class="col-6"><span style="color:#64748B;">Type:</span> ${l.installment_type}</div>
            </div>
            <div class="mt-2" style="font-size:11.5px;color:#94a3b8;">
              <i class="bi bi-hand-index me-1"></i>Tap to collect payment
            </div>
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
    document.getElementById('pm-title').textContent = 'Collect Payment';
    document.getElementById('pm-subtitle').textContent =
      `${selectedCustomer ? selectedCustomer.name + ' · ' : ''}${l.installment_type} · ${l.interest_type} ${l.interest_rate}%`;

    // Loan summary mini-cards
    document.getElementById('pm-loan-summary').innerHTML = `
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center" style="background:#f1f5f9;">
          <div class="fw-600" style="font-size:15px;">${formatCurrency(l.disbursement_amount)}</div>
          <div style="font-size:11px;color:#64748B;">Total Loan</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center" style="background:#f0fdf4;">
          <div class="fw-600" style="font-size:15px;color:#16a34a;">${formatCurrency(l.total_paid || 0)}</div>
          <div style="font-size:11px;color:#64748B;">Paid</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center" style="background:#fff7ed;">
          <div class="fw-600" style="font-size:15px;color:#DC2626;">${formatCurrency(l.balance_amount || 0)}</div>
          <div style="font-size:11px;color:#64748B;">Balance</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center" style="background:#f1f5f9;">
          ${statusBadge(l.status)}
          <div style="font-size:11px;color:#64748B;margin-top:4px;">Status</div>
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
      // Refresh loan cards
      if (selectedCustomer) await loadLoans(selectedCustomer.customer_id);
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
  }

  init();
})();

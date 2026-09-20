(function () {
  'use strict';

  let selectedCustomer = null;
  let selectedLoan = null;
  let selectedInstallment = null;
  let customerLoans = [];
  let installments = [];

  async function init() {
    await initPage('Collect Payment', [1, 2, 3, 4]);
    renderPage();

    // Check URL param
    const params = new URLSearchParams(window.location.search);
    const customerId = params.get('customer_id');
    if (customerId) {
      await loadCustomerById(customerId);
    }
  }

  function renderPage() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h1>Collect Payment</h1>
        <p>Search customer, select loan and record payment</p>
      </div>

      <!-- Step 1: Search -->
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
            <button class="btn btn-primary" id="search-cust-btn"><i class="bi bi-search me-1"></i>Search</button>
          </div>
        </div>
        <div id="customer-result" class="mt-3"></div>
      </div>

      <!-- Step 2: Loan Selection -->
      <div class="card mb-4 d-none" id="step2-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">2</span>Select Loan</h6>
          <button class="btn btn-sm btn-outline-secondary" id="change-cust-btn"><i class="bi bi-arrow-left me-1"></i>Change Customer</button>
        </div>
        <div id="loans-list" class="row g-3"></div>
      </div>

      <!-- Step 3: Installments -->
      <div class="card mb-4 d-none" id="step3-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">3</span>Select Installment</h6>
          <button class="btn btn-sm btn-outline-secondary" id="change-loan-btn"><i class="bi bi-arrow-left me-1"></i>Change Loan</button>
        </div>
        <div id="loan-summary" class="row g-3 mb-3"></div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr><th>#</th><th>Due Date</th><th>Total Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr>
            </thead>
            <tbody id="inst-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Step 4: Payment Form -->
      <div class="card d-none" id="step4-card">
        <div class="card-header-flex">
          <h6 class="card-title"><span class="badge bg-primary me-2">4</span>Payment Details</h6>
          <button class="btn btn-sm btn-outline-secondary" id="change-inst-btn"><i class="bi bi-arrow-left me-1"></i>Change Installment</button>
        </div>
        <div id="payment-form-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
        <div id="selected-inst-info" class="alert alert-info mb-3" style="font-size:13px;"></div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label">Amount (&#8377;) <span class="text-danger">*</span></label>
            <div class="input-group">
              <span class="input-group-text">&#8377;</span>
              <input type="number" class="form-control" id="pay-amount" min="0.01" step="0.01">
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Payment Mode <span class="text-danger">*</span></label>
            <select class="form-select" id="pay-mode">
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">Transaction Date <span class="text-danger">*</span></label>
            <input type="date" class="form-control" id="pay-date" value="${today}">
          </div>
          <div class="col-md-6">
            <label class="form-label">Remarks</label>
            <input type="text" class="form-control" id="pay-remarks" placeholder="Optional remarks">
          </div>
        </div>
        <div class="mt-4">
          <button class="btn btn-success btn-lg w-100" id="submit-pay-btn">
            <span id="pay-txt"><i class="bi bi-check-circle me-2"></i>Record Payment</span>
            <span id="pay-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Processing...</span>
          </button>
        </div>
      </div>`;

    // Events
    document.getElementById('cust-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
    document.getElementById('search-cust-btn').addEventListener('click', searchCustomer);
    document.getElementById('cust-phone').addEventListener('keydown', e => { if (e.key === 'Enter') searchCustomer(); });
    document.getElementById('change-cust-btn').addEventListener('click', resetToStep1);
    document.getElementById('change-loan-btn').addEventListener('click', resetToStep2);
    document.getElementById('change-inst-btn').addEventListener('click', resetToStep3);
    document.getElementById('submit-pay-btn').addEventListener('click', submitPayment);
  }

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
      document.getElementById('customer-result').innerHTML = `<div class="alert alert-danger" style="font-size:13px;">${err.message}</div>`;
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
    const initials = (c.name||'C').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
    document.getElementById('customer-result').innerHTML = `
      <div class="search-result-card">
        <div class="d-flex align-items-center gap-3">
          <div class="customer-avatar">${initials}</div>
          <div>
            <div class="fw-600" style="font-size:15px;">${c.name}</div>
            <div style="font-size:13px;color:#64748B;">${c.phone}</div>
            <div style="font-size:12px;color:#64748B;">${c.city || ''} ${c.state || ''}</div>
          </div>
          <div class="ms-auto">${statusBadge(c.status || 'ACTIVE')}</div>
        </div>
      </div>`;
  }

  async function loadLoans(customerId) {
    try {
      showLoading();
      const res = await api.get('/api/loans/customer/' + customerId);
      customerLoans = (res.data || []).filter(l => l.status !== 'CLOSED');
      document.getElementById('step2-card').classList.remove('d-none');
      const listEl = document.getElementById('loans-list');
      if (!customerLoans.length) {
        listEl.innerHTML = '<div class="col-12"><div class="alert alert-info" style="font-size:13px;"><i class="bi bi-info-circle me-2"></i>No active loans found for this customer.</div></div>';
        return;
      }
      listEl.innerHTML = customerLoans.map(l => `
        <div class="col-md-6">
          <div class="loan-card" onclick="selectLoan(${l.loan_id})">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div class="fw-600">Loan #${l.loan_id}</div>
              ${statusBadge(l.status)}
            </div>
            <div class="row g-1" style="font-size:12.5px;">
              <div class="col-6"><span style="color:#64748B;">Disbursed:</span> ${formatCurrency(l.disbursement_amount)}</div>
              <div class="col-6"><span style="color:#64748B;">Balance:</span> <span class="fw-600 text-danger">${formatCurrency(l.outstanding_amount || l.balance_amount || 0)}</span></div>
              <div class="col-6"><span style="color:#64748B;">Rate:</span> ${l.interest_rate}% (${l.interest_type})</div>
              <div class="col-6"><span style="color:#64748B;">Mode:</span> ${l.installment_type}</div>
            </div>
          </div>
        </div>`).join('');
    } catch (err) {
      showToast('Failed to load loans: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  window.selectLoan = async function(loanId) {
    selectedLoan = customerLoans.find(l => l.loan_id === loanId);
    if (!selectedLoan) return;
    // Highlight selected
    document.querySelectorAll('.loan-card').forEach(c => c.classList.remove('selected'));
    event.currentTarget.classList.add('selected');
    try {
      showLoading();
      const res = await api.get('/api/loans/' + loanId);
      const loanData = res.data || res;
      installments = loanData.installments || [];
      selectedLoan = loanData.loan || selectedLoan;
      showStep3();
    } catch (err) {
      showToast('Failed to load loan details: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  };

  function showStep3() {
    document.getElementById('step3-card').classList.remove('d-none');
    const l = selectedLoan;
    document.getElementById('loan-summary').innerHTML = `
      <div class="col-6 col-md-3">
        <div class="stat-card" style="padding:14px;">
          <div class="stat-icon blue" style="width:40px;height:40px;font-size:16px;"><i class="bi bi-bank2"></i></div>
          <div class="stat-body"><div class="stat-value" style="font-size:16px;">${formatCurrency(l.disbursement_amount||l.total_payable)}</div><div class="stat-label">Total Loan</div></div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card" style="padding:14px;">
          <div class="stat-icon green" style="width:40px;height:40px;font-size:16px;"><i class="bi bi-check-circle"></i></div>
          <div class="stat-body"><div class="stat-value" style="font-size:16px;">${formatCurrency(l.total_paid||l.collected_amount||0)}</div><div class="stat-label">Total Paid</div></div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card" style="padding:14px;">
          <div class="stat-icon red" style="width:40px;height:40px;font-size:16px;"><i class="bi bi-exclamation-circle"></i></div>
          <div class="stat-body"><div class="stat-value" style="font-size:16px;">${formatCurrency(l.outstanding_amount||l.balance_amount||0)}</div><div class="stat-label">Balance</div></div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="stat-card" style="padding:14px;">
          <div class="stat-icon amber" style="width:40px;height:40px;font-size:16px;"><i class="bi bi-calendar"></i></div>
          <div class="stat-body"><div class="stat-value" style="font-size:16px;">${statusBadge(l.status)}</div><div class="stat-label">Status</div></div>
        </div>
      </div>`;

    const tbody = document.getElementById('inst-tbody');
    if (!installments.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="bi bi-calendar-x"></i>No installments found</td></tr>';
      return;
    }
    tbody.innerHTML = installments.map((inst, i) => {
      const selectable = ['PENDING','PARTIAL','OVERDUE'].includes(inst.status);
      return `<tr class="installment-row ${selectable ? 'selectable' : ''}" ${selectable ? `onclick="selectInstallment(${i})"` : ''}>
        <td>${i+1}</td>
        <td>${formatDate(inst.due_date)}</td>
        <td>${formatCurrency(inst.total_amount || inst.installment_amount)}</td>
        <td>${formatCurrency(inst.paid_amount||0)}</td>
        <td><strong>${formatCurrency(inst.balance_amount||inst.pending_amount||(inst.total_amount||inst.installment_amount)-(inst.paid_amount||0))}</strong></td>
        <td>${statusBadge(inst.status)}</td>
      </tr>`;
    }).join('');
  }

  window.selectInstallment = function(idx) {
    selectedInstallment = installments[idx];
    document.querySelectorAll('.installment-row').forEach(r => r.classList.remove('selected'));
    document.querySelectorAll('.installment-row')[idx].classList.add('selected');
    const balance = selectedInstallment.balance_amount || selectedInstallment.pending_amount ||
      ((selectedInstallment.total_amount||selectedInstallment.installment_amount)-(selectedInstallment.paid_amount||0));
    document.getElementById('pay-amount').value = parseFloat(balance).toFixed(2);
    document.getElementById('selected-inst-info').innerHTML =
      `<i class="bi bi-info-circle me-2"></i>Selected: Installment #${idx+1} | Due: ${formatDate(selectedInstallment.due_date)} | Balance: <strong>${formatCurrency(balance)}</strong>`;
    document.getElementById('step4-card').classList.remove('d-none');
    document.getElementById('step4-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  async function submitPayment() {
    const errEl = document.getElementById('payment-form-error');
    errEl.classList.add('d-none');
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const mode = document.getElementById('pay-mode').value;
    const date = document.getElementById('pay-date').value;
    const remarks = document.getElementById('pay-remarks').value.trim();

    if (!selectedInstallment) { errEl.textContent = 'Please select an installment first.'; errEl.classList.remove('d-none'); return; }
    if (!amount || amount <= 0) { errEl.textContent = 'Please enter a valid amount.'; errEl.classList.remove('d-none'); return; }
    if (!date) { errEl.textContent = 'Transaction date is required.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('submit-pay-btn');
    btn.disabled = true;
    document.getElementById('pay-txt').classList.add('d-none');
    document.getElementById('pay-load').classList.remove('d-none');

    try {
      await api.post('/api/payments/collect', {
        loan_id: selectedLoan.loan_id,
        installment_id: selectedInstallment.installment_id,
        amount,
        payment_mode: mode,
        remarks,
        transaction_date: date
      });
      showToast('Payment recorded successfully!', 'success');
      // Refresh installments
      selectedInstallment = null;
      document.getElementById('step4-card').classList.add('d-none');
      const res = await api.get('/api/loans/' + selectedLoan.loan_id);
      const loanData = res.data || res;
      installments = loanData.installments || [];
      selectedLoan = loanData.loan || selectedLoan;
      showStep3();
      document.getElementById('step3-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      document.getElementById('pay-txt').classList.remove('d-none');
      document.getElementById('pay-load').classList.add('d-none');
    }
  }

  function resetToStep1() {
    selectedCustomer = null; selectedLoan = null; selectedInstallment = null;
    document.getElementById('customer-result').innerHTML = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('step2-card').classList.add('d-none');
    document.getElementById('step3-card').classList.add('d-none');
    document.getElementById('step4-card').classList.add('d-none');
  }

  function resetToStep2() {
    selectedLoan = null; selectedInstallment = null;
    document.getElementById('step3-card').classList.add('d-none');
    document.getElementById('step4-card').classList.add('d-none');
  }

  function resetToStep3() {
    selectedInstallment = null;
    document.getElementById('step4-card').classList.add('d-none');
  }

  init();
})();

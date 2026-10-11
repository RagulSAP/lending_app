(function () {
  'use strict';

  let selectedCustomer = null;
  let selectedLoan = null;
  let selectedInstallment = null;
  let customerLoans = [];
  let installments = [];
  let ioTransactions = [];
  let paymentModal = null;
  let closeLoanModal = null;
  let pendingClosePayload = null;
  let newInterestTouched = false;
  let closeMode = false;
  let cfNewAmtTouched = false;
  let cfNewNTouched = false;
  let cfCtx = null;
  let pendingCloseKind = 'IO_PRINCIPAL';

  async function init() {
    await initPage(t('pay.collect'), [1, 2, 3, 4]);
    renderPage();
    injectPaymentModal();

    const params = new URLSearchParams(window.location.search);
    const customerId = params.get('customer_id');
    if (customerId) await loadCustomerById(customerId);
    const loanId = params.get('loan_id');
    if (customerId && loanId && customerLoans.some(l => l.loan_id === loanId)) await window.selectLoan(loanId);
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
          <div class="d-flex gap-2">
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

              <!-- Installment / history section (toggled per loan type) -->
              <div id="pm-inst-section">
                <div class="fw-600 mb-2" id="pm-inst-heading" style="font-size:13px;">
                  <i class="bi bi-list-check me-1 text-primary"></i>Select an Installment
                </div>
                <div class="table-container mb-3">
                  <table class="table table-sm">
                    <thead id="pm-inst-thead">
                      <tr>
                        <th>#</th><th>Due Date</th><th>Total</th>
                        <th>Paid</th><th>${t('pay.balance')}</th><th>${t('common.status')}</th><th></th>
                      </tr>
                    </thead>
                    <tbody id="pm-inst-tbody"></tbody>
                  </table>
                </div>
              </div>

              <!-- Payment form — shown after installment selected (or always for interest-only) -->
              <div id="pm-payment-form" class="d-none">
                <hr class="my-3">
                <div id="pm-selected-inst" class="alert alert-info mb-3" style="font-size:13px;"></div>
                <div id="pm-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div id="pm-io-type-wrap" class="mb-3 d-none">
                  <label class="form-label">Collection Type <span class="text-danger">*</span></label>
                  <select class="form-select" id="pm-collect-type">
                    <option value="INTEREST">Interest</option>
                    <option value="PRINCIPAL">Principal</option>
                  </select>
                </div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label" id="pm-amount-label">${t('pay.amount')} <span class="text-danger">*</span></label>
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
                <div id="pm-principal-box" class="d-none mt-3">
                  <div id="pm-principal-info" class="alert alert-secondary mb-2" style="font-size:13px;"></div>
                  <div id="pm-interest-update" class="d-none">
                    <label class="form-label">Updated interest per collection <span style="font-size:12px;color:var(--text-secondary);">(for the remaining principal)</span></label>
                    <div class="input-group">
                      <span class="input-group-text">&#8377;</span>
                      <input type="number" class="form-control" id="pm-new-interest" min="1" step="1">
                    </div>
                    <div id="pm-new-interest-hint" class="mt-1" style="font-size:12px;color:var(--text-secondary);"></div>
                  </div>
                  <div id="pm-close-note" class="alert alert-warning d-none mb-0" style="font-size:13px;">
                    <i class="bi bi-info-circle me-1"></i>This clears the full outstanding principal. The loan will be closed.
                  </div>
                </div>
              </div>

              <!-- Close / part-pay principal form (principal-with-interest loans) -->
              <div id="pm-close-form" class="d-none">
                <div class="fw-600 mb-2" style="font-size:13px;"><i class="bi bi-lock me-1 text-danger"></i>Close Loan / Part-Pay Principal</div>
                <div id="cf-error" class="alert alert-danger d-none mb-3" style="font-size:13px;"></div>
                <div id="cf-info" class="alert alert-secondary" style="font-size:13px;"></div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">Outstanding Principal</label>
                    <div class="input-group">
                      <span class="input-group-text">&#8377;</span>
                      <input type="text" class="form-control" id="cf-outstanding" readonly>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Principal Repayment <span class="text-danger">*</span></label>
                    <div class="input-group">
                      <span class="input-group-text">&#8377;</span>
                      <input type="number" class="form-control" id="cf-principal-pay" min="1" step="1">
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="p-2 rounded text-center loan-stat-green">
                      <div style="font-size:11px;color:var(--text-secondary);">Amount Received Now</div>
                      <div class="fw-600" id="cf-total" style="font-size:18px;color:#16a34a;"></div>
                    </div>
                  </div>

                  <!-- Revised schedule: only when the principal repayment is less than outstanding -->
                  <div class="col-12 d-none" id="cf-reschedule">
                    <div class="alert alert-warning mb-2" style="font-size:13px;">
                      <i class="bi bi-info-circle me-1"></i>Part-payment: the unpaid installments will be replaced by a revised schedule for the remaining principal of <strong id="cf-remaining"></strong>.
                    </div>
                    <div class="row g-3">
                      <div class="col-md-4">
                        <label class="form-label">Remaining Installments <span class="text-danger">*</span></label>
                        <input type="number" class="form-control" id="cf-new-n" min="1" step="1">
                      </div>
                      <div class="col-md-4">
                        <label class="form-label">Amount per Installment <span class="text-danger">*</span></label>
                        <div class="input-group">
                          <span class="input-group-text">&#8377;</span>
                          <input type="number" class="form-control" id="cf-new-amt" min="1" step="1">
                        </div>
                      </div>
                      <div class="col-md-4">
                        <label class="form-label">First Due Date <span class="text-danger">*</span></label>
                        <input type="date" class="form-control" id="cf-first-due">
                      </div>
                      <div class="col-12" id="cf-new-hint" style="font-size:12px;color:var(--text-secondary);"></div>
                      <div class="col-12">
                        <div class="table-container" style="max-height:200px;overflow-y:auto;">
                          <table class="table table-sm mb-0" style="font-size:12px;">
                            <thead><tr><th>#</th><th>Due Date</th><th>Principal</th><th>Interest</th><th>Total</th></tr></thead>
                            <tbody id="cf-preview"></tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="col-md-6">
                    <label class="form-label">${t('pay.payment_mode')} <span class="text-danger">*</span></label>
                    <select class="form-select" id="cf-mode">
                      <option value="CASH">${t('pay.cash')}</option>
                      <option value="UPI">${t('pay.upi')}</option>
                      <option value="BANK_TRANSFER">${t('pay.bank')}</option>
                      <option value="CHEQUE">${t('pay.cheque')}</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Payment Date <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" id="cf-date" value="${today}">
                  </div>
                  <div class="col-12">
                    <label class="form-label">${t('pay.remarks')}</label>
                    <input type="text" class="form-control" id="cf-remarks" placeholder="Optional">
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-danger me-auto d-none" id="pm-foreclose-btn"><i class="bi bi-lock me-1"></i>Close / Part-Pay</button>
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-danger d-none" id="pm-close-submit-btn"><i class="bi bi-lock me-2"></i>Record &amp; Close Loan</button>
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
    document.getElementById('pm-collect-type').addEventListener('change', () => {
      newInterestTouched = false;
      const l = selectedLoan;
      document.getElementById('pm-amount').value = document.getElementById('pm-collect-type').value === 'PRINCIPAL'
        ? '' : parseFloat(l.installment_amount || 0).toFixed(2);
      refreshIOForm();
    });
    document.getElementById('pm-amount').addEventListener('input', refreshIOForm);
    document.getElementById('pm-new-interest').addEventListener('input', () => { newInterestTouched = true; });
    document.getElementById('pm-foreclose-btn').addEventListener('click', () => setCloseMode(!closeMode));
    document.getElementById('pm-close-submit-btn').addEventListener('click', submitClosure);
    ['cf-principal-pay', 'cf-new-n', 'cf-new-amt', 'cf-first-due'].forEach(id => {
      document.getElementById(id).addEventListener('input', refreshCloseForm);
    });
    document.getElementById('cf-new-amt').addEventListener('input', () => { cfNewAmtTouched = true; });
    document.getElementById('cf-new-n').addEventListener('input', () => { cfNewNTouched = true; });
    injectCloseLoanModal();
  }

  // ---------------------------------------------------------------------------
  // Foreclosure (principal-with-interest loans)
  // ---------------------------------------------------------------------------
  function setCloseMode(on) {
    closeMode = on;
    document.getElementById('pm-inst-section').classList.toggle('d-none', on);
    document.getElementById('pm-close-form').classList.toggle('d-none', !on);
    document.getElementById('pm-close-submit-btn').classList.toggle('d-none', !on);
    const showPay = !on && !!selectedInstallment;
    document.getElementById('pm-payment-form').classList.toggle('d-none', !showPay);
    document.getElementById('pm-submit-btn').classList.toggle('d-none', !showPay);
    document.getElementById('pm-foreclose-btn').innerHTML = on
      ? '<i class="bi bi-arrow-left me-1"></i>Back to installments'
      : '<i class="bi bi-lock me-1"></i>Close / Part-Pay';
    if (on) initCloseForm();
  }

  function addPeriod(dateStr, type, k) {
    const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
    if (type === 'DAILY') return new Date(Date.UTC(y, m - 1, d + k));
    if (type === 'WEEKLY') return new Date(Date.UTC(y, m - 1, d + 7 * k));
    const target = new Date(Date.UTC(y, m - 1 + k, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, last));
    return target;
  }

  function toIso(dt) { return dt.toISOString().split('T')[0]; }

  function initCloseForm() {
    const l = selectedLoan;
    const today = new Date().toISOString().split('T')[0];
    const outstanding = Math.round(parseFloat(l.balance_amount) || 0);
    const open = installments.filter(i => ['PENDING', 'PARTIAL'].includes(i.status));
    const avgTotal = open.length
      ? open.reduce((sum, i) => sum + (parseFloat(i.total_amount) || 0), 0) / open.length
      : (parseFloat(l.installment_amount) || 0);
    const firstOpenDue = open.length ? String(open[0].due_date).slice(0, 10) : today;
    cfCtx = {
      outstanding,
      openCount: Math.max(open.length, 1),
      avgTotal,
      firstDue: firstOpenDue >= today ? firstOpenDue : today,
    };
    cfNewAmtTouched = false;
    cfNewNTouched = false;

    document.getElementById('cf-outstanding').value = outstanding.toLocaleString('en-IN');
    document.getElementById('cf-principal-pay').value = outstanding;
    document.getElementById('cf-principal-pay').max = outstanding;
    document.getElementById('cf-first-due').value = cfCtx.firstDue;
    document.getElementById('cf-date').value = today;
    document.getElementById('cf-remarks').value = '';
    document.getElementById('cf-mode').value = 'CASH';
    document.getElementById('cf-error').classList.add('d-none');
    document.getElementById('cf-info').innerHTML =
      `${open.length} installment(s) are still open (about <strong>${formatCurrency(Math.round(avgTotal))}</strong> each). ` +
      'Repay the full principal to close the loan, or a smaller amount to continue with a revised installment schedule.';
    refreshCloseForm();
  }

  function readCloseForm() {
    const num = id => {
      const v = parseFloat(document.getElementById(id).value);
      return isNaN(v) ? 0 : v;
    };
    const outstanding = cfCtx.outstanding;
    const principalPay = num('cf-principal-pay');
    return {
      outstanding,
      principalPay,
      partial: principalPay > 0 && principalPay < outstanding,
      full: principalPay === outstanding,
      remaining: outstanding - principalPay,
      newN: Math.floor(num('cf-new-n')),
      newAmt: num('cf-new-amt'),
      firstDue: document.getElementById('cf-first-due').value,
    };
  }

  function buildNewSchedule(f) {
    const rows = [];
    if (!(f.newN >= 1) || !(f.newAmt >= 1) || !f.firstDue || f.remaining <= 0) return rows;
    const base = Math.floor(f.remaining / f.newN);
    for (let k = 1; k <= f.newN; k++) {
      const p = k < f.newN ? base : f.remaining - base * (f.newN - 1);
      rows.push({
        number: k,
        due: toIso(addPeriod(f.firstDue, selectedLoan.installment_type, k - 1)),
        principal: p,
        interest: f.newAmt - p,
        total: f.newAmt,
      });
    }
    return rows;
  }

  function refreshCloseForm() {
    if (!cfCtx) return;
    const f = readCloseForm();
    const valid = f.principalPay > 0 && f.principalPay <= f.outstanding;
    document.getElementById('cf-total').textContent = formatCurrency(valid ? f.principalPay : 0);

    document.getElementById('cf-reschedule').classList.toggle('d-none', !f.partial);
    const submitBtn = document.getElementById('pm-close-submit-btn');
    if (f.partial) {
      document.getElementById('cf-remaining').textContent = formatCurrency(f.remaining);
      if (!cfNewNTouched) document.getElementById('cf-new-n').value = cfCtx.openCount;
      if (!cfNewAmtTouched) {
        document.getElementById('cf-new-amt').value = Math.round(cfCtx.avgTotal * f.remaining / f.outstanding);
      }
      const g = readCloseForm();
      const rows = buildNewSchedule(g);
      document.getElementById('cf-preview').innerHTML = rows.length
        ? rows.map(r => `<tr><td>${r.number}</td><td>${formatDate(r.due)}</td><td>${formatCurrency(r.principal)}</td><td>${formatCurrency(r.interest)}</td><td><strong>${formatCurrency(r.total)}</strong></td></tr>`).join('')
        : '<tr><td colspan="5" class="text-center" style="color:var(--text-secondary);">Enter the installment details</td></tr>';
      const last = rows.length ? rows[rows.length - 1] : null;
      const totalInterest = rows.reduce((sum, r) => sum + r.interest, 0);
      document.getElementById('cf-new-hint').textContent = rows.length
        ? `${rows.length} installment(s) of ${formatCurrency(g.newAmt)} each = ${formatCurrency(g.newAmt * rows.length)} total, including ${formatCurrency(totalInterest)} interest. The last installment's principal absorbs rounding.`
        : '';
      if (last && last.interest < 0) {
        document.getElementById('cf-new-hint').textContent =
          `Amount per installment is too low: it must cover at least ${formatCurrency(last.principal)} of principal.`;
      }
      submitBtn.className = 'btn btn-primary';
      submitBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Record Part-Payment';
    } else {
      submitBtn.className = 'btn btn-danger';
      submitBtn.innerHTML = '<i class="bi bi-lock me-2"></i>Record &amp; Close Loan';
    }
  }

  function submitClosure() {
    const errEl = document.getElementById('cf-error');
    errEl.classList.add('d-none');
    const fail = msg => { errEl.textContent = msg; errEl.classList.remove('d-none'); };
    const f = readCloseForm();
    const date = document.getElementById('cf-date').value;

    if (!Number.isInteger(f.principalPay) || f.principalPay < 1) return fail('Principal repayment must be a whole number of at least 1.');
    if (f.principalPay > f.outstanding) return fail(`Principal repayment cannot exceed the outstanding principal (${formatCurrency(f.outstanding)}).`);
    if (!date) return fail('Payment date is required.');

    const payload = {
      loan_id: selectedLoan.loan_id,
      principal_amount: f.principalPay,
      amount: f.principalPay,
      payment_mode: document.getElementById('cf-mode').value,
      remarks: document.getElementById('cf-remarks').value.trim(),
      transaction_date: date,
    };

    if (f.partial) {
      if (!Number.isInteger(f.newN) || f.newN < 1) return fail('Enter the number of remaining installments (at least 1).');
      if (!Number.isInteger(f.newAmt) || f.newAmt < 1) return fail('Amount per installment must be a whole number of at least 1.');
      if (!f.firstDue) return fail('First due date is required.');
      const rows = buildNewSchedule(f);
      if (rows.some(r => r.interest < 0)) {
        return fail(`Amount per installment is too low: it must cover at least ${formatCurrency(rows[rows.length - 1].principal)} of principal.`);
      }
      payload.new_num_installments = f.newN;
      payload.new_installment_amount = f.newAmt;
      payload.first_due_date = f.firstDue;
      payload.schedule = rows;
      payload.remaining_principal = f.remaining;
      openCloseConfirm(payload, 'PART_PAY');
    } else {
      openCloseConfirm(payload, 'FORECLOSE');
    }
  }

  // ---------------------------------------------------------------------------
  // Interest-only helpers (vatti): outstanding principal, collection type, close flow
  // ---------------------------------------------------------------------------
  function isPrincipalTxn(txn) {
    return (txn.remarks || '').startsWith('Principal repayment');
  }

  function ioOutstanding() {
    const l = selectedLoan;
    const v = l.balance_amount !== null && l.balance_amount !== undefined ? l.balance_amount : l.disbursement_amount;
    return Math.round(parseFloat(v) || 0);
  }

  function ioInterestCollected() {
    return ioTransactions.filter(x => !isPrincipalTxn(x)).reduce((sum, x) => sum + (parseFloat(x.amount) || 0), 0);
  }

  function refreshIOForm() {
    if (!selectedLoan || selectedLoan.loan_type !== 'INTEREST_ONLY') return;
    const isPrincipal = document.getElementById('pm-collect-type').value === 'PRINCIPAL';
    const amtEl = document.getElementById('pm-amount');
    const outstanding = ioOutstanding();
    const amount = parseFloat(amtEl.value) || 0;
    const closing = isPrincipal && amount > 0 && amount === outstanding;
    const partial = isPrincipal && amount > 0 && amount < outstanding;

    document.getElementById('pm-amount-label').innerHTML =
      `${isPrincipal ? 'Principal Amount' : t('pay.amount')} <span class="text-danger">*</span>`;
    amtEl.step = isPrincipal ? '1' : '0.01';
    amtEl.min = isPrincipal ? '1' : '0.01';
    amtEl.max = isPrincipal ? String(outstanding) : '';

    document.getElementById('pm-selected-inst').innerHTML = isPrincipal
      ? `<i class="bi bi-cash-coin text-success me-2"></i>Collect principal &nbsp;·&nbsp; Outstanding principal: <strong>${formatCurrency(outstanding)}</strong>`
      : `<i class="bi bi-cash-coin text-success me-2"></i>Collect interest payment &nbsp;·&nbsp; Amount per collection: <strong>${formatCurrency(selectedLoan.installment_amount)}</strong>`;

    document.getElementById('pm-principal-box').classList.toggle('d-none', !isPrincipal);
    if (isPrincipal) {
      document.getElementById('pm-principal-info').innerHTML = amount > 0 && amount <= outstanding
        ? `Remaining principal after this payment: <strong>${formatCurrency(outstanding - amount)}</strong>`
        : `Enter the principal amount being repaid (up to <strong>${formatCurrency(outstanding)}</strong>).`;
      document.getElementById('pm-interest-update').classList.toggle('d-none', !partial);
      document.getElementById('pm-close-note').classList.toggle('d-none', !closing);
      if (partial) {
        const oldInterest = parseFloat(selectedLoan.installment_amount) || 0;
        const suggested = Math.max(1, Math.round(oldInterest * (outstanding - amount) / outstanding));
        const newEl = document.getElementById('pm-new-interest');
        if (!newInterestTouched) newEl.value = suggested;
        document.getElementById('pm-new-interest-hint').textContent =
          `Current: ${formatCurrency(oldInterest)} per collection. Suggested for the remaining principal: ${formatCurrency(suggested)}. You can change it.`;
      }
    }

    const btn = document.getElementById('pm-submit-btn');
    btn.className = `btn ${closing ? 'btn-danger' : 'btn-success'}`;
    document.getElementById('pm-submit-txt').innerHTML = closing
      ? '<i class="bi bi-lock me-2"></i>Record &amp; Close Loan'
      : '<i class="bi bi-check-circle me-2"></i>Record Payment';
  }

  function injectCloseLoanModal() {
    if (document.getElementById('close-loan-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="close-loan-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fw-600" style="font-size:16px;">
                <i class="bi bi-lock-fill me-2 text-danger" id="cl-icon"></i><span id="cl-title">Confirm Loan Closure</span>
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="cl-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <p style="font-size:13px;margin-bottom:10px;" id="cl-intro">Please review the details. Once closed, no more payments can be recorded on this loan.</p>
              <table class="table table-sm mb-0" style="font-size:13px;"><tbody id="cl-details"></tbody></table>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Back</button>
              <button type="button" class="btn btn-danger" id="cl-confirm-btn">
                <span id="cl-confirm-txt"><i class="bi bi-lock me-1"></i>Confirm &amp; Close Loan</span>
                <span id="cl-confirm-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Closing...</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    const modalEl = document.getElementById('close-loan-modal');
    modalEl.style.zIndex = 1070;
    modalEl.addEventListener('shown.bs.modal', () => {
      const backs = document.querySelectorAll('.modal-backdrop');
      if (backs.length) backs[backs.length - 1].style.zIndex = 1065;
    });
    closeLoanModal = new bootstrap.Modal(modalEl);
    document.getElementById('cl-confirm-btn').addEventListener('click', confirmCloseLoan);
  }

  function openCloseConfirm(payload, kind) {
    const l = selectedLoan;
    pendingClosePayload = payload;
    pendingCloseKind = kind || 'IO_PRINCIPAL';
    const modeLabels = { CASH: t('pay.cash'), UPI: t('pay.upi'), BANK_TRANSFER: t('pay.bank'), CHEQUE: t('pay.cheque') };
    const row = (label, value) => `<tr><td style="color:var(--text-secondary);width:48%;">${label}</td><td class="fw-600">${value}</td></tr>`;
    const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const openCount = installments.filter(i => ['PENDING', 'PARTIAL'].includes(i.status)).length;
    const common = [
      row('Customer', esc(selectedCustomer ? selectedCustomer.name : '—')),
      row('Loan Type', `Principal with Interest · ${esc(l.installment_type || '')}`),
      row('Loan Amount', formatCurrency(l.disbursement_amount)),
      row('Disbursed On', l.disbursement_date ? formatDate(l.disbursement_date) : '—'),
      row('Collected So Far', formatCurrency(l.total_paid || 0)),
    ];
    const tail = [
      row('Payment Mode', esc(modeLabels[payload.payment_mode] || payload.payment_mode)),
      row('Payment Date', formatDate(payload.transaction_date)),
      payload.remarks ? row('Remarks', esc(payload.remarks)) : '',
    ];
    let rows;
    const isPart = pendingCloseKind === 'PART_PAY';
    if (isPart) {
      const first = payload.schedule[0];
      rows = common.concat([
        row('Outstanding Principal', formatCurrency(payload.principal_amount + payload.remaining_principal)),
        row('Principal Repaid Now', `<span style="color:#16a34a;">${formatCurrency(payload.principal_amount)}</span>`),
        row('Remaining Principal', `<span style="color:#DC2626;">${formatCurrency(payload.remaining_principal)}</span>`),
        row('Open Installments Replaced', openCount),
        row('Revised Schedule', `${payload.schedule.length} × ${formatCurrency(first.total)}`),
        row('First Due Date', formatDate(payload.first_due_date)),
      ], tail);
    } else if (pendingCloseKind === 'FORECLOSE') {
      rows = common.concat([
        row('Open Installments', `${openCount} (will be closed)`),
        row('Closure Amount (Principal)', `<span style="color:#DC2626;">${formatCurrency(payload.principal_amount)}</span>`),
        row('Balance After Closure', formatCurrency(0)),
      ], tail);
    } else {
      rows = [
        row('Customer', esc(selectedCustomer ? selectedCustomer.name : '—')),
        row('Loan Type', `Vatti (Interest Only) · ${esc(l.installment_type || '')}`),
        row('Loan Amount', formatCurrency(l.disbursement_amount)),
        row('Disbursed On', l.disbursement_date ? formatDate(l.disbursement_date) : '—'),
        row('Interest Collected So Far', formatCurrency(ioInterestCollected())),
        row('Principal Being Repaid', `<span style="color:#DC2626;">${formatCurrency(payload.amount)}</span>`),
        row('Balance After Closure', formatCurrency(0)),
      ].concat(tail);
    }
    document.getElementById('cl-title').textContent = isPart ? 'Confirm Part-Payment' : 'Confirm Loan Closure';
    document.getElementById('cl-icon').className = isPart ? 'bi bi-cash-coin me-2 text-primary' : 'bi bi-lock-fill me-2 text-danger';
    document.getElementById('cl-intro').textContent = isPart
      ? 'Please review the details. The open installments will be replaced by the revised schedule below.'
      : 'Please review the details. Once closed, no more payments can be recorded on this loan.';
    const confirmBtn = document.getElementById('cl-confirm-btn');
    confirmBtn.className = `btn ${isPart ? 'btn-primary' : 'btn-danger'}`;
    document.getElementById('cl-confirm-txt').innerHTML = isPart
      ? '<i class="bi bi-check-circle me-1"></i>Confirm Part-Payment'
      : '<i class="bi bi-lock me-1"></i>Confirm &amp; Close Loan';
    document.getElementById('cl-details').innerHTML = rows.join('');
    document.getElementById('cl-error').classList.add('d-none');
    document.getElementById('cl-confirm-btn').disabled = false;
    document.getElementById('cl-confirm-txt').classList.remove('d-none');
    document.getElementById('cl-confirm-load').classList.add('d-none');
    closeLoanModal.show();
  }

  async function confirmCloseLoan() {
    if (!pendingClosePayload) return;
    const btn = document.getElementById('cl-confirm-btn');
    const errEl = document.getElementById('cl-error');
    errEl.classList.add('d-none');
    btn.disabled = true;
    document.getElementById('cl-confirm-txt').classList.add('d-none');
    document.getElementById('cl-confirm-load').classList.remove('d-none');
    try {
      const kind = pendingCloseKind;
      const url = kind === 'IO_PRINCIPAL' ? '/api/payments/collect' : '/api/payments/principal-payment';
      await api.post(url, Object.assign({}, pendingClosePayload, { confirm_close: true }));
      pendingClosePayload = null;
      closeLoanModal.hide();
      paymentModal.hide();
      showToast(kind === 'PART_PAY' ? 'Part-payment recorded and schedule updated!' : 'Loan closed successfully!', 'success');
      if (selectedCustomer) await loadLoans(selectedCustomer.customer_id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('cl-confirm-txt').classList.remove('d-none');
      document.getElementById('cl-confirm-load').classList.add('d-none');
    }
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

      const listEl = document.getElementById('loans-list');
      const addLoanBtn = document.getElementById('add-loan-btn');
      const roleId = (auth.getUser() || {}).role_id;
      const canExport = roleId === 1 || roleId === 2; // ADMIN or MANAGER
      const canEditLoan = [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF].includes(roleId);

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
              <div>
                <div class="fw-600" style="font-size:13px;">${l.installment_type} ${l.loan_type === 'INTEREST_ONLY' ? '· Interest Only' : l.num_installments ? '· ' + l.num_installments + ' installments' : ''}</div>
                ${l.loan_type === 'INTEREST_ONLY' ? '<span class="badge" style="font-size:10px;background:#FEF3C7;color:#92400E;border:1px solid #FCD34D;">Interest Only</span>' : ''}
              </div>
              ${statusBadge(l.status)}
            </div>
            <div class="row g-1 mb-3" style="font-size:12.5px;">
              <div class="col-6"><span style="color:var(--text-secondary);">Loan Amount:</span> ${formatCurrency(l.disbursement_amount)}</div>
              <div class="col-6"><span style="color:var(--text-secondary);">Outstanding:</span>
                <span class="fw-600 text-danger">${formatCurrency(l.balance_amount !== null && l.balance_amount !== undefined ? l.balance_amount : (l.loan_type === 'INTEREST_ONLY' ? l.disbursement_amount : 0))}</span>
              </div>
              <div class="col-6"><span style="color:var(--text-secondary);">${l.loan_type === 'INTEREST_ONLY' ? 'Interest/Coll:' : 'Installment:'}</span> <span class="fw-600">${formatCurrency(l.installment_amount)}</span></div>
              <div class="col-6"><span style="color:var(--text-secondary);">${t('pay.type')}:</span> ${l.installment_type}</div>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-success flex-fill" onclick="selectLoan('${l.loan_id}')">
                <i class="bi bi-cash-coin me-2"></i>${t('pay.collect')}
              </button>
              ${canEditLoan ? `
              <button type="button" class="btn btn-outline-primary" title="Edit loan" onclick="openEditLoanModal('${l.loan_id}')">
                <i class="bi bi-pencil"></i>
              </button>` : ''}
              ${canExport ? `
              <button type="button" class="btn btn-outline-success" title="Export Excel" onclick="exportLoanCard('${l.loan_id}','excel')">
                <i class="bi bi-file-earmark-excel"></i>
              </button>
              <button type="button" class="btn btn-outline-danger" title="Export PDF" onclick="exportLoanCard('${l.loan_id}','pdf')">
                <i class="bi bi-file-earmark-pdf"></i>
              </button>` : ''}
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
      ioTransactions = loanData.transactions || [];
      // Merge full API data (has total_paid, balance_amount, etc.) onto selected
      selectedLoan = Object.assign({}, selectedLoan, loanData);
      delete selectedLoan.installments;
      delete selectedLoan.transactions;
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
    const isIO = l.loan_type === 'INTEREST_ONLY';

    closeMode = false;
    document.getElementById('pm-inst-section').classList.remove('d-none');
    document.getElementById('pm-close-form').classList.add('d-none');
    document.getElementById('pm-close-submit-btn').classList.add('d-none');
    const canForeclose = !isIO && (auth.getUser() || {}).role_id !== ROLES.COLLECTOR;
    const forecloseBtn = document.getElementById('pm-foreclose-btn');
    forecloseBtn.classList.toggle('d-none', !canForeclose);
    forecloseBtn.innerHTML = '<i class="bi bi-lock me-1"></i>Close / Part-Pay';

    // Header
    document.getElementById('pm-title').textContent = t('pay.collect');
    document.getElementById('pm-subtitle').textContent = isIO
      ? `${selectedCustomer ? selectedCustomer.name + ' · ' : ''}${l.installment_type} · Interest Only · ${formatCurrency(l.installment_amount)} / collection`
      : `${selectedCustomer ? selectedCustomer.name + ' · ' : ''}${l.installment_type} · ${l.num_installments} installments · ${formatCurrency(l.installment_amount)} each`;

    // Loan summary mini-cards
    document.getElementById('pm-loan-summary').innerHTML = `
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center loan-stat-neutral">
          <div class="fw-600" style="font-size:15px;">${formatCurrency(l.disbursement_amount)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">Loan Amount</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center loan-stat-green">
          <div class="fw-600" style="font-size:15px;color:#16a34a;">${formatCurrency(isIO ? ioInterestCollected() : (l.total_paid || 0))}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${isIO ? 'Interest Collected' : 'Total Collected'}</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center balance-stat-box">
          <div class="fw-600" style="font-size:15px;color:#DC2626;">${formatCurrency(isIO ? ioOutstanding() : (l.balance_amount || 0))}</div>
          <div style="font-size:11px;color:var(--text-secondary);">Outstanding Principal</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="p-2 rounded text-center loan-stat-neutral">
          ${statusBadge(l.status)}
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${t('common.status')}</div>
        </div>
      </div>`;

    if (isIO) {
      // Interest-only: show payment history + always-visible collect form
      document.getElementById('pm-inst-heading').innerHTML =
        '<i class="bi bi-clock-history me-1 text-primary"></i>Payment History';
      document.getElementById('pm-inst-thead').innerHTML = `
        <tr><th>Date</th><th>Amount</th><th>Mode</th><th>Remarks</th></tr>`;
      const tbody = document.getElementById('pm-inst-tbody');
      if (!ioTransactions.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty"><i class="bi bi-inbox"></i>No payments yet</td></tr>`;
      } else {
        tbody.innerHTML = ioTransactions.map(txn => `
          <tr>
            <td>${formatDate(txn.transaction_date)}</td>
            <td><strong>${formatCurrency(txn.amount)}</strong>${isPrincipalTxn(txn) ? ' <span class="badge" style="font-size:10px;background:#DBEAFE;color:#1D4ED8;">Principal</span>' : ''}</td>
            <td><span class="badge bg-secondary" style="font-size:10px;">${txn.payment_mode || ''}</span></td>
            <td style="font-size:12px;color:var(--text-secondary);">${txn.remarks || '—'}</td>
          </tr>`).join('');
      }

      // Auto-show the payment form
      document.getElementById('pm-io-type-wrap').classList.remove('d-none');
      document.getElementById('pm-collect-type').value = 'INTEREST';
      newInterestTouched = false;
      document.getElementById('pm-payment-form').classList.remove('d-none');
      document.getElementById('pm-submit-btn').classList.remove('d-none');
      document.getElementById('pm-error').classList.add('d-none');
      document.getElementById('pm-amount').value = parseFloat(l.installment_amount || 0).toFixed(2);
      document.getElementById('pm-remarks').value = '';
      document.getElementById('pm-date').value = new Date().toISOString().split('T')[0];
      refreshIOForm();
    } else {
      // Regular loan: installment selection table
      document.getElementById('pm-inst-heading').innerHTML =
        '<i class="bi bi-list-check me-1 text-primary"></i>Select an Installment';
      document.getElementById('pm-inst-thead').innerHTML = `
        <tr>
          <th>#</th><th>Due Date</th><th>Total</th>
          <th>Paid</th><th>${t('pay.balance')}</th><th>${t('common.status')}</th><th></th>
        </tr>`;
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
              : inst.paid_date
                ? `<span style="font-size:11px;color:var(--text-secondary);"><i class="bi bi-check-circle-fill text-success me-1"></i>${formatDate(inst.paid_date)}</span>`
                : ''}</td>
          </tr>`;
        }).join('');
      }

      // Reset payment form
      document.getElementById('pm-io-type-wrap').classList.add('d-none');
      document.getElementById('pm-principal-box').classList.add('d-none');
      document.getElementById('pm-amount-label').innerHTML = `${t('pay.amount')} <span class="text-danger">*</span>`;
      document.getElementById('pm-amount').step = '0.01';
      document.getElementById('pm-amount').min = '0.01';
      document.getElementById('pm-amount').max = '';
      document.getElementById('pm-submit-btn').className = 'btn btn-success d-none';
      document.getElementById('pm-submit-txt').innerHTML = '<i class="bi bi-check-circle me-2"></i>Record Payment';
      document.getElementById('pm-payment-form').classList.add('d-none');
      document.getElementById('pm-submit-btn').classList.add('d-none');
      document.getElementById('pm-error').classList.add('d-none');
      document.getElementById('pm-amount').value = '';
      document.getElementById('pm-remarks').value = '';
      document.getElementById('pm-date').value = new Date().toISOString().split('T')[0];

      // Auto-select first pending installment if only one unpaid
      if (payable.length === 1) {
        const idx = installments.indexOf(payable[0]);
        if (idx !== -1) setTimeout(() => pmSelectInstallment(idx), 150);
      }
    }

    paymentModal.show();
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

    const isIO = selectedLoan && selectedLoan.loan_type === 'INTEREST_ONLY';
    if (!isIO && !selectedInstallment) {
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

    const payload = {
      loan_id: selectedLoan.loan_id,
      amount,
      payment_mode: mode,
      remarks,
      transaction_date: date,
    };
    if (!isIO && selectedInstallment) {
      payload.installment_id = selectedInstallment.installment_id;
    }

    const isPrincipal = isIO && document.getElementById('pm-collect-type').value === 'PRINCIPAL';
    if (isPrincipal) {
      const outstanding = ioOutstanding();
      if (!Number.isInteger(amount)) {
        errEl.textContent = 'Principal amount must be a whole number.';
        errEl.classList.remove('d-none');
        return;
      }
      if (amount > outstanding) {
        errEl.textContent = `Principal amount cannot exceed the outstanding principal (${formatCurrency(outstanding)}).`;
        errEl.classList.remove('d-none');
        return;
      }
      payload.collection_type = 'PRINCIPAL';
      if (amount === outstanding) {
        openCloseConfirm(payload);
        return;
      }
      const newInterest = parseFloat(document.getElementById('pm-new-interest').value);
      if (newInterest > 0) payload.new_interest_amount = newInterest;
    }

    const btn = document.getElementById('pm-submit-btn');
    btn.disabled = true;
    document.getElementById('pm-submit-txt').classList.add('d-none');
    document.getElementById('pm-submit-load').classList.remove('d-none');

    try {
      await api.post('/api/payments/collect', payload);
      paymentModal.hide();
      showToast('Payment recorded successfully!', 'success');
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
                <div class="col-12">
                  <label class="form-label">${t('onboard.loan_type')} <span class="text-danger">*</span></label>
                  <select class="form-select" id="al-loan-type">
                    <option value="PRINCIPAL_INTEREST">${t('onboard.lt_pi')}</option>
                    <option value="INTEREST_ONLY">${t('onboard.lt_io')}</option>
                  </select>
                </div>
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
                <div class="col-md-6" id="al-num-inst-wrap">
                  <label class="form-label">${t('pay.num_inst')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="al-num-inst" placeholder="e.g. 12" min="1" step="1">
                </div>
                <div class="col-md-6">
                  <label class="form-label" id="al-coll-label">${t('pay.coll_amount')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="al-collection" placeholder="e.g. 1000" min="1" step="1">
                </div>
                <div class="col-12" id="al-io-note" style="display:none;">
                  <div class="alert alert-warning mb-0 py-2" style="font-size:12px;">
                    <i class="bi bi-info-circle me-1"></i>${t('onboard.io_note')}
                  </div>
                </div>
                <div class="col-12" id="al-summary" style="display:none;">
                  <div class="loan-summary-box" style="display:flex;flex-wrap:wrap;text-align:center;border-radius:8px;overflow:hidden;">
                    <div style="flex:1;min-width:120px;padding:10px 8px;">
                      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;" id="al-summary-label1">${t('pay.total_recover')}</div>
                      <div id="al-total" style="font-size:15px;font-weight:700;color:#1D4ED8;">₹ 0</div>
                    </div>
                    <div style="width:1px;background:#BFDBFE;align-self:stretch;flex-shrink:0;"></div>
                    <div style="flex:1;min-width:120px;padding:10px 8px;">
                      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;" id="al-summary-label2">${t('pay.interest_earned')}</div>
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

    function alIsIO() {
      return document.getElementById('al-loan-type').value === 'INTEREST_ONLY';
    }

    function applyAlLoanType() {
      const isIO = alIsIO();
      document.getElementById('al-num-inst-wrap').style.display = isIO ? 'none' : '';
      document.getElementById('al-io-note').style.display = isIO ? 'block' : 'none';
      document.getElementById('al-coll-label').innerHTML = isIO
        ? `${t('onboard.interest_per_inst')} <span class="text-danger">*</span>`
        : `${t('pay.coll_amount')} <span class="text-danger">*</span>`;
      document.getElementById('al-summary-label1').textContent = isIO ? t('onboard.interest_per_inst') : t('pay.total_recover');
      document.getElementById('al-summary-label2').textContent = isIO ? t('onboard.principal_to_recover') : t('pay.interest_earned');
      updateSummary();
    }

    function updateSummary() {
      const isIO = alIsIO();
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

      if (isIO) {
        if (amount > 0 && col > 0) {
          document.getElementById('al-total').textContent    = formatCurrency(col);
          document.getElementById('al-interest').textContent = formatCurrency(amount);
          summaryEl.style.display = 'block';
        } else {
          summaryEl.style.display = 'none';
        }
      } else {
        if (amount > 0 && n > 0 && col > 0) {
          const alTotal    = Math.round(col * n * 100) / 100;
          const alInterest = Math.round((alTotal - amount) * 100) / 100;
          document.getElementById('al-total').textContent    = formatCurrency(alTotal);
          document.getElementById('al-interest').textContent = formatCurrency(alInterest);
          summaryEl.style.display = 'block';
        } else {
          summaryEl.style.display = 'none';
        }
      }
    }

    document.getElementById('al-loan-type').addEventListener('change', applyAlLoanType);
    ['al-amount', 'al-num-inst', 'al-collection'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateSummary);
    });
  }

  // ---------------------------------------------------------------------------
  // Edit loan modal
  // ---------------------------------------------------------------------------
  let editLoanModal = null;
  let editLoanData = null;
  let editLoanLocks = null;

  function injectEditLoanModal() {
    if (document.getElementById('edit-loan-modal')) return;
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="modal fade" id="edit-loan-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title fw-600" style="font-size:16px;">
                <i class="bi bi-pencil-square me-2 text-primary"></i>Edit Loan
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <div id="el-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <div id="el-note" class="alert alert-info d-none" style="font-size:13px;"></div>
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label">${t('onboard.loan_type')}</label>
                  <select class="form-select" id="el-type">
                    <option value="PRINCIPAL_INTEREST">${t('onboard.lt_pi')}</option>
                    <option value="INTEREST_ONLY">${t('onboard.lt_io')}</option>
                  </select>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.loan_amount')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="el-amount" min="1" step="1">
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.inst_type')} <span class="text-danger">*</span></label>
                  <select class="form-select" id="el-itype">
                    <option value="WEEKLY">${t('pay.weekly')}</option>
                    <option value="DAILY">${t('pay.daily')}</option>
                    <option value="MONTHLY">${t('pay.monthly')}</option>
                  </select>
                </div>
                <div class="col-md-6" id="el-n-wrap">
                  <label class="form-label">${t('pay.num_inst')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="el-n" min="1" step="1">
                </div>
                <div class="col-md-6" id="el-coll-wrap">
                  <label class="form-label" id="el-coll-label">${t('pay.coll_amount')} <span class="text-danger">*</span></label>
                  <input type="number" class="form-control" id="el-coll" min="1" step="1">
                </div>
                <div class="col-12 d-none" id="el-legacy-wrap">
                  <div class="row g-3">
                    <div class="col-md-4">
                      <label class="form-label">Interest Type</label>
                      <select class="form-select" id="el-int-type">
                        <option value="FLAT">Flat</option>
                        <option value="REDUCING">Reducing</option>
                      </select>
                    </div>
                    <div class="col-md-4">
                      <label class="form-label">Interest Rate (% p.a.)</label>
                      <input type="number" class="form-control" id="el-rate" min="0" step="0.01">
                    </div>
                    <div class="col-md-4">
                      <label class="form-label">Processing Fee</label>
                      <input type="number" class="form-control" id="el-fee" min="0" step="1">
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.disb_date')}</label>
                  <input type="date" class="form-control" id="el-date">
                </div>
                <div class="col-md-6">
                  <label class="form-label">${t('pay.remarks')}</label>
                  <input type="text" class="form-control" id="el-remarks" maxlength="100" placeholder="Optional">
                </div>
                <div class="col-12 d-none" id="el-summary">
                  <div class="p-2 rounded text-center loan-stat-neutral" style="font-size:13px;" id="el-summary-text"></div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${t('common.cancel')}</button>
              <button type="button" class="btn btn-primary" id="el-save-btn">
                <span id="el-save-txt"><i class="bi bi-check-lg me-1"></i>${t('common.save')}</span>
                <span id="el-save-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('common.saving')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el.firstElementChild);
    editLoanModal = new bootstrap.Modal(document.getElementById('edit-loan-modal'));
    document.getElementById('el-save-btn').addEventListener('click', saveEditLoan);
    document.getElementById('el-type').addEventListener('change', applyEditLoanType);
    ['el-amount', 'el-n', 'el-coll'].forEach(id => document.getElementById(id).addEventListener('input', updateEditLoanSummary));
  }

  function elIsIO() {
    return document.getElementById('el-type').value === 'INTEREST_ONLY';
  }

  function elIsLegacy() {
    return !elIsIO() && !!(editLoanData && editLoanData.interest_type);
  }

  function applyEditLoanType() {
    const isIO = elIsIO();
    const legacy = elIsLegacy();
    document.getElementById('el-n-wrap').classList.toggle('d-none', isIO);
    document.getElementById('el-coll-wrap').classList.toggle('d-none', legacy);
    document.getElementById('el-legacy-wrap').classList.toggle('d-none', !legacy);
    document.getElementById('el-coll-label').innerHTML = isIO
      ? `${t('onboard.interest_per_inst')} <span class="text-danger">*</span>`
      : `${t('pay.coll_amount')} <span class="text-danger">*</span>`;
    updateEditLoanSummary();
  }

  function updateEditLoanSummary() {
    const box = document.getElementById('el-summary');
    const textEl = document.getElementById('el-summary-text');
    const amount = parseFloat(document.getElementById('el-amount').value) || 0;
    const coll = parseFloat(document.getElementById('el-coll').value) || 0;
    const n = parseInt(document.getElementById('el-n').value) || 0;
    if (!elIsIO() && !elIsLegacy() && amount > 0 && coll > 0 && n > 0) {
      const total = coll * n;
      textEl.innerHTML = `Total to recover: <strong>${formatCurrency(total)}</strong> &nbsp;·&nbsp; Interest: <strong>${formatCurrency(total - amount)}</strong>`;
      box.classList.remove('d-none');
    } else {
      box.classList.add('d-none');
    }
  }

  window.openEditLoanModal = async function (loanId) {
    try {
      showLoading();
      const res = await api.get('/api/loans/' + loanId);
      editLoanData = res.data || {};
    } catch (err) {
      showToast('Failed to load loan: ' + err.message, 'danger');
      return;
    } finally {
      hideLoading();
    }
    injectEditLoanModal();
    const l = editLoanData;
    const wasIO = l.loan_type === 'INTEREST_ONLY';
    const payCount = l.payment_count || 0;
    const principalRepaid = wasIO && Math.round(parseFloat(l.balance_amount) || 0) !== Math.round(parseFloat(l.disbursement_amount) || 0);
    const piLocked = !wasIO && payCount > 0;
    editLoanLocks = {
      type: piLocked || (wasIO && payCount > 0),
      amount: piLocked || principalRepaid,
      terms: piLocked,
    };

    document.getElementById('el-type').value = l.loan_type || 'PRINCIPAL_INTEREST';
    document.getElementById('el-amount').value = Math.round(parseFloat(l.disbursement_amount) || 0);
    document.getElementById('el-itype').value = l.installment_type || 'WEEKLY';
    document.getElementById('el-n').value = wasIO ? '' : (l.num_installments || '');
    document.getElementById('el-coll').value = Math.round(parseFloat(l.installment_amount) || 0);
    document.getElementById('el-int-type').value = l.interest_type || 'FLAT';
    document.getElementById('el-rate').value = l.interest_rate != null ? parseFloat(l.interest_rate) : '';
    document.getElementById('el-fee').value = l.processing_fee != null ? parseFloat(l.processing_fee) : '';
    document.getElementById('el-date').value = l.disbursement_date ? String(l.disbursement_date).slice(0, 10) : '';
    document.getElementById('el-remarks').value = l.remarks || '';

    document.getElementById('el-type').disabled = editLoanLocks.type;
    document.getElementById('el-amount').disabled = editLoanLocks.amount;
    ['el-itype', 'el-n', 'el-coll', 'el-int-type', 'el-rate', 'el-fee', 'el-date'].forEach(id => {
      document.getElementById(id).disabled = editLoanLocks.terms;
    });

    const noteEl = document.getElementById('el-note');
    let note = '';
    if (piLocked) {
      note = 'This loan already has collections, so only the remarks can be edited. Use <strong>Close / Part-Pay</strong> in the collect-payment window to restructure the remaining installments.';
    } else if (wasIO) {
      if (payCount > 0) note += 'The loan type is locked because collections have been recorded. ';
      if (principalRepaid) note += 'The loan amount is locked because principal has been repaid. ';
      note += 'Changing the interest per collection or frequency applies to future collections.';
    } else {
      note = 'Changing the amount, installments, collection amount, frequency or date regenerates the whole installment schedule. The wallet rotation balance is adjusted for any change in loan amount.';
    }
    noteEl.innerHTML = '<i class="bi bi-info-circle me-1"></i>' + note;
    noteEl.classList.remove('d-none');

    document.getElementById('el-error').classList.add('d-none');
    document.getElementById('el-save-btn').disabled = false;
    document.getElementById('el-save-txt').classList.remove('d-none');
    document.getElementById('el-save-load').classList.add('d-none');
    applyEditLoanType();
    editLoanModal.show();
  };

  async function saveEditLoan() {
    const l = editLoanData;
    const errEl = document.getElementById('el-error');
    errEl.classList.add('d-none');
    const fail = msg => { errEl.textContent = msg; errEl.classList.remove('d-none'); };

    const isIO = elIsIO();
    const legacy = elIsLegacy();
    const amount = parseFloat(document.getElementById('el-amount').value);
    const n = parseInt(document.getElementById('el-n').value);
    const coll = parseFloat(document.getElementById('el-coll').value);
    const rate = parseFloat(document.getElementById('el-rate').value);

    const payload = { remarks: document.getElementById('el-remarks').value.trim() };
    let structural = false;
    if (!editLoanLocks.terms || !editLoanLocks.amount || !editLoanLocks.type) {
      if (!editLoanLocks.type) payload.loan_type = document.getElementById('el-type').value;
      if (!editLoanLocks.amount) {
        if (!(amount > 0)) return fail('Loan amount must be greater than zero.');
        payload.disbursement_amount = amount;
      }
      if (!editLoanLocks.terms) {
        const date = document.getElementById('el-date').value;
        if (!date) return fail('Disbursement date is required.');
        payload.installment_type = document.getElementById('el-itype').value;
        payload.disbursement_date = date;
        if (isIO) {
          if (!(coll > 0)) return fail('Interest per collection must be greater than zero.');
          payload.collection_amount = coll;
        } else if (legacy) {
          if (!(n >= 1)) return fail('Enter the number of installments.');
          if (isNaN(rate) || rate < 0) return fail('Enter a valid interest rate.');
          payload.num_installments = n;
          payload.interest_type = document.getElementById('el-int-type').value;
          payload.interest_rate = rate;
          payload.processing_fee = parseFloat(document.getElementById('el-fee').value) || 0;
        } else {
          if (!(n >= 1)) return fail('Enter the number of installments.');
          if (!(coll > 0)) return fail('Enter the collection amount.');
          if (coll * n < amount) return fail('Total collections (collection amount × installments) must be at least the loan amount.');
          payload.num_installments = n;
          payload.collection_amount = coll;
          payload.interest_type = '';
        }
      }
      structural =
        (payload.loan_type && payload.loan_type !== l.loan_type) ||
        (payload.disbursement_amount !== undefined && payload.disbursement_amount !== Math.round(parseFloat(l.disbursement_amount))) ||
        (payload.installment_type && payload.installment_type !== l.installment_type) ||
        (payload.disbursement_date && payload.disbursement_date !== String(l.disbursement_date).slice(0, 10)) ||
        (payload.num_installments !== undefined && payload.num_installments !== l.num_installments && !isIO) ||
        (payload.collection_amount !== undefined && payload.collection_amount !== Math.round(parseFloat(l.installment_amount)));
    }

    const isPIEdit = l.loan_type !== 'INTEREST_ONLY' || payload.loan_type === 'PRINCIPAL_INTEREST';
    if (structural && isPIEdit) {
      const ok = await confirmDialog('The installment schedule will be regenerated from the new values. Continue?');
      if (!ok) return;
    }

    const btn = document.getElementById('el-save-btn');
    btn.disabled = true;
    document.getElementById('el-save-txt').classList.add('d-none');
    document.getElementById('el-save-load').classList.remove('d-none');
    try {
      await api.patch('/api/loans/' + l.loan_id, payload);
      editLoanModal.hide();
      showToast('Loan updated successfully', 'success');
      if (selectedCustomer) await loadLoans(selectedCustomer.customer_id);
    } catch (err) {
      fail(err.message);
      btn.disabled = false;
      document.getElementById('el-save-txt').classList.remove('d-none');
      document.getElementById('el-save-load').classList.add('d-none');
    }
  }

  window.openAddLoanModal = async function () {
    injectAddLoanModal();
    const amtEl = document.getElementById('al-amount');
    document.getElementById('al-loan-type').value = 'PRINCIPAL_INTEREST';
    amtEl.value = '';
    amtEl.style.borderColor = '';
    amtEl._walletBalance = 0;
    document.getElementById('al-num-inst').value = '';
    document.getElementById('al-collection').value = '';
    document.getElementById('al-remarks').value = '';
    document.getElementById('al-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('al-summary').style.display = 'none';
    document.getElementById('al-num-inst-wrap').style.display = '';
    document.getElementById('al-io-note').style.display = 'none';
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

    const loanType = document.getElementById('al-loan-type').value;
    const isIO = loanType === 'INTEREST_ONLY';
    const amount = parseFloat(document.getElementById('al-amount').value) || 0;
    const numInst = parseInt(document.getElementById('al-num-inst').value) || 0;
    const colAmt = parseFloat(document.getElementById('al-collection').value) || 0;

    const walletBal = document.getElementById('al-amount')._walletBalance || 0;
    if (!selectedCustomer) { errEl.textContent = 'No customer selected.'; errEl.classList.remove('d-none'); return; }
    if (amount <= 0) { errEl.textContent = 'Enter a valid loan amount.'; errEl.classList.remove('d-none'); return; }
    if (amount > walletBal) { errEl.textContent = walletBal <= 0 ? 'Wallet is empty. Please top up the wallet before creating a loan.' : `Loan amount exceeds wallet balance (${formatCurrency(walletBal)}).`; errEl.classList.remove('d-none'); return; }
    if (!isIO && numInst < 1) { errEl.textContent = 'Enter number of installments.'; errEl.classList.remove('d-none'); return; }
    if (colAmt <= 0) { errEl.textContent = 'Enter a valid collection amount.'; errEl.classList.remove('d-none'); return; }
    if (!isIO && colAmt * numInst < amount) { errEl.textContent = 'Total collections must be ≥ loan amount.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('al-save-btn');
    btn.disabled = true;
    document.getElementById('al-save-txt').classList.add('d-none');
    document.getElementById('al-save-load').classList.remove('d-none');

    try {
      const payload = {
        customer_id: selectedCustomer.customer_id,
        loan_type: loanType,
        disbursement_amount: amount,
        installment_type: document.getElementById('al-inst-type').value,
        collection_amount: colAmt,
        disbursement_date: document.getElementById('al-date').value || null,
        remarks: document.getElementById('al-remarks').value.trim(),
      };
      if (!isIO) payload.num_installments = numInst;
      await api.post('/api/loans/', payload);
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
  function r2(v) { return Math.round((parseFloat(v) || 0) * 100) / 100; }

  function buildLoanSummaryRows() {
    const l = selectedLoan;
    const c = selectedCustomer;
    const totalPayable = l.total_payable || (r2(l.installment_amount) * parseInt(l.num_installments));
    return [
      ['Customer Name', c ? c.name : ''],
      ['Phone', c ? c.phone : ''],
      ['City', c ? (c.city || '') : ''],
      [],
      ['Loan ID', l.loan_id],
      ['Disbursed Amount', r2(l.disbursement_amount)],
      ['Installment Type', l.installment_type],
      ['No. of Installments', l.num_installments],
      ['Installment Amount', r2(l.installment_amount)],
      ['Total Payable', r2(totalPayable)],
      ['Total Paid', r2(l.total_paid)],
      ['Balance Amount', r2(l.balance_amount)],
      ['Status', l.status],
      ['Disbursement Date', l.disbursement_date || ''],
    ];
  }

  function buildInstallmentRows() {
    return installments.map(inst => {
      const balance = r2(inst.balance_amount) ||
        Math.round((r2(inst.total_amount) - r2(inst.paid_amount)) * 100) / 100;
      return [
        inst.installment_number,
        inst.due_date || '',
        r2(inst.total_amount),
        r2(inst.paid_amount),
        balance,
        inst.paid_date || '',
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
    XLSX.utils.sheet_add_aoa(ws, [['#', 'Due Date', 'Total Amount (₹)', 'Paid Amount (₹)', 'Balance (₹)', 'Paid Date', 'Status']], { origin: r++ });
    const instRows = buildInstallmentRows();
    XLSX.utils.sheet_add_aoa(ws, instRows, { origin: r });

    // Column widths
    ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Loan Details');

    const name = selectedCustomer.name.replace(/\s+/g, '_');
    XLSX.writeFile(wb, `Loan_${name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  window.exportLoanCard = async function (loanId, format) {
    try {
      showLoading();
      const res = await api.get('/api/loans/' + loanId);
      const loanData = res.data || {};
      const base = customerLoans.find(l => l.loan_id === loanId) || {};
      selectedLoan = Object.assign({}, base, loanData);
      delete selectedLoan.installments;
      installments = loanData.installments || [];
    } catch (err) {
      showToast('Failed to load loan: ' + err.message, 'danger');
      return;
    } finally {
      hideLoading();
    }
    if (format === 'excel') exportLoanExcel();
    else exportLoanPdf();
  };

  // PDF-safe currency: jsPDF default font has no Rupee glyph, use "Rs." instead
  function pdfAmt(val) {
    const n = Math.round((parseFloat(val) || 0) * 100) / 100;
    return 'Rs. ' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
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
        ['Loan ID', l.loan_id],
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
      row[5] ? String(row[5]) : '—',
      String(row[6]),
    ]);

    doc.autoTable({
      startY: y,
      head: [['#', 'Due Date', 'Total', 'Paid', 'Balance', 'Paid Date', 'Status']],
      body: instBodyRows,
      theme: 'grid',
      headStyles: {
        fillColor: [0, 51, 102], textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center',
      },
      bodyStyles: { fontSize: 8, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 24, halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 24, halign: 'center' },
        6: { cellWidth: 20, halign: 'center' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 6) {
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
  }

  init();
})();

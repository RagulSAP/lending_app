(function () {
  'use strict';

  let currentStep = 1;
  let collectors = [];
  let photoFile = null;
  let idProofFile = null;

  async function init() {
    await initPage('Onboard Customer', [1, 2, 3]);
    await loadCollectors();
    renderPage();
  }

  async function loadCollectors() {
    try {
      const res = await api.get('/api/users', { role_id: 4, status: 1, per_page: 100 });
      collectors = res.data || [];
    } catch (_) {
      collectors = [];
    }
  }

  function renderPage() {
    const collectorOptions = collectors.map(c => `<option value="${c.user_id}">${c.name} (${c.phone || ''})</option>`).join('');
    document.getElementById('page-content').innerHTML = `
      <div class="row justify-content-center">
        <div class="col-lg-8">
          <!-- Stepper -->
          <div class="stepper mb-4">
            <div class="step-item active" id="step-1-indicator">
              <div class="step-circle">1</div>
              <div class="step-label">${t('onboard.step1')}</div>
            </div>
            <div class="step-item" id="step-2-indicator">
              <div class="step-circle">2</div>
              <div class="step-label">${t('onboard.step2')}</div>
            </div>
          </div>

          <!-- Step 1 -->
          <div class="card" id="step-1-content">
            <div class="card-header-flex"><h6 class="card-title"><i class="bi bi-person me-2 text-primary"></i>${t('onboard.step1_title')}</h6></div>
            <div id="step1-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">${t('onboard.full_name')} <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="f-name" placeholder="Customer full name">
              </div>
              <div class="col-md-6">
                <label class="form-label">${t('onboard.phone')} <span class="text-danger">*</span></label>
                <input type="tel" class="form-control" id="f-phone" placeholder="10-digit phone" maxlength="10">
              </div>
              <div class="col-md-3">
                <label class="form-label">${t('onboard.pincode')}</label>
                <input type="text" class="form-control" id="f-pincode" placeholder="6-digit" maxlength="6">
                <span id="f-pincode-feedback" style="font-size:12px;"></span>
              </div>
              <div class="col-md-3">
                <label class="form-label">${t('onboard.area')}</label>
                <select class="form-select" id="f-area" disabled>
                  <option value="">Enter pincode first</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">${t('onboard.city')} <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="f-city" placeholder="City">
              </div>
              <div class="col-md-3">
                <label class="form-label">${t('onboard.state')}</label>
                <input type="text" class="form-control" id="f-state" placeholder="State">
              </div>
              <div class="col-12">
                <label class="form-label">${t('onboard.address')}</label>
                <textarea class="form-control" id="f-address" rows="2" placeholder="Full residential address"></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label">${t('onboard.aadhaar')}</label>
                <input type="text" class="form-control" id="f-aadhaar" placeholder="12-digit Aadhaar" maxlength="12">
              </div>
              <div class="col-md-6">
                <label class="form-label">${t('onboard.pan')}</label>
                <input type="text" class="form-control" id="f-pan" placeholder="10-char PAN" maxlength="10" style="text-transform:uppercase;">
              </div>
              <div class="col-md-12">
                <label class="form-label">${t('onboard.collector')}</label>
                <select class="form-select" id="f-collector">
                  <option value="">${t('onboard.optional_collector')}</option>
                  ${collectorOptions}
                </select>
              </div>
            </div>
            <div class="d-flex gap-2 mt-4">
              <a href="customers.html" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> ${t('onboard.cancel')}</a>
              <button type="button" class="btn btn-primary ms-auto" id="next-btn"><i class="bi bi-arrow-right me-1"></i>${t('onboard.next')}</button>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="card d-none" id="step-2-content">
            <div class="card-header-flex"><h6 class="card-title"><i class="bi bi-file-earmark-text me-2 text-primary"></i>${t('onboard.step2_title')}</h6></div>
            <div id="step2-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">${t('onboard.photo')} <span class="text-danger">*</span></label>
                <div class="file-upload-zone" id="photo-zone" onclick="document.getElementById('photo-input').click()">
                  <i class="bi bi-camera"></i>
                  <p>${t('onboard.click_photo')}<br><small>${t('onboard.file_hint')}</small></p>
                </div>
                <input type="file" id="photo-input" accept="image/jpeg,image/png,application/pdf" class="d-none">
                <div id="photo-preview" class="d-none"></div>
              </div>
              <div class="col-md-6">
                <div class="mb-3">
                  <label class="form-label">${t('onboard.id_type')} <span class="text-danger">*</span></label>
                  <select class="form-select" id="f-id-type">
                    <option value="">${t('onboard.id_select')}</option>
                    <option value="PAN">${t('onboard.id_pan')}</option>
                    <option value="AADHAAR">${t('onboard.id_aadhaar')}</option>
                    <option value="VOTER_ID">${t('onboard.id_voter')}</option>
                    <option value="PASSPORT">${t('onboard.id_passport')}</option>
                    <option value="DL">${t('onboard.id_driving')}</option>
                  </select>
                </div>
                <label class="form-label">${t('onboard.id_doc')} <span class="text-danger">*</span></label>
                <div class="file-upload-zone" id="id-zone" onclick="document.getElementById('id-input').click()">
                  <i class="bi bi-file-earmark-image"></i>
                  <p>${t('onboard.click_id')}<br><small>${t('onboard.file_hint')}</small></p>
                </div>
                <input type="file" id="id-input" accept="image/jpeg,image/png,application/pdf" class="d-none">
                <div id="id-preview" class="d-none"></div>
              </div>
            </div>

            <!-- Optional Loan Section -->
            <div class="mt-4">
              <button type="button" class="btn btn-outline-primary w-100" id="toggle-loan-btn" style="min-height:44px;">
                <i class="bi bi-plus-circle me-2"></i>${t('onboard.add_loan')}
              </button>
              <div id="loan-section" class="loan-info-box d-none mt-3 p-3">
                <h6 class="mb-3" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">${t('onboard.loan_section')}</h6>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">${t('onboard.loan_amount')} <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="l-amount" placeholder="e.g. 10000" min="1" step="1">
                    <span id="l-wallet-balance" style="font-size:12px;"></span>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">${t('onboard.inst_type')} <span class="text-danger">*</span></label>
                    <select class="form-select" id="l-inst-type">
                      <option value="WEEKLY">${t('pay.weekly')}</option>
                      <option value="DAILY">${t('pay.daily')}</option>
                      <option value="MONTHLY">${t('pay.monthly')}</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">${t('onboard.num_inst')} <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="l-num-inst" placeholder="e.g. 12" min="1" step="1">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">${t('onboard.coll_amount')} <span class="text-danger">*</span></label>
                    <input type="number" class="form-control" id="l-collection" placeholder="e.g. 1000" min="1" step="1">
                  </div>
                  <div class="col-12" id="l-summary" style="display:none;">
                    <div class="loan-summary-box" style="display:flex;flex-wrap:wrap;text-align:center;border-radius:8px;overflow:hidden;">
                      <div style="flex:1;min-width:120px;padding:10px 8px;">
                        <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('onboard.total_recover')}</div>
                        <div id="l-total" style="font-size:15px;font-weight:700;color:#1D4ED8;">&#8377; 0</div>
                      </div>
                      <div style="width:1px;background:#BFDBFE;align-self:stretch;flex-shrink:0;"></div>
                      <div style="flex:1;min-width:120px;padding:10px 8px;">
                        <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px;">${t('onboard.interest_earned')}</div>
                        <div id="l-interest" style="font-size:15px;font-weight:700;color:#16A34A;">&#8377; 0</div>
                      </div>
                      <div style="flex:1 0 100%;padding:8px 10px;border-top:1px solid #BFDBFE;">
                        <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">${t('onboard.disb_date')}</div>
                        <input type="date" class="form-control text-center" id="l-date">
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <label class="form-label">Remarks</label>
                    <input type="text" class="form-control" id="l-remarks" placeholder="Optional remarks">
                  </div>
                </div>
              </div>
            </div>

            <div class="d-flex gap-2 mt-4">
              <button type="button" class="btn btn-outline-secondary" id="back-btn"><i class="bi bi-arrow-left me-1"></i>${t('onboard.back')}</button>
              <button type="button" class="btn btn-primary ms-auto" id="submit-btn">
                <span id="submit-txt"><i class="bi bi-person-check me-1"></i>${t('onboard.submit')}</span>
                <span id="submit-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>${t('onboard.submitting')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    // Input masking / formatting events
    document.getElementById('f-phone').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    document.getElementById('f-aadhaar').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 12); });
    document.getElementById('f-pincode').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
      const fb = document.getElementById('f-pincode-feedback');
      if (fb) fb.textContent = '';
      if (this.value.length === 6) lookupPincode(this.value, 'f-city', 'f-state', 'f-pincode-feedback', 'f-area');
    });
    document.getElementById('f-pan').addEventListener('input', function () { this.value = this.value.toUpperCase().slice(0, 10); });

    // Navigation events
    document.getElementById('next-btn').addEventListener('click', goToStep2);
    document.getElementById('back-btn').addEventListener('click', goToStep1);
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);

    // File upload events
    document.getElementById('photo-input').addEventListener('change', function () { handleFileSelect(this, 'photo'); });
    document.getElementById('id-input').addEventListener('change', function () { handleFileSelect(this, 'id'); });

    // Loan toggle
    document.getElementById('toggle-loan-btn').addEventListener('click', async function () {
      const sec = document.getElementById('loan-section');
      const isHidden = sec.classList.contains('d-none');
      sec.classList.toggle('d-none');
      this.innerHTML = isHidden
        ? `<i class="bi bi-dash-circle me-2"></i>${t('onboard.remove_loan')}`
        : `<i class="bi bi-plus-circle me-2"></i>${t('onboard.add_loan')}`;
      if (isHidden) {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('l-date').value = today;
        // Show wallet balance
        let balance = 0;
        try {
          const wres = await api.get('/api/wallet');
          balance = (wres.data && wres.data.wallet) ? parseFloat(wres.data.wallet.rotation_balance || 0) : 0;
        } catch (_) {}
        const balEl = document.getElementById('l-wallet-balance');
        if (balEl) {
          balEl.textContent = `${t('pay.wallet_bal')}: ${formatCurrency(balance)}`;
          balEl.style.color = balance > 0 ? '#16A34A' : '#DC2626';
        }
        document.getElementById('l-amount')._walletBalance = balance;
      }
    });

    // Live loan summary calculation
    function updateLoanSummary() {
      const amtEl = document.getElementById('l-amount');
      const amount = parseFloat(amtEl.value) || 0;
      const n = parseInt(document.getElementById('l-num-inst').value) || 0;
      const col = parseFloat(document.getElementById('l-collection').value) || 0;
      const summary = document.getElementById('l-summary');

      // Wallet balance check
      const walletBal = amtEl._walletBalance || 0;
      const balEl = document.getElementById('l-wallet-balance');
      if (balEl) {
        if (walletBal <= 0) {
          balEl.style.color = '#DC2626';
          balEl.textContent = `${t('pay.wallet_bal')}: ₹ 0.00 — ${t('pay.wallet_empty')}`;
          amtEl.style.borderColor = amount > 0 ? '#DC2626' : '';
        } else if (amount > walletBal) {
          balEl.style.color = '#DC2626';
          balEl.textContent = `${t('pay.wallet_bal')}: ${formatCurrency(walletBal)} — ${t('pay.wallet_exceed')}`;
          amtEl.style.borderColor = '#DC2626';
        } else {
          balEl.style.color = '#16A34A';
          balEl.textContent = `${t('pay.wallet_bal')}: ${formatCurrency(walletBal)}`;
          amtEl.style.borderColor = '';
        }
      }

      if (amount > 0 && n > 0 && col > 0) {
        const total = col * n;
        const interest = total - amount;
        document.getElementById('l-total').textContent = '₹ ' + total.toLocaleString('en-IN');
        document.getElementById('l-interest').textContent = '₹ ' + interest.toLocaleString('en-IN');
        summary.style.display = 'block';
      } else {
        summary.style.display = 'none';
      }
    }
    ['l-amount', 'l-num-inst', 'l-collection'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateLoanSummary);
    });
  }

  function handleFileSelect(input, type) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size must be less than 5MB', 'danger');
      input.value = '';
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      showToast('Only JPG, PNG or PDF files allowed', 'danger');
      input.value = '';
      return;
    }

    if (type === 'photo') { photoFile = file; } else { idProofFile = file; }

    const zoneEl = document.getElementById(type === 'photo' ? 'photo-zone' : 'id-zone');
    const previewEl = document.getElementById(type === 'photo' ? 'photo-preview' : 'id-preview');
    const sizeKB = (file.size / 1024).toFixed(1);
    const changeBtnHtml = `<button type="button" class="btn btn-sm btn-outline-secondary mt-2" onclick="clearFile('${type}')"><i class="bi bi-arrow-repeat me-1"></i>${t('onboard.change')}</button>`;

    if (file.type === 'application/pdf') {
      previewEl.innerHTML = `
        <div class="file-img-preview">
          <i class="bi bi-file-earmark-pdf" style="font-size:52px;color:#DC2626;"></i>
          <div class="file-img-name">${file.name}</div>
          <div class="file-img-size">${sizeKB} KB · PDF</div>
          ${changeBtnHtml}
        </div>`;
      zoneEl.classList.add('d-none');
      previewEl.classList.remove('d-none');
    } else {
      const reader = new FileReader();
      reader.onload = function (e) {
        previewEl.innerHTML = `
          <div class="file-img-preview">
            <img src="${e.target.result}" alt="Preview">
            <div class="file-img-name">${file.name}</div>
            <div class="file-img-size">${sizeKB} KB</div>
            ${changeBtnHtml}
          </div>`;
        zoneEl.classList.add('d-none');
        previewEl.classList.remove('d-none');
      };
      reader.readAsDataURL(file);
    }
  }

  window.clearFile = function (type) {
    const inputId = type === 'photo' ? 'photo-input' : 'id-input';
    const zoneId  = type === 'photo' ? 'photo-zone'  : 'id-zone';
    const prevId  = type === 'photo' ? 'photo-preview' : 'id-preview';
    if (type === 'photo') { photoFile = null; } else { idProofFile = null; }
    document.getElementById(inputId).value = '';
    document.getElementById(prevId).classList.add('d-none');
    document.getElementById(prevId).innerHTML = '';
    document.getElementById(zoneId).classList.remove('d-none');
  };

  function goToStep1() {
    currentStep = 1;
    document.getElementById('step-1-content').classList.remove('d-none');
    document.getElementById('step-2-content').classList.add('d-none');
    document.getElementById('step-1-indicator').classList.add('active');
    document.getElementById('step-1-indicator').classList.remove('completed');
    document.getElementById('step-1-indicator').querySelector('.step-circle').textContent = '1';
    document.getElementById('step-2-indicator').classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showStep1Error(msg) {
    const errEl = document.getElementById('step1-error');
    errEl.textContent = msg;
    errEl.classList.remove('d-none');
    errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function goToStep2() {
    const errEl = document.getElementById('step1-error');
    errEl.classList.add('d-none');
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const city = document.getElementById('f-city').value.trim();
    const aadhaar = document.getElementById('f-aadhaar').value.trim();
    const pincode = document.getElementById('f-pincode').value.trim();
    const pan = document.getElementById('f-pan').value.trim();

    if (!name) { showStep1Error('Full name is required.'); return; }
    if (!/^\d{10}$/.test(phone)) { showStep1Error('Phone must be exactly 10 digits.'); return; }
    if (!city) { showStep1Error('City is required.'); return; }
    if (aadhaar && !/^\d{12}$/.test(aadhaar)) { showStep1Error('Aadhaar must be exactly 12 digits.'); return; }
    if (pincode && !/^\d{6}$/.test(pincode)) { showStep1Error('Pincode must be exactly 6 digits.'); return; }
    if (pan && pan.length !== 10) { showStep1Error('PAN must be exactly 10 characters.'); return; }

    currentStep = 2;
    document.getElementById('step-1-content').classList.add('d-none');
    document.getElementById('step-2-content').classList.remove('d-none');
    document.getElementById('step-1-indicator').classList.remove('active');
    document.getElementById('step-1-indicator').classList.add('completed');
    document.getElementById('step-1-indicator').querySelector('.step-circle').innerHTML = '<i class="bi bi-check-lg"></i>';
    document.getElementById('step-2-indicator').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit() {
    const errEl = document.getElementById('step2-error');
    errEl.classList.add('d-none');
    const idType = document.getElementById('f-id-type').value;

    if (!photoFile) { errEl.textContent = 'Please upload customer photo.'; errEl.classList.remove('d-none'); return; }
    if (!idType) { errEl.textContent = 'Please select ID proof type.'; errEl.classList.remove('d-none'); return; }
    if (!idProofFile) { errEl.textContent = 'Please upload ID proof document.'; errEl.classList.remove('d-none'); return; }

    // Pre-validate wallet before creating customer + loan
    const loanSectionEl = document.getElementById('loan-section');
    if (!loanSectionEl.classList.contains('d-none')) {
      const lAmtEl = document.getElementById('l-amount');
      const lAmount = parseFloat(lAmtEl.value) || 0;
      const lWalletBal = lAmtEl._walletBalance || 0;
      if (lAmount > 0 && lAmount > lWalletBal) {
        errEl.textContent = lWalletBal <= 0
          ? 'Wallet is empty. Please top up the wallet before assigning a loan.'
          : `Loan amount exceeds wallet balance (${formatCurrency(lWalletBal)}).`;
        errEl.classList.remove('d-none');
        return;
      }
    }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    document.getElementById('submit-txt').classList.add('d-none');
    document.getElementById('submit-load').classList.remove('d-none');

    try {
      const fd = new FormData();
      fd.append('name', document.getElementById('f-name').value.trim());
      fd.append('phone', document.getElementById('f-phone').value.trim());
      fd.append('pincode', document.getElementById('f-pincode').value.trim());
      fd.append('area', document.getElementById('f-area').value.trim());
      fd.append('city', document.getElementById('f-city').value.trim());
      fd.append('state', document.getElementById('f-state').value.trim());
      fd.append('address', document.getElementById('f-address').value.trim());
      fd.append('aadhaar_number', document.getElementById('f-aadhaar').value.trim());
      fd.append('pan_number', document.getElementById('f-pan').value.trim());
      fd.append('id_proof_type', idType);
      const assignedTo = document.getElementById('f-collector').value;
      if (assignedTo) fd.append('assigned_user_id', assignedTo);
      fd.append('photo', photoFile);
      fd.append('id_proof', idProofFile);

      const res = await api.postForm('/api/customers', fd);
      const customerId = (res.data || {}).customer_id;

      // Optional loan creation
      const loanSection = document.getElementById('loan-section');
      if (!loanSection.classList.contains('d-none') && customerId) {
        const amtEl = document.getElementById('l-amount');
        const amount = parseFloat(amtEl.value) || 0;
        const numInst = parseInt(document.getElementById('l-num-inst').value) || 0;
        const colAmt = parseFloat(document.getElementById('l-collection').value) || 0;
        const walletBal = amtEl._walletBalance || 0;
        if (amount > walletBal) {
          errEl.textContent = `Loan amount exceeds wallet balance (${formatCurrency(walletBal)}).`;
          errEl.classList.remove('d-none');
          btn.disabled = false;
          document.getElementById('submit-txt').classList.remove('d-none');
          document.getElementById('submit-load').classList.add('d-none');
          return;
        }
        if (amount > 0 && numInst > 0 && colAmt > 0) {
          try {
            await api.post('/api/loans/', {
              customer_id: customerId,
              disbursement_amount: amount,
              installment_type: document.getElementById('l-inst-type').value,
              num_installments: numInst,
              collection_amount: colAmt,
              disbursement_date: document.getElementById('l-date').value || null,
              remarks: document.getElementById('l-remarks').value.trim()
            });
          } catch (le) {
            showToast('Customer created but loan setup failed: ' + le.message, 'warning');
          }
        }
      }

      showToast(t('onboard.success'), 'success');
      setTimeout(() => { window.location.href = 'customers.html'; }, 1200);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
      btn.disabled = false;
      document.getElementById('submit-txt').classList.remove('d-none');
      document.getElementById('submit-load').classList.add('d-none');
    }
  }

  init();
})();

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
      <div class="page-header">
        <h1>Onboard Customer</h1>
        <p>Register a new customer and optionally create their first loan</p>
      </div>
      <div class="row justify-content-center">
        <div class="col-lg-8">
          <!-- Stepper -->
          <div class="stepper mb-4">
            <div class="step-item active" id="step-1-indicator">
              <div class="step-circle">1</div>
              <div class="step-label">Personal Details</div>
            </div>
            <div class="step-item" id="step-2-indicator">
              <div class="step-circle">2</div>
              <div class="step-label">KYC Documents</div>
            </div>
          </div>

          <!-- Step 1 -->
          <div class="card" id="step-1-content">
            <div class="card-header-flex"><h6 class="card-title"><i class="bi bi-person me-2 text-primary"></i>Personal Details</h6></div>
            <div id="step1-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Full Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="f-name" placeholder="Customer full name">
              </div>
              <div class="col-md-6">
                <label class="form-label">Phone Number <span class="text-danger">*</span></label>
                <input type="tel" class="form-control" id="f-phone" placeholder="10-digit phone" maxlength="10">
              </div>
              <div class="col-12">
                <label class="form-label">Address</label>
                <textarea class="form-control" id="f-address" rows="2" placeholder="Full residential address"></textarea>
              </div>
              <div class="col-md-4">
                <label class="form-label">City <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="f-city" placeholder="City">
              </div>
              <div class="col-md-4">
                <label class="form-label">State</label>
                <input type="text" class="form-control" id="f-state" placeholder="State">
              </div>
              <div class="col-md-4">
                <label class="form-label">Pincode</label>
                <input type="text" class="form-control" id="f-pincode" placeholder="6-digit pincode" maxlength="6">
              </div>
              <div class="col-md-6">
                <label class="form-label">Aadhaar Number</label>
                <input type="text" class="form-control" id="f-aadhaar" placeholder="12-digit Aadhaar" maxlength="12">
              </div>
              <div class="col-md-6">
                <label class="form-label">PAN Number</label>
                <input type="text" class="form-control" id="f-pan" placeholder="10-char PAN" maxlength="10" style="text-transform:uppercase;">
              </div>
              <div class="col-md-12">
                <label class="form-label">Assigned Collector</label>
                <select class="form-select" id="f-collector">
                  <option value="">Select collector (optional)</option>
                  ${collectorOptions}
                </select>
              </div>
            </div>
            <div class="d-flex gap-2 mt-4">
              <a href="customers.html" class="btn btn-outline-secondary"><i class="bi bi-arrow-left"></i> Cancel</a>
              <button type="button" class="btn btn-primary ms-auto" id="next-btn"><i class="bi bi-arrow-right me-1"></i>Next: KYC Documents</button>
            </div>
          </div>

          <!-- Step 2 -->
          <div class="card d-none" id="step-2-content">
            <div class="card-header-flex"><h6 class="card-title"><i class="bi bi-file-earmark-text me-2 text-primary"></i>KYC Documents</h6></div>
            <div id="step2-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">Customer Photo <span class="text-danger">*</span></label>
                <div class="file-upload-zone" id="photo-zone" onclick="document.getElementById('photo-input').click()">
                  <i class="bi bi-camera"></i>
                  <p>Click to upload photo<br><small>JPG, PNG or PDF, max 5MB</small></p>
                </div>
                <input type="file" id="photo-input" accept="image/jpeg,image/png,application/pdf" class="d-none">
                <div id="photo-preview" class="d-none file-preview">
                  <i class="bi bi-file-earmark-image text-primary" style="font-size:20px;"></i>
                  <span id="photo-name"></span>
                  <button type="button" class="btn btn-sm btn-outline-danger ms-auto" onclick="clearFile('photo')"><i class="bi bi-x"></i></button>
                </div>
              </div>
              <div class="col-md-6">
                <div class="mb-3">
                  <label class="form-label">ID Proof Type <span class="text-danger">*</span></label>
                  <select class="form-select" id="f-id-type">
                    <option value="">Select type</option>
                    <option value="PAN">PAN Card</option>
                    <option value="AADHAAR">Aadhaar Card</option>
                    <option value="VOTER_ID">Voter ID</option>
                    <option value="PASSPORT">Passport</option>
                    <option value="DL">Driving License</option>
                  </select>
                </div>
                <label class="form-label">ID Proof Document <span class="text-danger">*</span></label>
                <div class="file-upload-zone" id="id-zone" onclick="document.getElementById('id-input').click()">
                  <i class="bi bi-file-earmark-image"></i>
                  <p>Click to upload ID proof<br><small>JPG, PNG or PDF, max 5MB</small></p>
                </div>
                <input type="file" id="id-input" accept="image/jpeg,image/png,application/pdf" class="d-none">
                <div id="id-preview" class="d-none file-preview">
                  <i class="bi bi-file-earmark-image text-primary" style="font-size:20px;"></i>
                  <span id="id-name"></span>
                  <button type="button" class="btn btn-sm btn-outline-danger ms-auto" onclick="clearFile('id')"><i class="bi bi-x"></i></button>
                </div>
              </div>
            </div>

            <!-- Optional Loan Section -->
            <div class="mt-4">
              <button type="button" class="btn btn-outline-primary w-100" id="toggle-loan-btn" style="min-height:44px;">
                <i class="bi bi-plus-circle me-2"></i>Add Loan Details (Optional)
              </button>
              <div id="loan-section" class="d-none mt-3 p-3" style="background:#F8FAFC;border-radius:10px;border:1px solid #E2E8F0;">
                <h6 class="mb-3" style="font-size:13px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.5px;">Loan Details</h6>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">Disbursement Amount (&#8377;)</label>
                    <input type="number" class="form-control" id="l-amount" placeholder="0.00" min="0" step="0.01">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Interest Type</label>
                    <select class="form-select" id="l-int-type">
                      <option value="FLAT">Flat</option>
                      <option value="REDUCING">Reducing</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Interest Rate (% p.a.)</label>
                    <input type="number" class="form-control" id="l-rate" placeholder="e.g. 12" min="0" step="0.01">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Processing Fee (&#8377;)</label>
                    <input type="number" class="form-control" id="l-fee" placeholder="0.00" min="0" step="0.01">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Disbursement Date</label>
                    <input type="date" class="form-control" id="l-date">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Installment Type</label>
                    <select class="form-select" id="l-inst-type">
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Number of Installments</label>
                    <input type="number" class="form-control" id="l-num-inst" placeholder="e.g. 12" min="1">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Remarks</label>
                    <input type="text" class="form-control" id="l-remarks" placeholder="Optional remarks">
                  </div>
                </div>
              </div>
            </div>

            <div class="d-flex gap-2 mt-4">
              <button type="button" class="btn btn-outline-secondary" id="back-btn"><i class="bi bi-arrow-left me-1"></i>Back</button>
              <button type="button" class="btn btn-primary ms-auto" id="submit-btn">
                <span id="submit-txt"><i class="bi bi-person-check me-1"></i>Submit</span>
                <span id="submit-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Submitting...</span>
              </button>
            </div>
          </div>
        </div>
      </div>`;

    // Input masking / formatting events
    document.getElementById('f-phone').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
    document.getElementById('f-aadhaar').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 12); });
    document.getElementById('f-pincode').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
    document.getElementById('f-pan').addEventListener('input', function () { this.value = this.value.toUpperCase().slice(0, 10); });

    // Navigation events
    document.getElementById('next-btn').addEventListener('click', goToStep2);
    document.getElementById('back-btn').addEventListener('click', goToStep1);
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);

    // File upload events
    document.getElementById('photo-input').addEventListener('change', function () { handleFileSelect(this, 'photo'); });
    document.getElementById('id-input').addEventListener('change', function () { handleFileSelect(this, 'id'); });

    // Loan toggle
    document.getElementById('toggle-loan-btn').addEventListener('click', function () {
      const sec = document.getElementById('loan-section');
      const isHidden = sec.classList.contains('d-none');
      sec.classList.toggle('d-none');
      this.innerHTML = isHidden
        ? '<i class="bi bi-dash-circle me-2"></i>Remove Loan Details'
        : '<i class="bi bi-plus-circle me-2"></i>Add Loan Details (Optional)';
      if (isHidden) {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('l-date').value = today;
      }
    });
  }

  function handleFileSelect(input, type) {
    const file = input.files[0];
    if (!file) return;
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
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
    if (type === 'photo') {
      photoFile = file;
      document.getElementById('photo-name').textContent = file.name;
      document.getElementById('photo-preview').classList.remove('d-none');
    } else {
      idProofFile = file;
      document.getElementById('id-name').textContent = file.name;
      document.getElementById('id-preview').classList.remove('d-none');
    }
  }

  window.clearFile = function (type) {
    if (type === 'photo') {
      photoFile = null;
      document.getElementById('photo-input').value = '';
      document.getElementById('photo-preview').classList.add('d-none');
    } else {
      idProofFile = null;
      document.getElementById('id-input').value = '';
      document.getElementById('id-preview').classList.add('d-none');
    }
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

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    document.getElementById('submit-txt').classList.add('d-none');
    document.getElementById('submit-load').classList.remove('d-none');

    try {
      const fd = new FormData();
      fd.append('name', document.getElementById('f-name').value.trim());
      fd.append('phone', document.getElementById('f-phone').value.trim());
      fd.append('address', document.getElementById('f-address').value.trim());
      fd.append('city', document.getElementById('f-city').value.trim());
      fd.append('state', document.getElementById('f-state').value.trim());
      fd.append('pincode', document.getElementById('f-pincode').value.trim());
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
        const amount = document.getElementById('l-amount').value;
        if (amount && parseFloat(amount) > 0) {
          try {
            await api.post('/api/loans', {
              customer_id: customerId,
              disbursement_amount: parseFloat(amount),
              interest_type: document.getElementById('l-int-type').value,
              interest_rate: parseFloat(document.getElementById('l-rate').value) || 0,
              processing_fee: parseFloat(document.getElementById('l-fee').value) || 0,
              disbursement_date: document.getElementById('l-date').value,
              installment_type: document.getElementById('l-inst-type').value,
              num_installments: parseInt(document.getElementById('l-num-inst').value) || 1,
              remarks: document.getElementById('l-remarks').value.trim()
            });
          } catch (le) {
            showToast('Customer created but loan setup failed: ' + le.message, 'warning');
          }
        }
      }

      showToast('Customer onboarded successfully!', 'success');
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

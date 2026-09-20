(function () {
  'use strict';

  async function init() {
    await initPage('Onboard User', [1]);
    renderForm();
  }

  function renderForm() {
    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h1>Onboard New User</h1>
        <p>Create a new staff account for your organization</p>
      </div>
      <div class="row justify-content-center">
        <div class="col-lg-6">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-person-plus me-2 text-primary"></i>New User Details</h6>
            </div>
            <div id="form-error" class="alert alert-danger d-none" style="font-size:13px;"></div>
            <form id="onboard-form" novalidate>
              <div class="mb-3">
                <label class="form-label">Full Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="f-name" placeholder="Enter full name" required>
              </div>
              <div class="mb-3">
                <label class="form-label">Phone Number <span class="text-danger">*</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-phone"></i></span>
                  <input type="tel" class="form-control" id="f-phone" placeholder="10-digit phone" maxlength="10" required>
                </div>
                <div class="form-text">This will be used as login credential</div>
              </div>
              <div class="mb-3">
                <label class="form-label">Role <span class="text-danger">*</span></label>
                <select class="form-select" id="f-role" required>
                  <option value="">Select a role...</option>
                  <option value="1">Admin</option>
                  <option value="2">Manager</option>
                  <option value="3">Staff</option>
                  <option value="4">Collector</option>
                  <option value="5">Accountant</option>
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">Password <span class="text-danger">*</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-lock"></i></span>
                  <input type="password" class="form-control" id="f-pass" placeholder="Min 6 characters" required>
                  <button class="btn btn-outline-secondary" type="button" id="toggle-pass"><i class="bi bi-eye" id="eye-icon"></i></button>
                </div>
              </div>
              <div class="mb-4">
                <label class="form-label">Confirm Password <span class="text-danger">*</span></label>
                <div class="input-group">
                  <span class="input-group-text"><i class="bi bi-lock-fill"></i></span>
                  <input type="password" class="form-control" id="f-pass2" placeholder="Repeat password" required>
                </div>
              </div>
              <div class="d-flex gap-2">
                <a href="users.html" class="btn btn-outline-secondary flex-fill"><i class="bi bi-arrow-left"></i> Back</a>
                <button type="submit" class="btn btn-primary flex-fill" id="submit-btn">
                  <span id="submit-txt"><i class="bi bi-person-check me-1"></i>Create User</span>
                  <span id="submit-load" class="d-none"><span class="spinner-border spinner-border-sm me-2"></span>Creating...</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>`;

    document.getElementById('f-phone').addEventListener('input', function() { this.value = this.value.replace(/\D/g,'').slice(0,10); });
    document.getElementById('toggle-pass').addEventListener('click', function() {
      const inp = document.getElementById('f-pass');
      const icon = document.getElementById('eye-icon');
      if (inp.type === 'password') { inp.type = 'text'; icon.className = 'bi bi-eye-slash'; }
      else { inp.type = 'password'; icon.className = 'bi bi-eye'; }
    });
    document.getElementById('onboard-form').addEventListener('submit', handleSubmit);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const role_id = parseInt(document.getElementById('f-role').value);
    const password = document.getElementById('f-pass').value;
    const pass2 = document.getElementById('f-pass2').value;
    const errEl = document.getElementById('form-error');
    errEl.classList.add('d-none');

    if (!name) { errEl.textContent = 'Name is required.'; errEl.classList.remove('d-none'); return; }
    if (!/^\d{10}$/.test(phone)) { errEl.textContent = 'Phone must be exactly 10 digits.'; errEl.classList.remove('d-none'); return; }
    if (!role_id) { errEl.textContent = 'Please select a role.'; errEl.classList.remove('d-none'); return; }
    if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('d-none'); return; }
    if (password !== pass2) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    document.getElementById('submit-txt').classList.add('d-none');
    document.getElementById('submit-load').classList.remove('d-none');

    try {
      await api.post('/api/users', { name, phone, password, role_id });
      showToast('User created successfully!', 'success');
      setTimeout(() => { window.location.href = 'users.html'; }, 1200);
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

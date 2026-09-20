// LendTrack Expenses Page
(function () {
  'use strict';

  let currentPage = 1;
  const perPage = 20;
  let totalPages = 1;
  let categories = [];
  let currentUser = null;

  async function init() {
    await initPage('Expenses', [1, 2, 3, 5]);
    currentUser = auth.getUser();
    await loadCategories();
    renderPage();
    await loadExpenses();
  }

  async function loadCategories() {
    try {
      const res = await api.get('/api/expenses/categories');
      categories = res.data || [];
    } catch (_) {
      categories = [];
    }
  }

  function getCategoryOptions(selectedId) {
    if (!categories.length) return '<option value="">No categories — add one first</option>';
    return '<option value="">Select category...</option>' +
      categories.map(c => `<option value="${c.category_id}"${selectedId == c.category_id ? ' selected' : ''}>${c.name}</option>`).join('');
  }

  function renderPage() {
    const canManageCategory = [ROLES.ADMIN, ROLES.MANAGER].includes(currentUser.role_id);
    const today = new Date().toISOString().split('T')[0];
    const d = new Date();
    const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];

    document.getElementById('page-content').innerHTML = `
      <div class="page-header d-flex align-items-start justify-content-between flex-wrap gap-3">
        <div>
          <h1>Expenses</h1>
          <p>Track and manage organizational expenses</p>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          ${canManageCategory ? '<button class="btn btn-outline-primary" id="add-cat-btn"><i class="bi bi-tags me-1"></i>Add Category</button>' : ''}
          <button class="btn btn-primary" id="add-exp-btn"><i class="bi bi-plus-lg me-1"></i>Add Expense</button>
        </div>
      </div>

      <div class="filter-bar">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="f-cat">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${c.category_id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date From</label>
          <input type="date" class="form-control" id="f-from" value="${firstOfMonth}">
        </div>
        <div class="form-group">
          <label class="form-label">Date To</label>
          <input type="date" class="form-control" id="f-to" value="${today}">
        </div>
        <div class="form-group d-flex align-items-end">
          <button class="btn btn-primary" id="search-btn"><i class="bi bi-search me-1"></i>Search</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title">Expense Records</h6>
          <div class="d-flex gap-3 align-items-center flex-wrap">
            <span id="total-badge" class="fw-600 text-danger" style="font-size:14px;"></span>
            <span id="count-badge" class="badge bg-light text-dark" style="font-size:12px;"></span>
          </div>
        </div>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Entered By</th>
                <th>Remark</th>
              </tr>
            </thead>
            <tbody id="exp-tbody"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-center mt-3 mb-2" id="pagination-wrap"></div>
      </div>

      <!-- Add Expense Modal -->
      <div class="modal fade" id="addExpModal" tabindex="-1" aria-labelledby="addExpLabel">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title fw-600" id="addExpLabel">
                <i class="bi bi-receipt me-2 text-primary"></i>Add Expense
              </h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="exp-err" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <div class="mb-3">
                <label class="form-label">Category <span class="text-danger">*</span></label>
                <select class="form-select" id="e-cat">${getCategoryOptions()}</select>
                ${canManageCategory && !categories.length ? '<div class="form-text mt-1"><i class="bi bi-info-circle me-1"></i>No categories yet. Add a category first using the "Add Category" button.</div>' : ''}
              </div>
              <div class="mb-3">
                <label class="form-label">Amount (₹) <span class="text-danger">*</span></label>
                <div class="input-group">
                  <span class="input-group-text">₹</span>
                  <input type="number" class="form-control" id="e-amount" min="0.01" step="0.01" placeholder="0.00">
                </div>
              </div>
              <div class="mb-3">
                <label class="form-label">Remark</label>
                <input type="text" class="form-control" id="e-remark" placeholder="Optional description or notes">
              </div>
              <div class="mb-0">
                <label class="form-label">Date <span class="text-danger">*</span></label>
                <input type="date" class="form-control" id="e-date" value="${today}">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="save-exp-btn">
                <span id="save-exp-txt"><i class="bi bi-save me-1"></i>Save Expense</span>
                <span id="save-exp-load" class="d-none">
                  <span class="spinner-border spinner-border-sm me-2" role="status"></span>Saving...
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      ${canManageCategory ? `
      <!-- Add Category Modal -->
      <div class="modal fade" id="addCatModal" tabindex="-1" aria-labelledby="addCatLabel">
        <div class="modal-dialog modal-sm modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h6 class="modal-title fw-600" id="addCatLabel">
                <i class="bi bi-tags me-2 text-primary"></i>Add Category
              </h6>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <div id="cat-err" class="alert alert-danger d-none" style="font-size:13px;"></div>
              <div class="mb-3">
                <label class="form-label">Category Name <span class="text-danger">*</span></label>
                <input type="text" class="form-control" id="cat-name" placeholder="e.g. Office Supplies">
              </div>
              <div class="mb-0">
                <label class="form-label">Description</label>
                <input type="text" class="form-control" id="cat-desc" placeholder="Optional description">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-primary" id="save-cat-btn">
                <i class="bi bi-plus-lg me-1"></i>Add Category
              </button>
            </div>
          </div>
        </div>
      </div>` : ''}`;

    // Events
    document.getElementById('add-exp-btn').addEventListener('click', () => {
      document.getElementById('exp-err').classList.add('d-none');
      new bootstrap.Modal(document.getElementById('addExpModal')).show();
    });
    document.getElementById('save-exp-btn').addEventListener('click', saveExpense);
    document.getElementById('search-btn').addEventListener('click', () => { currentPage = 1; loadExpenses(); });

    if (canManageCategory) {
      document.getElementById('add-cat-btn').addEventListener('click', () => {
        document.getElementById('cat-err').classList.add('d-none');
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-desc').value = '';
        new bootstrap.Modal(document.getElementById('addCatModal')).show();
      });
      document.getElementById('save-cat-btn').addEventListener('click', saveCategory);
    }
  }

  async function loadExpenses() {
    const category_id = document.getElementById('f-cat').value;
    const date_from = document.getElementById('f-from').value;
    const date_to = document.getElementById('f-to').value;
    try {
      showLoading();
      const res = await api.get('/api/expenses', { category_id, date_from, date_to, page: currentPage, per_page: perPage });
      const expenses = res.data || [];
      const pagination = res.pagination || {};
      totalPages = pagination.total_pages || 1;
      const total = pagination.total || expenses.length;
      const totalAmt = pagination.total_amount || expenses.reduce((s, e) => s + parseFloat(e.expense_amount || 0), 0);

      const countBadge = document.getElementById('count-badge');
      const totalBadge = document.getElementById('total-badge');
      if (countBadge) countBadge.textContent = total + ' record' + (total !== 1 ? 's' : '');
      if (totalBadge) totalBadge.textContent = total > 0 ? 'Total: ' + formatCurrency(totalAmt) : '';

      const tbody = document.getElementById('exp-tbody');
      const offset = (currentPage - 1) * perPage;

      if (!expenses.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><i class="bi bi-receipt"></i>No expenses found for selected filters</td></tr>';
      } else {
        tbody.innerHTML = expenses.map((e, i) => `
          <tr>
            <td>${offset + i + 1}</td>
            <td>${formatDate(e.expense_date || e.created_at)}</td>
            <td>${e.category_name || '-'}</td>
            <td class="fw-600 text-danger">${formatCurrency(e.expense_amount)}</td>
            <td>${e.entered_by || e.user_name || '-'}</td>
            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(e.expense_remark || e.remark || '').replace(/"/g, '&quot;')}">${e.expense_remark || e.remark || '-'}</td>
          </tr>`).join('');
      }
      renderPagination();
    } catch (err) {
      document.getElementById('exp-tbody').innerHTML = `<tr><td colspan="6" class="table-empty"><i class="bi bi-exclamation-circle"></i>${err.message}</td></tr>`;
      showToast('Failed to load expenses: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  async function saveExpense() {
    const category_id = document.getElementById('e-cat').value;
    const expense_amount = parseFloat(document.getElementById('e-amount').value);
    const expense_remark = document.getElementById('e-remark').value.trim();
    const expense_date = document.getElementById('e-date').value;
    const errEl = document.getElementById('exp-err');
    errEl.classList.add('d-none');

    if (!category_id) { errEl.textContent = 'Please select a category.'; errEl.classList.remove('d-none'); return; }
    if (!expense_amount || expense_amount <= 0) { errEl.textContent = 'Please enter a valid amount greater than 0.'; errEl.classList.remove('d-none'); return; }
    if (!expense_date) { errEl.textContent = 'Date is required.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('save-exp-btn');
    btn.disabled = true;
    document.getElementById('save-exp-txt').classList.add('d-none');
    document.getElementById('save-exp-load').classList.remove('d-none');

    try {
      await api.post('/api/expenses', { category_id, expense_amount, expense_remark, expense_date });
      bootstrap.Modal.getInstance(document.getElementById('addExpModal')).hide();
      showToast('Expense added successfully!', 'success');
      document.getElementById('e-cat').value = '';
      document.getElementById('e-amount').value = '';
      document.getElementById('e-remark').value = '';
      await loadExpenses();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      document.getElementById('save-exp-txt').classList.remove('d-none');
      document.getElementById('save-exp-load').classList.add('d-none');
    }
  }

  async function saveCategory() {
    const name = document.getElementById('cat-name').value.trim();
    const description = document.getElementById('cat-desc').value.trim();
    const errEl = document.getElementById('cat-err');
    errEl.classList.add('d-none');

    if (!name) { errEl.textContent = 'Category name is required.'; errEl.classList.remove('d-none'); return; }

    const btn = document.getElementById('save-cat-btn');
    btn.disabled = true;

    try {
      await api.post('/api/expenses/categories', { name, description });
      bootstrap.Modal.getInstance(document.getElementById('addCatModal')).hide();
      showToast('Category "' + name + '" added!', 'success');
      document.getElementById('cat-name').value = '';
      document.getElementById('cat-desc').value = '';
      await loadCategories();
      // Refresh category selects
      document.getElementById('e-cat').innerHTML = getCategoryOptions();
      const fCat = document.getElementById('f-cat');
      fCat.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option value="${c.category_id}">${c.name}</option>`).join('');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('d-none');
    } finally {
      btn.disabled = false;
    }
  }

  function renderPagination() {
    const wrap = document.getElementById('pagination-wrap');
    if (!wrap || totalPages <= 1) { if (wrap) wrap.innerHTML = ''; return; }
    let html = '<nav><ul class="pagination mb-0">';
    html += `<li class="page-item${currentPage === 1 ? ' disabled' : ''}"><a class="page-link" href="#" onclick="expGoPage(${currentPage - 1});return false;">&#8249;</a></li>`;
    for (let p = Math.max(1, currentPage - 2); p <= Math.min(totalPages, currentPage + 2); p++) {
      html += `<li class="page-item${p === currentPage ? ' active' : ''}"><a class="page-link" href="#" onclick="expGoPage(${p});return false;">${p}</a></li>`;
    }
    html += `<li class="page-item${currentPage === totalPages ? ' disabled' : ''}"><a class="page-link" href="#" onclick="expGoPage(${currentPage + 1});return false;">&#8250;</a></li>`;
    html += '</ul></nav>';
    wrap.innerHTML = html;
  }

  window.expGoPage = function (p) {
    if (p < 1 || p > totalPages) return;
    currentPage = p;
    loadExpenses();
  };

  init();
})();

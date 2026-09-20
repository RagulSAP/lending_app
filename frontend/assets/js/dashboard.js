(function () {
  'use strict';

  async function init() {
    await initPage('Dashboard', [1, 2, 4, 5]);
    const user = auth.getUser();
    if (!user) return;
    if (user.role_id === ROLES.COLLECTOR) {
      await renderCollectorDashboard();
    } else {
      await renderAdminDashboard();
    }
  }

  // ---- COLLECTOR DASHBOARD ----
  async function renderCollectorDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h1>My Collections</h1>
        <p>Track your daily and monthly collection performance</p>
      </div>
      <div class="filter-bar">
        <div class="form-group">
          <label class="form-label">Date From</label>
          <input type="date" class="form-control" id="f-from" value="${firstOfMonth}">
        </div>
        <div class="form-group">
          <label class="form-label">Date To</label>
          <input type="date" class="form-control" id="f-to" value="${today}">
        </div>
        <div class="form-group d-flex align-items-end">
          <button class="btn btn-primary" id="filter-btn"><i class="bi bi-search"></i> Search</button>
        </div>
      </div>
      <div class="row g-3 mb-4" id="collector-stats"></div>
      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title">Recent Collections</h6>
        </div>
        <div class="table-container">
          <table class="table">
            <thead><tr><th>Date</th><th>Customer</th><th>Loan #</th><th>Amount</th><th>Mode</th></tr></thead>
            <tbody id="coll-tbody"></tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('filter-btn').addEventListener('click', loadCollectorData);
    await loadCollectorData();
  }

  async function loadCollectorData() {
    const from = document.getElementById('f-from').value;
    const to = document.getElementById('f-to').value;
    try {
      showLoading();
      const res = await api.get('/api/dashboard/summary', { date_from: from, date_to: to });
      const s = res.data || {};
      document.getElementById('collector-stats').innerHTML = `
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon blue"><i class="bi bi-cash-stack"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.collected_today || 0)}</div><div class="stat-label">Today's Collection</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon green"><i class="bi bi-calendar-check"></i></div><div class="stat-body"><div class="stat-value">${s.total_collections_count || 0}</div><div class="stat-label">Period Count</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon cyan"><i class="bi bi-graph-up-arrow"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.total_collections_amount || 0)}</div><div class="stat-label">Period Total</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon indigo"><i class="bi bi-calendar-month"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.collected_this_month || 0)}</div><div class="stat-label">This Month</div></div></div></div>`;
      const payments = s.recent_payments || [];
      const tbody = document.getElementById('coll-tbody');
      if (!payments.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty"><i class="bi bi-inbox"></i>No recent collections</td></tr>';
      } else {
        tbody.innerHTML = payments.map(p => `<tr><td>${formatDate(p.transaction_date)}</td><td>${p.customer_name || '-'}</td><td>#${p.loan_id || '-'}</td><td>${formatCurrency(p.amount)}</td><td><span class="badge bg-light text-dark">${p.payment_mode || '-'}</span></td></tr>`).join('');
      }
    } catch (err) {
      showToast('Failed to load data: ' + err.message, 'danger');
    } finally {
      hideLoading();
    }
  }

  // ---- ADMIN/MANAGER/ACCOUNTANT DASHBOARD ----
  async function renderAdminDashboard() {
    document.getElementById('page-content').innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Organization overview and key performance indicators</p>
      </div>
      <div class="row g-3 mb-4" id="kpi-row"></div>
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Loan Status Breakdown</h6></div>
            <div style="display:flex;align-items:center;justify-content:center;min-height:240px;">
              <canvas id="loan-chart" width="260" height="260"></canvas>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card h-100">
            <div class="card-header-flex">
              <h6 class="card-title">Recent Transactions</h6>
            </div>
            <div class="table-container">
              <table class="table">
                <thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>Mode</th><th>Collected By</th></tr></thead>
                <tbody id="txn-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    try {
      showLoading();
      const res = await api.get('/api/dashboard/summary');
      const s = res.data || {};
      document.getElementById('kpi-row').innerHTML = `
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon blue"><i class="bi bi-file-earmark-text"></i></div><div class="stat-body"><div class="stat-value">${s.total_active_loans || 0}</div><div class="stat-label">Active Loans</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon green"><i class="bi bi-bank2"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.total_disbursed || 0)}</div><div class="stat-label">Total Disbursed</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon cyan"><i class="bi bi-cash-coin"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.collected_today || 0)}</div><div class="stat-label">Collected Today</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon indigo"><i class="bi bi-calendar-month"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.collected_this_month || 0)}</div><div class="stat-label">Collected This Month</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon red"><i class="bi bi-exclamation-triangle-fill"></i></div><div class="stat-body"><div class="stat-value">${s.overdue_count || 0}</div><div class="stat-label">Overdue Loans</div><div class="stat-sub">${formatCurrency(s.overdue_amount || 0)}</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon purple"><i class="bi bi-wallet2"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.wallet_balance || 0)}</div><div class="stat-label">Wallet Balance</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon amber"><i class="bi bi-receipt"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.expenses_this_month || 0)}</div><div class="stat-label">Expenses This Month</div></div></div></div>
        <div class="col-6 col-xl-3"><div class="stat-card"><div class="stat-icon pink"><i class="bi bi-people"></i></div><div class="stat-body"><div class="stat-value">${s.active_customers || 0}</div><div class="stat-label">Active Customers</div></div></div></div>`;

      // Chart
      const activeOnly = Math.max((s.total_active_loans || 0) - (s.overdue_count || 0), 0);
      const overdueCount = s.overdue_count || 0;
      const chartCard = document.getElementById('loan-chart').closest('.card');
      if (typeof Chart !== 'undefined') {
        const ctx = document.getElementById('loan-chart').getContext('2d');
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['Active', 'Overdue'],
            datasets: [{ data: [activeOnly, overdueCount], backgroundColor: ['#2563EB','#DC2626'], borderWidth: 0, hoverOffset: 6 }]
          },
          options: { responsive: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12, family: 'Inter' }, padding: 16 } } }, cutout: '68%' }
        });
      } else {
        chartCard.querySelector('div[style]').innerHTML = `
          <div class="p-4 text-center" style="min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
            <div style="font-size:36px;font-weight:700;color:#2563EB;">${activeOnly}</div>
            <div style="font-size:13px;color:#64748B;">Active Loans</div>
            <div style="width:60px;height:2px;background:#e2e8f0;"></div>
            <div style="font-size:36px;font-weight:700;color:#DC2626;">${overdueCount}</div>
            <div style="font-size:13px;color:#64748B;">Overdue Loans</div>
          </div>`;
      }

      // Recent transactions
      const txns = s.recent_transactions || [];
      const tbody = document.getElementById('txn-tbody');
      if (!txns.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty"><i class="bi bi-inbox"></i>No recent transactions</td></tr>';
      } else {
        tbody.innerHTML = txns.map(t => `<tr><td>${formatDate(t.transaction_date || t.created_at)}</td><td>${t.customer_name || '-'}</td><td>${formatCurrency(t.amount)}</td><td><span class="badge bg-light text-dark">${t.payment_mode || '-'}</span></td><td>${t.collected_by || '-'}</td></tr>`).join('');
      }
    } catch (err) {
      document.getElementById('page-content').innerHTML += `<div class="alert alert-danger mt-3">${err.message}</div>`;
    } finally {
      hideLoading();
    }
  }

  init();
})();

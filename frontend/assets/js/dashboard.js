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
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Loan Status Breakdown</h6></div>
            <div style="position:relative;height:220px;padding:12px 16px;">
              <canvas id="loan-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Customer Loan Status</h6></div>
            <div style="position:relative;height:220px;padding:12px 16px;">
              <canvas id="customer-chart"></canvas>
            </div>
          </div>
        </div>
      </div>
      <div class="row g-4 mt-2">
        <div class="col-12">
          <div class="card">
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

      // Shared chart options builder
      function makeDoughnutOpts(labels, colors, data) {
        return {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                font: { size: 12, family: 'Inter' },
                padding: 18,
                usePointStyle: true,
                pointStyle: 'circle',
                generateLabels: () =>
                  labels.map((lbl, i) => ({
                    text: `${lbl}   ${data[i]}`,
                    fillStyle: colors[i],
                    strokeStyle: colors[i],
                    pointStyle: 'circle',
                    index: i,
                  })),
              },
            },
          },
          cutout: '70%',
        };
      }

      // Loan status chart
      const activeOnly   = Math.max((s.total_active_loans || 0) - (s.overdue_count || 0), 0);
      const overdueCount = s.overdue_count || 0;
      const loanLabels   = ['Active', 'Overdue'];
      const loanColors   = ['#2563EB', '#DC2626'];
      const loanData     = [activeOnly, overdueCount];
      if (typeof Chart !== 'undefined') {
        new Chart(document.getElementById('loan-chart').getContext('2d'), {
          type: 'doughnut',
          data: { labels: loanLabels, datasets: [{ data: loanData, backgroundColor: loanColors, borderWidth: 0, hoverOffset: 6 }] },
          options: makeDoughnutOpts(loanLabels, loanColors, loanData),
        });
      } else {
        document.getElementById('loan-chart').closest('div[style]').innerHTML =
          fallbackChart([['#2563EB', activeOnly, 'Active'], ['#DC2626', overdueCount, 'Overdue']]);
      }

      // Customer loan status chart
      const custActive    = s.customers_with_active_loans    || 0;
      const custCompleted = s.customers_with_completed_loans || 0;
      const custNone      = s.customers_without_loans        || 0;
      const custLabels    = ['Active Loan', 'Completed', 'No Loan'];
      const custColors    = ['#2563EB', '#16A34A', '#94A3B8'];
      const custData      = [custActive, custCompleted, custNone];
      if (typeof Chart !== 'undefined') {
        new Chart(document.getElementById('customer-chart').getContext('2d'), {
          type: 'doughnut',
          data: { labels: custLabels, datasets: [{ data: custData, backgroundColor: custColors, borderWidth: 0, hoverOffset: 6 }] },
          options: makeDoughnutOpts(custLabels, custColors, custData),
        });
      } else {
        document.getElementById('customer-chart').closest('div[style]').innerHTML =
          fallbackChart([['#2563EB', custActive, 'Active Loan'], ['#16A34A', custCompleted, 'Completed'], ['#94A3B8', custNone, 'No Loan']]);
      }

      function fallbackChart(items) {
        const rows = items.map(([color, val, label]) =>
          `<div style="display:flex;align-items:center;gap:10px;">
             <div style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;"></div>
             <span style="font-size:22px;font-weight:700;color:${color};">${val}</span>
             <span style="font-size:12px;color:#64748B;">${label}</span>
           </div>`
        ).join('<div style="width:40px;height:1px;background:#e2e8f0;margin:2px 0;"></div>');
        return `<div style="height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">${rows}</div>`;
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

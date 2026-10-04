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
    const dateLabel = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    const finCard = (id, label, accent) => `
      <div style="background:#fff;border-radius:12px;padding:14px 16px 14px 20px;border:1px solid #E2E8F0;
                  box-shadow:0 1px 4px rgba(0,0,0,.05);position:relative;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${accent};border-radius:12px 0 0 12px;"></div>
        <div style="font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px;">${label}</div>
        <div id="${id}" style="font-size:18px;font-weight:700;color:#1E293B;line-height:1.2;">—</div>
      </div>`;

    const miniCard = (id, label, icon, bg, color, subId) => `
      <div style="background:#fff;border-radius:10px;padding:10px 12px;border:1px solid #F1F5F9;
                  box-shadow:0 1px 3px rgba(0,0,0,.04);display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:${bg};display:flex;align-items:center;
                    justify-content:center;flex-shrink:0;">
          <i class="bi ${icon}" style="font-size:15px;color:${color};"></i>
        </div>
        <div style="min-width:0;">
          <div id="${id}" style="font-size:15px;font-weight:700;color:#1E293B;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
          ${subId ? `<div id="${subId}" style="font-size:10px;color:${color};font-weight:600;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>` : ''}
          <div style="font-size:11px;color:#94A3B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
        </div>
      </div>`;

    document.getElementById('page-content').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:8px;">
        <h1 style="font-size:20px;font-weight:700;color:#1E293B;margin:0;">Dashboard</h1>
        <span style="font-size:12px;color:#64748B;background:#F8FAFC;padding:4px 12px;border-radius:20px;border:1px solid #E2E8F0;">${dateLabel}</span>
      </div>

      <!-- Financial KPIs -->
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-4">${finCard('kv-invest',    'Invest Balance',    'linear-gradient(135deg,#7C3AED,#2563EB)')}</div>
        <div class="col-6 col-md-4">${finCard('kv-interest',  'Interest Balance',  'linear-gradient(135deg,#16A34A,#059669)')}</div>
        <div class="col-12 col-md-4">${finCard('kv-disbursed', 'Total Disbursed',   '#2563EB')}</div>
      </div>

      <!-- Operational mini-cards -->
      <div class="row g-2 mb-4">
        <div class="col-6 col-md-4 col-xl-2">${miniCard('mv-loans',     'Active Loans',     'bi-file-earmark-text',     '#EFF6FF', '#2563EB')}</div>
        <div class="col-6 col-md-4 col-xl-2">${miniCard('mv-overdue',   'Overdue',          'bi-exclamation-triangle',  '#FEF2F2', '#DC2626', 'mv-overdue-amt')}</div>
        <div class="col-6 col-md-4 col-xl-2">${miniCard('mv-today',     'Collected Today',  'bi-cash-coin',             '#ECFEFF', '#0891B2')}</div>
        <div class="col-6 col-md-4 col-xl-2">${miniCard('mv-month',     'This Month',       'bi-calendar-month',        '#EEF2FF', '#4F46E5')}</div>
        <div class="col-6 col-md-4 col-xl-2">${miniCard('mv-expenses',  'Expenses',         'bi-receipt',               '#FFFBEB', '#D97706')}</div>
        <div class="col-6 col-md-4 col-xl-2">${miniCard('mv-customers', 'Customers',        'bi-people',                '#FDF2F8', '#DB2777')}</div>
      </div>

      <!-- Charts + Recent Transactions -->
      <div class="row g-3">
        <div class="col-md-6 col-lg-4">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Loan Status</h6></div>
            <div style="position:relative;height:190px;padding:8px 16px;">
              <canvas id="loan-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-lg-4">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Customer Status</h6></div>
            <div style="position:relative;height:190px;padding:8px 16px;">
              <canvas id="customer-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Recent Transactions</h6></div>
            <div class="table-container">
              <table class="table table-sm" style="font-size:13px;">
                <thead><tr><th>Date</th><th>Customer</th><th>Amount</th><th>By</th></tr></thead>
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

      document.getElementById('kv-invest').textContent    = formatCurrency(s.wallet_invest_balance   || 0);
      document.getElementById('kv-interest').textContent  = formatCurrency(s.wallet_interest_balance || 0);
      document.getElementById('kv-disbursed').textContent = formatCurrency(s.total_disbursed         || 0);
      document.getElementById('mv-loans').textContent     = s.total_active_loans || 0;
      document.getElementById('mv-overdue').textContent   = s.overdue_count || 0;
      const ovdAmt = document.getElementById('mv-overdue-amt');
      if (ovdAmt) ovdAmt.textContent = formatCurrency(s.overdue_amount || 0);
      document.getElementById('mv-today').textContent     = formatCurrency(s.collected_today      || 0);
      document.getElementById('mv-month').textContent     = formatCurrency(s.collected_this_month || 0);
      document.getElementById('mv-expenses').textContent  = formatCurrency(s.expenses_this_month  || 0);
      document.getElementById('mv-customers').textContent = s.active_customers || 0;

      // Shared chart options builder
      function makeDoughnutOpts(labels, colors, data) {
        return {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                font: { size: 11, family: 'Inter' },
                padding: 12,
                usePointStyle: true,
                pointStyle: 'circle',
                generateLabels: () =>
                  labels.map((lbl, i) => ({
                    text: `${lbl}  ${data[i]}`,
                    fillStyle: colors[i],
                    strokeStyle: colors[i],
                    pointStyle: 'circle',
                    index: i,
                  })),
              },
            },
          },
          cutout: '72%',
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
        tbody.innerHTML = '<tr><td colspan="4" class="table-empty"><i class="bi bi-inbox"></i>No recent transactions</td></tr>';
      } else {
        tbody.innerHTML = txns.map(t => `<tr>
          <td style="white-space:nowrap;">${formatDate(t.transaction_date || t.created_at)}</td>
          <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.customer_name || '-'}</td>
          <td style="font-weight:600;white-space:nowrap;">${formatCurrency(t.amount)}</td>
          <td style="font-size:11px;color:#64748B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px;">${t.collected_by || '-'}</td>
        </tr>`).join('');
      }
    } catch (err) {
      document.getElementById('page-content').innerHTML += `<div class="alert alert-danger mt-3">${err.message}</div>`;
    } finally {
      hideLoading();
    }
  }

  init();
})();

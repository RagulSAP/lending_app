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
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
        <span style="font-size:12px;color:#64748B;background:#F8FAFC;padding:4px 12px;border-radius:20px;border:1px solid #E2E8F0;">${dateLabel}</span>
      </div>

      <!-- Financial KPIs -->
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-3">${finCard('kv-invest',    'Invest Balance',    'linear-gradient(135deg,#7C3AED,#2563EB)')}</div>
        <div class="col-6 col-md-3">${finCard('kv-interest',  'Interest Balance',  'linear-gradient(135deg,#16A34A,#059669)')}</div>
        <div class="col-6 col-md-3">${finCard('kv-disbursed', 'Total Disbursed',   '#2563EB')}</div>
        <div class="col-6 col-md-3">${finCard('kv-today',     'Collected Today',   '#0891B2')}</div>
      </div>

      <!-- Operational mini-cards -->
      <div class="row g-2 mb-4">
        <div class="col-6 col-md">${miniCard('mv-customers', 'Customers',   'bi-people',                '#FDF2F8', '#DB2777')}</div>
        <div class="col-6 col-md">${miniCard('mv-loans',     'Active Loans','bi-file-earmark-text',     '#EFF6FF', '#2563EB')}</div>
        <div class="col-6 col-md">${miniCard('mv-overdue',   'Overdue',     'bi-exclamation-triangle',  '#FEF2F2', '#DC2626', 'mv-overdue-amt')}</div>
        <div class="col-6 col-md">${miniCard('mv-month',     'This Month',  'bi-calendar-month',        '#EEF2FF', '#4F46E5')}</div>
        <div class="col-6 col-md">${miniCard('mv-expenses',  'Expenses',    'bi-receipt',               '#FFFBEB', '#D97706')}</div>
      </div>

      <!-- Charts -->
      <div class="row g-3">
        <div class="col-md-4">
          <div class="card h-100">
            <div class="card-header-flex"><h6 class="card-title">Customer Status</h6></div>
            <div style="position:relative;height:170px;padding:6px 12px;">
              <canvas id="customer-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-8">
          <div class="card h-100">
            <div class="card-header-flex" style="flex-wrap:wrap;gap:8px;align-items:center;">
              <h6 class="card-title" style="margin:0;">Collection &amp; Disbursement Trend</h6>
              <div style="display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end;flex-wrap:wrap;">
                <span id="trend-total-collected" style="font-size:11px;font-weight:600;color:#10B981;background:#ECFDF5;padding:2px 8px;border-radius:20px;border:1px solid #D1FAE5;display:none;"></span>
                <span id="trend-total-disbursed" style="font-size:11px;font-weight:600;color:#6366F1;background:#EEF2FF;padding:2px 8px;border-radius:20px;border:1px solid #E0E7FF;display:none;"></span>
                <input type="date" id="trend-from" class="form-control form-control-sm" style="width:126px;">
                <input type="date" id="trend-to"   class="form-control form-control-sm" style="width:126px;">
                <button class="btn btn-sm btn-primary" id="trend-apply" style="padding:3px 10px;font-size:12px;white-space:nowrap;">
                  <i class="bi bi-arrow-clockwise"></i> Apply
                </button>
              </div>
            </div>
            <div style="position:relative;height:210px;padding:6px 16px 10px;">
              <canvas id="trend-chart"></canvas>
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
      document.getElementById('kv-today').textContent     = formatCurrency(s.collected_today         || 0);
      document.getElementById('mv-customers').textContent = s.active_customers   || 0;
      document.getElementById('mv-loans').textContent     = s.total_active_loans || 0;
      document.getElementById('mv-overdue').textContent   = s.overdue_count      || 0;
      const ovdAmt = document.getElementById('mv-overdue-amt');
      if (ovdAmt) ovdAmt.textContent = formatCurrency(s.overdue_amount || 0);
      document.getElementById('mv-month').textContent     = formatCurrency(s.collected_this_month || 0);
      document.getElementById('mv-expenses').textContent  = formatCurrency(s.expenses_this_month  || 0);

      // Customer loan status chart
      const custActive    = s.customers_with_active_loans    || 0;
      const custCompleted = s.customers_with_completed_loans || 0;
      const custNone      = s.customers_without_loans        || 0;
      const custLabels    = ['Active', 'Completed', 'No Loan'];
      const custColors    = ['#6366F1', '#10B981', '#CBD5E1'];
      const custData      = [custActive, custCompleted, custNone];
      if (typeof Chart !== 'undefined') {
        new Chart(document.getElementById('customer-chart').getContext('2d'), {
          type: 'doughnut',
          data: { labels: custLabels, datasets: [{ data: custData, backgroundColor: custColors, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  font: { size: 10.5 },
                  padding: 10,
                  usePointStyle: true,
                  pointStyle: 'circle',
                  generateLabels: () =>
                    custLabels.map((lbl, i) => ({
                      text: `${lbl}  ${custData[i]}`,
                      fillStyle: custColors[i],
                      strokeStyle: custColors[i],
                      pointStyle: 'circle',
                      index: i,
                    })),
                },
              },
            },
            cutout: '74%',
          },
        });
      } else {
        const rows = [['#6366F1', custActive, 'Active'], ['#10B981', custCompleted, 'Completed'], ['#CBD5E1', custNone, 'No Loan']]
          .map(([c, v, l]) => `<div style="display:flex;align-items:center;gap:8px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;"></div>
            <span style="font-size:18px;font-weight:700;color:${c};">${v}</span>
            <span style="font-size:11px;color:#64748B;">${l}</span></div>`).join('');
        document.getElementById('customer-chart').closest('div[style]').innerHTML =
          `<div style="height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;">${rows}</div>`;
      }

      // Trend chart — default last 30 days
      let trendChartInstance = null;
      const today = new Date();
      const d30ago = new Date(today); d30ago.setDate(d30ago.getDate() - 29);
      const fmtDate = d => d.toISOString().split('T')[0];
      document.getElementById('trend-from').value = fmtDate(d30ago);
      document.getElementById('trend-to').value   = fmtDate(today);

      async function loadTrendChart(from, to) {
        try {
          const res = await api.get('/api/dashboard/trend', { date_from: from, date_to: to });
          const td = res.data || {};
          const dates     = td.dates     || [];
          const collected = td.collected || [];
          const disbursed = td.disbursed || [];

          if (trendChartInstance) { trendChartInstance.destroy(); trendChartInstance = null; }

          // Update summary badges
          const totalC = collected.reduce((a, b) => a + b, 0);
          const totalD = disbursed.reduce((a, b) => a + b, 0);
          const elC = document.getElementById('trend-total-collected');
          const elD = document.getElementById('trend-total-disbursed');
          if (elC) { elC.textContent = `↑ ${formatCurrency(totalC)}`; elC.style.display = 'inline'; }
          if (elD) { elD.textContent = `↓ ${formatCurrency(totalD)}`; elD.style.display = 'inline'; }

          if (typeof Chart === 'undefined') return;

          const ctx = document.getElementById('trend-chart').getContext('2d');

          // Gradient fill for collected bars
          const barGrad = ctx.createLinearGradient(0, 0, 0, 200);
          barGrad.addColorStop(0, 'rgba(16,185,129,0.85)');
          barGrad.addColorStop(1, 'rgba(16,185,129,0.35)');

          // Gradient fill under line
          const lineGrad = ctx.createLinearGradient(0, 0, 0, 200);
          lineGrad.addColorStop(0, 'rgba(99,102,241,0.18)');
          lineGrad.addColorStop(1, 'rgba(99,102,241,0.01)');

          const sparse = dates.length > 45;

          trendChartInstance = new Chart(ctx, {
            data: {
              labels: dates,
              datasets: [
                {
                  type: 'bar',
                  label: 'Collected',
                  data: collected,
                  backgroundColor: barGrad,
                  borderColor: 'rgba(16,185,129,0.9)',
                  borderWidth: 1,
                  borderRadius: 4,
                  borderSkipped: false,
                  order: 2,
                  yAxisID: 'y',
                  barPercentage: 0.6,
                  categoryPercentage: 0.7,
                },
                {
                  type: 'line',
                  label: 'Disbursed',
                  data: disbursed,
                  borderColor: '#6366F1',
                  backgroundColor: lineGrad,
                  borderWidth: 2.5,
                  pointRadius: sparse ? 0 : 3,
                  pointHoverRadius: 5,
                  pointBackgroundColor: '#6366F1',
                  pointBorderColor: '#fff',
                  pointBorderWidth: 1.5,
                  tension: 0.4,
                  fill: true,
                  order: 1,
                  yAxisID: 'y',
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              animation: { duration: 500, easing: 'easeInOutQuart' },
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  position: 'top',
                  align: 'end',
                  labels: {
                    font: { size: 11 },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16,
                    color: '#475569',
                  },
                },
                tooltip: {
                  backgroundColor: '#1E293B',
                  titleColor: '#94A3B8',
                  bodyColor: '#F8FAFC',
                  borderColor: '#334155',
                  borderWidth: 1,
                  cornerRadius: 8,
                  padding: 10,
                  callbacks: {
                    label: ctx => `  ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  border: { display: false },
                  ticks: { font: { size: 10 }, color: '#94A3B8', maxTicksLimit: sparse ? 10 : 16, maxRotation: 0 },
                },
                y: {
                  grid: { color: '#F1F5F9', drawBorder: false },
                  border: { display: false, dash: [4, 4] },
                  ticks: {
                    font: { size: 10 },
                    color: '#94A3B8',
                    padding: 6,
                    callback: v => {
                      if (v === 0) return '0';
                      if (v >= 100000) return (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
                      if (v >= 1000)   return (v / 1000).toFixed(0) + 'k';
                      return v;
                    },
                  },
                },
              },
            },
          });
        } catch (e) {
          console.warn('Trend chart load failed', e);
        }
      }

      document.getElementById('trend-apply').addEventListener('click', () => {
        loadTrendChart(document.getElementById('trend-from').value, document.getElementById('trend-to').value);
      });
      await loadTrendChart(fmtDate(d30ago), fmtDate(today));

    } catch (err) {
      document.getElementById('page-content').innerHTML += `<div class="alert alert-danger mt-3">${err.message}</div>`;
    } finally {
      hideLoading();
    }
  }

  init();
})();

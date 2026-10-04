(function () {
  'use strict';

  // Module-level state so the theme observer can rebuild charts at any time
  let _custChart  = null;
  let _trendChart = null;
  let _custCanvas = null;
  let _custLabels = [];
  let _custColors = [];
  let _custData   = [];

  const _isDark     = () => document.body.getAttribute('data-theme') === 'dark';
  const _textColor  = () => _isDark() ? '#E6EDF3' : '#0F172A';
  const _mutedColor = () => _isDark() ? '#8B949E' : '#64748B';
  const _gridColor  = () => _isDark() ? '#21262D' : '#F1F5F9';

  function _buildCustChart() {
    if (!_custCanvas || typeof Chart === 'undefined') return;
    if (_custChart) { _custChart.destroy(); _custChart = null; }
    _custChart = new Chart(_custCanvas.getContext('2d'), {
      type: 'doughnut',
      data: { labels: _custLabels, datasets: [{ data: _custData, backgroundColor: _custColors, borderWidth: 0, hoverOffset: 6 }] },
      options: {
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
              color: _textColor(),
              generateLabels: () => _custLabels.map((lbl, i) => ({
                text: `${lbl}  ${_custData[i]}`,
                fillStyle: _custColors[i],
                strokeStyle: _custColors[i],
                pointStyle: 'circle',
                fontColor: _textColor(),
                index: i,
              })),
            },
          },
        },
        cutout: '72%',
      },
    });
  }

  function _syncChartTheme() {
    _buildCustChart(); // Full rebuild guarantees correct colors
    if (_trendChart) {
      _trendChart.options.plugins.legend.labels.color = _textColor();
      _trendChart.options.scales.x.ticks.color        = _mutedColor();
      _trendChart.options.scales.y.ticks.color        = _mutedColor();
      _trendChart.options.scales.y.grid.color         = _gridColor();
      _trendChart.update();
    }
  }

  // Rebuild/recolour charts whenever the theme attribute changes
  new MutationObserver(_syncChartTheme)
    .observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

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
      <div class="filter-bar">
        <div class="form-group">
          <label class="form-label">${t('dash.date_from')}</label>
          <input type="date" class="form-control" id="f-from" value="${firstOfMonth}">
        </div>
        <div class="form-group">
          <label class="form-label">${t('dash.date_to')}</label>
          <input type="date" class="form-control" id="f-to" value="${today}">
        </div>
        <div class="form-group d-flex align-items-end">
          <button class="btn btn-primary" id="filter-btn"><i class="bi bi-search"></i> ${t('common.search')}</button>
        </div>
      </div>
      <div class="row g-3 mb-4" id="collector-stats"></div>
      <div class="card">
        <div class="card-header-flex">
          <h6 class="card-title">${t('dash.recent')}</h6>
        </div>
        <div class="table-container">
          <table class="table">
            <thead><tr><th>${t('dash.col_date')}</th><th>${t('dash.col_customer')}</th><th>${t('dash.col_loan')}</th><th>${t('dash.col_amount')}</th><th>${t('dash.col_mode')}</th></tr></thead>
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
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon blue"><i class="bi bi-cash-stack"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.collected_today || 0)}</div><div class="stat-label">${t('dash.today_coll')}</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon green"><i class="bi bi-calendar-check"></i></div><div class="stat-body"><div class="stat-value">${s.total_collections_count || 0}</div><div class="stat-label">${t('dash.period_count')}</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon cyan"><i class="bi bi-graph-up-arrow"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.total_collections_amount || 0)}</div><div class="stat-label">${t('dash.period_total')}</div></div></div></div>
        <div class="col-6 col-lg-3"><div class="stat-card"><div class="stat-icon indigo"><i class="bi bi-calendar-month"></i></div><div class="stat-body"><div class="stat-value">${formatCurrency(s.collected_this_month || 0)}</div><div class="stat-label">${t('dash.this_month')}</div></div></div></div>`;
      const payments = s.recent_payments || [];
      const tbody = document.getElementById('coll-tbody');
      if (!payments.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="table-empty"><i class="bi bi-inbox"></i>${t('dash.no_recent')}</td></tr>`;
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
    const finCard = (id, label, accent) => `
      <div style="background:var(--card-bg);border-radius:12px;padding:14px 16px 14px 20px;border:1px solid var(--border);
                  box-shadow:var(--shadow-sm);position:relative;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background:${accent};border-radius:12px 0 0 12px;"></div>
        <div style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:5px;">${label}</div>
        <div id="${id}" style="font-size:18px;font-weight:700;color:var(--text-primary);line-height:1.2;">—</div>
      </div>`;

    const miniCard = (id, label, icon, chipClass, color, subId) => `
      <div style="background:var(--card-bg);border-radius:10px;padding:10px 12px;border:1px solid var(--border);
                  box-shadow:var(--shadow-sm);display:flex;align-items:center;gap:10px;">
        <div class="${chipClass}" style="width:34px;height:34px;border-radius:8px;display:flex;align-items:center;
                    justify-content:center;flex-shrink:0;">
          <i class="bi ${icon}" style="font-size:15px;color:${color};"></i>
        </div>
        <div style="min-width:0;">
          <div id="${id}" style="font-size:15px;font-weight:700;color:var(--text-primary);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
          ${subId ? `<div id="${subId}" style="font-size:10px;color:${color};font-weight:600;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>` : ''}
          <div style="font-size:11px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${label}</div>
        </div>
      </div>`;

    document.getElementById('page-content').style.cssText = 'display:flex;flex-direction:column;height:calc(100vh - var(--topbar-height) - 48px);';
    document.getElementById('page-content').innerHTML = `
      <!-- Financial KPIs -->
      <div class="row g-3 mb-3">
        <div class="col-6 col-md-3">${finCard('kv-disbursed', t('dash.total_disbursed'),   '#2563EB')}</div>
        <div class="col-6 col-md-3">${finCard('kv-today',     t('dash.collected_today'),   '#0891B2')}</div>
        <div class="col-6 col-md-3">${finCard('kv-rotation',  t('dash.rotation_balance'),  'linear-gradient(135deg,#7C3AED,#2563EB)')}</div>
        <div class="col-6 col-md-3">${finCard('kv-interest',  t('dash.interest_balance'),  'linear-gradient(135deg,#16A34A,#059669)')}</div>
      </div>

      <!-- Operational mini-cards -->
      <div class="row g-2 mb-4">
        <div class="col-6 col-md">${miniCard('mv-customers', t('dash.customers'),    'bi-people',               'dash-chip-pink',   '#DB2777')}</div>
        <div class="col-6 col-md">${miniCard('mv-loans',     t('dash.active_loans'), 'bi-file-earmark-text',    'dash-chip-blue',   '#2563EB')}</div>
        <div class="col-6 col-md">${miniCard('mv-overdue',   t('dash.overdue'),      'bi-exclamation-triangle', 'dash-chip-red',    '#DC2626')}</div>
        <div class="col-6 col-md">${miniCard('mv-month',     t('dash.this_month'),   'bi-calendar-month',       'dash-chip-indigo', '#4F46E5')}</div>
        <div class="col-6 col-md">${miniCard('mv-expenses',  t('dash.expenses'),     'bi-receipt',              'dash-chip-amber',  '#D97706')}</div>
      </div>

      <!-- Charts -->
      <div class="row g-3" style="flex:1;min-height:0;">
        <div class="col-md-4" style="display:flex;flex-direction:column;">
          <div class="card" style="flex:1;min-height:0;display:flex;flex-direction:column;">
            <div class="card-header-flex"><h6 class="card-title">${t('dash.customer_status')}</h6></div>
            <div style="position:relative;flex:1;min-height:0;padding:8px 16px;">
              <canvas id="customer-chart"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-8" style="display:flex;flex-direction:column;">
          <div class="card" style="flex:1;min-height:0;display:flex;flex-direction:column;">
            <div class="card-header-flex" style="flex-wrap:wrap;gap:8px;">
              <h6 class="card-title" style="margin:0;">${t('dash.collection_trend')}</h6>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <input type="date" id="trend-from" class="form-control form-control-sm" style="width:130px;">
                <input type="date" id="trend-to"   class="form-control form-control-sm" style="width:130px;">
                <button class="btn btn-sm btn-primary" id="trend-apply" style="padding:3px 10px;font-size:12px;">
                  <i class="bi bi-search"></i> ${t('common.apply')}
                </button>
              </div>
            </div>
            <div style="position:relative;flex:1;min-height:0;padding:8px 16px;">
              <canvas id="trend-chart"></canvas>
            </div>
          </div>
        </div>
      </div>`;

    try {
      showLoading();
      const res = await api.get('/api/dashboard/summary');
      const s = res.data || {};

      document.getElementById('kv-rotation').textContent  = formatCurrency(s.wallet_rotation_balance  || 0);
      document.getElementById('kv-interest').textContent  = formatCurrency(s.wallet_interest_balance || 0);
      document.getElementById('kv-disbursed').textContent = formatCurrency(s.total_disbursed         || 0);
      document.getElementById('kv-today').textContent     = formatCurrency(s.collected_today         || 0);
      document.getElementById('mv-customers').textContent = s.active_customers   || 0;
      document.getElementById('mv-loans').textContent     = s.total_active_loans || 0;
      document.getElementById('mv-overdue').textContent   = s.overdue_count      || 0;
      document.getElementById('mv-month').textContent     = formatCurrency(s.collected_this_month || 0);
      document.getElementById('mv-expenses').textContent  = formatCurrency(s.expenses_this_month  || 0);

      // Customer loan status chart — populate module-level state then build
      _custLabels = [t('dash.active_loan'), t('dash.completed'), t('dash.no_loan')];
      _custColors = ['#2563EB', '#16A34A', '#94A3B8'];
      _custData   = [s.customers_with_active_loans || 0, s.customers_with_completed_loans || 0, s.customers_without_loans || 0];
      _custCanvas = document.getElementById('customer-chart');
      _buildCustChart();

      // Trend chart — default last 30 days
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

          if (_trendChart) { _trendChart.destroy(); _trendChart = null; }

          if (typeof Chart === 'undefined') return;

          _trendChart = new Chart(document.getElementById('trend-chart').getContext('2d'), {
            data: {
              labels: dates,
              datasets: [
                {
                  type: 'bar',
                  label: t('dash.collected'),
                  data: collected,
                  backgroundColor: 'rgba(22,163,74,.65)',
                  borderRadius: 3,
                  order: 2,
                  yAxisID: 'y',
                },
                {
                  type: 'line',
                  label: t('dash.disbursed'),
                  data: disbursed,
                  borderColor: '#2563EB',
                  backgroundColor: 'rgba(37,99,235,.08)',
                  borderWidth: 2,
                  pointRadius: dates.length > 60 ? 0 : 3,
                  tension: 0.35,
                  fill: true,
                  order: 1,
                  yAxisID: 'y',
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  position: 'top',
                  labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 14, color: _textColor() },
                },
                tooltip: {
                  callbacks: {
                    label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: { font: { size: 10 }, maxTicksLimit: 12, maxRotation: 0, color: _mutedColor() },
                },
                y: {
                  grid: { color: _gridColor() },
                  ticks: {
                    font: { size: 10 }, color: _mutedColor(),
                    callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v,
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

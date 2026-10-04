(function () {
  'use strict';

  async function init() {
    await initPage('Settings', [0, 1, 2, 3, 4, 5]);
    render();
  }

  function currentTheme() {
    try { return localStorage.getItem('tc-theme') || 'light'; } catch { return 'light'; }
  }

  function render() {
    const s = getSettings();
    const theme = currentTheme();

    document.getElementById('page-content').innerHTML = `
      <div class="row g-4" style="max-width:720px;">

        <!-- Appearance -->
        <div class="col-12">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-palette me-2 text-primary"></i>Appearance</h6>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Theme</div>
                <div class="setting-desc">Switch between light and dark interface</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm ${theme !== 'dark' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('theme','light')">
                  <i class="bi bi-sun me-1"></i>Light
                </button>
                <button class="btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('theme','dark')">
                  <i class="bi bi-moon-stars me-1"></i>Dark
                </button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Font Size</div>
                <div class="setting-desc">Adjust text size across the application</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm ${s.fontSize === 'small'  ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('fontSize','small')">Small</button>
                <button class="btn btn-sm ${s.fontSize === 'medium' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('fontSize','medium')">Medium</button>
                <button class="btn btn-sm ${s.fontSize === 'large'  ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('fontSize','large')">Large</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Compact Layout</div>
                <div class="setting-desc">Reduce spacing to fit more content on screen</div>
              </div>
              <div class="form-check form-switch mb-0">
                <input class="form-check-input" type="checkbox" role="switch" id="compact-chk"
                       style="width:40px;height:22px;cursor:pointer;"
                       ${s.compact ? 'checked' : ''}
                       onchange="setSetting('compact', this.checked)">
              </div>
            </div>
          </div>
        </div>

        <!-- Data Display -->
        <div class="col-12">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-table me-2 text-primary"></i>Data & Display</h6>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Date Format</div>
                <div class="setting-desc">How dates appear throughout the app</div>
              </div>
              <div class="d-flex align-items-center gap-3">
                <span class="setting-preview">${s.dateFormat === 'numeric' ? '12/01/2026' : '12 Jan 2026'}</span>
                <div class="btn-group" role="group">
                  <button class="btn btn-sm ${s.dateFormat !== 'numeric' ? 'btn-primary' : 'btn-outline-secondary'}"
                          onclick="setSetting('dateFormat','short')">12 Jan 2026</button>
                  <button class="btn btn-sm ${s.dateFormat === 'numeric' ? 'btn-primary' : 'btn-outline-secondary'}"
                          onclick="setSetting('dateFormat','numeric')">12/01/2026</button>
                </div>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Rows Per Page</div>
                <div class="setting-desc">Default number of records shown in tables (takes effect on next load)</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm ${s.pageSize === 10 ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('pageSize',10)">10</button>
                <button class="btn btn-sm ${s.pageSize === 20 ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('pageSize',20)">20</button>
                <button class="btn btn-sm ${s.pageSize === 50 ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('pageSize',50)">50</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Language -->
        <div class="col-12">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-translate me-2 text-primary"></i>Language</h6>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Display Language</div>
                <div class="setting-desc">Language used for labels and interface text</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm btn-primary">
                  <i class="bi bi-check me-1"></i>English
                </button>
                <button class="btn btn-sm btn-outline-secondary" disabled title="Coming soon">
                  தமிழ் &nbsp;<span class="badge bg-secondary" style="font-size:9px;vertical-align:middle;">Soon</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- About & Reset -->
        <div class="col-12">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-info-circle me-2 text-primary"></i>About</h6>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Application</div>
                <div class="setting-desc">Thiruvelan Capitals — Microfinance Management System</div>
              </div>
              <span class="badge bg-primary" style="font-size:12px;padding:5px 10px;">v1.0</span>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">Reset to Defaults</div>
                <div class="setting-desc">Restore all preferences to their original values</div>
              </div>
              <button class="btn btn-sm btn-outline-danger" onclick="resetAllSettings()">
                <i class="bi bi-arrow-counterclockwise me-1"></i>Reset
              </button>
            </div>
          </div>
        </div>

      </div>`;
  }

  window.setSetting = function (key, value) {
    if (key === 'theme') {
      applyTheme(value);
    } else {
      saveSettings({ [key]: value });
    }
    showToast('Setting saved', 'success');
    render();
  };

  window.resetAllSettings = async function () {
    const ok = await confirmDialog('Reset all settings to defaults?');
    if (!ok) return;
    try { localStorage.removeItem('tc-settings'); } catch {}
    applySettings();
    showToast('Settings reset to defaults', 'success');
    render();
  };

  init();
})();

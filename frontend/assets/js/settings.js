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
    const lang = s.language || 'en';

    document.getElementById('page-content').innerHTML = `
      <div class="row g-4" style="max-width:720px;">

        <!-- Appearance -->
        <div class="col-12">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-palette me-2 text-primary"></i>${t('settings.appearance')}</h6>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.theme')}</div>
                <div class="setting-desc">${t('settings.theme_desc')}</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm ${theme !== 'dark' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('theme','light')">
                  <i class="bi bi-sun me-1"></i>${t('settings.light')}
                </button>
                <button class="btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('theme','dark')">
                  <i class="bi bi-moon-stars me-1"></i>${t('settings.dark')}
                </button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.font_size')}</div>
                <div class="setting-desc">${t('settings.font_desc')}</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm ${s.fontSize === 'small'  ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('fontSize','small')">${t('settings.small')}</button>
                <button class="btn btn-sm ${s.fontSize === 'medium' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('fontSize','medium')">${t('settings.medium')}</button>
                <button class="btn btn-sm ${s.fontSize === 'large'  ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setSetting('fontSize','large')">${t('settings.large')}</button>
              </div>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.compact')}</div>
                <div class="setting-desc">${t('settings.compact_desc')}</div>
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
              <h6 class="card-title"><i class="bi bi-table me-2 text-primary"></i>${t('settings.data')}</h6>
            </div>

            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.date_format')}</div>
                <div class="setting-desc">${t('settings.date_desc')}</div>
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
                <div class="setting-label">${t('settings.rows')}</div>
                <div class="setting-desc">${t('settings.rows_desc')}</div>
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
              <h6 class="card-title"><i class="bi bi-translate me-2 text-primary"></i>${t('settings.language')}</h6>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.lang_label')}</div>
                <div class="setting-desc">${t('settings.lang_desc')}</div>
              </div>
              <div class="btn-group" role="group">
                <button class="btn btn-sm ${lang === 'en' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setLanguage('en')">
                  ${lang === 'en' ? '<i class="bi bi-check me-1"></i>' : ''}English
                </button>
                <button class="btn btn-sm ${lang === 'ta' ? 'btn-primary' : 'btn-outline-secondary'}"
                        onclick="setLanguage('ta')">
                  ${lang === 'ta' ? '<i class="bi bi-check me-1"></i>' : ''}தமிழ்
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- About & Reset -->
        <div class="col-12">
          <div class="card">
            <div class="card-header-flex">
              <h6 class="card-title"><i class="bi bi-info-circle me-2 text-primary"></i>${t('settings.about')}</h6>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.application')}</div>
                <div class="setting-desc">${t('settings.app_desc')}</div>
              </div>
              <span class="badge bg-primary" style="font-size:12px;padding:5px 10px;">v1.0</span>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <div class="setting-label">${t('settings.reset')}</div>
                <div class="setting-desc">${t('settings.reset_desc')}</div>
              </div>
              <button class="btn btn-sm btn-outline-danger" onclick="resetAllSettings()">
                <i class="bi bi-arrow-counterclockwise me-1"></i>${t('settings.reset_btn')}
              </button>
            </div>
          </div>
        </div>

      </div>`;
  }

  window.setLanguage = function (lang) {
    saveSettings({ language: lang });
    showToast(t('settings.saved'), 'success');
    setTimeout(() => window.location.reload(), 400);
  };

  window.setSetting = function (key, value) {
    if (key === 'theme') {
      applyTheme(value);
    } else {
      saveSettings({ [key]: value });
    }
    showToast(t('settings.saved'), 'success');
    render();
  };

  window.resetAllSettings = async function () {
    const ok = await confirmDialog(t('settings.reset_confirm'));
    if (!ok) return;
    try { localStorage.removeItem('tc-settings'); } catch {}
    applySettings();
    showToast(t('settings.reset_done'), 'success');
    setTimeout(() => window.location.reload(), 400);
  };

  init();
})();

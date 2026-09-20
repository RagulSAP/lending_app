// LendTrack API Module — IIFE, exposes window.api and window.auth
(function () {
  'use strict';

  const TOKEN_KEY = 'lending_token';
  const USER_KEY = 'lending_user';

  /* AUTH */
  const auth = {
    getToken() { return localStorage.getItem(TOKEN_KEY); },
    setToken(t) { localStorage.setItem(TOKEN_KEY, t); },
    clearToken() { localStorage.removeItem(TOKEN_KEY); },
    getUser() {
      try { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; }
      catch { return null; }
    },
    setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); },
    clearUser() { localStorage.removeItem(USER_KEY); },
    isLoggedIn() { return !!this.getToken(); },
    requireLogin() {
      if (!this.isLoggedIn()) {
        window.location.href = '/frontend/index.html';
        return false;
      }
      return true;
    },
    requireRole(...roles) {
      const user = this.getUser();
      if (!user || !roles.includes(user.role_id)) {
        this.logout();
        return false;
      }
      return true;
    },
    logout() {
      this.clearToken();
      this.clearUser();
      window.location.href = '/frontend/index.html';
    }
  };

  function getAuthHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = auth.getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function getAuthHeadersNoContent() {
    const h = {};
    const t = auth.getToken();
    if (t) h['Authorization'] = 'Bearer ' + t;
    return h;
  }

  function isLoginPage() {
    const p = window.location.pathname;
    return p.endsWith('index.html') || p.endsWith('/frontend/') || p === '/';
  }

  async function handleResponse(res) {
    if (res.status === 401 && !isLoginPage()) {
      // Session expired on a protected page — clear and redirect to login
      auth.clearToken(); auth.clearUser();
      window.location.href = '/frontend/index.html';
      throw new Error('Session expired. Please log in again.');
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      if (!res.ok) throw new Error('HTTP Error: ' + res.status);
      return res;
    }
    const data = await res.json();
    if (!res.ok) {
      const msg = data.message || data.error || ('Request failed: ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  function qs(params = {}) {
    const f = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''));
    const s = new URLSearchParams(f).toString();
    return s ? '?' + s : '';
  }

  const api = {
    async get(url, params = {}) {
      const res = await fetch(url + qs(params), { method: 'GET', headers: getAuthHeaders() });
      return handleResponse(res);
    },
    async post(url, body = {}) {
      const res = await fetch(url, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body) });
      return handleResponse(res);
    },
    async patch(url, body = {}) {
      const res = await fetch(url, { method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body) });
      return handleResponse(res);
    },
    async delete(url) {
      const res = await fetch(url, { method: 'DELETE', headers: getAuthHeaders() });
      return handleResponse(res);
    },
    async postForm(url, formData) {
      const res = await fetch(url, { method: 'POST', headers: getAuthHeadersNoContent(), body: formData });
      return handleResponse(res);
    },
    async download(url, params = {}, filename = 'download') {
      const res = await fetch(url + qs(params), { method: 'GET', headers: getAuthHeadersNoContent() });
      if (!res.ok) throw new Error('Download failed: ' + res.status);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }
  };

  window.api = api;
  window.auth = auth;
})();

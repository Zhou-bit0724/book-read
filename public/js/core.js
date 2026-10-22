'use strict';

(function () {
  const WK = (window.WK = window.WK || {});

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  const ICONS = {
    home: '<path d="M3.5 10.7 12 3.6l8.5 7.1"/><path d="M5.4 9.4V20a.6.6 0 0 0 .6.6h12a.6.6 0 0 0 .6-.6V9.4"/>',
    shelf: '<path d="M4.5 4.5h5v15h-5zM10.5 3.5h4.5v16h-4.5z"/><path d="m16.2 5.8 3.4 1-3 12.4-3.4-1"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.8 20c.8-3.5 3.7-5.4 7.2-5.4s6.4 1.9 7.2 5.4"/>',
    search: '<circle cx="10.8" cy="10.8" r="6.2"/><path d="m15.4 15.4 4.1 4.1"/>',
    back: '<path d="m14.5 5.2-6.8 6.8 6.8 6.8"/>',
    right: '<path d="m9.5 5.2 6.8 6.8-6.8 6.8"/>',
    more: '<circle cx="5.6" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.25" fill="currentColor" stroke="none"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.6" cy="6" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="4.6" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
    grid: '<rect x="4" y="4" width="6.4" height="6.4" rx="1.4"/><rect x="13.6" y="4" width="6.4" height="6.4" rx="1.4"/><rect x="4" y="13.6" width="6.4" height="6.4" rx="1.4"/><rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1.4"/>',
    bookmark: '<path d="M7.5 4.5h9a1 1 0 0 1 1 1V21l-5.5-3.3L6.5 21V5.5a1 1 0 0 1 1-1Z"/>',
    arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    download: '<path d="M12 4v10"/><path d="m7.5 10 4.5 4.5 4.5-4.5"/><path d="M5 19h14"/>',
    info: '<circle cx="12" cy="12" r="8.2"/><path d="M12 10.8v5"/><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none"/>',
    logout: '<path d="M14 5h4.5A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="m10 8.5 3.5 3.5-3.5 3.5"/><path d="M3.5 12h10"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>',
    clock: '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.8V12l3 1.8"/>',
    text: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    lock: '<rect x="5.5" y="10" width="13" height="10" rx="2.2"/><path d="M8.5 10V7.8a3.5 3.5 0 0 1 7 0V10"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.2"/><path d="M10.5 18.5h3"/>',
    cloudOff: '<path d="M6.2 17.5h10.6a3.7 3.7 0 0 0 .5-7.4A5.6 5.6 0 0 0 7.9 8.4"/><path d="M4 4 20 20"/>',
    bookOpen: '<path d="M12 6.5C10.4 5.3 8.2 4.8 5.5 5v13c2.7-.2 4.9.3 6.5 1.5 1.6-1.2 3.8-1.7 6.5-1.5V5c-2.7-.2-4.9.3-6.5 1.5Z"/><path d="M12 6.5v13"/>',
    sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  };

  function icon(name, cls = '') {
    const path = ICONS[name] || ICONS.info;
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  function hashHue(value) {
    const text = String(value || 'wenku8');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    return hash;
  }

  function persist(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable */
    }
  }

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  const SETTING_DEFAULTS = {
    readerTheme: 'paper',
    font: 'song',
    fontSize: 18,
    lineHeight: 1.92,
    margin: 22,
  };

  const storedSettings = load('wk8.settings.v1', {});
  const settings = Object.assign({}, SETTING_DEFAULTS, storedSettings && typeof storedSettings === 'object' ? storedSettings : {});
  if (!['paper', 'sepia', 'night', 'black'].includes(settings.readerTheme)) settings.readerTheme = 'paper';
  if (!['song', 'hei', 'kai'].includes(settings.font)) settings.font = 'song';
  settings.fontSize = Math.max(14, Math.min(30, Number(settings.fontSize) || 18));
  settings.lineHeight = Math.max(1.4, Math.min(2.4, Number(settings.lineHeight) || 1.92));
  settings.margin = Math.max(12, Math.min(36, Number(settings.margin) || 22));

  const appTheme = ['auto', 'light', 'dark'].includes(load('wk8.theme.v1', null))
    ? load('wk8.theme.v1', 'auto')
    : 'auto';
  const shelfView = load('wk8.shelfView.v1', 'grid') === 'list' ? 'list' : 'grid';

  const store = {
    settings,
    shelf: Array.isArray(load('wk8.shelf.v1', [])) ? load('wk8.shelf.v1', []) : [],
    history: load('wk8.history.v1', {}),
    recent: Array.isArray(load('wk8.recent.v1', [])) ? load('wk8.recent.v1', []) : [],
    read: load('wk8.read.v1', {}),
    stats: Object.assign({ seconds: 0 }, load('wk8.stats.v1', {})),
    appTheme,
    shelfView,
  };
  if (!store.history || typeof store.history !== 'object' || Array.isArray(store.history)) store.history = {};
  if (!store.read || typeof store.read !== 'object' || Array.isArray(store.read)) store.read = {};

  const saveShelf = () => persist('wk8.shelf.v1', store.shelf);
  const saveHistory = () => persist('wk8.history.v1', store.history);
  const saveRecent = () => persist('wk8.recent.v1', store.recent);
  const saveSettings = () => persist('wk8.settings.v1', store.settings);
  const saveStats = () => persist('wk8.stats.v1', store.stats);
  const saveRead = () => persist('wk8.read.v1', store.read);
  const saveTheme = () => persist('wk8.theme.v1', store.appTheme);
  const saveShelfView = () => persist('wk8.shelfView.v1', store.shelfView);

  const state = {
    routeId: 0,
    currentPath: '',
    prevPath: '',
    books: new Map(),
    bookPromises: new Map(),
    home: null,
    reader: null,
    scroll: new Map(),
    cleanup: [],
    sheetOpen: false,
  };

  async function api(path, options = {}) {
    const headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    let body;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    let res;
    try {
      res = await fetch(path, Object.assign({ credentials: 'same-origin' }, options, { headers, body }));
    } catch (cause) {
      const error = new Error('无法连接服务，请检查网络或确认 npm start 仍在运行');
      error.status = 0;
      error.cause = cause;
      throw error;
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      const error = new Error((data && data.error) || `请求失败（${res.status}）`);
      error.status = res.status;
      error.authRequired = Boolean(data && data.authRequired);
      error.captcha = Boolean(data && data.captcha);
      throw error;
    }
    return data;
  }

  async function loadBook(id, options = {}) {
    const key = String(id);
    if (!options.force && state.books.has(key)) return state.books.get(key);
    if (!options.force && state.bookPromises.has(key)) return state.bookPromises.get(key);
    const promise = api(`/api/book/${encodeURIComponent(key)}`)
      .then((book) => {
        state.books.set(key, book);
        state.bookPromises.delete(key);
        return book;
      })
      .catch((error) => {
        state.bookPromises.delete(key);
        throw error;
      });
    state.bookPromises.set(key, promise);
    return promise;
  }

  function latestHistory() {
    return Object.values(store.history)
      .filter((item) => item && item.bookId && item.chapterId && item.updatedAt)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  }

  function findShelf(id) {
    return store.shelf.find((item) => String(item.id) === String(id)) || null;
  }

  function markRead(bookId, cid) {
    const key = `${bookId}:${cid}`;
    if (store.read[key]) return false;
    store.read[key] = Date.now();
    const keys = Object.keys(store.read);
    if (keys.length > 4000) {
      keys.sort((a, b) => store.read[a] - store.read[b]);
      for (let i = 0; i < keys.length - 3500; i += 1) delete store.read[keys[i]];
    }
    saveRead();
    return true;
  }

  function formatWords(value) {
    const n = Number(value) || 0;
    if (!n) return '';
    if (n >= 10000) {
      const w = n / 10000;
      return `${w >= 100 ? Math.round(w) : w.toFixed(1).replace(/\.0$/, '')} 万字`;
    }
    return `${n} 字`;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total <= 0) return '0 分钟';
    if (total < 60) return '<1 分钟';
    const minutes = Math.round(total / 60);
    if (minutes < 60) return `${minutes} 分钟`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
  }

  function timeAgo(timestamp) {
    const ts = Number(timestamp) || 0;
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
    const date = new Date(ts);
    const now = new Date();
    if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
  }

  function todayLabel() {
    return new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  }

  function themeLabel(value = store.appTheme) {
    return { auto: '跟随系统', light: '浅色', dark: '深色' }[value] || '跟随系统';
  }

  function applyTheme() {
    document.documentElement.dataset.theme = store.appTheme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = store.appTheme === 'dark'
      || (store.appTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (meta) meta.setAttribute('content', dark ? '#141513' : '#f4efe5');
  }

  function applyReaderSettings() {
    const root = document.documentElement;
    root.dataset.readerTheme = store.settings.readerTheme;
    root.dataset.readerFont = store.settings.font;
    root.style.setProperty('--reader-size', `${store.settings.fontSize}px`);
    root.style.setProperty('--reader-leading', String(store.settings.lineHeight));
    root.style.setProperty('--reader-margin', `${store.settings.margin}px`);
  }

  let toastTimer = null;
  function toast(message, duration = 2200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  function navigate(hash) {
    if (location.hash === hash) {
      if (WK.renderRoute) WK.renderRoute();
      return;
    }
    location.hash = hash;
  }

  function onCleanup(fn) {
    if (typeof fn === 'function') state.cleanup.push(fn);
  }

  function setTitle(title) {
    document.title = title ? `${title} · 轻小说文库` : '轻小说文库';
  }

  function pick(array, count) {
    return Array.isArray(array) ? array.slice(0, count) : [];
  }

  WK.$ = $;
  WK.$$ = $$;
  WK.esc = esc;
  WK.icon = icon;
  WK.hashHue = hashHue;
  WK.persist = persist;
  WK.loadStored = load;
  WK.store = store;
  WK.state = state;
  WK.api = api;
  WK.loadBook = loadBook;
  WK.latestHistory = latestHistory;
  WK.findShelf = findShelf;
  WK.markRead = markRead;
  WK.formatWords = formatWords;
  WK.formatDuration = formatDuration;
  WK.timeAgo = timeAgo;
  WK.todayLabel = todayLabel;
  WK.themeLabel = themeLabel;
  WK.applyTheme = applyTheme;
  WK.applyReaderSettings = applyReaderSettings;
  WK.saveShelf = saveShelf;
  WK.saveHistory = saveHistory;
  WK.saveRecent = saveRecent;
  WK.saveSettings = saveSettings;
  WK.saveStats = saveStats;
  WK.saveRead = saveRead;
  WK.saveTheme = saveTheme;
  WK.saveShelfView = saveShelfView;
  WK.toast = toast;
  WK.navigate = navigate;
  WK.onCleanup = onCleanup;
  WK.setTitle = setTitle;
  WK.pick = pick;
  WK.SETTING_DEFAULTS = SETTING_DEFAULTS;
})();

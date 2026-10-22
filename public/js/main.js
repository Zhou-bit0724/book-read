'use strict';

(function () {
  const WK = window.WK;
  const {
    $, $$, esc, store, state, toast, navigate, setTitle,
    applyTheme, applyReaderSettings, themeLabel,
  } = WK;

  function cleanupAll() {
    const fns = state.cleanup.splice(0);
    for (let i = fns.length - 1; i >= 0; i -= 1) {
      try {
        fns[i]();
      } catch (error) {
        console.warn('[cleanup]', error);
      }
    }
  }

  function decode(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function routeFromHash() {
    let raw = location.hash.startsWith('#/') ? location.hash.slice(1) : '';
    if (!raw) raw = '/home';
    const mark = raw.indexOf('?');
    const path = mark >= 0 ? raw.slice(0, mark) : raw;
    const query = new URLSearchParams(mark >= 0 ? raw.slice(mark + 1) : '');
    const segments = path.split('/').filter(Boolean).map(decode);
    return { raw, path, query, segments };
  }

  function pageFor(segments) {
    const name = segments[0] || 'home';
    const id = segments[1];
    if (name === 'home') return { name, render: (ctx) => WK.pages.home(ctx), reader: false };
    if (name === 'shelf') return { name, render: (ctx) => WK.pages.shelf(ctx), reader: false };
    if (name === 'me') return { name, render: (ctx) => WK.pages.me(ctx), reader: false };
    if (name === 'search') return { name, render: (ctx, query) => WK.pages.search(ctx, query), reader: false };
    if (name === 'sugoi') return { name, render: (ctx) => WK.pages.sugoi(ctx, id), reader: false };
    if (name === 'offline') return { name, render: (ctx) => WK.pages.offline(ctx), reader: false };
    if (name === 'book' && id) return { name, render: (ctx) => WK.pages.book(ctx, id), reader: false };
    if (name === 'read' && id && segments[2]) {
      return { name, render: (ctx) => WK.pages.reader(ctx, id, segments[2]), reader: true };
    }
    return null;
  }

  async function renderRoute(options = {}) {
    const token = (state.routeId += 1);
    const oldRaw = state.currentRaw || '';

    cleanupAll();
    if (state.sheetOpen && !options.keepSheet) WK.sheet.close(true);
    if (!options.skipSave && oldRaw && !oldRaw.startsWith('/read/')) {
      state.scroll.set(oldRaw, window.scrollY);
    }

    let route = routeFromHash();
    let page = pageFor(route.segments);
    if (!page) {
      history.replaceState(null, '', '#/home');
      route = routeFromHash();
      page = pageFor(route.segments);
    }

    state.prevPath = state.currentPath;
    state.currentPath = route.path;
    state.currentRaw = route.raw;

    const app = $('#app');
    app.className = page.reader ? 'app reader-host' : 'app';
    document.body.classList.toggle('reader-mode', page.reader);
    if (page.reader) applyReaderSettings();

    const target = options.preserveScroll ? Number(options.scrollY) || 0 : (state.scroll.get(route.raw) || 0);
    if (!page.reader) window.scrollTo(0, target);

    const ctx = { alive: () => token === state.routeId };
    try {
      await page.render(ctx, route.query, route.segments);
    } catch (error) {
      if (!ctx.alive()) return;
      app.innerHTML = WK.errorBox(error.message || '页面加载失败');
    }
    if (!ctx.alive() || page.reader) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (ctx.alive()) window.scrollTo(0, target);
      });
    });
  }

  function updateReaderPreferenceText() {
    const row = $('[data-action="reader-settings"] .settings-value');
    if (!row) return;
    const labels = { paper: '纸白', sepia: '米黄', night: '夜间', black: '纯黑' };
    row.textContent = `${labels[store.settings.readerTheme] || '纸白'} · ${store.settings.fontSize}px`;
  }

  function updateThemeRows() {
    const row = $('[data-action="theme-sheet"] .settings-value');
    if (row) row.textContent = themeLabel();
    $$('[data-action="theme-choice"]').forEach((button) => {
      button.classList.toggle('active', button.dataset.themeValue === store.appTheme);
    });
  }

  function updateShelfToggle() {
    const button = $('#shelf-toggle');
    if (!button) return;
    const inShelf = Boolean(WK.findShelf(button.dataset.id));
    button.setAttribute('aria-pressed', String(inShelf));
    const label = $('#shelf-label', button);
    if (label) label.textContent = inShelf ? '已在书架' : '加入书架';
  }

  function toggleDesc(button) {
    const card = button.closest('.desc-card');
    if (!card) return;
    const clamped = card.classList.toggle('clamped');
    button.textContent = clamped ? '展开简介' : '收起简介';
  }

  function updateDownloadProgress(progress, info) {
    if (!progress) return;
    progress.hidden = false;
    const bar = progress.querySelector('.progress-track i');
    const label = progress.querySelector('span');
    const percent = info.total ? Math.min(100, Math.round((info.done / info.total) * 100)) : 0;
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = `${info.label || '下载中'} · ${percent}%`;
  }

  async function startDownload(id, button) {
    if (!window.isSecureContext) {
      toast('离线下载需要 HTTPS 访问');
      return;
    }
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      toast('页面缓存尚未就绪，请刷新后再下载');
      return;
    }
    if (button) button.disabled = true;
    const progress = $('#download-progress');
    try {
      const book = state.books.get(String(id)) || await WK.loadBook(id);
      const meta = await WK.offline.downloadBook(book, (info) => updateDownloadProgress(progress, info));
      const failed = Number(meta.imageFailed) || 0;
      toast(failed ? `已下载到手机，${failed} 张插图未能保存` : '已下载到手机，断网也能读', 3200);
      WK.rerender();
    } catch (error) {
      toast(error.message || '下载失败，请稍后重试', 3200);
      if (progress) progress.hidden = true;
    } finally {
      if (button && button.isConnected) button.disabled = false;
    }
  }

  function confirmRemoveDownload(id) {
    const meta = WK.offline.get(id);
    if (!meta) {
      toast('没有找到这个下载');
      return;
    }
    WK.openConfirmSheet({
      title: '删除下载',
      message: `删除《${meta.title}》的 ${meta.chapterCount || 0} 个章节和本地插图？书签与阅读进度会保留。`,
      confirmLabel: '删除下载',
      onConfirm: async () => {
        await WK.offline.remove(id);
        WK.sheet.close(true);
        toast('已删除本地下载');
        WK.rerender();
      },
    });
  }

  function onAction(action, element, event) {
    event.preventDefault();
    if (action === 'back') {
      if (history.length > 1) history.back();
      else navigate('#/home');
      return;
    }
    if (action === 'retry') {
      renderRoute({ preserveScroll: true, scrollY: window.scrollY, skipSave: true });
      return;
    }
    if (action === 'download-book') {
      startDownload(element.dataset.id, element);
      return;
    }
    if (action === 'download-manage' || action === 'offline-remove') {
      confirmRemoveDownload(element.dataset.id);
      return;
    }
    if (action === 'close-sheet') {
      WK.sheet.close();
      return;
    }
    if (action === 'confirm-sheet') {
      WK.sheet.confirm();
      return;
    }
    if (action === 'close-lightbox') {
      WK.closeLightbox();
      return;
    }
    if (action === 'theme-sheet') {
      WK.openThemeSheet();
      return;
    }
    if (action === 'theme-choice') {
      const value = element.dataset.themeValue;
      if (!['auto', 'light', 'dark'].includes(value)) return;
      store.appTheme = value;
      WK.saveTheme();
      applyTheme();
      updateThemeRows();
      return;
    }
    if (action === 'reader-settings') {
      WK.openReaderSettingsSheet();
      return;
    }
    if (action === 'reader-theme') {
      const value = element.dataset.value;
      if (!['paper', 'sepia', 'night', 'black'].includes(value)) return;
      store.settings.readerTheme = value;
      WK.saveSettings();
      applyReaderSettings();
      $$('[data-action="reader-theme"]').forEach((button) => {
        button.classList.toggle('active', button.dataset.value === value);
      });
      updateReaderPreferenceText();
      return;
    }
    if (action === 'reader-font') {
      const value = element.dataset.value;
      if (!['song', 'hei', 'kai'].includes(value)) return;
      store.settings.font = value;
      WK.saveSettings();
      applyReaderSettings();
      $$('[data-action="reader-font"]').forEach((button) => {
        button.classList.toggle('active', button.dataset.value === value);
      });
      return;
    }
    if (action === 'reader-size') {
      const delta = Number(element.dataset.delta) || 0;
      store.settings.fontSize = Math.max(14, Math.min(30, store.settings.fontSize + delta));
      WK.saveSettings();
      applyReaderSettings();
      const size = $('#rs-size');
      if (size) size.textContent = String(store.settings.fontSize);
      updateReaderPreferenceText();
      return;
    }
    if (action === 'open-toc') {
      WK.openTocSheet();
      return;
    }
    if (action === 'install') {
      WK.openInstallSheet();
      return;
    }
    if (action === 'about') {
      WK.openAboutSheet();
      return;
    }
    if (action === 'toggle-shelf') {
      WK.toggleShelf(element.dataset.id).then(updateShelfToggle);
      return;
    }
    if (action === 'shelf-menu') {
      WK.openShelfMenu(element.dataset.id);
      return;
    }
    if (action === 'remove-shelf') {
      const id = element.dataset.id;
      WK.openConfirmSheet({
        title: '移出书架',
        message: '只会移除本地书架和阅读进度入口，不影响官网收藏。',
        confirmLabel: '移出',
        onConfirm: () => WK.removeShelf(id),
      });
      return;
    }
    if (action === 'shelf-view') {
      const value = element.dataset.view === 'list' ? 'list' : 'grid';
      if (store.shelfView === value) return;
      store.shelfView = value;
      WK.saveShelfView();
      renderRoute({ preserveScroll: true, scrollY: window.scrollY, skipSave: true });
      return;
    }
    if (action === 'toggle-shelf-view') {
      store.shelfView = store.shelfView === 'grid' ? 'list' : 'grid';
      WK.saveShelfView();
      renderRoute({ preserveScroll: true, scrollY: window.scrollY, skipSave: true });
      return;
    }
    if (action === 'desc-toggle') {
      toggleDesc(element);
      return;
    }
    if (action === 'open-search') {
      navigate('#/search');
      return;
    }
    if (action === 'clear-search') {
      if (state.currentPath === '/search') navigate('#/search');
      else {
        const input = $('.search-input-wrap input');
        if (input) {
          input.value = '';
          input.focus();
        }
      }
      return;
    }
    if (action === 'clear-recent') {
      store.recent = [];
      WK.saveRecent();
      renderRoute({ preserveScroll: true, scrollY: window.scrollY, skipSave: true });
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const element = event.target.closest('[data-action]');
      if (element) {
        onAction(element.dataset.action, element, event);
        return;
      }
      const image = event.target.closest('.reader-content img');
      if (image && image.getAttribute('src')) {
        event.preventDefault();
        WK.openLightbox(image.getAttribute('src'));
        return;
      }
      if (event.target.id === 'lightbox') WK.closeLightbox();
    });

    document.addEventListener('submit', (event) => {
      const form = event.target.closest('form');
      if (!form) return;
      if (form.dataset.form === 'search') {
        event.preventDefault();
        const input = form.querySelector('input[name="q"]');
        const query = input ? input.value.trim() : '';
        navigate(query ? `#/search?q=${encodeURIComponent(query)}` : '#/search');
        return;
      }
    });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (target.id === 'rs-leading') {
        store.settings.lineHeight = Math.max(1.4, Math.min(2.4, Number(target.value) || 1.92));
        WK.saveSettings();
        applyReaderSettings();
        const value = $('#rs-leading-val');
        if (value) value.textContent = Number(store.settings.lineHeight).toFixed(2);
      } else if (target.id === 'rs-margin') {
        store.settings.margin = Math.max(12, Math.min(36, Number(target.value) || 22));
        WK.saveSettings();
        applyReaderSettings();
        const value = $('#rs-margin-val');
        if (value) value.textContent = String(store.settings.margin);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (WK.isLightboxOpen()) WK.closeLightbox();
      else if (state.sheetOpen) WK.sheet.close();
    });

    document.addEventListener('error', (event) => {
      const target = event.target;
      if (!target || target.tagName !== 'IMG') return;
      const raw = target.getAttribute('src') || '';
      if (raw.indexOf('/api/image') === -1) {
        target.classList.add('is-missing');
        return;
      }
      const tries = Number(target.dataset.imgRetry || 0);
      if (tries >= 2) {
        target.classList.add('is-missing');
        return;
      }
      target.dataset.imgRetry = String(tries + 1);
      setTimeout(() => {
        try {
          const next = new URL(raw, location.origin);
          next.searchParams.set('r', String(Date.now()));
          target.src = next.toString();
        } catch {
          target.classList.add('is-missing');
        }
      }, 900 * (tries + 1));
    }, true);

    window.addEventListener('scroll', () => {
      if (state.currentRaw && !state.currentRaw.startsWith('/read/')) {
        state.scroll.set(state.currentRaw, window.scrollY);
      }
    }, { passive: true });

    window.addEventListener('hashchange', () => {
      renderRoute();
    });
  }

  function boot() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    applyTheme();
    applyReaderSettings();
    bindEvents();
    renderRoute();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  WK.renderRoute = renderRoute;
  WK.rerender = () => renderRoute({ preserveScroll: true, scrollY: window.scrollY, skipSave: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

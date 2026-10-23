'use strict';

(function () {
  const WK = window.WK;
  const {
    $, esc, icon, hashHue, store, state, formatWords, themeLabel,
  } = WK;

  function coverHtml(book, options = {}) {
    const title = String(book && book.title ? book.title : '未命名');
    const letter = Array.from(title.trim())[0] || '书';
    const hue = hashHue(`${title}:${book && book.id ? book.id : ''}`);
    const badge = options.badge ? `<span class="badge">${esc(options.badge)}</span>` : '';
    const img = book && book.cover
      ? `<img src="${esc(book.cover)}" alt="" loading="lazy" decoding="async">`
      : '';
    return `<div class="cover" style="--h:${hue}"><span class="cover-fallback" aria-hidden="true">${esc(letter)}</span>${badge}${img}</div>`;
  }

  function bookCard(book, options = {}) {
    const sub = options.sub !== undefined ? options.sub : (book.author || '');
    const rank = options.rank
      ? `<span class="rank-badge">${esc(options.rank)}</span>`
      : '';
    const href = options.href || `#/book/${encodeURIComponent(book.id)}`;
    return `<a class="book-card" href="${esc(href)}">${rank}${coverHtml(book)}<div class="book-meta-line">${esc(book.title || '未命名')}</div>${sub ? `<div class="book-sub">${esc(sub)}</div>` : ''}</a>`;
  }

  function rankGrid(books, startRank = 1) {
    return `<div class="grid-books rank-grid">${(books || []).map((book, index) => bookCard(book, { rank: startRank + index })).join('')}</div>`;
  }

  function bookRow(book, options = {}) {
    const meta = options.sub !== undefined
      ? [options.sub]
      : [book.author, book.category, book.status, book.words ? formatWords(book.words) : ''].filter(Boolean);
    const rank = options.rank
      ? `<span class="rank${Number(options.rank) <= 3 ? ' top' : ''}">${esc(options.rank)}</span>`
      : '';
    return `<a class="list-row" href="#/book/${encodeURIComponent(book.id)}">${rank}${coverHtml(book)}<div class="row-main"><h3>${esc(book.title || '未命名')}</h3><div class="row-sub">${meta.map((item) => `<span>${esc(item)}</span>`).join('')}</div></div>${icon('right', 'chevron')}</a>`;
  }

  function bookRows(books, startRank = null) {
    return `<div class="list-rows">${(books || []).map((book, index) => bookRow(book, { rank: startRank == null ? 0 : startRank + index })).join('')}</div>`;
  }

  function topbar(options = {}) {
    const title = options.title || '';
    const sub = options.sub || '';
    const actions = options.actions || '';
    const back = options.back === false
      ? ''
      : `<button class="icon-btn" type="button" data-action="back" aria-label="返回">${icon('back')}</button>`;
    return `<header class="topbar"><div class="topbar-inner">${back}<h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h1>${actions}</div></header>`;
  }

  function tabbar(active) {
    const tabs = [
      ['home', '首页', 'home'],
      ['library', '本地', 'bookOpen'],
      ['shelf', '书架', 'shelf'],
      ['me', '我的', 'user'],
    ];
    return `<nav class="tabbar">${tabs.map(([key, label, iconName]) => `<a href="#/${key}" class="${active === key ? 'active' : ''}" aria-current="${active === key ? 'page' : 'false'}">${icon(iconName)}<span>${label}</span></a>`).join('')}</nav>`;
  }

  function sectionHead(title, moreHref, moreLabel = '更多') {
    return `<div class="section-head"><h2>${esc(title)}</h2>${moreHref ? `<a class="more" href="${esc(moreHref)}">${esc(moreLabel)}${icon('right')}</a>` : ''}</div>`;
  }

  function emptyState(options = {}) {
    return `<div class="empty-state"><div class="empty-icon">${icon(options.iconName || 'bookOpen')}</div><h2>${esc(options.title || '这里还是空的')}</h2><p>${esc(options.text || '')}</p>${options.action || ''}</div>`;
  }

  function errorBox(message, options = {}) {
    const title = options.title || '出了点问题';
    const retry = options.retry === false
      ? ''
      : '<button class="primary-btn" type="button" data-action="retry">重新加载</button>';
    return `<div class="error-box"><div class="error-icon">${icon(options.iconName || 'cloudOff')}</div><h2>${esc(title)}</h2><p>${esc(message || '请稍后再试')}</p>${retry}</div>`;
  }

  function footerNote(extra = '', options = {}) {
    const base = options.local
      ? '本地书库只读取本机文件，不会上传或分发。<br>请只导入自己合法拥有或公共领域/开放许可的内容。'
      : '内容来自轻小说文库官网，仅供个人试阅。<br>非官方阅读器；服务端不存储书籍文件，下载仅供本机离线阅读。';
    return `<div class="footer-note">${base}${extra ? `<br>${esc(extra)}` : ''}</div>`;
  }

  function skeletonHome() {
    const cards = Array.from({ length: 4 }, () => `<div class="book-card"><div class="skeleton-cover"></div><div class="skeleton-line" style="margin-top:10px"></div><div class="skeleton-line short" style="margin-top:6px"></div></div>`).join('');
    return `<div class="loading-page"><div class="skeleton-line title"></div><div class="skeleton-line short"></div><div class="hscroll" style="margin-top:26px">${cards}</div><div class="skeleton-line title" style="margin-top:32px;width:38%;height:20px"></div><div class="hscroll">${cards}</div></div>${tabbar('home')}`;
  }

  function skeletonBook() {
    return `<div class="loading-page"><div class="loading-book"><div class="skeleton-cover"></div><div class="loading-lines"><div class="skeleton-line title"></div><div class="skeleton-line short"></div><div class="skeleton-line" style="margin-top:18px"></div><div class="skeleton-line short" style="margin-top:8px"></div></div></div><div class="skeleton-line" style="margin-top:18px"></div><div class="skeleton-line short" style="margin-top:8px"></div></div>`;
  }

  function skeletonRows(count = 5) {
    return `<div class="loading-page">${Array.from({ length: count }, () => `<div class="list-row"><div class="skeleton-cover" style="width:54px"></div><div class="row-main"><div class="skeleton-line" style="width:52%"></div><div class="skeleton-line short" style="margin-top:8px"></div></div></div>`).join('')}</div>`;
  }

  let currentSheet = null;
  let closeTimer = null;

  function openSheet(options = {}) {
    closeSheet(true);
    const root = document.getElementById('sheet-root');
    if (!root) return null;
    const title = options.title || '';
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.setAttribute('data-action', 'close-sheet');
    const sheet = document.createElement('section');
    sheet.className = `sheet ${options.className || ''}`.trim();
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', title);
    sheet.innerHTML = `<div class="sheet-grabber"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-action="close-sheet" aria-label="关闭">${icon('close')}</button></div><div class="sheet-body ${options.bodyClass || ''}">${options.body || ''}</div>`;
    root.replaceChildren(backdrop, sheet);
    currentSheet = { root, backdrop, sheet, onConfirm: null };
    state.sheetOpen = true;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      backdrop.classList.add('open');
      sheet.classList.add('open');
    });
    if (typeof options.onMount === 'function') options.onMount(sheet);
    return sheet;
  }

  function closeSheet(immediate = false) {
    if (!currentSheet) {
      state.sheetOpen = false;
      return;
    }
    const { root, backdrop, sheet } = currentSheet;
    currentSheet = null;
    state.sheetOpen = false;
    clearTimeout(closeTimer);
    backdrop.classList.remove('open');
    sheet.classList.remove('open');
    const finish = () => {
      root.replaceChildren();
      document.body.style.overflow = '';
    };
    if (immediate) finish();
    else closeTimer = setTimeout(finish, 280);
  }

  function confirmSheet() {
    const callback = currentSheet && currentSheet.onConfirm;
    closeSheet();
    return callback ? callback() : undefined;
  }

  function openConfirmSheet(options = {}) {
    openSheet({
      title: options.title || '确认操作',
      body: `<p class="form-note" style="font-size:12.5px">${esc(options.message || '')}</p><div class="sheet-actions"><button class="ghost-btn" type="button" data-action="close-sheet">取消</button><button class="ghost-btn danger-btn" type="button" data-action="confirm-sheet">${esc(options.confirmLabel || '确认')}</button></div>`,
      onMount: (sheet) => {
        if (currentSheet) currentSheet.onConfirm = options.onConfirm || null;
        return sheet;
      },
    });
  }

  function openThemeSheet() {
    const choices = [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']];
    openSheet({
      title: '外观',
      body: `<div class="segmented">${choices.map(([value, label]) => `<button type="button" data-action="theme-choice" data-theme-value="${value}" class="${store.appTheme === value ? 'active' : ''}">${label}</button>`).join('')}</div><p class="form-note" style="margin-top:14px">外观设置仅影响书架与列表，阅读器配色可在「阅读偏好」中单独调整。</p><div class="sheet-actions"><button class="primary-btn" type="button" data-action="close-sheet">完成</button></div>`,
    });
  }

  function openReaderSettingsSheet() {
    const s = store.settings;
    const themes = [
      ['paper', '纸白'],
      ['sepia', '米黄'],
      ['night', '夜间'],
      ['black', '纯黑'],
    ];
    const fonts = [
      ['song', '宋体'],
      ['hei', '黑体'],
      ['kai', '楷体'],
    ];
    openSheet({
      title: '阅读偏好',
      body: `<div class="reader-settings"><div class="setting-block"><div class="setting-label"><strong>主题</strong></div><div class="reader-themes">${themes.map(([value, label]) => `<button type="button" data-action="reader-theme" data-value="${value}" class="${s.readerTheme === value ? 'active' : ''}"><span class="theme-swatch ${value}"></span>${label}</button>`).join('')}</div></div><div class="setting-block"><div class="setting-label"><strong>字体</strong></div><div class="segmented">${fonts.map(([value, label]) => `<button type="button" data-action="reader-font" data-value="${value}" class="${s.font === value ? 'active' : ''}">${label}</button>`).join('')}</div></div><div class="setting-block"><div class="setting-label"><span>字号</span><div class="stepper"><button type="button" data-action="reader-size" data-delta="-1" aria-label="减小字号">−</button><span id="rs-size">${s.fontSize}</span><button type="button" data-action="reader-size" data-delta="1" aria-label="增大字号">+</button></div></div></div><div class="setting-block"><div class="setting-label"><span>行距</span><strong id="rs-leading-val">${Number(s.lineHeight).toFixed(2)}</strong></div><input type="range" id="rs-leading" min="1.5" max="2.4" step="0.02" value="${s.lineHeight}"></div><div class="setting-block"><div class="setting-label"><span>左右边距</span><strong id="rs-margin-val">${s.margin}</strong></div><input type="range" id="rs-margin" min="14" max="36" step="1" value="${s.margin}"></div></div>`,
    });
  }

  function openInstallSheet() {
    const standalone = window.navigator.standalone
      || window.matchMedia('(display-mode: standalone)').matches;
    const host = location.host || 'localhost:8787';
    openSheet({
      title: '安装到主屏幕',
      body: `<p class="form-note" style="font-size:12.5px">${standalone ? '当前已经以独立应用方式运行，可以从主屏幕直接打开。' : '把它添加到 iPhone 主屏幕，就能像 App 一样全屏阅读。'}</p><div class="settings-group" style="margin-top:14px"><div class="settings-row"><span class="settings-icon">${icon('phone')}</span><span class="settings-label">1. 用 Safari 打开</span><span class="settings-value">${esc(host)}</span></div><div class="settings-row"><span class="settings-icon">${icon('download')}</span><span class="settings-label">2. 点底部「分享」</span><span class="settings-value">分享按钮</span></div><div class="settings-row"><span class="settings-icon">${icon('home')}</span><span class="settings-label">3. 选择「添加到主屏幕」</span><span class="settings-value">完成</span></div></div><p class="form-note">手机与电脑需连接同一 Wi-Fi，并保持电脑上的本地服务运行。通过局域网地址访问时可以正常安装。</p><div class="sheet-actions"><button class="primary-btn" type="button" data-action="close-sheet">知道了</button></div>`,
    });
  }

  function openAboutSheet() {
    openSheet({
      title: '关于与免责声明',
      body: `<p class="form-note" style="font-size:12.5px;line-height:1.8">「轻小说文库 · 网页版」是一个非官方、个人自用的浏览器阅读界面，用于在 iPhone 上阅读轻小说文库官网公开的试阅内容。</p><p class="form-note" style="font-size:12.5px;line-height:1.8">所有书籍信息、目录、正文与封面均来自轻小说文库官网，版权归原作者、译者与出版机构所有。本页面不存储、不打包、不提供整书下载，也不绕过任何付费或登录限制。请勿用于商业用途或二次分发。</p><p class="form-note" style="font-size:12.5px;line-height:1.8">登录功能仅把账号密码转发给官网；账号密码不会写入浏览器存储，登录会话只保存在本机 Node 服务的内存中。若你不同意以上说明，请停止使用。</p><div class="sheet-actions"><a class="ghost-btn" href="https://www.wenku8.net" target="_blank" rel="noopener noreferrer">访问官网</a><button class="primary-btn" type="button" data-action="close-sheet">关闭</button></div><p class="form-note" style="text-align:center;margin-top:18px">v1.0.0 · 非官方客户端</p>`,
    });
  }

  function openShelfMenu(id) {
    const item = WK.findShelf(id);
    if (!item) return;
    const continueHref = item.lastChapterId
      ? `#/read/${item.bookId || item.id}/${item.lastChapterId}`
      : `#/book/${item.id}`;
    const progress = Number(item.percent) || 0;
    openSheet({
      title: item.title || '书架',
      body: `<div class="list-row" style="border-bottom:0;padding-top:0">${coverHtml(item)}<div class="row-main"><h3>${esc(item.title || '未命名')}</h3><div class="row-sub"><span>${esc(item.author || '')}</span><span>${progress}%</span></div><div class="progress-track" style="margin-top:9px"><i style="width:${Math.max(0, Math.min(100, progress))}%"></i></div></div></div><div class="sheet-actions"><a class="primary-btn" href="${continueHref}">${item.lastChapterId ? '继续阅读' : '查看书籍'}</a><a class="ghost-btn" href="#/book/${item.id}">书籍详情</a></div><div class="sheet-actions" style="margin-top:16px"><button class="ghost-btn danger-btn" type="button" data-action="remove-shelf" data-id="${esc(item.id)}">从书架移除</button></div>`,
    });
  }

  let lightboxOpen = false;
  function openLightbox(src) {
    const box = $('#lightbox');
    const img = $('#lightbox-img');
    if (!box || !img || !src) return;
    img.src = src;
    box.hidden = false;
    lightboxOpen = true;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    const box = $('#lightbox');
    const img = $('#lightbox-img');
    if (!box) return;
    box.hidden = true;
    if (img) img.removeAttribute('src');
    lightboxOpen = false;
    if (!state.sheetOpen) document.body.style.overflow = '';
  }

  function isLightboxOpen() {
    return lightboxOpen;
  }

  WK.coverHtml = coverHtml;
  WK.bookCard = bookCard;
  WK.rankGrid = rankGrid;
  WK.bookRow = bookRow;
  WK.bookRows = bookRows;
  WK.topbar = topbar;
  WK.tabbar = tabbar;
  WK.sectionHead = sectionHead;
  WK.emptyState = emptyState;
  WK.errorBox = errorBox;
  WK.footerNote = footerNote;
  WK.skeletonHome = skeletonHome;
  WK.skeletonBook = skeletonBook;
  WK.skeletonRows = skeletonRows;
  WK.sheet = {
    open: openSheet,
    close: closeSheet,
    confirm: confirmSheet,
    get current() {
      return currentSheet;
    },
  };
  WK.openThemeSheet = openThemeSheet;
  WK.openReaderSettingsSheet = openReaderSettingsSheet;
  WK.openInstallSheet = openInstallSheet;
  WK.openAboutSheet = openAboutSheet;
  WK.openConfirmSheet = openConfirmSheet;
  WK.openShelfMenu = openShelfMenu;
  WK.openLightbox = openLightbox;
  WK.closeLightbox = closeLightbox;
  WK.isLightboxOpen = isLightboxOpen;
  WK.themeLabel = themeLabel;
})();

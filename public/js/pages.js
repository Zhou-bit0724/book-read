'use strict';

(function () {
  const WK = window.WK;
  const {
    $, esc, icon, api, store, state, loadBook, latestHistory, findShelf,
    formatWords, formatDuration, timeAgo, todayLabel, themeLabel,
    coverHtml, bookCard, rankGrid, bookRows, topbar, tabbar, sectionHead,
    emptyState, errorBox, footerNote, skeletonHome, skeletonBook,
  } = WK;

  const READER_THEME_LABELS = {
    paper: '纸白',
    sepia: '米黄',
    night: '夜间',
    black: '纯黑',
  };

  function settingRow(options) {
    const value = options.value ? `<span class="settings-value">${esc(options.value)}</span>` : '';
    const inner = `<span class="settings-icon">${icon(options.iconName || 'right')}</span><span class="settings-label">${esc(options.label)}</span>${value}${icon('right', 'chevron')}`;
    if (options.href) {
      return `<a class="settings-row" href="${esc(options.href)}"${options.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
    }
    return `<button class="settings-row" type="button"${options.action ? ` data-action="${options.action}"` : ''}>${inner}</button>`;
  }

  function readerThemeLabel() {
    return READER_THEME_LABELS[store.settings.readerTheme] || '纸白';
  }

  async function pageHome(ctx) {
    WK.setTitle('');
    const app = $('#app');
    const downloads = WK.offline.list();
    if (!navigator.onLine) {
      renderOfflineHome(app);
      return;
    }
    app.innerHTML = skeletonHome();
    let data;
    try {
      data = await api('/api/home');
      if (!ctx.alive()) return;
      state.home = data;
      renderHome(app, data);
    } catch (error) {
      if (!ctx.alive()) return;
      if (state.home) {
        renderHome(app, state.home);
        WK.toast('刷新失败，正在显示缓存内容');
        return;
      }
      if (downloads.length) {
        renderOfflineHome(app, error.message);
        return;
      }
      app.innerHTML = `<section class="hero"><div class="hero-row"><div><p class="eyebrow">轻小说 · 文库</p><h1>今晚，读点什么</h1><p>${esc(todayLabel())}</p></div><a class="icon-btn glass" href="#/me" aria-label="我的">${icon('user')}</a></div></section>${errorBox(error.message)}${tabbar('home')}`;
    }
  }

  function renderHome(app, data) {
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const sugoi = data.sugoi || { books: [], year: 2026 };
    const continueItem = latestHistory();
    const downloads = WK.offline.list();
    const sectionHtml = sections
      .filter((section) => Array.isArray(section.books) && section.books.length)
      .map((section) => `<section class="section">${sectionHead(section.title)}<div class="hscroll">${section.books.map((book) => bookCard(book)).join('')}</div></section>`)
      .join('');
    const sugoiHtml = Array.isArray(sugoi.books) && sugoi.books.length
      ? `<section class="section">${sectionHead('年度精选', `#/sugoi/${encodeURIComponent(sugoi.year || 2026)}`, '全部')}<div class="grid-books rank-grid">${sugoi.books.slice(0, 6).map((book, index) => bookCard(book, { rank: index + 1 })).join('')}</div></section>`
      : '';
    const offlineHtml = downloads.length
      ? `<section class="section">${sectionHead('离线书架', '#/offline', '管理')}<div class="hscroll">${downloads.slice(0, 8).map((item) => bookCard(item)).join('')}</div></section>`
      : '';
    const local = WK.library.cachedIndex().books
      .filter((item) => navigator.onLine || WK.library.isDownloaded(item.id));
    const localHtml = local.length
      ? `<section class="section">${sectionHead('本地书库', '#/library', '全部')}<div class="hscroll">${local.slice(0, 8).map((item) => bookCard(item, { href: `#/library/${encodeURIComponent(item.id)}` })).join('')}</div></section>`
      : '';
    app.innerHTML = `<section class="hero"><div class="hero-row"><div><p class="eyebrow">轻小说 · 文库</p><h1>今晚，读点什么</h1><p>${esc(todayLabel())} · 可下载离线阅读</p></div><a class="icon-btn glass" href="#/me" aria-label="我的">${icon('user')}</a></div></section><button class="search-pill" type="button" data-action="open-search">${icon('search')}<span>搜索已下载书籍</span></button>${continueItem ? `<section class="section">${sectionHead('继续阅读')}${continueCard(continueItem)}</section>` : ''}${offlineHtml}${localHtml}${sectionHtml}${sugoiHtml}${footerNote()}${tabbar('home')}`;
  }

  function renderOfflineHome(app, notice) {
    const downloads = WK.offline.list();
    const noticeHtml = notice
      ? `<div class="offline-note">${icon('cloudOff')}<div><strong>当前无法连接服务</strong><p>${esc(notice)}</p></div></div>`
      : `<div class="offline-note">${icon('cloudOff')}<div><strong>离线模式</strong><p>正在读取已下载到本机的书籍。</p></div></div>`;
    app.innerHTML = `<section class="hero"><div class="hero-row"><div><p class="eyebrow">轻小说 · 文库</p><h1>离线书架</h1><p>${downloads.length} 本已下载 · 无需联网</p></div><a class="icon-btn glass" href="#/me" aria-label="我的">${icon('user')}</a></div></section>${noticeHtml}<section class="section">${sectionHead('本地书籍', '#/offline', '管理')}${offlineRows(downloads)}</section>${tabbar('home')}`;
  }

  function offlineRows(items) {
    if (!items.length) {
      const action = navigator.onLine ? '<a class="primary-btn" href="#/home">去发现</a>' : '';
      return emptyState({ iconName: 'cloudOff', title: '还没有离线书籍', text: '联网时打开一本书，点「下载到手机」，断网后就能从这里继续读。', action });
    }
    return `<div class="list-rows">${items.map((item) => `<div class="list-row"><a class="row-anchor" href="#/book/${encodeURIComponent(item.id)}">${coverHtml(item)}<div class="row-main"><h3>${esc(item.title || '未命名')}</h3><div class="row-sub"><span>${esc(item.author || '')}</span><span>${Number(item.chapterCount) || 0} 章 · 离线可读</span></div></div></a><button class="shelf-menu offline-remove" type="button" data-action="offline-remove" data-id="${esc(item.id)}" aria-label="删除下载">${icon('close')}</button></div>`).join('')}</div>`;
  }

  function continueCard(item) {
    const percent = Math.max(0, Math.min(100, Math.round(Number(item.percent) || 0)));
    const background = item.cover
      ? `<div class="continue-bg" style="background-image:url('${esc(item.cover)}')"></div>`
      : '';
    const style = item.cover ? '' : ' style="background:linear-gradient(135deg,#46685a,#22362d)"';
    const href = item.source === 'library'
      ? `#/library/${encodeURIComponent(item.bookId)}/read/${encodeURIComponent(item.chapterId)}`
      : `#/read/${encodeURIComponent(item.bookId)}/${encodeURIComponent(item.chapterId)}`;
    return `<a class="continue-card" href="${href}"${style}>${background}<div class="continue-body"><p class="eyebrow" style="color:#d7c49b">上次读到</p><h3>${esc(item.title || '未命名')}</h3><p>${esc(item.chapterTitle || '')}</p><div class="continue-progress"><div class="progress-track"><i style="width:${percent}%"></i></div><span>${percent}%</span></div><span class="continue-cta">接着上次读 ${icon('arrowRight')}</span></div></a>`;
  }

  function pageShelf(ctx) {
    WK.setTitle('书架');
    const app = $('#app');
    const items = store.shelf.slice().sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
    const action = `<a class="icon-btn" href="#/search" aria-label="搜索">${icon('search')}</a>`;
    if (!items.length) {
      app.innerHTML = `${topbar({ title: '书架', sub: '本地收藏', actions: action })}${emptyState({ iconName: 'bookmark', title: '书架还是空的', text: '在书籍详情页点「加入书架」，阅读进度也会自动保存在这里。', action: '<a class="primary-btn" href="#/home">去发现</a>' })}${tabbar('shelf')}`;
      return;
    }
    const grid = store.shelfView === 'grid';
    const body = grid ? renderShelfGrid(items) : renderShelfList(items);
    app.innerHTML = `${topbar({ title: '书架', sub: `${items.length} 本`, actions: action })}<div class="shelf-summary"><span>${items.length} 本收藏 · 阅读进度自动保存</span><div class="seg"><button type="button" data-action="shelf-view" data-view="grid" class="${grid ? 'active' : ''}" aria-label="网格视图">${icon('grid')}</button><button type="button" data-action="shelf-view" data-view="list" class="${grid ? '' : 'active'}" aria-label="列表视图">${icon('list')}</button></div></div>${body}${footerNote()}${tabbar('shelf')}`;
  }

  function shelfParts(item) {
    const history = store.history[item.id] || {};
    const percent = Math.max(0, Math.min(100, Math.round(Number(item.percent != null ? item.percent : history.percent) || 0)));
    const lastChapterTitle = item.lastChapterTitle || history.chapterTitle || '尚未开始';
    return { history, percent, lastChapterTitle };
  }

  function renderShelfGrid(items) {
    return `<div class="grid-books">${items.map((item) => {
      const { percent, lastChapterTitle } = shelfParts(item);
      return `<div class="book-card shelf-card" data-shelf-id="${esc(item.id)}"><button class="shelf-menu" type="button" data-action="shelf-menu" data-id="${esc(item.id)}" aria-label="书架菜单">${icon('more')}</button><a href="#/book/${encodeURIComponent(item.id)}">${coverHtml(item)}<div class="book-meta-line">${esc(item.title || '未命名')}</div><div class="book-sub">${esc(lastChapterTitle)}</div></a><div class="progress-track"><i style="width:${percent}%"></i></div></div>`;
    }).join('')}</div>`;
  }

  function renderShelfList(items) {
    return `<div class="list-rows">${items.map((item) => {
      const { percent, lastChapterTitle } = shelfParts(item);
      return `<div class="list-row shelf-row" data-shelf-id="${esc(item.id)}"><a class="row-anchor" href="#/book/${encodeURIComponent(item.id)}">${coverHtml(item)}<div class="row-main"><h3>${esc(item.title || '未命名')}</h3><div class="row-sub"><span>${esc(item.author || '')}</span><span>${percent}% · ${esc(lastChapterTitle)}</span></div><div class="progress-track shelf-progress"><i style="width:${percent}%"></i></div></div></a><button class="shelf-menu" type="button" data-action="shelf-menu" data-id="${esc(item.id)}" aria-label="书架菜单">${icon('more')}</button></div>`;
    }).join('')}</div>`;
  }

  function pageMe(ctx) {
    WK.setTitle('我的');
    const app = $('#app');
    const readCount = Object.keys(store.read).length;
    const downloadCount = WK.offline.list().length;
    const libraryCount = WK.library.cachedIndex().books.length;
    app.innerHTML = `${topbar({ title: '我的', back: false, actions: `<button class="icon-btn" type="button" data-action="theme-sheet" aria-label="外观">${icon('sun')}</button>` })}<div class="me-card"><div class="avatar">本</div><div class="me-main"><h2>本地阅读</h2><p>无需登录 · 下载后断网可读</p></div></div><div class="stats"><div class="stat"><strong>${store.shelf.length}</strong><span>书架</span></div><div class="stat"><strong>${downloadCount}</strong><span>已下载</span></div><div class="stat"><strong>${readCount}</strong><span>已读章节</span></div></div><div class="settings-group">${settingRow({ iconName: 'text', label: '阅读偏好', value: `${readerThemeLabel()} · ${store.settings.fontSize}px`, action: 'reader-settings' })}${settingRow({ iconName: 'sun', label: '外观', value: themeLabel(), action: 'theme-sheet' })}${settingRow({ iconName: store.shelfView === 'grid' ? 'grid' : 'list', label: '书架布局', value: store.shelfView === 'grid' ? '网格' : '列表', action: 'toggle-shelf-view' })}</div><div class="settings-group">${settingRow({ iconName: 'bookOpen', label: '本地书库', value: `${libraryCount} 本`, href: '#/library' })}${settingRow({ iconName: 'download', label: '离线书架', value: `${downloadCount} 本`, href: '#/offline' })}${settingRow({ iconName: 'bookOpen', label: '年度精选', value: '轻厉榜单', href: '#/sugoi/2026' })}</div><div class="settings-group">${settingRow({ iconName: 'phone', label: '安装到主屏幕', value: 'PWA', action: 'install' })}${settingRow({ iconName: 'info', label: '关于与免责声明', action: 'about' })}${settingRow({ iconName: 'external', label: '访问官网', value: 'wenku8.net', href: 'https://www.wenku8.net', external: true })}</div>${footerNote('非官方客户端 · 本地离线版')}${tabbar('me')}`;
  }

  async function pageOffline(ctx) {
    WK.setTitle('离线书架');
    const app = $('#app');
    const items = WK.offline.list();
    app.innerHTML = `${topbar({ title: '离线书架', sub: `${items.length} 本` })}<div class="offline-note">${icon('download')}<div><strong>数据保存在这台设备</strong><p id="offline-storage">正在统计本地空间…</p></div></div><section class="section">${offlineRows(items)}</section>${footerNote('断网后从主屏幕打开，仍可读已下载书籍。')}`;
    const estimate = await WK.offline.storageEstimate();
    const el = $('#offline-storage');
    if (el && estimate) {
      const mb = (Number(estimate.usage) || 0) / 1024 / 1024;
      el.textContent = `已用 ${mb < 0.1 ? '<0.1' : mb.toFixed(1)} MB，下载内容仅存于本机。`;
    }
  }

  function libraryGrouped(books) {
    const groups = new Map();
    for (const book of books) {
      const key = book.category || '本地书库';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(book);
    }
    return [...groups.entries()].map(([title, items]) => `<section class="section"><div class="section-head"><h2>${esc(title)}</h2><span class="more">${items.length} 本</span></div><div class="grid-books">${items.map((book) => {
      const downloaded = WK.library.isDownloaded(book.id);
      const label = book.author || (book.format === 'pdf' ? 'PDF' : '本地文件');
      return bookCard(book, {
        href: `#/library/${encodeURIComponent(book.id)}`,
        sub: downloaded ? `已下载 · ${label}` : label,
      });
    }).join('')}</div></section>`).join('');
  }

  function libraryIndexHtml(data, notice) {
    const books = Array.isArray(data && data.books) ? data.books : [];
    const errors = Array.isArray(data && data.errors) ? data.errors : [];
    const errorHtml = errors.length
      ? `<div class="offline-note">${icon('info')}<div><strong>${errors.length} 个文件未能导入</strong><p>${errors.slice(0, 3).map((item) => `${esc(item.file)}：${esc(item.error)}`).join('<br>')}</p></div></div>`
      : '';
    const noticeHtml = notice
      ? `<div class="offline-note">${icon('cloudOff')}<div><strong>当前使用本地缓存目录</strong><p>${esc(notice)}</p></div></div>`
      : '';
    const body = books.length
      ? libraryGrouped(books)
      : emptyState({
        iconName: 'bookOpen',
        title: '本地书库还是空的',
        text: '把合法拥有的 TXT、Markdown、EPUB 或 PDF 放到项目的 library/ 文件夹，然后点右上角刷新。文件只留在电脑上，不会提交到 Git。',
      });
    return `${topbar({ title: '本地书库', sub: `${books.length} 本`, actions: `<button class="icon-btn" type="button" data-action="library-refresh" aria-label="重新扫描">${icon('refresh')}</button>` })}<div class="offline-note">${icon('bookOpen')}<div><strong>你自己的书，只在这台设备</strong><p>支持 TXT / Markdown / EPUB / PDF；公共领域示例会随项目提供。</p></div></div>${noticeHtml}${errorHtml}${body}${footerNote('只扫描 library/ 与 resources/samples/。', { local: true })}${tabbar('library')}`;
  }

  async function pageLibrary(ctx) {
    WK.setTitle('本地书库');
    const app = $('#app');
    const raw = WK.library.cachedIndex();
    const offlineView = !navigator.onLine
      ? { ...raw, books: raw.books.filter((book) => WK.library.isDownloaded(book.id)) }
      : raw;
    app.innerHTML = libraryIndexHtml(offlineView, navigator.onLine ? '' : '当前离线，只显示已经下载到手机的本地书。');
    try {
      const data = await WK.library.fetchIndex();
      if (!ctx.alive()) return;
      app.innerHTML = libraryIndexHtml(data);
    } catch (error) {
      if (!ctx.alive()) return;
      app.innerHTML = libraryIndexHtml(offlineView, error.message || '无法连接本地服务');
    }
  }

  async function pageLibraryBook(ctx, id) {
    WK.setTitle('本地书籍');
    const app = $('#app');
    app.innerHTML = `${topbar({ title: '本地书籍' })}${skeletonBook()}`;
    let book;
    try {
      book = await WK.library.loadBook(id);
    } catch (error) {
      if (!ctx.alive()) return;
      app.innerHTML = `${topbar({ title: '本地书籍' })}${errorBox(error.message || '无法读取本地书籍')}${tabbar('library')}`;
      return;
    }
    if (!ctx.alive() || !book) return;
    state.books.set(String(book.id), book);
    renderLibraryBook(app, book);
  }

  function renderLibraryBook(app, book) {
    WK.setTitle(book.title || '本地书籍');
    const first = book.firstChapter || (Array.isArray(book.chapters) ? book.chapters[0] : null);
    const downloaded = WK.library.isDownloaded(book.id);
    const format = String(book.format || '').toUpperCase();
    const readButton = first
      ? `<a class="primary-btn" href="#/library/${encodeURIComponent(book.id)}/read/${encodeURIComponent(first.id)}">${icon('bookOpen')}<span>开始阅读</span></a>`
      : `<a class="primary-btn" href="/api/library/${encodeURIComponent(book.id)}/file" target="_blank" rel="noopener">${icon('external')}<span>打开 PDF</span></a>`;
    const downloadButton = !first
      ? ''
      : downloaded
        ? `<button class="ghost-btn" type="button" data-action="library-remove" data-id="${esc(book.id)}">${icon('download')}<span>已下载</span></button>`
        : `<button class="ghost-btn" id="library-download" type="button" data-action="library-download" data-id="${esc(book.id)}">${icon('download')}<span>下载到手机</span></button>`;
    const stats = [
      format,
      book.chapterCount ? `${book.chapterCount} 章` : '',
      book.words ? formatWords(book.words) : '',
      book.seed ? '随项目提供' : '本机导入',
    ].filter(Boolean).map((item) => `<span>${esc(item)}</span>`).join('');
    const description = book.description
      ? `<div class="desc-card"><p>${esc(book.description)}</p></div>`
      : '';
    const toc = Array.isArray(book.chapters) && book.chapters.length
      ? `<div class="section"><div class="toc-head"><h2>目录</h2><span>${book.chapters.length} 章</span></div><details class="volume" open><summary><span>正文</span><span class="vol-count">${book.chapters.length} 章</span>${icon('right')}</summary>${book.chapters.map((chapter, index) => `<a class="chapter-row" href="#/library/${encodeURIComponent(book.id)}/read/${encodeURIComponent(chapter.id)}"><span class="chapter-index">${String(index + 1).padStart(3, '0')}</span><span class="chapter-name">${esc(chapter.title)}</span></a>`).join('')}</details></div>`
      : '';
    app.innerHTML = `${topbar({ title: '本地书籍', actions: `<a class="icon-btn" href="#/library" aria-label="返回本地书库">${icon('list')}</a>` })}<div class="book-hero">${coverHtml(book)}<div class="hero-main"><h1>${esc(book.title || '未命名')}</h1><p class="author">${esc(book.author || '作者未知')}</p><div class="chips"><span class="chip accent">本地</span>${book.category ? `<span class="chip">${esc(book.category)}</span>` : ''}</div><div class="hero-stats">${stats}</div></div></div><div class="book-actions">${readButton}${downloadButton}</div><div id="library-progress" class="download-progress" hidden><div class="progress-track"><i></i></div><span></span></div>${description}${toc}${footerNote('', { local: true })}${tabbar('library')}`;
  }

  function searchBar(query) {
    return `<form class="search-bar" data-form="search" role="search"><button class="icon-btn" type="button" data-action="back" aria-label="返回">${icon('back')}</button><div class="search-input-wrap">${icon('search')}<input name="q" type="search" value="${esc(query)}" placeholder="搜索书名或作者" enterkeyhint="search" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">${query ? `<button class="icon-btn small" type="button" data-action="clear-search" aria-label="清空">${icon('close')}</button>` : ''}</div><button class="search-go" type="submit">搜索</button></form>`;
  }

  function pageSearch(ctx, queryParams) {
    const app = $('#app');
    const query = (queryParams.get('q') || '').trim();
    WK.setTitle(query ? `搜索 · ${query}` : '搜索');
    app.innerHTML = `<div class="search-page">${searchBar(query)}<div id="search-content"></div></div>`;
    const content = $('#search-content');
    const downloads = WK.offline.list();
    const localDownloads = WK.library.downloadedList();
    if (!query) {
      content.innerHTML = `<p class="search-hint">只搜索已下载到手机的书籍，共 ${downloads.length + localDownloads.length} 本。</p>${recentSearches()}`;
      return;
    }
    rememberSearch(query);
    const books = WK.offline.search(query);
    const localBooks = WK.library.search(query);
    const localHtml = localBooks.length
      ? `<div class="section" style="margin-top:20px"><div class="section-head"><h2>本地书库</h2><span class="more">${localBooks.length} 本</span></div><div class="grid-books">${localBooks.map((book) => bookCard(book, { href: `#/library/${encodeURIComponent(book.id)}`, sub: book.author || '本地文件' })).join('')}</div></div>`
      : '';
    content.innerHTML = `<div class="section" style="margin-top:20px"><div class="section-head"><h2>本地搜索结果</h2><span class="more">${books.length} 本</span></div>${books.length ? bookRows(books) : emptyState({ iconName: 'search', title: '没有找到这本书', text: '搜索范围是已下载书籍；请先在官网书籍详情页下载整本，或把本地文件导入 library/ 后下载到手机。' })}</div>${localHtml}${recentSearches()}`;
  }

  function recentSearches() {
    if (!store.recent.length) return '';
    return `<div class="section" style="margin-top:28px"><div class="section-head"><h2>最近搜索</h2><button class="more" type="button" data-action="clear-recent">清空</button></div><div class="recent-searches">${store.recent.map((item) => `<a href="#/search?q=${encodeURIComponent(item)}">${esc(item)}</a>`).join('')}</div></div>`;
  }

  function rememberSearch(query) {
    store.recent = [query].concat(store.recent.filter((item) => item !== query)).slice(0, 10);
    WK.saveRecent();
  }

  async function pageSugoi(ctx, year) {
    const y = Math.max(2005, Math.min(2100, Number(year) || 2026));
    WK.setTitle('年度精选');
    const app = $('#app');
    const fallbackYears = Array.from({ length: 22 }, (_, index) => 2026 - index);
    app.innerHTML = `${topbar({ title: '年度精选', sub: `${y} 年` })}<div class="year-pills">${fallbackYears.map((item) => `<a href="#/sugoi/${item}" class="${item === y ? 'active' : ''}">${item}</a>`).join('')}</div><div id="sugoi-content">${skeletonBook()}</div>`;
    const content = $('#sugoi-content');
    try {
      const data = await api(`/api/sugoi?year=${y}`);
      if (!ctx.alive()) return;
      const years = Array.isArray(data.years) && data.years.length ? data.years : fallbackYears;
      const bookList = data.books || [];
      const pills = `<div class="year-pills">${years.map((item) => `<a href="#/sugoi/${item}" class="${item === y ? 'active' : ''}">${item}</a>`).join('')}</div>`;
      content.innerHTML = `${pills}<div class="section" style="margin-top:0"><div class="section-head"><h2>${y} 年榜单</h2><span class="more">${bookList.length} 本</span></div>${bookList.length ? rankGrid(bookList, 1) : emptyState({ iconName: 'bookOpen', title: '这一年还没有榜单', text: '换一个年份看看。' })}</div>${footerNote('榜单来自「这本轻小说真厉害！」年度评选。')}`;
      const parent = content.parentElement;
      const oldPills = parent.querySelector('.year-pills');
      if (oldPills) oldPills.remove();
    } catch (error) {
      if (!ctx.alive()) return;
      content.innerHTML = errorBox(error.message);
    }
  }


  async function pageBook(ctx, id) {
    WK.setTitle('书籍详情');
    const app = $('#app');
    const cached = state.books.get(String(id));
    if (!cached) app.innerHTML = `${topbar({ title: '书籍详情' })}${skeletonBook()}`;
    let book = cached;
    if (!book && !navigator.onLine) book = await WK.offline.loadBook(id);
    if (!ctx.alive()) return;
    if (book) {
      renderBook(app, book);
      return;
    }
    try {
      book = await loadBook(id);
      if (!ctx.alive()) return;
      renderBook(app, book);
    } catch (error) {
      if (!ctx.alive()) return;
      const local = await WK.offline.loadBook(id);
      if (!ctx.alive()) return;
      if (local) {
        renderBook(app, local);
        return;
      }
      app.innerHTML = `${topbar({ title: '书籍详情' })}${errorBox(error.message)}`;
    }
  }

  function renderBook(app, book) {
    WK.setTitle(book.title || '书籍详情');
    const history = store.history[book.id] || null;
    const inShelf = Boolean(findShelf(book.id));
    const downloaded = WK.offline.isDownloaded(book.id);
    const first = book.firstChapter || (Array.isArray(book.chapters) ? book.chapters[0] : null);
    const startId = history && history.chapterId ? history.chapterId : first && first.id;
    const readingLabel = history && history.chapterId ? '继续阅读' : '开始阅读';
    const reading = startId
      ? `<a class="primary-btn" href="#/read/${encodeURIComponent(book.id)}/${encodeURIComponent(startId)}">${icon('bookOpen')}<span>${readingLabel}</span></a>`
      : '<span class="primary-btn" style="opacity:.45">暂无章节</span>';
    const categoryChip = book.category ? `<span class="chip accent">${esc(book.category)}</span>` : '';
    const downloadButton = downloaded
      ? `<button class="ghost-btn" type="button" data-action="download-manage" data-id="${esc(book.id)}">${icon('download')}<span>已下载</span></button>`
      : `<button class="ghost-btn" id="download-book" type="button" data-action="download-book" data-id="${esc(book.id)}">${icon('download')}<span>下载到手机</span></button>`;
    const offlineChip = downloaded ? '<span class="chip accent">离线可读</span>' : '';
    const stats = [
      book.wordsText || formatWords(book.words),
      book.chapterCount ? `${book.chapterCount} 章` : '',
      book.followers ? `${book.followers} 人关注` : '',
      book.updated ? `更新于 ${book.updated}` : '',
      book.heat || '',
    ].filter(Boolean).map((item) => `<span>${esc(item)}</span>`).join('');
    const tags = Array.isArray(book.tags) && book.tags.length
      ? `<div class="book-tags">${book.tags.map((tag) => `<span class="chip">${esc(tag)}</span>`).join('')}</div>`
      : '';
    const description = book.description || '';
    const desc = description
      ? `<div class="desc-card ${description.length > 170 ? 'clamped' : ''}"><p>${esc(description)}</p>${description.length > 170 ? '<button class="desc-toggle" type="button" data-action="desc-toggle">展开简介</button>' : ''}</div>`
      : '';
    const toc = renderToc(book, history);
    const related = Array.isArray(book.related) && book.related.length
      ? `<section class="section">${sectionHead('同分类推荐')}<div class="hscroll">${book.related.map((item) => bookCard(item)).join('')}</div></section>`
      : '';
    const official = book.officialUrl || `https://www.wenku8.net/book/${book.id}.htm`;
    app.innerHTML = `${topbar({ title: '书籍详情', actions: `<a class="icon-btn" href="${esc(official)}" target="_blank" rel="noopener noreferrer" aria-label="在官网打开">${icon('external')}</a>` })}<div class="book-hero">${coverHtml(book)}<div class="hero-main"><h1>${esc(book.title || '未命名')}</h1><p class="author">${esc(book.author || '作者未知')}</p><div class="chips">${categoryChip}${offlineChip}${book.status ? `<span class="chip">${esc(book.status)}</span>` : ''}</div><div class="hero-stats">${stats}</div></div></div><div class="book-actions">${reading}<button class="ghost-btn" id="shelf-toggle" type="button" data-action="toggle-shelf" data-id="${esc(book.id)}" aria-pressed="${inShelf}">${icon('bookmark')}<span id="shelf-label">${inShelf ? '已在书架' : '加入书架'}</span></button>${downloadButton}</div><div id="download-progress" class="download-progress" hidden><div class="progress-track"><i></i></div><span></span></div>${desc}${tags}${toc}${related}${footerNote()}`;
  }

  function renderToc(book, history) {
    const volumes = Array.isArray(book.volumes) ? book.volumes.filter((volume) => volume.chapters && volume.chapters.length) : [];
    const currentCid = history && history.chapterId ? Number(history.chapterId) : null;
    if (!volumes.length) {
      return `<div class="section"><div class="toc-head"><h2>目录</h2><span>${Number(book.chapterCount) || 0} 章</span></div><div class="empty-toc">目录暂时无法获取，可能官网正在维护。</div></div>`;
    }
    const volumeHtml = volumes.map((volume, index) => {
      const hasCurrent = currentCid ? volume.chapters.some((chapter) => Number(chapter.id) === currentCid) : false;
      const open = hasCurrent || (index === 0 && currentCid == null);
      return `<details class="volume" ${open ? 'open' : ''}><summary><span>${esc(volume.title || '正文')}</span><span class="vol-count">${volume.chapters.length} 章</span>${icon('right')}</summary>${volume.chapters.map((chapter) => `<a class="chapter-row ${Number(chapter.id) === currentCid ? 'current' : ''}" href="#/read/${encodeURIComponent(book.id)}/${encodeURIComponent(chapter.id)}"><span class="chapter-index">${String((Number(chapter.index) || 0) + 1).padStart(3, '0')}</span><span class="chapter-name">${esc(chapter.title)}</span></a>`).join('')}</details>`;
    }).join('');
    return `<div class="section"><div class="toc-head"><h2>目录</h2><span>${Number(book.chapterCount) || 0} 章</span></div>${volumeHtml}</div>`;
  }

  async function toggleShelf(id) {
    const index = store.shelf.findIndex((item) => String(item.id) === String(id));
    if (index >= 0) {
      store.shelf.splice(index, 1);
      WK.saveShelf();
      WK.toast('已从书架移除');
      updateShelfButton(id);
      return;
    }
    try {
      const book = state.books.get(String(id)) || await loadBook(id);
      const history = store.history[book.id] || {};
      store.shelf.unshift({
        id: book.id,
        bookId: book.id,
        title: book.title,
        author: book.author,
        cover: book.cover,
        addedAt: Date.now(),
        updatedAt: Date.now(),
        lastChapterId: history.chapterId || null,
        lastChapterTitle: history.chapterTitle || '',
        percent: Number(history.percent) || 0,
      });
      WK.saveShelf();
      WK.toast('已加入书架');
      updateShelfButton(id);
    } catch (error) {
      WK.toast(error.message || '加入书架失败');
    }
  }

  function updateShelfButton(id) {
    const button = $('#shelf-toggle');
    if (!button || String(button.dataset.id) !== String(id)) return;
    const inShelf = Boolean(findShelf(id));
    button.setAttribute('aria-pressed', String(inShelf));
    const label = $('#shelf-label', button);
    if (label) label.textContent = inShelf ? '已在书架' : '加入书架';
  }

  function removeShelf(id) {
    const index = store.shelf.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return;
    store.shelf.splice(index, 1);
    WK.saveShelf();
    WK.sheet.close();
    WK.toast('已从书架移除');
    if (state.currentPath === '/shelf') {
      WK.renderRoute({ preserveScroll: true, scrollY: window.scrollY });
    } else {
      updateShelfButton(id);
    }
  }

  WK.pages = {
    home: pageHome,
    shelf: pageShelf,
    me: pageMe,
    search: pageSearch,
    sugoi: pageSugoi,
    offline: pageOffline,
    library: pageLibrary,
    libraryBook: pageLibraryBook,
    book: pageBook,
  };
  WK.toggleShelf = toggleShelf;
  WK.removeShelf = removeShelf;
})();

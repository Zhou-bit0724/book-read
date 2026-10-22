'use strict';

(function () {
  const WK = window.WK;
  const {
    $, esc, icon, api, store, state, loadBook, markRead,
    applyReaderSettings, toast, onCleanup,
  } = WK;

  let activeSession = null;

  function navButton(label, iconName, href, disabled) {
    if (disabled) {
      return `<button class="nav-disabled" type="button" disabled>${icon(iconName)}<span>${label}</span></button>`;
    }
    return `<a href="${href}">${icon(iconName)}<span>${label}</span></a>`;
  }

  function navHtml(bookId, chapter) {
    const prev = chapter.prev
      ? navButton('上一章', 'arrowLeft', `#/read/${bookId}/${chapter.prev}`, false)
      : navButton('上一章', 'arrowLeft', '#', true);
    const next = chapter.next
      ? navButton('下一章', 'arrowRight', `#/read/${bookId}/${chapter.next}`, false)
      : navButton('下一章', 'arrowRight', '#', true);
    return `${prev}<button class="chapter-jump" type="button" data-action="open-toc">${icon('list')}<span>目录</span></button><span class="reader-progress-text" id="reader-pos"></span>${next}`;
  }

  function shell(bookId, bookTitle, chapterTitle) {
    return `<div class="reader-page" id="reader-page"><div class="reader-progress" id="reader-progress"></div><header class="reader-top"><a class="icon-btn" href="#/book/${bookId}" aria-label="返回书籍">${icon('back')}</a><div class="reader-head-title"><strong id="reader-book-title">${esc(bookTitle)}</strong><span id="reader-chapter-title">${esc(chapterTitle)}</span></div><button class="icon-btn" type="button" data-action="open-toc" aria-label="目录">${icon('list')}</button><button class="icon-btn" type="button" data-action="reader-settings" aria-label="阅读设置">${icon('settings')}</button></header><main class="reader-content" id="reader-content"><div class="reader-loading"><div class="skeleton-line title"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div></main><footer class="reader-bottom"><div class="reader-nav" id="reader-nav"><button class="nav-disabled" type="button" disabled>${icon('arrowLeft')}<span>上一章</span></button><button class="chapter-jump" type="button" data-action="open-toc">${icon('list')}<span>目录</span></button><span class="reader-progress-text"></span><button class="nav-disabled" type="button" disabled>${icon('arrowRight')}<span>下一章</span></button></div></footer></div>`;
  }

  async function pageReader(ctx, bookId, cid) {
    const id = Number(bookId);
    const chapterId = Number(cid);
    const app = $('#app');
    const known = state.books.get(String(id));
    const previous = store.history[id];
    const shellTitle = (known && known.title) || (previous && previous.title) || '阅读';
    WK.setTitle('阅读');
    app.innerHTML = shell(id, shellTitle, '');
    applyReaderSettings();
    const content = $('#reader-content');
    let chapter;
    try {
      chapter = await api(`/api/chapter/${id}/${chapterId}`);
    } catch (error) {
      chapter = await WK.offline.loadChapter(id, chapterId);
      if (!ctx.alive()) return;
      if (!chapter) {
        showError(content, id, error);
        return;
      }
    }
    if (!ctx.alive()) return;
    const localBook = known || await WK.offline.loadBook(id);
    if (!ctx.alive()) return;
    mountChapter(ctx, id, chapterId, chapter, localBook || null);
    loadBook(id)
      .then((data) => {
        if (!ctx.alive() || !activeSession || activeSession.cid !== chapterId) return null;
        activeSession.book = data;
        updateMeta(data);
        return data;
      })
      .catch(() => null);
  }

  function mountChapter(ctx, bookId, chapterId, chapter, book) {
    const content = $('#reader-content');
    const readerPage = $('#reader-page');
    const chapterTitle = $('#reader-chapter-title');
    const bookTitle = $('#reader-book-title');
    if (chapterTitle) chapterTitle.textContent = chapter.title || '';
    if (bookTitle) bookTitle.textContent = (book && book.title) || chapter.bookTitle || '阅读';
    WK.setTitle((book && book.title) || chapter.bookTitle || '阅读');

    const index = book ? book.chapters.findIndex((item) => Number(item.id) === Number(chapterId)) : -1;
    const total = book ? Number(book.chapterCount) || book.chapters.length : 0;
    content.innerHTML = `<h1 class="chapter-title">${esc(chapter.title || '')}</h1>${chapter.content || '<p class="chapter-end">本章暂无内容。</p>'}<div class="chapter-end">本章完</div>`;

    const nav = $('#reader-nav');
    if (nav) nav.innerHTML = navHtml(bookId, chapter);

    activeSession = {
      bookId,
      cid: chapterId,
      chapter,
      book,
      index,
      total,
      ratio: 0,
    };
    state.reader = activeSession;
    updatePos();

    const key = `${bookId}:${chapterId}`;
    let restore = state.scroll.get(key);
    if (restore == null) {
      const history = store.history[bookId];
      if (history && Number(history.chapterId) === Number(chapterId) && Number(history.scroll) > 0) {
        restore = Number(history.scroll);
      }
    }
    activeSession.ratio = restore == null ? 0 : restore;

    markRead(bookId, chapterId);
    persistProgress(activeSession.ratio);
    setupReader(ctx, bookId, chapterId, chapter, restore == null ? 0 : restore);
  }

  function setupReader(ctx, bookId, chapterId, chapter, restoreRatio) {
    const readerPage = $('#reader-page');
    const content = $('#reader-content');
    const progress = $('#reader-progress');
    if (!readerPage || !content || !progress) return;

    let ratio = restoreRatio || 0;
    let saveTimer = null;
    let lastTick = Date.now();
    let restoresLeft = restoreRatio > 0 ? 2 : 0;

    function update() {
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (activeSession) activeSession.ratio = ratio;
      progress.style.width = `${(ratio * 100).toFixed(2)}%`;
      state.scroll.set(`${bookId}:${chapterId}`, ratio);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => persistProgress(ratio), 450);
    }

    function restore() {
      if (!restoresLeft) return;
      restoresLeft -= 1;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, max * restoreRatio);
      update();
    }

    requestAnimationFrame(() => {
      if (!ctx.alive() || !activeSession || activeSession.cid !== chapterId) return;
      window.scrollTo(0, 0);
      if (restoreRatio > 0) {
        requestAnimationFrame(() => {
          if (ctx.alive() && activeSession && activeSession.cid === chapterId) restore();
        });
      }
      update();
    });
    const restoreTimer = restoreRatio > 0
      ? setTimeout(() => {
        if (ctx.alive() && activeSession && activeSession.cid === chapterId) restore();
      }, 380)
      : null;

    window.addEventListener('scroll', update, { passive: true });

    const timer = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') {
        const delta = Math.round((now - lastTick) / 1000);
        if (delta > 0 && delta < 40) {
          store.stats.seconds += delta;
          WK.saveStats();
        }
      }
      lastTick = now;
    }, 15000);

    function flush() {
      clearTimeout(saveTimer);
      persistProgress(ratio);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') flush();
      lastTick = Date.now();
    }

    function onKey(event) {
      if (state.sheetOpen || WK.isLightboxOpen()) return;
      if (event.key === 'ArrowRight' && chapter.next) {
        WK.navigate(`#/read/${bookId}/${chapter.next}`);
      } else if (event.key === 'ArrowLeft' && chapter.prev) {
        WK.navigate(`#/read/${bookId}/${chapter.prev}`);
      }
    }

    function onClick(event) {
      if (event.target.closest('a, button, img')) return;
      const selection = window.getSelection();
      if (selection && String(selection).trim()) return;
      readerPage.classList.toggle('chrome-hidden');
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    content.addEventListener('click', onClick);

    if (chapter.next) {
      const prefetch = setTimeout(() => {
        fetch(`/api/chapter/${bookId}/${chapter.next}`).catch(() => {});
      }, 1600);
      onCleanup(() => clearTimeout(prefetch));
    }

    onCleanup(() => {
      window.removeEventListener('scroll', update);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      content.removeEventListener('click', onClick);
      clearInterval(timer);
      clearTimeout(saveTimer);
      if (restoreTimer) clearTimeout(restoreTimer);
      const now = Date.now();
      if (document.visibilityState === 'visible') {
        const delta = Math.round((now - lastTick) / 1000);
        if (delta > 0 && delta < 600) {
          store.stats.seconds += delta;
          WK.saveStats();
        }
      }
      persistProgress(ratio);
      for (const img of content.querySelectorAll('img')) img.removeAttribute('src');
      readerPage.classList.remove('chrome-hidden');
      if (activeSession && activeSession.cid === chapterId) activeSession = null;
      state.reader = null;
    });
  }

  function updateMeta(book) {
    if (!activeSession) return;
    const title = $('#reader-book-title');
    if (title) title.textContent = book.title || '阅读';
    const chapterTitle = $('#reader-chapter-title');
    if (chapterTitle && activeSession.chapter) chapterTitle.textContent = activeSession.chapter.title || '';
    activeSession.index = book.chapters.findIndex((item) => Number(item.id) === Number(activeSession.cid));
    activeSession.total = Number(book.chapterCount) || book.chapters.length;
    updatePos();
    persistProgress(activeSession.ratio || 0);
    WK.setTitle(book.title || '阅读');
  }

  function updatePos() {
    const el = $('#reader-pos');
    if (!el || !activeSession) return;
    if (activeSession.index >= 0 && activeSession.total) {
      el.textContent = `${activeSession.index + 1} / ${activeSession.total}`;
    } else {
      el.textContent = '';
    }
  }

  function persistProgress(ratio) {
    if (!activeSession) return;
    const session = activeSession;
    const total = Number(session.total) || 0;
    const index = session.index >= 0 ? session.index : 0;
    const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
    const percent = total
      ? Math.max(0, Math.min(100, Math.round(((index + safeRatio) / total) * 100)))
      : Math.round(safeRatio * 100);
    const previous = store.history[session.bookId] || {};
    const book = session.book;
    const item = {
      bookId: session.bookId,
      title: (book && book.title) || session.chapter.bookTitle || previous.title || '未命名',
      author: (book && book.author) || previous.author || '',
      cover: (book && book.cover) || previous.cover || '',
      chapterId: session.cid,
      chapterTitle: session.chapter.title || '',
      index,
      total,
      percent,
      scroll: safeRatio,
      updatedAt: Date.now(),
    };
    store.history[session.bookId] = item;
    WK.saveHistory();
    const shelfItem = WK.findShelf(session.bookId);
    if (shelfItem) {
      shelfItem.lastChapterId = session.cid;
      shelfItem.lastChapterTitle = session.chapter.title || '';
      shelfItem.percent = percent;
      shelfItem.updatedAt = Date.now();
      if (!shelfItem.cover && item.cover) shelfItem.cover = item.cover;
      WK.saveShelf();
    }
  }

  function showError(content, bookId, error) {
    content.innerHTML = `<div class="reader-error"><p>${esc(error.message || '章节加载失败')}</p><div class="reader-error-actions"><button class="ghost-btn" type="button" data-action="retry">重试</button><a class="ghost-btn" href="#/book/${bookId}">返回书籍</a></div></div>`;
  }

  async function openTocSheet() {
    const session = activeSession;
    if (!session) {
      toast('请先打开一个章节');
      return;
    }
    let book = session.book;
    if (!book) {
      toast('目录正在加载');
      try {
        book = await loadBook(session.bookId);
        if (!activeSession || activeSession.cid !== session.cid) return;
        activeSession.book = book;
        updateMeta(book);
      } catch (error) {
        book = await WK.offline.loadBook(session.bookId);
        if (!book) {
          toast(error.message || '目录加载失败');
          return;
        }
        session.book = book;
        updateMeta(book);
      }
    }
    if (!book.chapters || !book.chapters.length) {
      toast('目录暂时无法获取');
      return;
    }
    const currentCid = session.cid;
    const volumes = book.volumes && book.volumes.length
      ? book.volumes
      : [{ title: '正文', chapters: book.chapters }];
    const html = volumes.map((volume, index) => {
      const hasCurrent = volume.chapters.some((chapter) => Number(chapter.id) === currentCid);
      const open = hasCurrent || (index === 0 && !volumes.some((item) => item.chapters.some((chapter) => Number(chapter.id) === currentCid)));
      return `<details class="volume" ${open ? 'open' : ''}><summary><span>${esc(volume.title || '正文')}</span><span class="vol-count">${volume.chapters.length} 章</span>${icon('right')}</summary>${volume.chapters.map((chapter) => `<a class="chapter-row ${Number(chapter.id) === currentCid ? 'current' : ''}" href="#/read/${session.bookId}/${chapter.id}"><span class="chapter-index">${String((Number(chapter.index) || 0) + 1).padStart(3, '0')}</span><span class="chapter-name">${esc(chapter.title)}</span></a>`).join('')}</details>`;
    }).join('');
    WK.sheet.open({
      title: `目录 · ${book.chapterCount || book.chapters.length} 章`,
      bodyClass: 'toc-body',
      body: html,
      onMount: (sheet) => {
        const current = sheet.querySelector('.chapter-row.current');
        if (current) requestAnimationFrame(() => current.scrollIntoView({ block: 'center' }));
      },
    });
  }

  WK.pages = WK.pages || {};
  WK.pages.reader = pageReader;
  WK.openTocSheet = openTocSheet;
})();

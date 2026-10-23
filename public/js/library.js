'use strict';

(function () {
  const WK = window.WK;
  const INDEX_KEY = 'wk8.library.index.v1';
  const DOWNLOAD_KEY = 'wk8.library.downloads.v1';
  const CACHE_PREFIX = 'wk8-library-book-';
  const downloads = new Map();

  function loadDownloads() {
    try {
      const raw = JSON.parse(localStorage.getItem(DOWNLOAD_KEY) || '[]');
      for (const item of Array.isArray(raw) ? raw : []) {
        if (item && item.id) downloads.set(String(item.id), item);
      }
    } catch {
      /* ignore corrupt metadata */
    }
  }

  function saveDownloads() {
    try {
      localStorage.setItem(DOWNLOAD_KEY, JSON.stringify([...downloads.values()]));
    } catch {
      /* storage full or unavailable */
    }
  }

  function cacheName(id) {
    return `${CACHE_PREFIX}${String(id)}`;
  }

  function request(path) {
    return new Request(new URL(path, location.origin));
  }

  function cachedIndex() {
    const fallback = { books: [], errors: [], generatedAt: 0, directory: '' };
    try {
      const value = JSON.parse(localStorage.getItem(INDEX_KEY) || 'null');
      if (!value || !Array.isArray(value.books)) return fallback;
      const known = new Map(value.books.map((book) => [String(book.id), book]));
      for (const item of downloads.values()) {
        if (!known.has(String(item.id))) known.set(String(item.id), item);
      }
      return { ...value, books: [...known.values()] };
    } catch {
      return fallback;
    }
  }

  function saveIndex(data) {
    try {
      localStorage.setItem(INDEX_KEY, JSON.stringify({
        books: Array.isArray(data && data.books) ? data.books : [],
        errors: Array.isArray(data && data.errors) ? data.errors : [],
        generatedAt: Number(data && data.generatedAt) || Date.now(),
        directory: String((data && data.directory) || ''),
      }));
    } catch {
      /* storage full or unavailable */
    }
  }

  async function fetchIndex(options = {}) {
    const data = options.refresh
      ? await WK.api('/api/library/refresh', { method: 'POST' })
      : await WK.api('/api/library');
    saveIndex(data);
    return data;
  }

  async function loadBook(id) {
    try {
      return await WK.api(`/api/library/${encodeURIComponent(id)}`);
    } catch (error) {
      const cached = await loadCachedBook(id);
      if (cached) return cached;
      throw error;
    }
  }

  async function loadChapter(bookId, chapterId) {
    try {
      return await WK.api(`/api/library/${encodeURIComponent(bookId)}/chapter/${encodeURIComponent(chapterId)}`);
    } catch (error) {
      const cached = await loadCachedChapter(bookId, chapterId);
      if (cached) return cached;
      throw error;
    }
  }

  async function loadCachedBook(id) {
    try {
      const cache = await caches.open(cacheName(id));
      const res = await cache.match(request(`/api/library/${encodeURIComponent(id)}`));
      return res ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async function loadCachedChapter(bookId, chapterId) {
    try {
      const cache = await caches.open(cacheName(bookId));
      const res = await cache.match(request(`/api/library/${encodeURIComponent(bookId)}/chapter/${encodeURIComponent(chapterId)}`));
      return res ? await res.json() : null;
    } catch {
      return null;
    }
  }

  function isDownloaded(id) {
    return downloads.has(String(id));
  }

  function getDownload(id) {
    return downloads.get(String(id)) || null;
  }

  function downloadedList() {
    return [...downloads.values()].sort((a, b) => (Number(b.downloadedAt) || 0) - (Number(a.downloadedAt) || 0));
  }

  async function download(book, onProgress = () => {}) {
    const id = String(book && book.id);
    if (!id) throw new Error('书籍编号无效');
    if (!('caches' in window)) throw new Error('当前浏览器不支持离线存储');
    if (!window.isSecureContext) throw new Error('离线下载需要 HTTPS 访问');
    if (isDownloaded(id)) return getDownload(id);
    const cache = await caches.open(cacheName(id));
    try {
      onProgress({ phase: 'book', done: 0, total: 1, label: '准备本地书籍' });
      const bookRes = await fetch(`/api/library/${encodeURIComponent(id)}`);
      if (!bookRes.ok) throw new Error(`书籍信息读取失败（${bookRes.status}）`);
      const fullBook = await bookRes.clone().json();
      await cache.put(request(`/api/library/${encodeURIComponent(id)}`), bookRes);
      const chapters = Array.isArray(fullBook.chapters) ? fullBook.chapters : [];
      let done = 0;
      for (const chapter of chapters) {
        const path = `/api/library/${encodeURIComponent(id)}/chapter/${encodeURIComponent(chapter.id)}`;
        const res = await fetch(path);
        if (!res.ok) throw new Error(`章节 ${chapter.title || chapter.id} 下载失败（${res.status}）`);
        await cache.put(request(path), res.clone());
        done += 1;
        onProgress({ phase: 'chapters', done, total: chapters.length, label: `章节 ${done}/${chapters.length}` });
      }
      if (fullBook.cover) {
        try {
          const coverRes = await fetch(fullBook.cover);
          if (coverRes.ok) await cache.put(request(fullBook.cover), coverRes);
        } catch {
          /* cover is optional */
        }
      }
      const meta = {
        id,
        title: fullBook.title || book.title || '未命名',
        author: fullBook.author || book.author || '',
        cover: fullBook.cover || book.cover || '',
        category: fullBook.category || book.category || '',
        format: fullBook.format || book.format || '',
        chapterCount: chapters.length,
        cacheName: cacheName(id),
        downloadedAt: Date.now(),
      };
      downloads.set(id, meta);
      saveDownloads();
      onProgress({ phase: 'done', done: 1, total: 1, label: '下载完成' });
      return meta;
    } catch (error) {
      await caches.delete(cacheName(id)).catch(() => {});
      throw error;
    }
  }

  async function remove(id) {
    const key = String(id);
    await caches.delete(cacheName(key)).catch(() => {});
    downloads.delete(key);
    saveDownloads();
  }

  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return downloadedList().filter((item) => `${item.title} ${item.author} ${item.category}`.toLowerCase().includes(q));
  }

  loadDownloads();

  WK.library = {
    cachedIndex,
    fetchIndex,
    loadBook,
    loadChapter,
    loadCachedBook,
    loadCachedChapter,
    download,
    remove,
    isDownloaded,
    getDownload,
    downloadedList,
    search,
  };
})();

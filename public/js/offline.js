'use strict';

(function () {
  const WK = window.WK;
  const META_KEY = 'wk8.downloads.v1';
  const CACHE_PREFIX = 'wk8-offline-book-';
  const downloads = new Map();

  function loadMeta() {
    try {
      const raw = JSON.parse(localStorage.getItem(META_KEY) || '[]');
      for (const item of Array.isArray(raw) ? raw : []) {
        if (item && item.id != null) downloads.set(String(item.id), item);
      }
    } catch {
      /* ignore corrupt metadata */
    }
  }

  function persistMeta() {
    try {
      localStorage.setItem(META_KEY, JSON.stringify([...downloads.values()]));
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

  function list() {
    return [...downloads.values()].sort((a, b) => (Number(b.downloadedAt) || 0) - (Number(a.downloadedAt) || 0));
  }

  function get(id) {
    return downloads.get(String(id)) || null;
  }

  function isDownloaded(id) {
    return Boolean(get(id));
  }

  function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(timer) };
  }

  async function fetchWithTimeout(url, ms, options = {}) {
    const timeout = withTimeout(ms);
    try {
      return await fetch(url, Object.assign({}, options, { signal: timeout.signal }));
    } finally {
      timeout.clear();
    }
  }

  async function mapLimit(items, limit, fn) {
    let next = 0;
    let firstError = null;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!firstError) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        try {
          await fn(items[index], index);
        } catch (error) {
          firstError = error;
        }
      }
    });
    await Promise.all(workers);
    if (firstError) throw firstError;
  }

  function collectChapters(book) {
    const out = [];
    const seen = new Set();
    const add = (chapter) => {
      if (!chapter || chapter.id == null) return;
      const key = String(chapter.id);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(chapter);
    };
    for (const volume of Array.isArray(book.volumes) ? book.volumes : []) {
      for (const chapter of Array.isArray(volume.chapters) ? volume.chapters : []) add(chapter);
    }
    for (const chapter of Array.isArray(book.chapters) ? book.chapters : []) add(chapter);
    return out;
  }

  function collectImages(chapter, images) {
    const add = (value) => {
      if (typeof value !== 'string' || !value) return;
      let src = value.replace(/&amp;/g, '&');
      if (src.startsWith('//')) src = `${location.protocol}${src}`;
      try {
        const url = new URL(src, location.origin);
        if (url.pathname === '/api/image') images.add(url.pathname + url.search);
      } catch {
        /* ignore malformed image source */
      }
    };
    for (const image of Array.isArray(chapter.images) ? chapter.images : []) add(image);
    const html = String(chapter.content || '');
    for (const match of html.matchAll(/(?:src|data-src)=["']([^"']+)["']/gi)) add(match[1]);
  }

  async function downloadBook(book, onProgress = () => {}) {
    const id = String(book && book.id);
    if (!id) throw new Error('书籍编号无效');
    if (!('caches' in window)) throw new Error('当前浏览器不支持离线存储');
    if (!navigator.onLine) throw new Error('当前没有网络，无法下载');

    if (isDownloaded(id)) return get(id);
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    const name = cacheName(id);
    const cache = await caches.open(name);
    let done = 0;
    let total = Math.max(1, Number(book.chapterCount) || 1);
    let imageTotal = 0;
    let imageFailed = 0;
    const imageSet = new Set();
    const report = (phase, label) => {
      onProgress({ phase, done, total: Math.max(done, total), label });
    };

    try {
      report('book', '准备书籍');
      const bookRes = await fetchWithTimeout(`/api/book/${encodeURIComponent(id)}`, 60000);
      if (!bookRes.ok) throw new Error(`书籍信息下载失败（${bookRes.status}）`);
      const bookCopy = bookRes.clone();
      const fullBook = await bookRes.json();
      await cache.put(request(`/api/book/${encodeURIComponent(id)}`), bookCopy);

      const chapters = collectChapters(fullBook);
      if (!chapters.length) throw new Error('这本书没有可下载的章节');
      total = chapters.length;
      report('chapters', `章节 0/${total}`);

      await mapLimit(chapters, 3, async (chapter) => {
        const cid = String(chapter.id);
        const path = `/api/chapter/${encodeURIComponent(id)}/${encodeURIComponent(cid)}`;
        const res = await fetchWithTimeout(path, 60000);
        if (!res.ok) throw new Error(`章节 ${cid} 下载失败（${res.status}）`);
        const copy = res.clone();
        const data = await res.json();
        await cache.put(request(path), copy);
        collectImages(data, imageSet);
        done += 1;
        report('chapters', `章节 ${done}/${chapters.length}`);
      });

      if (fullBook.cover) {
        collectImages({ images: [fullBook.cover] }, imageSet);
      }
      const images = [...imageSet];
      imageTotal = images.length;
      total += imageTotal;
      if (imageTotal) report('images', `插图 0/${imageTotal}`);

      await mapLimit(images, 2, async (src) => {
        try {
          const res = await fetchWithTimeout(src, 90000);
          if (!res.ok) throw new Error(String(res.status));
          await cache.put(request(src), res);
        } catch {
          imageFailed += 1;
        }
        done += 1;
        report('images', `插图 ${done - chapters.length}/${imageTotal}`);
      });

      const meta = {
        id,
        title: fullBook.title || book.title || '未命名',
        author: fullBook.author || book.author || '',
        cover: fullBook.cover || book.cover || '',
        category: fullBook.category || book.category || '',
        status: fullBook.status || book.status || '',
        wordsText: fullBook.wordsText || '',
        chapterCount: chapters.length,
        imageCount: imageTotal - imageFailed,
        imageFailed,
        cacheName: name,
        downloadedAt: Date.now(),
      };
      downloads.set(id, meta);
      persistMeta();
      onProgress({ phase: 'done', done: total, total, label: '下载完成' });
      return meta;
    } catch (error) {
      await caches.delete(name).catch(() => {});
      throw error;
    }
  }

  async function remove(id) {
    const key = String(id);
    await caches.delete(cacheName(key)).catch(() => {});
    downloads.delete(key);
    persistMeta();
  }

  async function loadBook(id) {
    const meta = get(id);
    if (!meta) return null;
    try {
      const cache = await caches.open(meta.cacheName);
      const res = await cache.match(request(`/api/book/${encodeURIComponent(id)}`));
      return res ? await res.json() : null;
    } catch {
      return null;
    }
  }

  async function loadChapter(bookId, chapterId) {
    const meta = get(bookId);
    if (!meta) return null;
    try {
      const cache = await caches.open(meta.cacheName);
      const path = `/api/chapter/${encodeURIComponent(bookId)}/${encodeURIComponent(chapterId)}`;
      const res = await cache.match(request(path));
      return res ? await res.json() : null;
    } catch {
      return null;
    }
  }

  function search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return list().filter((item) => `${item.title} ${item.author} ${item.category}`.toLowerCase().includes(q));
  }

  async function storageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    try {
      return await navigator.storage.estimate();
    } catch {
      return null;
    }
  }

  loadMeta();

  WK.offline = {
    list,
    get,
    isDownloaded,
    downloadBook,
    remove,
    loadBook,
    loadChapter,
    search,
    storageEstimate,
  };
})();

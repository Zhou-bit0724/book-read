'use strict';

const {
  BASE,
  IMAGE_UA,
  CookieJar,
  fetchHtml,
  siteRequest,
  rawRequest,
  decodeHtml,
  encodeForm,
  pct,
} = require('./http');
const http = require('node:http');
const https = require('node:https');
const P = require('./parse');

const cache = new Map();
const MAX_CACHE = 600;

class SiteError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'SiteError';
    this.status = status;
  }
}

class AuthError extends SiteError {
  constructor(message = '需要登录文库账号') {
    super(message, 401);
    this.name = 'AuthError';
    this.authRequired = true;
  }
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttl) {
  if (cache.size > MAX_CACHE) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expires < now || cache.size > MAX_CACHE) cache.delete(k);
      if (cache.size <= MAX_CACHE * 0.8) break;
    }
  }
  cache.set(key, { value, expires: Date.now() + ttl });
  return value;
}

async function cached(key, ttl, producer) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const value = await producer();
  return cacheSet(key, value, ttl);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getHtml(path, opts = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await fetchHtml(path.startsWith('http') ? path : BASE + path, opts);
      if (res.status === 403 && attempt === 0) {
        await sleep(450);
        continue;
      }
      if (res.status >= 500 && attempt === 0) {
        await sleep(450);
        continue;
      }
      if (res.status === 403) {
        throw new SiteError('官网暂时拒绝访问（403），请稍后再试', 403);
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await sleep(400);
        continue;
      }
    }
  }
  if (lastError instanceof SiteError) throw lastError;
  throw new SiteError(`官网连接失败：${lastError ? lastError.message : '未知错误'}`, 502);
}

async function getHome() {
  const hit = cacheGet('home:v2');
  if (hit) return hit;

  const [wap, sugoi] = await Promise.allSettled([
    getHtml('/wap/index.php'),
    getSugoi(2026),
  ]);
  const sections = wap.status === 'fulfilled' ? P.parseWapHome(wap.value.html) : [];
  const sugoiData = sugoi.status === 'fulfilled'
    ? sugoi.value
    : { books: [], years: [] };
  if (sugoi.status === 'rejected') {
    console.warn(`[site] 首页年度精选获取失败：${sugoi.reason && sugoi.reason.message || sugoi.reason}`);
  }

  if (!sections.length && sugoiData.books.length) {
    sections.push({
      sort: 'sugoi',
      title: '编辑推荐',
      books: sugoiData.books.slice(0, 8),
    });
  }
  if (!sections.length && !sugoiData.books.length) {
    throw new SiteError('官网内容暂时无法获取，请稍后重试', 502);
  }

  const value = {
    sections,
    sugoi: {
      year: 2026,
      years: sugoiData.years,
      books: sugoiData.books.slice(0, 60),
    },
    updatedAt: Date.now(),
  };
  const complete = wap.status === 'fulfilled' && sugoiData.books.length > 0;
  return cacheSet('home:v2', value, complete ? 10 * 60 * 1000 : 60 * 1000);
}

async function getSugoi(year) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 2005 || y > 2100) {
    throw new SiteError('榜单年份无效', 400);
  }
  return cached(`sugoi:${y}`, 24 * 60 * 60 * 1000, async () => {
    const res = await getHtml(`/zt/sugoi/${y}.php`);
    if (res.status === 404) throw new SiteError('没有这一年的榜单', 404);
    const data = P.parseSugoiPage(res.html);
    return { year: y, years: data.years, books: data.books };
  });
}

async function getBook(id) {
  const bookId = Number(id);
  if (!Number.isInteger(bookId) || bookId <= 0) throw new SiteError('书籍编号无效', 400);
  return cached(`book:${bookId}:v3`, 30 * 60 * 1000, async () => {
    const res = await getHtml(`/book/${bookId}.htm`);
    if (res.status === 404) throw new SiteError('没有找到这本书', 404);
    if (res.redirectedToLogin) throw new SiteError('官网要求登录后才能查看这本书', 401);
    const book = P.parseBookPage(res.html, bookId);

    let toc = { volumes: [], chapters: [], count: 0 };
    if (book.tocPath) {
      try {
        const tocRes = await getHtml(book.tocPath, { referer: `${BASE}/book/${bookId}.htm` });
        toc = P.parseTocPage(tocRes.html);
      } catch {
        toc = { volumes: [], chapters: [], count: 0 };
      }
    }

    return {
      ...book,
      volumes: toc.volumes,
      chapters: toc.chapters,
      chapterCount: toc.count,
      firstChapter: toc.chapters[0] || book.latest || null,
      officialUrl: `${BASE}/book/${bookId}.htm`,
    };
  });
}

async function getChapter(bookId, chapterId) {
  const bid = Number(bookId);
  const cid = Number(chapterId);
  if (!Number.isInteger(bid) || bid <= 0 || !Number.isInteger(cid) || cid <= 0) {
    throw new SiteError('章节参数无效', 400);
  }
  const chapter = await cached(`chapter:${bid}:${cid}:v3`, 12 * 60 * 60 * 1000, async () => {
    const res = await getHtml(
      `/modules/article/reader.php?aid=${bid}&cid=${cid}`,
      { referer: `${BASE}/book/${bid}.htm` }
    );
    if (res.redirectedToLogin) throw new AuthError('官网要求登录后才能阅读这一章');
    if (res.status === 404) throw new SiteError('章节不存在或已下架', 404);
    const chapter = P.parseReaderPage(res.html, bid);
    chapter.officialUrl = `${BASE}/modules/article/reader.php?aid=${bid}&cid=${cid}`;
    return chapter;
  });
  prefetchImages(chapter && chapter.images);
  return chapter;
}

async function login(username, password) {
  const user = String(username || '').trim();
  const pass = String(password || '');
  if (!user || !pass) return { ok: false, error: '请输入账号和密码' };

  const jar = new CookieJar();
  try {
    await getHtml('/login.php', { jar });
    const body = encodeForm({
      username: user,
      password: pass,
      usecookie: '315360000',
      action: 'login',
      submit: '  登  录  ',
    });
    const res = await siteRequest(`${BASE}/login.php?do=submit`, {
      method: 'POST',
      jar,
      body,
      referer: `${BASE}/login.php`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: BASE,
        'Upgrade-Insecure-Requests': '1',
      },
    });
    const html = decodeHtml(res.buffer, res.headers['content-type']);
    const failure = P.parseLoginFailure(html);
    if (failure) {
      return { ok: false, error: failure, captcha: /验证码/.test(failure) };
    }

    const check = await getHtml('/index.php', { jar, referer: `${BASE}/login.php` });
    if (check.redirectedToLogin || /login\.php\?jumpurl/.test(check.url)) {
      return { ok: false, error: '登录没有生效，请检查账号密码或官网状态' };
    }
    const profile = P.parseProfile(check.html);
    if (!profile && !jar.header()) {
      return { ok: false, error: '登录失败，请检查账号密码' };
    }
    return {
      ok: true,
      jar,
      username: profile ? profile.username : user,
      uid: profile ? profile.uid : null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof SiteError ? error.message : `登录请求失败：${error.message}`,
    };
  }
}

async function search(query, jar) {
  const q = String(query || '').trim();
  if (!q) return { query: q, books: [] };
  if (q.length > 60) throw new SiteError('搜索词太长', 400);
  const path = `/modules/article/search.php?searchtype=articlename&searchkey=${pct(q)}`;
  const res = await getHtml(path, { jar, referer: `${BASE}/index.php` });
  if (res.redirectedToLogin) throw new AuthError();
  const data = P.parseListPage(res.html);
  if (data.loginWall) throw new AuthError();
  return { query: q, books: data.books, title: data.title };
}

const RANK_SORTS = new Set([
  'allvisit', 'allvote', 'monthvisit', 'monthvote', 'weekvisit', 'weekvote',
  'dayvisit', 'dayvote', 'postdate', 'lastupdate', 'goodnum', 'size',
]);

const RANK_TITLES = {
  allvisit: '总排行榜',
  allvote: '总推荐榜',
  monthvisit: '月排行榜',
  monthvote: '月推荐榜',
  weekvisit: '周排行榜',
  weekvote: '周推荐榜',
  dayvisit: '日排行榜',
  dayvote: '日推荐榜',
  postdate: '最新入库',
  lastupdate: '最近更新',
  goodnum: '总收藏榜',
  size: '字数排行',
};

async function listRank(sort, page, jar) {
  const s = String(sort || 'allvisit');
  if (!RANK_SORTS.has(s)) throw new SiteError('排行榜类型无效', 400);
  const p = Math.max(1, Math.min(50, Number(page) || 1));
  const res = await getHtml(
    `/modules/article/toplist.php?sort=${s}&page=${p}`,
    { jar, referer: `${BASE}/index.php` }
  );
  if (res.redirectedToLogin) throw new AuthError();
  const data = P.parseListPage(res.html);
  if (data.loginWall) throw new AuthError();
  return {
    sort: s,
    page: p,
    title: RANK_TITLES[s] || '排行榜',
    books: data.books,
  };
}

const CATEGORIES = {
  0: '全部轻小说', 1: '电击文库', 2: '富士见文库', 3: '角川文库',
  4: 'MF文库J', 5: 'Fami通文库', 6: 'GA文库', 7: 'HJ文库',
  8: '一迅社', 9: '集英社', 10: '小学馆', 11: '讲谈社',
  12: '少女文库', 13: '其他文库', 14: '游戏剧本',
};

async function listCategory(classId, page, jar) {
  const c = Number(classId);
  if (!Number.isInteger(c) || !Object.prototype.hasOwnProperty.call(CATEGORIES, c)) {
    throw new SiteError('分类编号无效', 400);
  }
  const p = Math.max(1, Math.min(50, Number(page) || 1));
  const res = await getHtml(
    `/modules/article/articlelist.php?class=${c}&page=${p}`,
    { jar, referer: `${BASE}/modules/article/articlelist.php` }
  );
  if (res.redirectedToLogin) throw new AuthError();
  const data = P.parseListPage(res.html);
  if (data.loginWall) throw new AuthError();
  return {
    classId: c,
    page: p,
    title: CATEGORIES[c] || '分类',
    books: data.books,
  };
}

function isAllowedImageHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'wenku8.com' || host.endsWith('.wenku8.com') ||
    host === 'wenku8.net' || host.endsWith('.wenku8.net') ||
    host === '777743.xyz' || host.endsWith('.777743.xyz')
  );
}

const IMAGE_AGENT_HTTP = new http.Agent({ keepAlive: false, maxSockets: 16 });
const IMAGE_AGENT_HTTPS = new https.Agent({ keepAlive: false, maxSockets: 16 });
const imageCache = new Map();
const IMAGE_CACHE_TTL = 30 * 60 * 1000;
const IMAGE_CACHE_MAX = 120;
const IMAGE_ATTEMPTS = 3;
const IMAGE_TIMEOUT = 20000;

function imageCacheGet(key) {
  const hit = imageCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    imageCache.delete(key);
    return null;
  }
  return hit.value;
}

function imageCacheSet(key, value) {
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
  imageCache.set(key, { value, expires: Date.now() + IMAGE_CACHE_TTL });
}

function fetchImageOnce(url) {
  return rawRequest(url, {
    headers: {
      'User-Agent': IMAGE_UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: `${BASE}/`,
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    agent: url.protocol === 'https:' ? IMAGE_AGENT_HTTPS : IMAGE_AGENT_HTTP,
    timeout: IMAGE_TIMEOUT,
    retries: 1,
    maxBytes: 15 * 1024 * 1024,
  });
}

async function getImage(src) {
  let url;
  try {
    url = new URL(String(src || ''));
  } catch {
    throw new SiteError('图片地址无效', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol) || !isAllowedImageHost(url.hostname)) {
    throw new SiteError('不允许的图片地址', 400);
  }
  const key = url.toString();
  const cachedImage = imageCacheGet(key);
  if (cachedImage) return cachedImage;

  const inflightKey = 'k:' + key;
  const existing = imageInflight.get(inflightKey);
  if (existing) return existing;

  const task = (async () => {
    let lastError = null;
    for (let round = 0; round < IMAGE_ROUNDS; round += 1) {
      try {
        const res = await fetchImageRace(url);
        const value = {
          buffer: res.body,
          contentType: res.headers['content-type'] || 'image/jpeg',
          status: res.status,
        };
        imageCacheSet(key, value);
        return value;
      } catch (error) {
        if (error instanceof SiteError && error.status === 404) throw error;
        lastError = error;
      }
    }
    throw lastError instanceof SiteError ? lastError : new SiteError('图片获取失败', 502);
  })();

  imageInflight.set(inflightKey, task);
  task.catch(() => {}).then(() => imageInflight.delete(inflightKey));
  return task;
}

const IMAGE_ROUNDS = 3;
const IMAGE_RACERS = 2;
const imageInflight = new Map();

const IMAGE_MAX_CONCURRENT = 6;
let imageActive = 0;
const imageWaiters = [];

function imageSemaphore() {
  if (imageActive < IMAGE_MAX_CONCURRENT) {
    imageActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => imageWaiters.push(resolve));
}

function imageSemaphoreRelease() {
  const next = imageWaiters.shift();
  if (next) next();
  else imageActive -= 1;
}

async function fetchImageLimited(url) {
  await imageSemaphore();
  try {
    return await fetchImageOnce(url);
  } finally {
    imageSemaphoreRelease();
  }
}

function fetchImageRace(url) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pending = IMAGE_RACERS;
    let lastError = null;
    for (let i = 0; i < IMAGE_RACERS; i += 1) {
      fetchImageLimited(url).then(
        (res) => {
          pending -= 1;
          if (settled) return;
          if (res.status === 404) {
            settled = true;
            reject(new SiteError('图片获取失败', 404));
            return;
          }
          if (res.status >= 400) {
            lastError = new SiteError('图片获取失败', 502);
            if (pending === 0) {
              settled = true;
              reject(lastError);
            }
            return;
          }
          settled = true;
          resolve(res);
        },
        (error) => {
          pending -= 1;
          if (settled) return;
          lastError = error;
          if (pending === 0) {
            settled = true;
            reject(lastError);
          }
        }
      );
    }
  });
}

let prefetchRunning = 0;
const prefetchQueue = [];

function pumpPrefetch() {
  while (prefetchRunning < 2 && prefetchQueue.length) {
    const src = prefetchQueue.shift();
    prefetchRunning += 1;
    getImage(src)
      .catch(() => {})
      .finally(() => {
        prefetchRunning -= 1;
        pumpPrefetch();
      });
  }
}

function prefetchImages(list) {
  if (!Array.isArray(list) || !list.length) return;
  for (const item of list) {
    if (typeof item !== 'string' || !item.startsWith('/api/image')) continue;
    let src = '';
    try {
      src = new URL(item, 'http://local').searchParams.get('src') || '';
    } catch {
      continue;
    }
    if (!src || prefetchQueue.includes(src)) continue;
    if (imageCacheGet(src)) continue;
    prefetchQueue.push(src);
  }
  pumpPrefetch();
}

module.exports = {
  SiteError,
  AuthError,
  getHome,
  getSugoi,
  getBook,
  getChapter,
  login,
  search,
  listRank,
  listCategory,
  getImage,
  RANK_TITLES,
  CATEGORIES,
};

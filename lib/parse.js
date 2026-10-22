'use strict';

const { BASE } = require('./http');

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  hellip: '…', mdash: '—', ndash: '–', ldquo: '“', rdquo: '”',
  lsquo: '‘', rsquo: '’', middot: '·', bull: '•', times: '×',
  divide: '÷', laquo: '«', raquo: '»', copy: '©', reg: '®',
  trade: '™', deg: '°', plusmn: '±', frac12: '½', sup2: '²',
  sup3: '³', micro: 'µ', para: '¶', sect: '§', euro: '€',
  pound: '£', yen: '¥', cent: '¢', larr: '←', rarr: '→',
  uarr: '↑', darr: '↓', harr: '↔', emsp: '　', ensp: ' ',
  thinsp: ' ', zwj: '', zwnj: '',
};

function decodeEntities(value) {
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);?/gi, (all, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (Number.isFinite(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return all;
        }
      }
      return all;
    }
    const key = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : all;
  });
}

function stripTags(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<(p|div|li|tr|h[1-6]|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
}

function cleanInline(value) {
  let text = decodeEntities(stripTags(value));
  text = text.replace(/\u00a0/g, ' ').replace(/\r/g, '');
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function toLines(value) {
  let text = decodeEntities(stripTags(value));
  text = text.replace(/\u00a0/g, ' ').replace(/\r/g, '');
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').replace(/^[\s　]+|[\s　]+$/g, ''))
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function match(value, re) {
  const m = re.exec(value);
  return m ? m[1] : '';
}

function normalizeUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) u = `http:${u}`;
  if (u.startsWith('/')) u = BASE + u;
  return u;
}

function imageProxy(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return '';
  return `/api/image?src=${encodeURIComponent(normalized)}`;
}

function bookCover(id, found) {
  const url = found || `http://img.wenku8.com/image/${Math.floor(Number(id) / 1000)}/${id}/${id}s.jpg`;
  return imageProxy(url);
}

function balancedDiv(html, id) {
  const startRe = new RegExp(`<div[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const start = startRe.exec(html);
  if (!start) return '';
  const from = start.index + start[0].length;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (/^<\/div/i.test(m[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}

function parseBookPage(html, id) {
  const title =
    match(html, /<b>([^<]{1,200})<\/b>\s*\[\s*<a href="[^"]*uservote/i) ||
    match(html, /<span style="font-size:16px;[^"]*"><b>([\s\S]*?)<\/b>/i) ||
    cleanInline(match(html, /<title>([\s\S]*?)<\/title>/i)).split(' - ')[0];

  const author = cleanInline(match(html, /小说作者：([^<]+)/));
  const category = cleanInline(match(html, /文库分类：([^<]+)/));
  const status = cleanInline(match(html, /文章状态：([^<]+)/));
  const updated = cleanInline(match(html, /最后更新：([^<]+)/));
  const wordsText = cleanInline(match(html, /全文长度：([^<]+)/));
  const words = Number((wordsText.match(/[\d,]+/) || ['0'])[0].replace(/,/g, '')) || 0;
  const tagsText = cleanInline(match(html, /作品Tags：<\/b>([\s\S]*?)<\/span>/i));
  const tags = tagsText ? tagsText.split(/[\s,，、/]+/).filter(Boolean).slice(0, 12) : [];
  const heat = cleanInline(match(html, /作品热度：([^<]+)/));
  const latestTitle = cleanInline(
    match(html, /最近章节：<\/span><br\s*\/?>\s*<span[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
  );
  const latestLink = match(html, /最近章节：<\/span><br\s*\/?>\s*<span[^>]*><a[^>]*href="([^"]+)"[^>]*>/i);
  const latest = latestLink
    ? {
        id: Number((latestLink.match(/(\d+)\.htm/) || [])[1]) || 0,
        title: cleanInline(
          match(html, /最近章节：<\/span><br\s*\/?>\s*<span[^>]*><a[^>]*>([\s\S]*?)<\/a>/i)
        ),
      }
    : null;

  const introHtml = match(html, /内容简介：<\/span><br\s*\/?>\s*<span[^>]*>([\s\S]*?)<\/span><br\s*\/?>/i);
  const description = toLines(introHtml).join('\n');

  const coverMatch = new RegExp(
    `(?:https?:)?//img\\.wenku8\\.com/image/[^"'\\s]*?/${id}s\\.jpg`,
    'i'
  ).exec(html);
  const cover = bookCover(id, coverMatch ? normalizeUrl(coverMatch[0]) : '');

  const tocPath = match(html, /href=["'](\/novel\/\d+\/\d+\/index\.htm)["']/i);
  const votes = Number((match(html, /([\d,]+)\s*推/) || '0').replace(/,/g, '')) || 0;
  const followers =
    Number((match(html, /([\d,]+)\s*位会员关注/) || '0').replace(/,/g, '')) || 0;

  const related = [];
  const seen = new Set([Number(id)]);
  const relatedPart = html.includes('同分类小说推荐')
    ? html.slice(html.indexOf('同分类小说推荐'))
    : html;
  for (const m of relatedPart.matchAll(/<a[^>]+href=["'](?:https?:\/\/www\.wenku8\.net)?\/book\/(\d+)\.htm["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const rid = Number(m[1]);
    const rtitle = cleanInline(m[2]);
    if (!rid || seen.has(rid) || !rtitle) continue;
    seen.add(rid);
    related.push({ id: rid, title: rtitle, cover: bookCover(rid) });
    if (related.length >= 10) break;
  }

  return {
    id: Number(id),
    title: title || `书籍 ${id}`,
    author,
    category,
    status,
    updated,
    words,
    wordsText,
    tags,
    heat,
    description,
    cover,
    coverUrl: coverMatch ? normalizeUrl(coverMatch[0]) : '',
    tocPath,
    latest,
    votes,
    followers,
    related,
  };
}

const VOLUME_RE =
  /^(第[一二三四五六七八九十百千万零〇两\d]+卷|第[一二三四五六七八九十百千万零〇两\d]+章|第[一二三四五六七八九十百千万零〇两\d]+部|番外|外传|短篇|特别篇|后记|序章|终章|完本感言|插图|正文|其他)/;

function parseTocPage(html) {
  const volumes = [];
  const seen = new Set();
  let current = null;

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const chapters = [];
    for (const a of row.matchAll(/<a[^>]+href=["']([^"']*?(\d+)\.htm)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const cid = Number(a[2]);
      const title = cleanInline(a[3]);
      if (!cid || !title || seen.has(cid)) continue;
      if (/index\.htm/i.test(a[1])) continue;
      seen.add(cid);
      chapters.push({ id: cid, title });
    }
    if (chapters.length) {
      if (!current) {
        current = { title: '正文', chapters: [] };
        volumes.push(current);
      }
      current.chapters.push(...chapters);
      continue;
    }
    const text = cleanInline(row);
    const looksVolume =
      /class=["'][^"']*v(c|b)ss/i.test(row) ||
      (text && text.length <= 40 && VOLUME_RE.test(text));
    if (looksVolume) {
      current = { title: text, chapters: [] };
      volumes.push(current);
    }
  }

  const cleaned = volumes.filter((v) => v.chapters.length);
  let index = 0;
  for (const volume of cleaned) {
    for (const chapter of volume.chapters) {
      chapter.index = index;
      chapter.volume = volume.title;
      index += 1;
    }
  }
  return {
    volumes: cleaned,
    chapters: cleaned.flatMap((v) => v.chapters),
    count: index,
  };
}

function parseReaderPage(html, bookId) {
  const title = cleanInline(balancedDiv(html, 'title')) || cleanInline(match(html, /<title>([\s\S]*?)<\/title>/i));
  const bookTitle = cleanInline(
    match(html, new RegExp(`<a[^>]+href=["'][^"']*?/book/${bookId}\\.htm["'][^>]*>([\\s\\S]*?)<\\/a>`, 'i'))
  );
  const raw = balancedDiv(html, 'content');
  const content = cleanChapter(raw, bookId);

  let prev = null;
  let next = null;
  const preview = match(html, /var\s+preview_page\s*=\s*["']([^"']+)["']/i);
  const nextPage = match(html, /var\s+next_page\s*=\s*["']([^"']+)["']/i);
  const cidFrom = (url) => {
    const m = /[?&]cid=(\d+)/.exec(url || '');
    return m ? Number(m[1]) : null;
  };
  prev = cidFrom(preview);
  next = cidFrom(nextPage);

  if (!prev && !next) {
    for (const a of html.matchAll(/<a[^>]+href=["']([^"']*reader\.php[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = cleanInline(a[2]);
      const cid = cidFrom(a[1]);
      if (!cid) continue;
      if (/上一页|上一章|上一节/.test(label)) prev = cid;
      if (/下一页|下一章|下一节/.test(label)) next = cid;
    }
  }

  return {
    title,
    bookTitle,
    bookId: Number(bookId),
    content: content.html,
    text: content.text,
    images: content.images,
    words: content.text.replace(/\s/g, '').length,
    prev,
    next,
  };
}

const CREDIT_PATTERNS = [
  /^本文来自/,
  /^台版\s*转自/,
  /^图源\s*[:：]/,
  /^录入\s*[:：]/,
  /^修图\s*[:：]/,
  /^校对\s*[:：]/,
  /^轻小说文库/,
  /^手机阅读/,
  /^更多精彩/,
  /^本章未完/,
  /^请记住本站/,
  /^最新网址/,
  /^加入书签/,
  /^推荐本书/,
  /^内容报错/,
  /^上一页/,
  /^下一页/,
  /^返回书目/,
  /^查看书评/,
];

function cleanChapter(rawHtml, bookId) {
  if (!rawHtml) return { html: '', text: '', images: [] };
  let html = rawHtml
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<ul[^>]*id=["']contentdp["'][^>]*>[\s\S]*?<\/ul>/gi, '')
    .replace(/<ins\b[\s\S]*?<\/ins>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');

  const images = [];
  html = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src =
      match(tag, /src=["']([^"']+)["']/i) ||
      match(tag, /data-src=["']([^"']+)["']/i) ||
      match(tag, /data-original=["']([^"']+)["']/i);
    if (!src) return '';
    const abs = normalizeUrl(src);
    if (!abs) return '';
    images.push(abs);
    return `\n@@WK8IMG${images.length - 1}@@\n`;
  });

  html = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n')
    .replace(/<(p|div|li|tr|h[1-6]|section|article|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  let text = decodeEntities(html).replace(/\u00a0/g, ' ').replace(/\r/g, '');
  const lines = text.split('\n');

  const out = [];
  const plain = [];
  for (let line of lines) {
    line = line.replace(/[ \t\f\v]+/g, ' ').replace(/^[\s　]+|[\s　]+$/g, '');
    if (!line) continue;
    if (line === 'null') continue;
    if (CREDIT_PATTERNS.some((re) => re.test(line))) continue;
    if (/^https?:\/\/(www\.)?wenku8\.(com|net)/i.test(line) && line.length < 60) continue;
    if (/^[-—=*_]{3,}$/.test(line)) continue;

    const parts = line.split(/@@WK8IMG(\d+)@@/);
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i].trim();
      if (i % 2 === 1) {
        const idx = Number(parts[i]);
        const src = images[idx];
        if (src) out.push({ type: 'image', src });
      } else if (part) {
        out.push({ type: 'text', text: part });
        plain.push(part);
      }
    }
  }

  const htmlOut = out
    .map((node) => {
      if (node.type === 'image') {
        return `<figure class="illustration"><img src="${escapeHtml(imageProxy(node.src))}" alt="插图" loading="lazy" decoding="async"></figure>`;
      }
      return `<p>${escapeHtml(node.text)}</p>`;
    })
    .join('');

  return {
    html: htmlOut,
    text: plain.join('\n'),
    images: images.map((src) => imageProxy(src)),
    bookId,
  };
}

function parseWapHome(html) {
  const sections = [
    { sort: 'dayvisit', title: '今日热门' },
    { sort: 'lastupdate', title: '今日更新' },
    { sort: 'postdate', title: '新书一览' },
  ];
  const positions = sections
    .map((s) => ({ ...s, at: html.indexOf(`toplist.php?sort=${s.sort}`) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at);

  const result = [];
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].at;
    const end = i + 1 < positions.length ? positions[i + 1].at : html.length;
    const chunk = html.slice(start, end);
    const books = [];
    const seen = new Set();
    for (const m of chunk.matchAll(/<a[^>]+href=["'][^"']*articleinfo\.php\?id=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const id = Number(m[1]);
      const title = cleanInline(m[2]);
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      books.push({ id, title, cover: bookCover(id) });
      if (books.length >= 8) break;
    }
    if (books.length) result.push({ ...positions[i], books });
  }
  return result;
}

function parseSugoiPage(html) {
  const books = [];
  const seen = new Set();
  for (const m of html.matchAll(/<a[^>]+href=["'][^"']*?\/book\/(\d+)\.htm["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const id = Number(m[1]);
    const title = cleanInline(m[2]);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    books.push({ id, title, cover: bookCover(id) });
  }
  const years = [];
  for (const m of html.matchAll(/\/zt\/sugoi\/(\d{4})\.php/g)) {
    const year = Number(m[1]);
    if (!years.includes(year)) years.push(year);
  }
  years.sort((a, b) => b - a);
  return { books, years };
}

function parseListPage(html) {
  const title = cleanInline(match(html, /<title>([\s\S]*?)<\/title>/i)).replace(/\s*-\s*轻小说文库.*$/, '');
  const loginWall =
    /login\.php\?jumpurl/i.test(html) ||
    (/用户登录/.test(html) && !/\/book\/\d+\.htm/i.test(html));
  const books = [];
  const seen = new Set();

  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = row[1];
    const link = body.match(/<a[^>]+href=["'][^"']*?\/book\/(\d+)\.htm["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const id = Number(link[1]);
    let bookTitle = cleanInline(link[2]);
    if (!bookTitle) {
      const t = body.match(/<a[^>]+href=["'][^"']*?\/book\/\d+\.htm["'][^>]+title=["']([^"']+)["']/i);
      bookTitle = t ? cleanInline(t[1]) : '';
    }
    if (!id || !bookTitle || seen.has(id)) continue;
    seen.add(id);

    const cells = [];
    for (const td of body.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      const text = cleanInline(td[1]);
      if (text) cells.push(text);
    }
    const joined = cells.join(' | ');
    let author = '';
    const authorCell = cells.find((c) => /作者/.test(c));
    if (authorCell) author = authorCell.replace(/^.*作者[:：]?\s*/, '').trim();
    if (!author && cells.length > 1 && cells[1] !== bookTitle) author = cells[1];
    const words = Number((joined.match(/([\d,]+)\s*字/) || [0, '0'])[1].replace(/,/g, '')) || 0;
    const updated = (joined.match(/\d{2,4}-\d{1,2}-\d{1,2}/) || [''])[0];
    const status = /已完结|完结/.test(joined) ? '已完结' : /连载/.test(joined) ? '连载中' : '';
    const category = (joined.match(/(电击文库|富士见文库|角川文库|MF文库J|Fami通文库|GA文库|HJ文库|一迅社|集英社|小学馆|讲谈社|少女文库|其他文库)/) || [''])[0];

    books.push({
      id,
      title: bookTitle,
      author,
      words,
      updated,
      status,
      category,
      cover: bookCover(id),
    });
    if (books.length >= 40) break;
  }

  if (!books.length) {
    for (const m of html.matchAll(/<a[^>]+href=["'][^"']*?\/book\/(\d+)\.htm["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const id = Number(m[1]);
      const bookTitle = cleanInline(m[2]);
      if (!id || !bookTitle || seen.has(id)) continue;
      seen.add(id);
      books.push({ id, title: bookTitle, cover: bookCover(id) });
      if (books.length >= 40) break;
    }
  }

  return { title, books, loginWall };
}

function parseLoginFailure(html) {
  if (/登录成功|退出|欢迎您/.test(html) && !/用户名不存在|密码错误|登录失败/.test(html)) {
    return '';
  }
  const found = html.match(
    /(用户名不存在|该用户不存在|用户不存在|密码错误|密码不正确|登录失败|验证码[^<。]*|安全提问[^<。]*|用户名或密码[^<。]*|您的账号[^<。]*)/
  );
  if (found) return cleanInline(found[1]);
  const title = cleanInline(match(html, /<title>([\s\S]*?)<\/title>/i));
  if (/提示错误|错误/.test(title)) {
    return cleanInline(
      match(html, /<div[^>]*>([\s\S]{0,300}?)<\/div>/i)
    ) || '登录失败，请检查账号密码';
  }
  return '';
}

function parseProfile(html) {
  const m = html.match(/userpage\.php\?uid=(\d+)[^>]*>([\s\S]*?)<\/a>/i);
  if (!m) return null;
  return { uid: Number(m[1]), username: cleanInline(m[2]) };
}

module.exports = {
  decodeEntities,
  stripTags,
  cleanInline,
  toLines,
  escapeHtml,
  imageProxy,
  bookCover,
  parseBookPage,
  parseTocPage,
  parseReaderPage,
  parseWapHome,
  parseSugoiPage,
  parseListPage,
  parseLoginFailure,
  parseProfile,
};

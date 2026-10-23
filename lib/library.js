'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const iconv = require('iconv-lite');

const ROOT = path.join(__dirname, '..');
const LIBRARY_DIR = path.join(ROOT, 'library');
const SEED_DIR = path.join(ROOT, 'resources', 'samples');
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const CHAPTER_LIMIT = 12000;
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown']);
const SUPPORTED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, '.epub', '.pdf']);
const HEADING_RE = /^(?:第[0-9零〇一二三四五六七八九十百千万两]+[章节回卷部篇集]|chapter\s+\d+|(?:序章|楔子|引子|前言|序言|尾声|终章|后记|番外))(?:[\s:：、.．-].*)?$/i;

let books = new Map();
let errors = [];
let generatedAt = 0;
let refreshing = null;

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

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
    const entities = {
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
    const key = body.toLowerCase();
    return Object.prototype.hasOwnProperty.call(entities, key) ? entities[key] : all;
  });
}

function stripMarkup(value) {
  return decodeEntities(String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, '\n\n')
    .replace(/<(p|div|li|tr|h[1-6]|section|article|blockquote)\b[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inlineText(value) {
  return stripMarkup(value).replace(/\s+/g, ' ').trim();
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function paragraphHtml(text) {
  const blocks = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((item) => item.replace(/[ \t]+$/gm, '').trim())
    .filter(Boolean);
  return blocks.map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('') || '<p class="chapter-end">本章暂无内容。</p>';
}

function decodeText(buffer) {
  if (!buffer || !buffer.length) return '';
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  const utf8 = buffer.toString('utf8').replace(/\u0000/g, '');
  const bad = (utf8.match(/\uFFFD/g) || []).length;
  if (bad === 0) return utf8;
  const gb = iconv.decode(buffer, 'gb18030').replace(/\u0000/g, '');
  return (gb.match(/\uFFFD/g) || []).length < bad ? gb : utf8;
}

function normalizeTitle(value, fallback) {
  const title = inlineText(value).replace(/^#+\s*/, '').trim();
  return title || fallback;
}

function filenameMeta(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const match = base.match(/^(.+?)\s+[-—–]\s+(.+)$/);
  if (match) return { title: match[1].trim() || base, author: match[2].trim() };
  return { title: base.trim() || '未命名', author: '' };
}

function splitLongText(text) {
  const paragraphs = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const chunks = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const raw of paragraphs) {
    const block = raw.trim();
    if (!block) continue;
    if (block.length > CHAPTER_LIMIT) {
      push();
      for (let i = 0; i < block.length; i += CHAPTER_LIMIT) {
        chunks.push(block.slice(i, i + CHAPTER_LIMIT));
      }
      continue;
    }
    if (current && current.length + block.length + 2 > CHAPTER_LIMIT) push();
    current += `${current ? '\n\n' : ''}${block}`;
  }
  push();
  return chunks.length ? chunks : [String(text || '').trim()].filter(Boolean);
}

function textChapters(text, format) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const lines = normalized.split('\n');
  const sections = [];
  let current = null;
  let preface = [];
  let foundHeading = false;
  const markdown = format === 'md' || format === 'markdown';
  for (const rawLine of lines) {
    const line = rawLine.trim();
    let heading = '';
    if (markdown && /^#{1,3}\s+\S/.test(line)) {
      heading = line.replace(/^#{1,3}\s+/, '').trim();
    } else if (line.length <= 80 && HEADING_RE.test(line)) {
      heading = line;
    }
    if (heading) {
      foundHeading = true;
      if (current && current.lines.join('\n').trim()) sections.push(current);
      current = { title: heading, lines: [] };
    } else if (current) {
      current.lines.push(rawLine);
    } else {
      preface.push(rawLine);
    }
  }
  if (current && current.lines.join('\n').trim()) sections.push(current);

  if (!foundHeading || !sections.length) {
    const chunks = splitLongText(normalized);
    return chunks.map((chunk, index) => ({
      title: chunks.length > 1 ? `第 ${index + 1} 部分` : '正文',
      text: chunk,
    }));
  }

  const result = [];
  const prefaceText = preface.join('\n').trim();
  if (prefaceText) result.push({ title: '前言', text: prefaceText });
  for (const section of sections) {
    const content = section.lines.join('\n').trim();
    if (content) result.push({ title: section.title, text: content });
  }
  return result;
}

function parseText(buffer, filePath, format) {
  const text = decodeText(buffer);
  const chapters = textChapters(text, format).map((chapter, index) => ({
    id: `c${index + 1}`,
    title: normalizeTitle(chapter.title, `第 ${index + 1} 章`),
    index,
    content: paragraphHtml(chapter.text),
    words: chapter.text.replace(/\s/g, '').length,
  }));
  return { chapters };
}

function findEndOfCentralDirectory(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return -1;
  const min = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) throw new Error('EPUB 不是有效的 ZIP 文件');
  const count = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (pointer + 46 > buffer.length || buffer.readUInt32LE(pointer) !== 0x02014b50) {
      throw new Error('EPUB ZIP 目录损坏');
    }
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength).replace(/\\/g, '/');
    pointer += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith('/')) continue;
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      continue;
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = Buffer.from(data);
    else if (method === 8) content = zlib.inflateRawSync(data);
    else throw new Error(`不支持的 EPUB 压缩方式：${method}`);
    entries.set(name.replace(/^\/+/, ''), content);
  }
  return entries;
}

function resolveZipPath(base, href) {
  let value = String(href || '').split('#')[0].split('?')[0];
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep the original path */
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(base), value));
  return resolved.replace(/^\/+/, '');
}

function readTagAttribute(tag, name) {
  const match = String(tag || '').match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? (match[1] != null ? match[1] : match[2]) : '';
}

function parseXmlAttributes(text) {
  const attrs = {};
  const source = String(text || '');
  const regex = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = regex.exec(source))) {
    attrs[match[1]] = match[2] != null ? match[2] : match[3];
  }
  return attrs;
}

function parseEpub(buffer) {
  const entries = readZipEntries(buffer);
  const readEntry = (name) => {
    const value = entries.get(name);
    return value ? value.toString('utf8') : '';
  };
  const container = readEntry('META-INF/container.xml');
  const rootfile = container.match(/<rootfile\b[^>]*>/i);
  let opfPath = rootfile ? readTagAttribute(rootfile[0], 'full-path') : '';
  if (!opfPath) {
    opfPath = [...entries.keys()].find((name) => name.toLowerCase().endsWith('.opf')) || '';
  }
  if (!opfPath) throw new Error('EPUB 缺少 OPF 文件');
  const opf = readEntry(opfPath);
  if (!opf) throw new Error('EPUB OPF 文件无法读取');

  const manifest = new Map();
  for (const item of opf.match(/<item\b[^>]*\/?>/gi) || []) {
    const attrs = parseXmlAttributes(item);
    if (attrs.id && attrs.href) {
      manifest.set(attrs.id, {
        id: attrs.id,
        href: attrs.href,
        mediaType: attrs['media-type'] || '',
        properties: attrs.properties || '',
      });
    }
  }
  const spine = [];
  for (const item of opf.match(/<itemref\b[^>]*\/?>/gi) || []) {
    const idref = readTagAttribute(item, 'idref');
    if (idref && manifest.has(idref)) spine.push(manifest.get(idref));
  }
  const title = inlineText((opf.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i) || [])[1] || '');
  const creator = inlineText((opf.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i) || [])[1] || '');
  const description = inlineText((opf.match(/<dc:description\b[^>]*>([\s\S]*?)<\/dc:description>/i) || [])[1] || '');
  const coverId = readTagAttribute((opf.match(/<meta\b[^>]*name\s*=\s*["']cover["'][^>]*>/i) || [''])[0], 'content');
  let coverItem = null;
  for (const item of manifest.values()) {
    if (/\bcover-image\b/i.test(item.properties) || item.id === coverId) {
      coverItem = item;
      break;
    }
  }
  if (!coverItem) {
    coverItem = [...manifest.values()].find((item) => /(?:^|\/)cover\.(?:jpe?g|png|webp|gif)$/i.test(item.href)) || null;
  }
  const chapters = [];
  const chapterItems = spine.filter((item) => /html|xhtml/i.test(item.mediaType) || /\.(?:xhtml|html|htm)$/i.test(item.href));
  const sourceItems = chapterItems.length ? chapterItems : [...manifest.values()].filter((item) => /\.(?:xhtml|html|htm)$/i.test(item.href));
  for (const item of sourceItems) {
    const entryPath = resolveZipPath(opfPath, item.href);
    const html = readEntry(entryPath);
    if (!html) continue;
    const text = stripMarkup(html);
    if (!text) continue;
    const htmlTitle = inlineText((html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const heading = inlineText((html.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i) || [])[1] || '');
    const bodyText = heading && text.startsWith(heading) ? text.slice(heading.length).trim() : text;
    chapters.push({
      id: `c${chapters.length + 1}`,
      title: normalizeTitle(htmlTitle || heading, `第 ${chapters.length + 1} 章`),
      index: chapters.length,
      content: paragraphHtml(bodyText),
      words: bodyText.replace(/\s/g, '').length,
    });
  }
  if (!chapters.length) throw new Error('EPUB 没有可读取的正文');
  let coverBuffer = null;
  let coverType = '';
  if (coverItem) {
    const coverPath = resolveZipPath(opfPath, coverItem.href);
    coverBuffer = entries.get(coverPath) || null;
    const ext = path.posix.extname(coverPath).toLowerCase();
    coverType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
  }
  return { title, author: creator, description, chapters, coverBuffer, coverType };
}

async function scanFiles(dir, files, seed, prefix) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'README.md') continue;
    const filePath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === '.cache' || entry.name === 'node_modules') continue;
      await scanFiles(filePath, files, seed, `${prefix}${entry.name}/`);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    files.push({ filePath, relative: path.relative(ROOT, filePath).split(path.sep).join('/'), seed, ext });
  }
}

async function buildBook(file) {
  const stat = await fsp.stat(file.filePath);
  if (!stat.isFile()) return null;
  if (stat.size > MAX_FILE_BYTES) throw new Error('文件超过 80 MB，未导入');
  if (stat.size === 0) throw new Error('文件为空');
  const id = `b${crypto.createHash('sha1').update(file.relative).digest('hex').slice(0, 12)}`;
  const fallback = filenameMeta(file.filePath);
  const category = file.seed
    ? '公共领域示例'
    : path.dirname(file.relative).replace(/^library\/?/, '').split('/').filter(Boolean).join(' / ') || '本机文件';
  let parsed;
  let format = file.ext.slice(1);
  if (file.ext === '.pdf') {
    parsed = {
      title: fallback.title,
      author: fallback.author,
      description: 'PDF 文件。点击「打开 PDF」在系统阅读器中查看。',
      chapters: [],
      coverBuffer: null,
      coverType: '',
    };
    format = 'pdf';
  } else if (file.ext === '.epub') {
    const buffer = await fsp.readFile(file.filePath);
    parsed = parseEpub(buffer);
    if (!parsed.title) parsed.title = fallback.title;
    if (!parsed.author) parsed.author = fallback.author;
    format = 'epub';
  } else {
    const buffer = await fsp.readFile(file.filePath);
    parsed = parseText(buffer, file.filePath, format);
    parsed.title = fallback.title;
    parsed.author = fallback.author;
    parsed.description = parsed.chapters.length ? parsed.chapters[0].content.replace(/<[^>]+>/g, '').slice(0, 140) : '';
  }
  parsed.chapters = parsed.chapters.map((chapter, index) => ({ ...chapter, index, id: chapter.id || `c${index + 1}` }));
  const words = parsed.chapters.reduce((sum, chapter) => sum + Number(chapter.words || 0), 0);
  return {
    id,
    title: parsed.title || fallback.title,
    author: parsed.author || '',
    category,
    format,
    source: file.relative,
    description: parsed.description || '',
    chapters: parsed.chapters,
    words,
    coverBuffer: parsed.coverBuffer || null,
    coverType: parsed.coverType || '',
    filePath: file.filePath,
    seed: file.seed,
  };
}

function publicBook(book) {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    category: book.category,
    format: book.format,
    source: book.source,
    description: book.description,
    chapterCount: book.chapters.length,
    words: book.words,
    cover: book.coverBuffer ? `/api/library/${book.id}/cover` : '',
    seed: book.seed,
    firstChapter: book.chapters[0] ? { id: book.chapters[0].id, title: book.chapters[0].title } : null,
  };
}

function payload() {
  return {
    books: [...books.values()].map(publicBook).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
    errors,
    generatedAt,
    directory: LIBRARY_DIR,
  };
}

async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const files = [];
    const nextErrors = [];
    await scanFiles(LIBRARY_DIR, files, false, '');
    await scanFiles(SEED_DIR, files, true, '');
    const next = new Map();
    for (const file of files) {
      try {
        const book = await buildBook(file);
        if (book) next.set(book.id, book);
      } catch (error) {
        nextErrors.push({ file: file.relative, error: error.message || '导入失败' });
      }
    }
    books = next;
    errors = nextErrors;
    generatedAt = Date.now();
    return payload();
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}

function getBook(id) {
  const book = books.get(String(id));
  if (!book) return null;
  const chapters = book.chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    index: chapter.index,
  }));
  return {
    ...publicBook(book),
    chapters,
    volumes: chapters.length ? [{ title: '正文', chapters }] : [],
    fileUrl: `/api/library/${book.id}/file`,
  };
}

function getChapter(bookId, chapterId) {
  const book = books.get(String(bookId));
  if (!book) return null;
  const index = book.chapters.findIndex((chapter) => String(chapter.id) === String(chapterId));
  if (index < 0) return null;
  const chapter = book.chapters[index];
  return {
    id: chapter.id,
    title: chapter.title,
    content: chapter.content,
    index,
    prev: index > 0 ? book.chapters[index - 1].id : null,
    next: index + 1 < book.chapters.length ? book.chapters[index + 1].id : null,
    bookTitle: book.title,
    chapterCount: book.chapters.length,
  };
}

function getCover(id) {
  const book = books.get(String(id));
  if (!book || !book.coverBuffer) return null;
  return { buffer: book.coverBuffer, contentType: book.coverType || 'image/jpeg' };
}

function getFile(id) {
  const book = books.get(String(id));
  if (!book) return null;
  return { path: book.filePath, format: book.format, title: book.title };
}

module.exports = {
  refresh,
  payload,
  getBook,
  getChapter,
  getCover,
  getFile,
  libraryDir: LIBRARY_DIR,
};

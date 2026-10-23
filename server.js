'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const site = require('./lib/site');
const library = require('./lib/library');

const PORT = Number(process.env.PORT) || 8787;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 8443;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const TLS_CERT = process.env.TLS_CERT || path.join(__dirname, 'certs', 'server.crt');
const TLS_KEY = process.env.TLS_KEY || path.join(__dirname, 'certs', 'server.key');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.cer': 'application/x-x509-ca-cert',
  '.txt': 'text/plain; charset=utf-8',
  '.epub': 'application/epub+zip',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, error) {
  const status = error.status || 500;
  sendJson(res, status, {
    error: error.message || '服务器错误',
    authRequired: Boolean(error.authRequired),
  });
}

function sendLibraryFile(req, res, id) {
  const file = library.getFile(id);
  if (!file) {
    sendJson(res, 404, { error: '本地书籍不存在' });
    return;
  }
  let stat;
  try {
    stat = fs.statSync(file.path);
  } catch {
    sendJson(res, 404, { error: '源文件不存在' });
    return;
  }
  const total = stat.size;
  const contentTypes = {
    pdf: 'application/pdf',
    epub: 'application/epub+zip',
    md: 'text/markdown; charset=utf-8',
    markdown: 'text/markdown; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
  };
  const contentType = contentTypes[file.format] || 'application/octet-stream';
  const name = path.basename(file.path);
  const asciiName = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  let start = 0;
  let end = total - 1;
  let status = 200;
  const range = String(req.headers.range || '');
  const rangeMatch = range.match(/^bytes=(\d+)-(\d*)$/);
  const suffixMatch = range.match(/^bytes=-(\d+)$/);
  if (rangeMatch) {
    start = Number(rangeMatch[1]);
    end = rangeMatch[2] ? Math.min(Number(rangeMatch[2]), total - 1) : total - 1;
    status = 206;
  } else if (suffixMatch) {
    start = Math.max(0, total - Number(suffixMatch[1]));
    status = 206;
  }
  if (start >= total || start > end) {
    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
    res.end();
    return;
  }
  const headers = {
    'Content-Type': contentType,
    'Content-Length': end - start + 1,
    'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${total}`;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file.path, { start, end }).pipe(res);
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relative);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(301, { Location: `${pathname.replace(/\/?$/, '/')}index.html` });
    res.end();
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag });
    res.end();
    return;
  }
  const longCache = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff2'].includes(ext);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': longCache ? 'public, max-age=604800' : 'no-cache',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

let libraryReady = null;

function ensureLibrary() {
  if (!libraryReady) {
    libraryReady = library.refresh()
      .then((data) => {
        console.log(`[library] ${data.books.length} 本，${data.errors.length} 个错误`);
        return data;
      })
      .catch((error) => {
        console.error(`[library] 扫描失败: ${error.stack || error.message}`);
        return null;
      });
  }
  return libraryReady;
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const started = Date.now();

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, time: Date.now(), uptime: process.uptime() });
    }

    if (req.method === 'GET' && pathname === '/api/library') {
      await ensureLibrary();
      return sendJson(res, 200, library.payload());
    }

    if (req.method === 'POST' && pathname === '/api/library/refresh') {
      return sendJson(res, 200, await library.refresh());
    }

    const libraryFileMatch = pathname.match(/^\/api\/library\/([a-z0-9]+)\/file$/);
    if ((req.method === 'GET' || req.method === 'HEAD') && libraryFileMatch) {
      await ensureLibrary();
      return sendLibraryFile(req, res, libraryFileMatch[1]);
    }

    const libraryCoverMatch = pathname.match(/^\/api\/library\/([a-z0-9]+)\/cover$/);
    if (req.method === 'GET' && libraryCoverMatch) {
      await ensureLibrary();
      const cover = library.getCover(libraryCoverMatch[1]);
      if (!cover) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      res.writeHead(200, {
        'Content-Type': cover.contentType,
        'Content-Length': cover.buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(cover.buffer);
    }

    const libraryChapterMatch = pathname.match(/^\/api\/library\/([a-z0-9]+)\/chapter\/([a-z0-9]+)$/);
    if (req.method === 'GET' && libraryChapterMatch) {
      await ensureLibrary();
      const chapter = library.getChapter(libraryChapterMatch[1], libraryChapterMatch[2]);
      if (!chapter) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '章节不存在' }));
      }
      return sendJson(res, 200, chapter);
    }

    const libraryBookMatch = pathname.match(/^\/api\/library\/([a-z0-9]+)$/);
    if (req.method === 'GET' && libraryBookMatch) {
      await ensureLibrary();
      const book = library.getBook(libraryBookMatch[1]);
      if (!book) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '本地书籍不存在' }));
      }
      return sendJson(res, 200, book);
    }

    if (req.method === 'GET' && pathname === '/api/home') {
      const data = await site.getHome();
      return sendJson(res, 200, data);
    }

    if (req.method === 'GET' && pathname === '/api/sugoi') {
      return sendJson(res, 200, await site.getSugoi(searchParams.get('year') || 2026));
    }

    const bookMatch = pathname.match(/^\/api\/book\/(\d+)$/);
    if (req.method === 'GET' && bookMatch) {
      return sendJson(res, 200, await site.getBook(bookMatch[1]));
    }

    const chapterMatch = pathname.match(/^\/api\/chapter\/(\d+)\/(\d+)$/);
    if (req.method === 'GET' && chapterMatch) {
      return sendJson(res, 200, await site.getChapter(chapterMatch[1], chapterMatch[2]));
    }

    if (req.method === 'GET' && pathname === '/api/image') {
      const src = searchParams.get('src') || '';
      const image = await site.getImage(src);
      res.writeHead(200, {
        'Content-Type': image.contentType,
        'Content-Length': image.buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      });
      return res.end(image.buffer);
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: '接口不存在' }));
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error(`[api] ${pathname} ${status} ${error.stack || error.message}`);
    }
    return sendError(res, error);
  } finally {
    const ms = Date.now() - started;
    if (pathname !== '/api/image' || ms > 1500) {
      console.log(`[api] ${req.method} ${pathname} ${ms}ms`);
    }
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url);
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }
  serveStatic(req, res, url.pathname);
}

const server = http.createServer(handleRequest);

function lanAddresses() {
  const addresses = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) addresses.push(net.address);
    }
  }
  return addresses;
}

function startHttps(addresses) {
  if (!fs.existsSync(TLS_CERT) || !fs.existsSync(TLS_KEY)) {
    console.log('  HTTPS 未启用：缺少 certs/server.crt 或 certs/server.key');
    console.log('');
    return;
  }
  try {
    const tlsServer = https.createServer({
      key: fs.readFileSync(TLS_KEY),
      cert: fs.readFileSync(TLS_CERT),
      minVersion: 'TLSv1.2',
    }, handleRequest);
    tlsServer.listen(HTTPS_PORT, HOST, () => {
      console.log(`  HTTPS 本机: https://localhost:${HTTPS_PORT}`);
      for (const ip of addresses) console.log(`  HTTPS 手机: https://${ip}:${HTTPS_PORT}`);
      console.log('');
    });
    tlsServer.on('error', (error) => {
      console.error(`  HTTPS 启动失败: ${error.message}`);
      console.log('');
    });
  } catch (error) {
    console.error(`  HTTPS 启动失败: ${error.message}`);
    console.log('');
  }
}

server.listen(PORT, HOST, () => {
  const addresses = lanAddresses();
  console.log('');
  console.log('  轻小说文库 · iOS 网页版');
  console.log(`  本机: http://localhost:${PORT}`);
  for (const ip of addresses) console.log(`  手机: http://${ip}:${PORT}`);
  console.log('');
  console.log('  手机与电脑需在同一 Wi-Fi。按 Ctrl+C 停止。');
  ensureLibrary();
  warmCache();

  console.log('');
  startHttps(addresses);
});

process.on('unhandledRejection', (error) => {
  console.error('[unhandled]', error);
});

function warmCache() {
  const tasks = [
    ['home', () => site.getHome()],
    ['sugoi', () => site.getSugoi(2026)],
  ];
  for (const [name, run] of tasks) {
    const started = Date.now();
    run()
      .then(() => console.log(`[warm] ${name} warmed in ${Date.now() - started}ms`))
      .catch((error) => console.log(`[warm] ${name} warm failed: ${error.message}`));
  }
}

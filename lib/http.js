'use strict';

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const iconv = require('iconv-lite');

const BASE = 'https://www.wenku8.net';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IMAGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  absorb(headers) {
    const list = headers['set-cookie'];
    if (!list) return;
    const lines = Array.isArray(list) ? list : [list];
    for (const line of lines) {
      const parts = String(line).split(';');
      const pair = parts.shift() || '';
      const at = pair.indexOf('=');
      if (at < 0) continue;
      const name = pair.slice(0, at).trim();
      if (!name) continue;
      const value = pair.slice(at + 1).trim();
      let dead = false;
      for (const attr of parts) {
        const eq = attr.indexOf('=');
        const key = (eq < 0 ? attr : attr.slice(0, eq)).trim().toLowerCase();
        const val = eq < 0 ? '' : attr.slice(eq + 1).trim();
        if (key === 'max-age' && Number(val) <= 0) dead = true;
        if (key === 'expires') {
          const t = Date.parse(val);
          if (Number.isFinite(t) && t <= Date.now()) dead = true;
        }
      }
      if (dead) this.map.delete(name);
      else this.map.set(name, value);
    }
  }

  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  has(name) {
    return this.map.has(name);
  }

  clear() {
    this.map.clear();
  }
}

function decompress(buffer, encoding) {
  if (!buffer || !buffer.length) return buffer;
  const enc = String(encoding || '').toLowerCase();
  try {
    if (enc.includes('gzip')) return zlib.gunzipSync(buffer);
    if (enc.includes('deflate')) return zlib.inflateSync(buffer);
    if (enc.includes('br') && zlib.brotliDecompressSync) return zlib.brotliDecompressSync(buffer);
  } catch {
    return buffer;
  }
  return buffer;
}

function rawRequestOnce(target, opts = {}) {
  const url = target instanceof URL ? target : new URL(target);
  const mod = url.protocol === 'https:' ? https : http;
  const method = opts.method || 'GET';
  const body = opts.body || null;
  const timeout = opts.timeout || 25000;
  const maxBytes = opts.maxBytes || 8 * 1024 * 1024;
  const headers = { ...(opts.headers || {}) };
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

  return new Promise((resolve, reject) => {
    const requestOptions = { headers };
    if (method !== 'GET') requestOptions.method = method;
    if (opts.agent) requestOptions.agent = opts.agent;
    const req = mod.request(url, requestOptions, (res) => {
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error('response too large'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: decompress(raw, res.headers['content-encoding']),
          url: url.toString(),
        });
      });
      res.on('error', reject);
    });
    req.setTimeout(timeout, () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const RETRYABLE = new Set(['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNABORTED', 'EAI_AGAIN']);

function isRetryable(error) {
  if (!error) return false;
  if (RETRYABLE.has(error.code)) return true;
  const msg = String(error.message || '');
  return /timed out|socket hang up|ECONNRESET|EPIPE|network/i.test(msg);
}

async function rawRequest(target, opts = {}) {
  const attempts = opts.retries === undefined ? 3 : Math.max(1, Number(opts.retries) || 1);
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await rawRequestOnce(target, opts);
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function siteRequest(target, opts = {}) {
  const jar = opts.jar || null;
  const method = opts.method || 'GET';
  let url = new URL(target.startsWith('http') ? target : BASE + target);
  let body = opts.body || null;
  let headers = {
    'User-Agent': UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    Referer: opts.referer || BASE + '/',
    Connection: 'close',
    ...(opts.headers || {}),
  };
  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  let currentMethod = method;
  let currentBody = body;

  for (let hop = 0; hop < 7; hop += 1) {
    if (jar && /(^|\.)wenku8\.(net|com)$/i.test(url.hostname)) {
      const cookie = jar.header();
      if (cookie) headers.Cookie = cookie;
      else delete headers.Cookie;
    }
    const res = await rawRequest(url, {
      method: currentMethod,
      headers,
      body: currentBody,
      timeout: opts.timeout,
      maxBytes: opts.maxBytes,
    });
    if (jar) jar.absorb(res.headers);

    const location = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      const next = new URL(location, url);
      if (res.status === 303 || ((res.status === 301 || res.status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentBody = null;
        delete headers['Content-Type'];
        delete headers['Content-Length'];
      }
      headers.Referer = url.toString();
      url = next;
      continue;
    }
    return {
      status: res.status,
      headers: res.headers,
      buffer: res.body,
      url: url.toString(),
    };
  }
  throw new Error('too many redirects');
}

function decodeHtml(buffer, contentType) {
  const declared = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '');
  let encoding = declared ? declared[1].toLowerCase() : '';
  if (encoding === 'gb2312' || encoding === 'gbk' || encoding === 'x-gbk') encoding = 'gbk';
  if (encoding && iconv.encodingExists(encoding)) {
    return iconv.decode(buffer, encoding);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, 'gbk');
  }
}

async function fetchHtml(target, opts = {}) {
  const res = await siteRequest(target, opts);
  const html = decodeHtml(res.buffer, res.headers['content-type']);
  return {
    html,
    status: res.status,
    url: res.url,
    headers: res.headers,
    redirectedToLogin: /\/login\.php(\?|$)/.test(res.url),
  };
}

function encodeForm(fields) {
  return Buffer.from(
    Object.entries(fields)
      .map(([k, v]) => `${pct(k)}=${pct(String(v))}`)
      .join('&'),
    'ascii'
  );
}

function pct(value) {
  const bytes = iconv.encode(String(value), 'gbk');
  let out = '';
  for (const byte of bytes) {
    const ch = String.fromCharCode(byte);
    if (/[A-Za-z0-9_.~-]/.test(ch)) out += ch;
    else out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

module.exports = {
  BASE,
  UA,
  IMAGE_UA,
  CookieJar,
  siteRequest,
  fetchHtml,
  rawRequest,
  decodeHtml,
  encodeForm,
  pct,
};

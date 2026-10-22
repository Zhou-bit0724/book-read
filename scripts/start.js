'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const dataDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Wenku8Web');
const logPath = path.join(dataDir, 'server.log');
const pidPath = path.join(dataDir, 'server.pid');
const port = Number(process.env.PORT) || 8787;

function health() {
  return new Promise((resolve) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: '/api/health',
      timeout: 1500,
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 && JSON.parse(body).ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function main() {
  if (await health()) {
    console.log(`Wenku8 already running on http://127.0.0.1:${port}`);
    return;
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  child.unref();
  fs.closeSync(out);

  if (!child.pid) throw new Error('Failed to start server');
  fs.writeFileSync(pidPath, String(child.pid), 'ascii');
  console.log(`Wenku8 started, pid=${child.pid}, log=${logPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

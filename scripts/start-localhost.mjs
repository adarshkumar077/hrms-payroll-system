#!/usr/bin/env node
/**
 * Local HRMS stack — HTTPS on :3000 for Camera + GPS, with HTTP→HTTPS redirect
 * so http://192.168.1.69:3000 no longer shows ERR_EMPTY_RESPONSE.
 *
 * Local:  https://localhost:3000  (http:// also redirects here)
 * LAN:    https://<lan-ip>:3000   (accept cert once; http:// auto-upgrades)
 * Public: Cloudflare quick tunnel (HTTPS)
 * API:    :3001 via Next /api/v1 rewrite
 *
 * Plain HTTP-only (no camera): npm run start:localhost:http
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const urlFile = path.join(root, '.public-url.txt');
const useHttps = process.env.EITF_WEB_HTTPS === '0' || process.argv.includes('--http') ? false : true;
const INTERNAL_PORT = 3005;

function cloudflaredBin() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], {
    encoding: 'utf8',
    shell: true,
  });
  if (r.status === 0) return r.stdout.trim().split(/\r?\n/)[0];
  const win = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
  return process.platform === 'win32' ? win : 'cloudflared';
}

function ensureWindowsFirewall() {
  if (process.platform !== 'win32') return;
  for (const port of [3000, 3001]) {
    try {
      spawnSync(
        'netsh',
        [
          'advfirewall',
          'firewall',
          'add',
          'rule',
          `name=EITF HRMS Port ${port}`,
          'dir=in',
          'action=allow',
          'protocol=TCP',
          `localport=${port}`,
          'profile=private,domain',
        ],
        { encoding: 'utf8', shell: true, windowsHide: true },
      );
    } catch {
      /* ignore */
    }
  }
}

function startQuickTunnel(localOrigin) {
  const bin = cloudflaredBin();
  const tunnel = spawn(
    bin,
    ['tunnel', '--url', localOrigin, '--no-tls-verify', '--no-autoupdate'],
    {
      cwd: root,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  children.push(tunnel);
  const onChunk = (buf) => {
    const text = buf.toString();
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      writeFileSync(urlFile, m[0] + '\n', 'utf8');
      console.log(`Cloudflare: ${m[0]}`);
    }
  };
  tunnel.stdout.on('data', onChunk);
  tunnel.stderr.on('data', onChunk);
  tunnel.on('exit', (code) => {
    console.log(`[tunnel] exited code=${code}`);
  });
}

function lanIp() {
  const nets = networkInterfaces();
  const preferred = [];
  const others = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (!net.address.startsWith('192.168.')) continue;
      const virtual = /vmware|vethernet|virtual|hyper-v/i.test(name);
      if (net.address === '192.168.1.69' || (!virtual && /wi-?fi|wlan|wireless/i.test(name))) {
        preferred.push(net.address);
      } else if (!virtual) {
        preferred.push(net.address);
      } else {
        others.push(net.address);
      }
    }
  }
  return preferred[0] || others[0] || '127.0.0.1';
}

const children = [];
function run(label, args, env = {}, opts = {}) {
  const child = spawn(opts.cmd || npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: opts.shell !== false,
    env: { ...process.env, ...env },
  });
  child.on('exit', (code) => {
    console.log(`[${label}] exited code=${code}`);
  });
  children.push(child);
  return child;
}

ensureWindowsFirewall();

const lan = lanIp();

console.log('\n=== EITF HRMS ===');
console.log(`Root: ${root}`);
if (useHttps) {
  console.log('Mode: HTTPS + HTTP→HTTPS redirect (fixes ERR_EMPTY_RESPONSE)');
  console.log('Local:  https://localhost:3000');
  console.log(`LAN:    https://${lan}:3000  ← use this (accept cert once)`);
  console.log(`Also:   http://${lan}:3000  ← auto-redirects to HTTPS`);
} else {
  console.log('Mode: HTTP only (Camera/GPS blocked by browsers)');
  console.log('Local:  http://localhost:3000');
  console.log(`LAN:    http://${lan}:3000`);
}
console.log('API:    http://0.0.0.0:3001');
console.log('Login:  admin@eitf.in / Admin@123\n');

run('api', ['run', 'dev:api']);

if (useHttps) {
  // Next stays HTTP on loopback; public :3000 terminates TLS + redirects plain HTTP.
  run('web', ['run', 'dev:internal', '-w', '@eitf/web'], {
    API_INTERNAL_URL: 'http://127.0.0.1:3001',
  });
  setTimeout(() => {
    run(
      'gateway',
      [path.join(root, 'scripts', 'lan-https-gateway.mjs')],
      { EITF_GATEWAY_PORT: '3000', EITF_NEXT_INTERNAL_PORT: String(INTERNAL_PORT) },
      { cmd: process.execPath, shell: false },
    );
  }, 2500);
  startQuickTunnel('https://127.0.0.1:3000');
} else {
  run('web', ['run', 'dev:web:http'], {
    API_INTERNAL_URL: 'http://127.0.0.1:3001',
    HOSTNAME: '0.0.0.0',
  });
  startQuickTunnel('http://127.0.0.1:3000');
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill('SIGTERM');
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

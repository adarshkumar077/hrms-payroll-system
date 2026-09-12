#!/usr/bin/env node
/**
 * Local HRMS stack (Attendance & Payroll) — CRM/Orbit not started.
 * Public: http://localhost:3000  |  API: :3001
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const urlFile = path.join(root, '.public-url.txt');

function cloudflaredBin() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], {
    encoding: 'utf8',
    shell: true,
  });
  if (r.status === 0) return r.stdout.trim().split(/\r?\n/)[0];
  const win = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';
  return process.platform === 'win32' ? win : 'cloudflared';
}

function startQuickTunnel() {
  const bin = cloudflaredBin();
  const tunnel = spawn(bin, ['tunnel', '--url', 'http://127.0.0.1:3000', '--no-autoupdate'], {
    cwd: root,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && net.address.startsWith('192.168.')) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const children = [];
function run(label, args, env = {}) {
  const child = spawn(npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  child.on('exit', (code) => {
    console.log(`[${label}] exited code=${code}`);
  });
  children.push(child);
  return child;
}

console.log('\n=== EITF HRMS (Attendance & Payroll) ===');
console.log(`Root: ${root}`);
console.log('Public: http://localhost:3000');
console.log(`LAN:    http://${lanIp()}:3000`);
console.log('Login:  superadmin / Super@123\n');

run('api', ['run', 'dev:api']);
run('web', ['run', 'dev:web'], {
  API_INTERNAL_URL: 'http://127.0.0.1:3001',
});
startQuickTunnel();

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

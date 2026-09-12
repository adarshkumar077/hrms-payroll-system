#!/usr/bin/env node
/**
 * Expose local HRMS (Next.js :3000 → Nest :3001 rewrite) on a public HTTPS URL
 * via Cloudflare quick tunnel (trycloudflare.com). No Cloudflare account required.
 *
 * Usage: npm run start:public
 */
import { spawn, spawnSync, execSync } from 'node:child_process';
import { createWriteStream, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const urlFile = path.join(root, '.public-url.txt');
const logFile = path.join(root, '.cloudflared-tunnel.log');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function portOpen(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => {
      s.close();
      resolve(false);
    });
    s.listen(port, '127.0.0.1');
  });
}

function which(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
    encoding: 'utf8',
    shell: true,
  });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : '';
}

function installCloudflared() {
  if (which('cloudflared')) return which('cloudflared');
  console.log('Installing Cloudflare Tunnel (cloudflared)...');
  if (process.platform === 'win32') {
    const w = spawnSync(
      'winget',
      [
        'install',
        '-e',
        '--id',
        'Cloudflare.cloudflared',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ],
      { stdio: 'inherit', shell: true },
    );
    if (w.status !== 0) {
      console.warn('winget install failed; trying GitHub binary...');
      try {
        execSync(
          'powershell -NoProfile -Command "Invoke-WebRequest -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe -OutFile $env:TEMP\\cloudflared.exe"',
          { stdio: 'inherit' },
        );
        return process.env.TEMP + '\\cloudflared.exe';
      } catch {
        throw new Error('Could not install cloudflared. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
      }
    }
  } else {
    spawnSync('brew', ['install', 'cloudflared'], { stdio: 'inherit' });
  }
  return which('cloudflared') || 'cloudflared';
}

function waitHttp(url, timeoutMs = 90_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url, { redirect: 'manual' });
        if (res.status > 0) return resolve(true);
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout waiting for ${url}`));
      setTimeout(tick, 1500);
    };
    tick();
  });
}

const children = [];

async function ensureStack() {
  const webUp = await portOpen(3000);
  const apiUp = await portOpen(3001);
  if (webUp && apiUp) {
    console.log('HRMS already listening on :3000 and :3001');
    return;
  }
  console.log('Starting Postgres (embedded) if needed...');
  spawnSync(npm, ['run', 'db:up'], { cwd: root, stdio: 'inherit', shell: true });

  console.log('Starting API + web on 0.0.0.0 ...');
  const stack = spawn(npm, ['run', 'start:localhost'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      API_INTERNAL_URL: 'http://127.0.0.1:3001',
    },
  });
  children.push(stack);
  await waitHttp('http://127.0.0.1:3000');
  await waitHttp('http://127.0.0.1:3001/api/v1/health');
}

async function main() {
  const bin = installCloudflared();
  await ensureStack();

  const out = createWriteStream(logFile, { flags: 'w' });
  console.log('\nOpening Cloudflare quick tunnel → http://127.0.0.1:3000\n');

  const tunnel = spawn(bin, ['tunnel', '--url', 'http://127.0.0.1:3000', '--no-autoupdate'], {
    cwd: root,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(tunnel);

  let publicUrl = '';
  const onChunk = (buf) => {
    const text = buf.toString();
    process.stdout.write(text);
    out.write(text);
    const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !publicUrl) {
      publicUrl = m[0];
      writeFileSync(urlFile, publicUrl + '\n', 'utf8');
      console.log('\n========================================');
      console.log('Public HTTPS URL (any device):');
      console.log(publicUrl);
      console.log('Login: superadmin / Super@123');
      console.log('Keep this window open. Stop: npm run stop:public  or Ctrl+C');
      console.log('========================================\n');
    }
  };
  tunnel.stdout.on('data', onChunk);
  tunnel.stderr.on('data', onChunk);

  tunnel.on('exit', (code) => {
    console.log(`cloudflared exited code=${code}`);
    process.exit(code ?? 0);
  });

  const shutdown = () => {
    for (const c of children) {
      try {
        c.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

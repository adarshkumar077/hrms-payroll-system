#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const urlFile = path.join(root, '.public-url.txt');

if (process.platform === 'win32') {
  try {
    execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
  } catch {
    /* not running */
  }
} else {
  try {
    execSync('pkill -f "cloudflared tunnel"', { stdio: 'ignore' });
  } catch {
    /* not running */
  }
}

if (existsSync(urlFile)) unlinkSync(urlFile);
console.log('Cloudflare tunnel stopped. Local HRMS on :3000/:3001 is unchanged.');
console.log('To stop API+web as well, close the start:localhost terminal (Ctrl+C).');

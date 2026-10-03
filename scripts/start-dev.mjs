#!/usr/bin/env node
/**
 * Start local HRMS stack (DB must already be running: npm run db:up).
 * CRM/Orbit is not started.
 */
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

function lanIp() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.')) {
        if (net.address.startsWith('192.168.')) return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const api = spawn(npm, ['run', 'dev:api'], { cwd: root, stdio: 'inherit', shell: true });
const web = spawn(npm, ['run', 'dev:web'], { cwd: root, stdio: 'inherit', shell: true });

const ip = lanIp();
console.log('\n--- EITF HRMS (Attendance & Payroll) ---');
console.log(`Local:   http://localhost:3000`);
console.log(`Network: http://${ip}:3000`);
console.log(`API LAN: http://${ip}:3001/api/v1/health`);
console.log('Login: admin@eitf.in / Admin@123');
console.log('Keep this terminal open. Ctrl+C to stop.\n');

function shutdown() {
  api.kill('SIGTERM');
  web.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

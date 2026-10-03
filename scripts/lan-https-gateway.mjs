#!/usr/bin/env node
/**
 * Same-port HTTP + HTTPS gateway for LAN phones.
 *
 * Problem: Next --experimental-https only speaks TLS. Opening
 * http://192.168.1.69:3000 causes ERR_EMPTY_RESPONSE.
 *
 * This gateway listens on 0.0.0.0:3000:
 *  - Plain HTTP  → 301 redirect to https://<same-host>:3000/...
 *  - HTTPS (TLS) → reverse-proxy to Next on 127.0.0.1:INTERNAL_PORT
 *
 * Camera/GPS keep working (secure context on HTTPS).
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_PORT = Number(process.env.EITF_GATEWAY_PORT || 3000);
const INTERNAL_PORT = Number(process.env.EITF_NEXT_INTERNAL_PORT || 3005);
const certDir = path.join(root, 'apps', 'web', 'certificates');
const key = fs.readFileSync(path.join(certDir, 'localhost-key.pem'));
const cert = fs.readFileSync(path.join(certDir, 'localhost.pem'));

function proxyRequest(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${INTERNAL_PORT}` };
  const p = http.request(
    {
      hostname: '127.0.0.1',
      port: INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  p.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end(`Gateway could not reach Next.js on :${INTERNAL_PORT} (${err.message})`);
  });
  req.pipe(p);
}

function proxyUpgrade(req, socket, head) {
  const headers = { ...req.headers, host: `127.0.0.1:${INTERNAL_PORT}` };
  const p = http.request({
    hostname: '127.0.0.1',
    port: INTERNAL_PORT,
    path: req.url,
    method: req.method,
    headers,
  });
  p.on('upgrade', (upRes, upSocket, upHead) => {
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(upRes.headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (upHead?.length) socket.write(upHead);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });
  p.on('error', () => {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  });
  p.end();
}

const httpsServer = https.createServer({ key, cert }, proxyRequest);
httpsServer.on('upgrade', proxyUpgrade);

const httpServer = http.createServer((req, res) => {
  const hostHeader = String(req.headers.host || '192.168.1.69:3000');
  const hostname = hostHeader.replace(/:\d+$/, '');
  const target = `https://${hostname}:${PUBLIC_PORT}${req.url || '/'}`;
  res.writeHead(301, {
    Location: target,
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${target}">` +
      `<p>Redirecting to secure HRMS: <a href="${target}">${target}</a></p>`,
  );
});

const gateway = net.createServer((socket) => {
  socket.once('data', (buf) => {
    socket.pause();
    socket.unshift(buf);
    // TLS handshake records start with 0x16
    if (buf[0] === 0x16) {
      httpsServer.emit('connection', socket);
    } else {
      httpServer.emit('connection', socket);
    }
    process.nextTick(() => {
      try {
        socket.resume();
      } catch {
        /* ignore */
      }
    });
  });
  socket.on('error', () => {
    /* ignore client aborts */
  });
});

gateway.listen(PUBLIC_PORT, '0.0.0.0', () => {
  console.log(
    `[gateway] :${PUBLIC_PORT} HTTP→HTTPS redirect + HTTPS→Next :${INTERNAL_PORT}`,
  );
});

gateway.on('error', (err) => {
  console.error('[gateway] failed:', err.message);
  process.exit(1);
});

function shutdown() {
  try {
    gateway.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

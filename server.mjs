import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameStore, GameError } from './src/engine.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
async function jsonBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new GameError('Envie JSON.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length; chunks.push(chunk);
    if (size > 12_000) throw new GameError('Pedido muito grande.', 413);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new GameError('JSON inválido.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GameError('Objeto JSON esperado.');
  return body;
}
export function createServer({ store = new GameStore() } = {}) {
  const rates = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const now = Date.now();
        for (const [ip, rate] of rates) if (now - rate.at > 60_000) rates.delete(ip);
        const ip = req.socket.remoteAddress;
        const rate = rates.get(ip) || { at: now, count: 0 }; rate.count++; rates.set(ip, rate);
        if (rate.count > 600) { res.setHeader('Retry-After', '60'); throw new GameError('Muitos pedidos. Aguarde um minuto.', 429); }
        // Local/LAN prototype: refuse browser cross-origin writes rather than exposing CORS.
        if (req.method === 'POST' && req.headers.origin) {
          let origin; try { origin = new URL(req.headers.origin); } catch { throw new GameError('Origem inválida.', 403); }
          if (!['http:', 'https:'].includes(origin.protocol) || origin.host !== req.headers.host) throw new GameError('Origem não permitida.', 403);
        }
        if (req.method === 'POST' && url.pathname === '/api/rooms') { send(201, store.create(await jsonBody(req))); return; }
        const match = /^\/api\/rooms\/([A-Za-z0-9]{8})(?:\/(join|actions))?$/.exec(url.pathname);
        if (!match) throw new GameError('Rota não encontrada.', 404);
        const [, code, operation] = match;
        const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
        if (req.method === 'POST' && operation === 'join') { send(200, store.join(code, await jsonBody(req))); return; }
        if (req.method === 'GET' && !operation) { send(200, store.get(code, token)); return; }
        if (req.method === 'POST' && operation === 'actions') { send(200, store.act(code, token, await jsonBody(req))); return; }
        throw new GameError('Método não permitido.', 405);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new GameError('Método não permitido.', 405);
      let decoded;
      try { decoded = decodeURIComponent(url.pathname); } catch { throw new GameError('Caminho inválido.'); }
      const relative = decoded === '/' ? 'index.html' : decoded.slice(1);
      const requested = path.resolve(root, relative);
      if (!requested.startsWith(root + path.sep) || !mime[path.extname(requested)]) throw new GameError('Arquivo não encontrado.', 404);
      let resolved;
      try { resolved = await realpath(requested); } catch { throw new GameError('Arquivo não encontrado.', 404); }
      if (!resolved.startsWith(root + path.sep)) throw new GameError('Arquivo não encontrado.', 404);
      const bytes = await readFile(resolved);
      res.writeHead(200, { 'Content-Type': mime[path.extname(resolved)], 'Content-Length': bytes.length });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      send(error instanceof GameError ? error.status : 500, { error: error instanceof GameError ? error.message : 'Erro interno. Tente novamente.' });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => console.log(`SHIFT local prototype: http://${host}:${port}`));
}

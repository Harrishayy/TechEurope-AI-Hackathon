const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.FRONTEND_PORT || 8081);
const ROOT = process.cwd();
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://localhost:8080';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (reqUrl.pathname.startsWith('/api/')) {
      proxyApi(req, res, reqUrl).catch((err) => {
        console.error('[frontend] API proxy error:', err);
        sendJson(res, 502, { error: 'Bad gateway' });
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    serveStatic(reqUrl.pathname, res);
  } catch (err) {
    console.error('[frontend] Unhandled error:', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`[frontend] Running on http://localhost:${PORT}`);
});

function serveStatic(urlPath, res) {
  let pathname = decodeURIComponent(urlPath || '/');
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(json);
}

async function proxyApi(req, res, reqUrl) {
  const target = new URL(reqUrl.pathname + reqUrl.search, BACKEND_ORIGIN);

  const headers = {};
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (!value) continue;
    if (key.toLowerCase() === 'host') continue;
    headers[key] = value;
  }

  const method = req.method || 'GET';
  let body;
  if (method !== 'GET' && method !== 'HEAD') {
    body = await readRequestBody(req);
  }

  const upstream = await fetch(target, {
    method,
    headers,
    body
  });

  const responseBuffer = Buffer.from(await upstream.arrayBuffer());
  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    responseHeaders[key] = value;
  });

  res.writeHead(upstream.status, responseHeaders);
  res.end(responseBuffer);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

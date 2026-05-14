const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_URL = 'https://ai.hackclub.com/proxy/v1/chat/completions';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'POST' && req.url === '/api/chat') {
      await handleChatProxy(req, res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: { message: 'Method not allowed' } });
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error('Server error:', error);
    sendJson(res, 500, { error: { message: 'Internal server error' } });
  }
});

async function handleChatProxy(req, res) {
  const body = await readRequestBody(req);
  const apiKey = getApiKeyFromRequest(req);

  if (!apiKey) {
    sendJson(res, 400, { error: { message: 'Missing API key. Add your Hack Club API key in the app first.' } });
    return;
  }

  const upstream = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body
  });

  res.writeHead(upstream.status, {
    'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });

  if (!upstream.body) {
    res.end();
    return;
  }

  for await (const chunk of upstream.body) {
    res.write(chunk);
  }

  res.end();
}

function serveStatic(req, res) {
  const requestPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(decodeURIComponent(requestPath)).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    sendJson(res, 403, { error: { message: 'Forbidden' } });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: { message: 'Not found' } });
        return;
      }

      sendJson(res, 500, { error: { message: 'Failed to read file' } });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(data);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function getApiKeyFromRequest(req) {
  const headerKey = req.headers['x-hackclub-api-key'];

  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  if (Array.isArray(headerKey) && headerKey.length > 0) {
    return headerKey[0].trim();
  }

  return '';
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

server.listen(PORT, () => {
  console.log(`Solara server running at http://localhost:${PORT}`);
});

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

loadEnvFromFile(path.join(process.cwd(), '.env'));

const PORT = Number(process.env.PORT || 8080);
const ROOT = process.cwd();

const DUST_BASE_URL = process.env.DUST_BASE_URL || 'https://dust.tt';
const DUST_WORKSPACE_ID = process.env.DUST_WORKSPACE_ID || '';
const DUST_API_KEY = process.env.DUST_API_KEY || '';
const DUST_AGENT_ID = process.env.DUST_AGENT_ID || '';

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

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'POST' && reqUrl.pathname === '/api/sop/generate') {
      return handleSopGenerate(req, res);
    }

    if (req.method === 'GET' && reqUrl.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        dustConfigured: Boolean(DUST_WORKSPACE_ID && DUST_API_KEY && DUST_AGENT_ID)
      });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    return serveStatic(reqUrl.pathname, res);
  } catch (err) {
    console.error('[server] Unhandled error:', err);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`[skilllens] Running on http://localhost:${PORT}`);
});

async function handleSopGenerate(req, res) {
  if (!DUST_WORKSPACE_ID || !DUST_API_KEY || !DUST_AGENT_ID) {
    return sendJson(res, 500, {
      error: 'Dust is not configured. Set DUST_WORKSPACE_ID, DUST_API_KEY, and DUST_AGENT_ID.'
    });
  }

  const body = await readJsonBody(req, 10 * 1024 * 1024);
  if (!body) {
    return sendJson(res, 400, { error: 'Invalid JSON body.' });
  }

  const mode = body.mode || 'text';
  const context = String(body.context || '');
  const inputText = String(body.text || '');
  const accountId = String(body.accountId || 'default');
  const frames = Array.isArray(body.frames) ? body.frames.filter((f) => typeof f === 'string') : [];

  if (mode === 'text' && !inputText.trim()) {
    return sendJson(res, 400, { error: 'Text mode requires `text`.' });
  }

  try {
    const userMessage = buildDustMessage({
      mode,
      context,
      inputText,
      frames
    });

    const { conversationId, messageId } = await createDustConversation(userMessage);
    const answer = await waitForDustAnswer(conversationId, messageId, 90_000);
    const sop = parseSopFromAgent(answer);

    return sendJson(res, 200, {
      ok: true,
      accountId,
      sop
    });
  } catch (err) {
    console.error('[dust] SOP generation failed:', err);
    return sendJson(res, 500, {
      error: err.message || 'Failed to generate SOP via Dust.'
    });
  }
}

function buildDustMessage({ mode, context, inputText, frames }) {
  const rules = [
    'Return ONLY a valid JSON object with this exact shape:',
    '{',
    '  "title": "Name of procedure",',
    '  "role": "job role",',
    '  "steps": [',
    '    {',
    '      "step": 1,',
    '      "action": "Short physical action",',
    '      "look_for": "Visual confirmation",',
    '      "common_mistakes": "Likely error"',
    '    }',
    '  ]',
    '}',
    'Use 6-15 steps where possible.',
    'Each action should be one clear step.'
  ].join('\n');

  let inputBlock = '';
  if (mode === 'text') {
    inputBlock = `SOURCE: text\n\n${inputText}`;
  } else {
    const frameMarkdown = frames
      .slice(0, 6)
      .map((frame, i) => `Frame ${i + 1}:\n![frame-${i + 1}](data:image/jpeg;base64,${frame})`)
      .join('\n\n');
    inputBlock = `SOURCE: ${mode}\n\nUse the attached chronological frames to infer the SOP.\n\n${frameMarkdown}`;
  }

  return [
    'You are an operations trainer creating SOPs for physical workflows.',
    rules,
    `Additional context: ${context || 'None'}`,
    '',
    inputBlock
  ].join('\n');
}

async function createDustConversation(content) {
  const url = `${DUST_BASE_URL}/api/v1/w/${encodeURIComponent(DUST_WORKSPACE_ID)}/assistant/conversations`;
  const payload = {
    title: null,
    visibility: 'unlisted',
    message: {
      content,
      mentions: [{ configurationId: DUST_AGENT_ID }],
      context: {
        timezone: 'UTC',
        username: 'SkillLens API',
        fullName: 'SkillLens API',
        origin: 'api'
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DUST_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Dust createConversation failed (${res.status}): ${safeStringify(data)}`);
  }

  const conversationId = data?.conversation?.sId || data?.conversation?.id;
  const messageId = data?.message?.sId || data?.message?.id;
  if (!conversationId || !messageId) {
    throw new Error('Dust conversation response missing conversation/message IDs.');
  }

  return { conversationId, messageId };
}

async function waitForDustAnswer(conversationId, messageId, timeoutMs) {
  const startedAt = Date.now();
  let combinedText = '';

  while (Date.now() - startedAt < timeoutMs) {
    const events = await getDustMessageEvents(conversationId, messageId);
    for (const event of events) {
      if (event.type === 'user_message_error' || event.type === 'agent_error') {
        throw new Error(event?.error?.message || 'Dust agent returned an error event.');
      }
      if (event.type === 'generation_tokens' && event.classification === 'tokens' && event.text) {
        combinedText += event.text;
      }
      if (event.type === 'agent_message_success') {
        return event?.message?.content || combinedText || '';
      }
    }

    await sleep(1200);
  }

  if (combinedText.trim()) return combinedText.trim();
  throw new Error('Timed out waiting for Dust agent response.');
}

async function getDustMessageEvents(conversationId, messageId) {
  const url = `${DUST_BASE_URL}/api/v1/w/${encodeURIComponent(DUST_WORKSPACE_ID)}/assistant/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/events`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${DUST_API_KEY}` }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Dust events fetch failed (${res.status}): ${safeStringify(data)}`);
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.events)) return data.events;
  return [];
}

function parseSopFromAgent(text) {
  const raw = String(text || '').trim();
  const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Dust response was not valid JSON.');
    }
    return JSON.parse(match[0]);
  }
}

function serveStatic(urlPath, res) {
  let pathname = decodeURIComponent(urlPath || '/');
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(ROOT, pathname));

  if (!filePath.startsWith(ROOT)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return sendJson(res, 404, { error: 'Not found' });
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

async function readJsonBody(req, maxBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });

    req.on('error', () => resolve(null));
  });
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

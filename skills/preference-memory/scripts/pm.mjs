#!/usr/bin/env node
// Fallback client for the «preferences» MCP server — for agents that have a shell but no MCP client.
// Node >= 18, no dependencies. Talks Streamable HTTP (JSON or SSE responses) to <URL>/mcp.
//
// Env:
//   PREFERENCES_MCP_URL    default http://localhost:3000/mcp
//   PREFERENCES_MCP_TOKEN  Bearer token (MCP_TOKEN from the service .env); MCP_TOKEN is accepted too
//   PREFERENCES_ENV_FILE   optional path to the service .env to read MCP_TOKEN from
//
// Usage:
//   node pm.mjs context "<task description>" [--applies-to php,claude] [--top-k 10]
//   node pm.mjs search "<query>" [--domain fishing] [--folder "Программирование/Код"] [--project Дача]
//                                [--polarity like|dislike] [--applies-to chatgpt] [--tags a,b] [--top-k 10]
//   node pm.mjs folder "<path>" [--cursor X] [--limit 50]
//   node pm.mjs folders | projects | project "<name>"
//   node pm.mjs add "<phrase in the user's words>" [--project Дача]
//   node pm.mjs main                     # whole PREFERENCES.md
//   node pm.mjs tools                    # list available tools
import { existsSync, readFileSync } from 'node:fs';

const url = process.env.PREFERENCES_MCP_URL || 'http://localhost:3000/mcp';

function readToken() {
  const direct = process.env.PREFERENCES_MCP_TOKEN || process.env.MCP_TOKEN;
  if (direct) return direct.trim();
  const candidates = [process.env.PREFERENCES_ENV_FILE, '.env'].filter(Boolean);
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('MCP_TOKEN='));
    const value = line?.slice('MCP_TOKEN='.length).trim();
    if (value && !value.startsWith('#')) return value;
  }
  return null;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? '';
    else positional.push(a);
  }
  return { positional, flags };
}

const list = (v) =>
  v
    ? v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;
const num = (v) => (v ? Number(v) : undefined);
const clean = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

async function rpc(method, params, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (res.status === 401)
    throw new Error('401: неверный или пустой токен (PREFERENCES_MCP_TOKEN / MCP_TOKEN)');
  if (!res.ok) throw new Error(`HTTP ${res.status} от ${url}`);
  const text = await res.text();
  const payload = (res.headers.get('content-type') || '').includes('text/event-stream')
    ? text
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .pop()
    : text;
  const msg = JSON.parse(payload || '{}');
  if (msg.error) throw new Error(`${msg.error.code}: ${msg.error.message}`);
  return msg.result;
}

const out = (result) => {
  const parts = (result?.content ?? result?.contents ?? []).map((c) => c.text ?? '');
  process.stdout.write(`${parts.join('\n')}\n`);
  if (result?.isError) process.exitCode = 1;
};

const { positional, flags } = parseArgs(process.argv.slice(2));
const [cmd, arg] = positional;
const token = readToken();
if (!token) {
  console.error(
    'Нет токена: задайте PREFERENCES_MCP_TOKEN (значение MCP_TOKEN из .env сервиса) или PREFERENCES_ENV_FILE.',
  );
  process.exit(2);
}

const call = (name, args) => rpc('tools/call', { name, arguments: clean(args) }, token).then(out);

try {
  switch (cmd) {
    case 'context':
      await call('get_context_for_task', {
        task: arg,
        applies_to: list(flags['applies-to']),
        top_k: num(flags['top-k']),
      });
      break;
    case 'search':
      await call('get_preferences', {
        query: arg,
        domain: flags.domain,
        folder: flags.folder,
        project: flags.project,
        polarity: flags.polarity,
        applies_to: list(flags['applies-to']),
        tags: list(flags.tags),
        top_k: num(flags['top-k']),
      });
      break;
    case 'folder':
      await call('get_folder', { path: arg, cursor: flags.cursor, limit: num(flags.limit) });
      break;
    case 'folders':
      await call('list_folders', {});
      break;
    case 'projects':
      await call('list_projects', {});
      break;
    case 'project':
      await call('get_project', { name: arg, cursor: flags.cursor });
      break;
    case 'add':
      await call('add_preference', { text: arg, project: flags.project });
      break;
    case 'main':
      out(await rpc('resources/read', { uri: 'preferences://main' }, token));
      break;
    case 'tools': {
      const r = await rpc('tools/list', {}, token);
      for (const t of r.tools) console.log(`${t.name} — ${t.description}`);
      break;
    }
    default:
      console.error(
        'Команды: context | search | folder | folders | projects | project | add | main | tools (см. шапку файла)',
      );
      process.exit(2);
  }
} catch (err) {
  console.error(`preferences: ${err.message}`);
  if (err.cause?.code === 'ECONNREFUSED')
    console.error(`Сервис не отвечает по ${url} — запущен ли он (docker compose up -d)?`);
  process.exit(1);
}

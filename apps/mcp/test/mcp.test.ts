import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCore, createLogger, type Core } from '@preference-memory/core';
import { FakeAi } from '../../../packages/core/test/fake-ai.js';
import { testConfig } from '../../../packages/core/test/helpers.js';
import { buildMcpServer } from '../src/server.js';

type Text = { content: { type: string; text: string }[] };
const text = (r: unknown) => (r as Text).content.map((c) => c.text).join('\n');

async function makeCore(env: Record<string, string> = {}) {
  const config = testConfig({ SEED_DEMO: 'true', ...env });
  const ai = new FakeAi(config.EMBED_DIM);
  ai.tasks.set('напиши PHP-сервис', {
    domains: ['programming'],
    project: null,
    applies_to: ['php'],
  });
  ai.script('не люблю файлы с кодом больше 100 строк', {
    statement: 'Файлы с кодом больше 100 строк',
    polarity: 'dislike',
    folder_path: ['Программирование', 'Код', 'Не люблю'],
    domain: 'programming',
    applies_to: ['any_ai'],
    tags: ['код', 'файлы', 'размер'],
    constraints: [{ metric: 'file_lines', operator: '<=', value: 100, unit: 'lines' }],
  });
  const core = createCore({
    config,
    log: createLogger('silent', 't'),
    ai,
    dataDir: mkdtempSync(join(tmpdir(), 'pm-mcp-')),
  });
  await core.bootstrap({ owner: true });
  return core;
}

async function connect(core: Core) {
  const server = buildMcpServer(core);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([
    server.connect(serverTransport, { client: 'bearer' }),
    client.connect(clientTransport),
  ]);
  return client;
}

describe('MCP tools over the in-memory transport', () => {
  let core: Core;
  let client: Client;

  beforeAll(async () => {
    core = await makeCore();
    client = await connect(core);
  });
  afterAll(() => client.close());

  it('lists all tools with English descriptions', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'add_preference',
      'get_context_for_task',
      'get_folder',
      'get_preferences',
      'get_project',
      'list_folders',
      'list_projects',
    ]);
    const main = tools.find((t) => t.name === 'get_context_for_task');
    expect(main?.description).toContain(
      "Call this at the start of any task to load the user's likes, dislikes and hard constraints.",
    );
    expect(main?.inputSchema.required).toEqual(['task']);
  });

  it('get_context_for_task: domain filter + constraints', async () => {
    const out = text(
      await client.callTool({
        name: 'get_context_for_task',
        arguments: { task: 'напиши PHP-сервис' },
      }),
    );
    expect(out).toContain('domains: programming');
    expect(out).toContain('# Жёсткие ограничения');
    expect(out).toContain('`function_lines <= 40 lines`');
    expect(out).toContain('Строгая типизация в PHP');
    expect(out).not.toContain('Рыбалка');
  });

  it('get_context_for_task with applies_to narrows the rules', async () => {
    const out = text(
      await client.callTool({
        name: 'get_context_for_task',
        arguments: { task: 'напиши PHP-сервис', applies_to: ['php'] },
      }),
    );
    expect(out).toContain('PHP');
    expect(out).not.toContain('Понятные имена переменных');
  });

  it('get_preferences with filters', async () => {
    const out = text(
      await client.callTool({
        name: 'get_preferences',
        arguments: { query: 'рыбалка', domain: 'fishing' },
      }),
    );
    expect(out).toContain('## Рыбалка › Люблю');
    expect(out).toContain('## Рыбалка › Не люблю');
    expect(out).not.toContain('PHP');
    const liked = text(
      await client.callTool({
        name: 'get_preferences',
        arguments: { query: 'рыбалка', domain: 'fishing', polarity: 'like' },
      }),
    );
    expect(liked).not.toContain('Шумные соседи');
    const folder = text(
      await client.callTool({
        name: 'get_preferences',
        arguments: { query: 'код', folder: 'Программирование/PHP' },
      }),
    );
    expect(folder).not.toContain('Функции длиннее');
  });

  it('get_folder with cursor pagination', async () => {
    const first = text(
      await client.callTool({
        name: 'get_folder',
        arguments: { path: 'Программирование', limit: 3 },
      }),
    );
    expect(first).toContain('# Программирование — правил: 4');
    expect(first).toContain('Подпапки:');
    const cursor = /next_cursor: (\S+)/.exec(first)?.[1];
    expect(cursor).toBeTruthy();
    const second = text(
      await client.callTool({
        name: 'get_folder',
        arguments: { path: 'Программирование', limit: 3, cursor },
      }),
    );
    expect(second).not.toContain('next_cursor');
    const missing = text(
      await client.callTool({ name: 'get_folder', arguments: { path: 'Нет/Такой' } }),
    );
    expect(missing).toContain('не найдена');
  });

  it('list_folders, list_projects, get_project', async () => {
    expect(text(await client.callTool({ name: 'list_folders', arguments: {} }))).toContain(
      '- Программирование (4)',
    );
    expect(text(await client.callTool({ name: 'list_projects', arguments: {} }))).toBe(
      '- Семейный чат (2)',
    );
    const project = text(
      await client.callTool({ name: 'get_project', arguments: { name: 'Семейный чат' } }),
    );
    expect(project).toContain('Минимальный UI');
  });

  it('add_preference runs the pipeline with source=mcp', async () => {
    const out = text(
      await client.callTool({
        name: 'add_preference',
        arguments: { text: 'не люблю файлы с кодом больше 100 строк' },
      }),
    );
    expect(out).toContain('Результат: создано');
    expect(out).toContain('`file_lines <= 100 lines`');
    const saved = await core.prefs.all({ metric: 'file_lines' });
    expect(saved[0]?.source).toBe('mcp');
  });

  it('resources and prompt', async () => {
    const main = await client.readResource({ uri: 'preferences://main' });
    expect((main.contents[0] as { text: string }).text).toContain('# Мои предпочтения');
    const branch = await client.readResource({
      uri: `preferences://folder/${encodeURIComponent('Проекты/Семейный чат')}`,
    });
    const branchText = (branch.contents[0] as { text: string }).text;
    expect(branchText).toContain('Проекты › Семейный чат');
    expect(branchText).not.toContain('Рыбалка');
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates[0]?.uriTemplate).toBe('preferences://folder/{path}');
    const prompt = await client.getPrompt({
      name: 'apply_my_preferences',
      arguments: { task: 'рефакторинг' },
    });
    expect(JSON.stringify(prompt.messages)).toContain('get_context_for_task');
  });
});

describe('MCP_ALLOW_WRITE=false', () => {
  it('does not register add_preference', async () => {
    const core = await makeCore({ MCP_ALLOW_WRITE: 'false', SEED_DEMO: 'false' });
    const client = await connect(core);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain('add_preference');
    expect(tools).toHaveLength(6);
    await client.close();
  });
});

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

describe('HTTP transport with MCP_TOKEN', () => {
  it('401 without/with wrong token, 200 with Bearer or X-Api-Key, health is open', async () => {
    const core = await makeCore({ SEED_DEMO: 'false' });
    const server = buildMcpServer(core);
    const port = await freePort();
    await server.start({
      transportType: 'httpStream',
      httpStream: { port, host: '127.0.0.1', endpoint: '/mcp', stateless: true },
    });
    const url = `http://127.0.0.1:${port}/mcp`;
    const init = {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      }),
    };
    try {
      expect((await fetch(url, init)).status).toBe(401);
      expect(
        (await fetch(url, { ...init, headers: { ...init.headers, authorization: 'Bearer wrong' } }))
          .status,
      ).toBe(401);
      expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200);
      const withKey = (key: string) => ({
        ...init,
        headers: { ...init.headers, 'x-api-key': key },
      });
      expect((await fetch(url, withKey('wrong'))).status).toBe(401);
      expect((await fetch(url, withKey(core.config.MCP_TOKEN))).status).toBe(200);
      // Claude.ai may send its own (OAuth) Authorization alongside X-Api-Key — a valid key still wins
      const both = {
        ...init,
        headers: {
          ...init.headers,
          authorization: 'Bearer oauth-xyz',
          'x-api-key': core.config.MCP_TOKEN,
        },
      };
      expect((await fetch(url, both)).status).toBe(200);

      const client = new Client({ name: 't', version: '1' });
      await client.connect(
        new StreamableHTTPClientTransport(new URL(url), {
          requestInit: { headers: { authorization: `Bearer ${core.config.MCP_TOKEN}` } },
        }),
      );
      const { tools } = await client.listTools();
      expect(tools.length).toBe(7);
      await client.close();
    } finally {
      await server.stop();
    }
  });
});

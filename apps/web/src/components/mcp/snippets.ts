/**
 * Тексты подключения MCP по клиентам — единственное место, где они собираются.
 * Настоящий токен сюда не передаётся никогда: только литерал <MCP_TOKEN>.
 */
export type McpClient = 'claude-code' | 'claude-desktop' | 'chatgpt' | 'cursor';

export const TOKEN = '<MCP_TOKEN>';
export const CLIENTS: { id: McpClient; label: string }[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'claude-desktop', label: 'Claude Desktop' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'cursor', label: 'Cursor' },
];

export const isLocal = (url: string) => /^http:\/\/(localhost|127\.0\.0\.1)/.test(url);
export const needsHttps = (url: string) => url.startsWith('http://');

/** steps: текст шага; фрагменты в `обратных кавычках` показываются моноширинной пилюлей (McpSteps). */
export type Snippets = { blocks: { label: string; code: string }[]; steps: string[] };

const header = `Authorization: Bearer ${TOKEN}`;
const add = (url: string, auth: string) =>
  `claude mcp add --transport http --scope user preferences ${url} --header "${auth}"`;

export function snippetsFor(client: McpClient, url: string): Snippets {
  switch (client) {
    case 'claude-code': {
      const blocks = [{ label: 'Команда', code: add(url, header) }];
      if (isLocal(url))
        blocks.push({
          label: 'В папке сервиса — токен подставится из .env',
          code: add(url, "Authorization: Bearer $(grep '^MCP_TOKEN=' .env | cut -d= -f2)"),
        });
      return {
        blocks,
        steps: [
          `Скопируйте команду и замените \`${TOKEN}\` значением из \`.env\` — или возьмите вторую команду, она подставит токен сама`,
          'Выполните её в терминале',
          'Откройте новую сессию `claude` и введите `/mcp` — сервер `preferences` должен быть `connected`',
        ],
      };
    }
    case 'claude-desktop':
      return {
        blocks: [
          { label: 'URL', code: url },
          { label: 'Заголовок (Request headers → x-api-key)', code: `X-Api-Key: ${TOKEN}` },
        ],
        steps: [
          'Claude.ai → `Customize → Connectors → Add custom connector`, вставьте URL → `Continue`',
          'В `Request headers` выберите `x-api-key`, значение — `<MCP_TOKEN>` из `.env` (без слова Bearer)',
          'Сохраните и включите коннектор в чате; в Claude Desktop он появится сам — коннекторы общие для аккаунта',
        ],
      };
    case 'chatgpt':
      return {
        blocks: [
          { label: 'URL', code: url },
          { label: 'Заголовок', code: header },
        ],
        steps: [
          'Включите `Settings → Security and login → Developer mode` и создайте app с MCP-сервером',
          'Вставьте URL — нужен публичный `https://`',
          'ChatGPT не передаёт статичный `Bearer`: используйте Secure MCP Tunnel с заголовком или OAuth',
        ],
      };
    case 'cursor': {
      const config = {
        mcpServers: { preferences: { url, headers: { Authorization: `Bearer ${TOKEN}` } } },
      };
      return {
        blocks: [{ label: '~/.cursor/mcp.json', code: JSON.stringify(config, null, 2) }],
        steps: [
          'Откройте `~/.cursor/mcp.json` (или `.cursor/mcp.json` в проекте)',
          `Вставьте блок и замените \`${TOKEN}\` значением из \`.env\``,
          'Перезапустите Cursor: в `Settings → MCP` сервер `preferences` должен быть активен',
        ],
      };
    }
  }
}

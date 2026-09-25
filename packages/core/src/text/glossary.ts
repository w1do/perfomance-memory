/**
 * Словарь целей `applies_to` и терминов распознавания речи. Каноническое имя → варианты, как их пишут и как их
 * слышит Whisper («клауды-коды» = Claude Code). Используется, чтобы (1) не отбрасывать цель из-за транслита,
 * (2) приводить цели к одному имени, (3) подсказывать Whisper написание терминов (STT_TERMS).
 */
export const TARGET_ALIASES: Record<string, string[]> = {
  claude_code: [
    'claude code',
    'claudecode',
    'клод код',
    'клауд код',
    'клауды-коды',
    'клауды коды',
    'клауд-код',
    'клод-код',
    'клауды кода',
    'клауды-кода',
  ],
  claude: ['claude', 'клод', 'клауд'],
  chatgpt: ['chatgpt', 'chat gpt', 'чатгпт', 'чат gpt', 'чат-gpt', 'чат джипити'],
  cursor: ['cursor', 'курсор'],
  codex: ['codex', 'кодекс'],
  junie: ['junie', 'джуни'],
  php: ['php', 'пхп'],
  laravel: ['laravel', 'ларавел', 'ларавель'],
  react: ['react', 'реакт'],
  typescript: ['typescript', 'тайпскрипт'],
  docker: ['docker', 'докер'],
  gitlab: ['gitlab', 'гитлаб', 'гит лаб'],
  gitlab_ci: ['gitlab ci', 'gitlab-ci', 'гитлаб ci'],
  github: ['github', 'гитхаб'],
  dokploy: ['dokploy', 'докплой', 'док плой'],
  qdrant: ['qdrant', 'кудрант', 'кьюдрант'],
  swagger: ['swagger', 'сваггер', 'openapi'],
  pest: ['pest'],
  mcp: ['mcp', 'эмсипи'],
};

/** Как писать термины в подсказке Whisper (prompt), чтобы он узнавал их на слух. */
export const STT_TERMS = [
  'Claude Code',
  'ChatGPT',
  'Cursor',
  'Codex',
  'Junie',
  'MCP',
  'PHP',
  'Laravel',
  'PHPDoc',
  'Pest',
  'Swagger',
  'OpenAPI',
  'React',
  'TypeScript',
  'Docker',
  'GitLab CI',
  'GitHub',
  'Dokploy',
  'Qdrant',
  'SaaS',
  'CI/CD',
  'API',
];

const squash = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Приводит вариант к каноническому имени («Claude Code» → claude_code); неизвестное — как есть. */
export function canonicalTarget(target: string): string {
  const t = squash(target);
  for (const [name, aliases] of Object.entries(TARGET_ALIASES)) {
    if (squash(name) === t || aliases.some((a) => squash(a) === t)) return name;
  }
  return target.trim().toLowerCase();
}

/** Цель названа во фразе — сама или любым её вариантом из словаря. */
export function targetMentioned(text: string, target: string): boolean {
  const hay = squash(text);
  const variants = [target, ...(TARGET_ALIASES[target] ?? [])];
  return variants.some((v) => hay.includes(squash(v)));
}

/** Более конкретная цель поглощает общую: «клауды-коды» — это claude_code, а не ещё и claude. */
const SUBSUMES: Record<string, string[]> = { claude_code: ['claude'], gitlab_ci: ['gitlab'] };

/** Цели из словаря, прямо названные во фразе (извлечение, а не догадка). */
export function detectTargets(text: string): string[] {
  const found = Object.keys(TARGET_ALIASES).filter((name) => targetMentioned(text, name));
  const hidden = new Set(found.flatMap((name) => SUBSUMES[name] ?? []));
  return found.filter((name) => !hidden.has(name));
}

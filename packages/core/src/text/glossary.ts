/**
 * Словарь целей `applies_to` (фиксированный: чего нет здесь — уходит в теги) и терминов распознавания речи. Каноническое имя → варианты, как их пишут и как их
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
  next: ['next', 'nextjs', 'next.js', 'некст'],
  nuxt: ['nuxt', 'накст'],
  vue: ['vue'],
  astro: ['astro'],
  symfony: ['symfony', 'симфони'],
  swoole: ['swoole', 'свул'],
  octane: ['octane', 'laravel/octane'],
  horizon: ['horizon', 'laravel/horizon', 'хорайзон'],
  composer: ['composer', 'композер'],
  git: ['git', 'гит'],
  phpstan: ['phpstan'],
  pint: ['pint', 'laravel/pint'],
  deptrac: ['deptrac'],
};

/** Словарь applies_to: только эти цели (технологии, инструменты, ассистенты). Остальное — теги. */
export const TARGETS = Object.keys(TARGET_ALIASES);

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

/** Приводит вариант к каноническому имени («Claude Code» → claude_code); неизвестное — как есть, в нижнем регистре. */
export function canonicalTarget(target: string): string {
  const t = squash(target);
  for (const [name, aliases] of Object.entries(TARGET_ALIASES)) {
    if (squash(name) === t || aliases.some((a) => squash(a) === t)) return name;
  }
  return target.trim().toLowerCase();
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Цель названа во фразе — сама или любым её вариантом; короткие (≤ 4 букв) — только отдельным словом. */
export function targetMentioned(text: string, target: string): boolean {
  const hay = squash(text);
  const variants = [target, ...(TARGET_ALIASES[target] ?? [])];
  return variants.some((v) => {
    const sq = squash(v);
    if (sq.length > 4) return hay.includes(sq);
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(v.toLowerCase())}($|[^\\p{L}\\p{N}])`, 'u').test(
      text.toLowerCase().replace(/ё/g, 'е'),
    );
  });
}

/** Более конкретная цель поглощает общую: «клауды-коды» — это claude_code, а не ещё и claude. */
const SUBSUMES: Record<string, string[]> = {
  claude_code: ['claude'],
  gitlab_ci: ['gitlab', 'git'],
  gitlab: ['git'],
  github: ['git'],
};

/** Цели из словаря, прямо названные во фразе (извлечение, а не догадка). */
export function detectTargets(text: string): string[] {
  const found = Object.keys(TARGET_ALIASES).filter((name) => targetMentioned(text, name));
  const hidden = new Set(found.flatMap((name) => SUBSUMES[name] ?? []));
  return found.filter((name) => !hidden.has(name));
}

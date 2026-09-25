import { z } from 'zod';

/**
 * docker compose keeps "KEY=   # comment" as the literal value "# comment",
 * so a value that starts with "#" is a comment, i.e. empty.
 */
const clean = (v: unknown) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t.startsWith('#') ? '' : t;
};

const trimmed = <T extends z.ZodType>(schema: T) => z.preprocess(clean, schema);

const required = (hint: string) =>
  trimmed(z.string({ error: `заполните (${hint})` }).min(1, `заполните (${hint})`));

const optionalString = (fallback: string) =>
  trimmed(z.string().optional()).transform((v) => (v ? v : fallback));

const bool = (fallback: boolean) =>
  trimmed(z.enum(['true', 'false', '1', '0', 'yes', 'no', '']).optional()).transform((v) =>
    v === undefined || v === '' ? fallback : ['true', '1', 'yes'].includes(v),
  );

const int = (fallback: number, min: number, max: number) =>
  trimmed(z.string().optional()).pipe(
    z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : fallback))
      .pipe(z.number().int(`должно быть целым числом`).min(min).max(max)),
  );

const num = (fallback: number, min: number, max: number) =>
  trimmed(z.string().optional()).pipe(
    z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : fallback))
      .pipe(z.number({ error: 'должно быть числом' }).min(min).max(max)),
  );

const url = (fallback: string) =>
  optionalString(fallback).pipe(z.url({ error: 'должно быть адресом вида http(s)://…' }));

/** Необязательная публичная ссылка: пусто — элемент интерфейса не показывается. */
const optionalUrl = () =>
  optionalString('').pipe(
    z.union([z.literal(''), z.url({ error: 'должно быть адресом https://…' })]),
  );

export const envSchema = z.object({
  OPENAI_API_KEY: required('ключ OpenAI API'),
  OPENAI_BASE_URL: url('https://api.openai.com/v1'),
  OPENAI_STT_MODEL: optionalString('whisper-1'),
  OPENAI_LLM_MODEL: optionalString('gpt-5.5'),
  OPENAI_EMBED_MODEL: optionalString('text-embedding-3-small'),
  EMBED_DIM: int(1536, 8, 8192),
  STT_LANGUAGE: optionalString('ru'),

  MCP_TOKEN: trimmed(
    z
      .string({ error: 'заполните (Bearer-токен для агентов)' })
      .min(1, 'заполните (Bearer-токен для агентов)')
      .min(16, 'слишком короткий: нужно не меньше 16 символов'),
  ),
  MCP_ALLOW_WRITE: bool(true),

  ADMIN_EMAIL: trimmed(
    z
      .string({ error: 'заполните (email для входа в веб-интерфейс)' })
      .min(1, 'заполните (email для входа в веб-интерфейс)')
      .pipe(z.email({ error: 'должно быть email-адресом' })),
  ),
  ADMIN_PASSWORD: trimmed(
    z
      .string({ error: 'заполните (пароль для входа в веб-интерфейс)' })
      .min(1, 'заполните (пароль для входа в веб-интерфейс)')
      .min(8, 'слишком короткий: нужно не меньше 8 символов'),
  ),
  PUBLIC_URL: url('http://localhost:3000').transform((v) => v.replace(/\/+$/, '')),
  WEB_PORT: int(3000, 1, 65535),

  QDRANT_URL: url('http://qdrant:6333'),
  QDRANT_API_KEY: optionalString(''),
  QDRANT_COLLECTION: optionalString('preferences').pipe(
    z.string().regex(/^[A-Za-z0-9_-]+$/, 'только латиница, цифры, _ и -'),
  ),
  QDRANT_FOLDERS_COLLECTION: optionalString('folders').pipe(
    z.string().regex(/^[A-Za-z0-9_-]+$/, 'только латиница, цифры, _ и -'),
  ),

  CONFLICT_SCORE: num(0.8, 0, 1),
  SEARCH_TOP_K: int(10, 1, 100),
  MAX_AUDIO_MB: int(25, 1, 200),
  SEED_DEMO: bool(false),
  TELEGRAM_URL: optionalUrl(),
  CONTACT_URL: optionalUrl(),
  STUDIO_URL: optionalUrl(),
  YOUTUBE_URL: optionalUrl(),
  STUDIO_NAME: optionalString(''),
  BACKUP_INTERVAL_HOURS: int(24, 1, 168),
  BACKUP_KEEP: int(14, 1, 365),
  LOG_LEVEL: optionalString('info').pipe(
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
      error: 'одно из: fatal, error, warn, info, debug, trace, silent',
    }),
  ),
});

export type Config = z.infer<typeof envSchema>;

export class EnvError extends Error {
  constructor(
    message: string,
    readonly variables: string[],
  ) {
    super(message);
    this.name = 'EnvError';
  }
}

/** Parses process env. Throws EnvError with a single human-readable line. Never echoes values. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (result.success) return result.data;
  const problems = new Map<string, string>();
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '?');
    if (!problems.has(key)) problems.set(key, issue.message);
  }
  const parts = [...problems].map(([key, msg]) => `${key} — ${msg}`);
  throw new EnvError(
    `Ошибка конфигурации .env: ${parts.join('; ')}. Исправьте файл .env и перезапустите: docker compose up -d`,
    [...problems.keys()],
  );
}

/** Loads config or prints the one-line error and exits the process. */
export function loadConfigOrExit(env: Record<string, string | undefined> = process.env): Config {
  try {
    return loadConfig(env);
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

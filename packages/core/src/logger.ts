import { pino, type Logger } from 'pino';

export type { Logger };

/** Structured JSON logger. Secret-bearing fields are always redacted. */
export function createLogger(level: string, name: string): Logger {
  return pino({
    name,
    level,
    base: { service: name },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.apiKey',
        '*.api_key',
        '*.password',
        '*.token',
        'OPENAI_API_KEY',
        'MCP_TOKEN',
        'ADMIN_PASSWORD',
        'QDRANT_API_KEY',
      ],
      censor: '[скрыто]',
    },
  });
}

import { QdrantClient } from '@qdrant/js-client-rest';
import type { Config } from '../env.js';

export type { QdrantClient };

/**
 * Клиент держит keep-alive 10 с, а Qdrant закрывает простаивающее соединение раньше: запрос, попавший на
 * закрытый сокет, падает с «other side closed». Такой обрыв повторяется один раз — операции сервиса с Qdrant
 * идемпотентны (upsert по id, set_payload, поиск, удаление по id).
 */
const socketClosed = (err: unknown): boolean => {
  const cause = (err as { cause?: { code?: string } } | null)?.cause;
  return cause?.code === 'UND_ERR_SOCKET' || cause?.code === 'ECONNRESET';
};

function withRetry(client: QdrantClient): QdrantClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      const fn = value as (...a: unknown[]) => unknown;
      return (...args: unknown[]) => {
        const result = fn.apply(target, args);
        if (!(result instanceof Promise)) return result;
        return result.catch((err: unknown) => {
          if (!socketClosed(err)) throw err;
          return fn.apply(target, args);
        });
      };
    },
  });
}

export function createQdrant(config: Config): QdrantClient {
  const url = new URL(config.QDRANT_URL);
  return withRetry(
    new QdrantClient({
      url: config.QDRANT_URL,
      port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 6333,
      ...(config.QDRANT_API_KEY ? { apiKey: config.QDRANT_API_KEY } : {}),
      checkCompatibility: false,
    }),
  );
}

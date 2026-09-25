import { QdrantClient } from '@qdrant/js-client-rest';
import type { Config } from '../env.js';

export type { QdrantClient };

export function createQdrant(config: Config): QdrantClient {
  const url = new URL(config.QDRANT_URL);
  return new QdrantClient({
    url: config.QDRANT_URL,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 6333,
    ...(config.QDRANT_API_KEY ? { apiKey: config.QDRANT_API_KEY } : {}),
    checkCompatibility: false,
  });
}

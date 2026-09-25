import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Core } from '@preference-memory/core';
import { filterQuerySchema, toFilter } from '../query.js';

export interface MetaOptions {
  mcpHealthUrl: string;
  version: string;
}

async function probe(url: string): Promise<'ok' | 'down'> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

export function metaRoutes(app: FastifyInstance, core: Core, opts: MetaOptions): void {
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/facets', async (req) =>
    core.prefs.facets(toFilter(filterQuerySchema.parse(req.query))),
  );

  app.get('/api/stats', async () => core.prefs.stats());

  app.get('/api/export.md', async (req, reply) => {
    const { folder } = z.object({ folder: z.string().trim().max(500).optional() }).parse(req.query);
    const md = await core.exportMarkdown(folder || undefined);
    return reply
      .type('text/markdown; charset=utf-8')
      .header('content-disposition', 'inline; filename="PREFERENCES.md"')
      .send(md);
  });

  /** Service status and active models from .env — never any secret. */
  app.get('/api/status', async () => {
    const c = core.config;
    const [qdrant, mcp] = await Promise.all([
      core.qdrant
        .getCollections()
        .then(() => 'ok' as const)
        .catch(() => 'down' as const),
      probe(opts.mcpHealthUrl),
    ]);
    return {
      version: opts.version,
      services: { api: 'ok', qdrant, mcp },
      models: {
        stt: c.OPENAI_STT_MODEL,
        llm: c.OPENAI_LLM_MODEL,
        embed: c.OPENAI_EMBED_MODEL,
        embed_dim: c.EMBED_DIM,
        stt_language: c.STT_LANGUAGE,
      },
      mcp: { url: `${c.PUBLIC_URL}/mcp`, allow_write: c.MCP_ALLOW_WRITE },
      public_url: c.PUBLIC_URL,
      auth_enabled: c.WEB_PASSWORD.length > 0,
      search: { top_k: c.SEARCH_TOP_K, conflict_score: c.CONFLICT_SCORE },
      max_audio_mb: c.MAX_AUDIO_MB,
      // публичные ссылки для шапки и подвала (не секреты); пустые — не показываются
      links: {
        telegram: c.TELEGRAM_URL,
        contact: c.CONTACT_URL,
        studio: c.STUDIO_URL,
        youtube: c.YOUTUBE_URL,
        studio_name: c.STUDIO_NAME,
      },
    };
  });
}

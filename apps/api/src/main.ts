import { createCore, createLogger, loadConfigOrExit } from '@preference-memory/core';
import { buildServer } from './server.js';

const PORT = 8080;
const MCP_HEALTH_URL = 'http://mcp:8081/health';

const config = loadConfigOrExit();
const log = createLogger(config.LOG_LEVEL, 'api');
const core = createCore({ config, log });

try {
  await core.bootstrap({ owner: true });
  const app = await buildServer(core, { mcpHealthUrl: MCP_HEALTH_URL, version: '1.0.0' });
  await app.listen({ host: '0.0.0.0', port: PORT });
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (err) {
  log.fatal(
    { err: { message: (err as Error).message, name: (err as Error).name } },
    'api failed to start',
  );
  process.exit(1);
}

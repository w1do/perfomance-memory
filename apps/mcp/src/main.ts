import { createCore, createLogger, loadConfigOrExit } from '@preference-memory/core';
import { buildMcpServer } from './server.js';

const PORT = 8081;

const config = loadConfigOrExit();
const log = createLogger(config.LOG_LEVEL, 'mcp');
const core = createCore({ config, log });

try {
  await core.bootstrap({ owner: false });
  const server = buildMcpServer(core);
  await server.start({
    transportType: 'httpStream',
    httpStream: { port: PORT, host: '0.0.0.0', endpoint: '/mcp', stateless: true },
  });
  log.info(
    { port: PORT, endpoint: '/mcp', allow_write: config.MCP_ALLOW_WRITE },
    'mcp server started',
  );
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (err) {
  log.fatal({ err: { message: (err as Error).message } }, 'mcp failed to start');
  process.exit(1);
}

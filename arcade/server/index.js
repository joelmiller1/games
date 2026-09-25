// Entry point: `node server/index.js` (see config.js for environment variables).
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApp(config);
const addr = await app.listen();
app.log.info(`Arcade ${config.version} listening on http://${addr.address}:${addr.port}${config.basePath} (data: ${config.dataDir})`);

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  app.log.info(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();
  try {
    await app.close();
  } catch (e) {
    app.log.error('error during shutdown', e);
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => app.log.error('unhandled rejection', e));

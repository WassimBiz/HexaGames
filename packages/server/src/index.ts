import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { httpServer } = createApp(config);

httpServer.listen(config.PORT, () => {
  console.info(`[server] HexaGuess écoute sur http://localhost:${config.PORT}`);
});

function shutdown(): void {
  httpServer.close();
  setTimeout(() => process.exit(0), 100).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

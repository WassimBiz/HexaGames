import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { createApp } from '../packages/server/src/app';
import { StaticChampionProvider } from '../packages/server/src/game/champions';

const champions = [
  { id: 'Ahri', name: 'Ahri', imageUrl: 'https://example.test/Ahri.png', numericId: 103 },
  { id: 'Braum', name: 'Braum', imageUrl: 'https://example.test/Braum.png', numericId: 201 },
  { id: 'Kaisa', name: "Kai'Sa", imageUrl: 'https://example.test/Kaisa.png' },
  { id: 'Zoe', name: 'Zoé', imageUrl: 'https://example.test/Zoe.png' },
  { id: 'Darius', name: 'Darius', imageUrl: 'https://example.test/Darius.png', numericId: 122 },
];

export default async function globalSetup() {
  const app = createApp(
    {
      PORT: 3001,
      CLIENT_ORIGIN: 'http://127.0.0.1:5173',
      DISCONNECT_GRACE_MS: 100,
      RIOT_LEGAL_TEXT: 'Mention communautaire de test',
      DISABLED_CHAMPION_IDS: '',
    },
    new StaticChampionProvider(champions),
  );
  await new Promise<void>((resolve) => app.httpServer.listen(3001, '127.0.0.1', resolve));

  const root = join(process.cwd(), 'packages', 'client', 'dist');
  const contentTypes: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
  };
  const clientServer = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requested = normalize(join(root, pathname));
    const safePath =
      requested.startsWith(root) && existsSync(requested) && statSync(requested).isFile()
        ? requested
        : join(root, 'index.html');
    response.setHeader(
      'Content-Type',
      contentTypes[extname(safePath)] ?? 'application/octet-stream',
    );
    createReadStream(safePath).pipe(response);
  });
  await new Promise<void>((resolve) => clientServer.listen(5173, '127.0.0.1', resolve));

  return async () => {
    await new Promise<void>((resolve) => app.io.close(() => resolve()));
    await new Promise<void>((resolve) => clientServer.close(() => resolve()));
  };
}

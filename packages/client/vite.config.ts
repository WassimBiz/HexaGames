import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Évite un parcours inutile des dossiers parents dans les environnements locaux cloisonnés.
  optimizeDeps: { noDiscovery: true, include: [] },
});

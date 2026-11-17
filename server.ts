import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServerApp } from './src/server/app';

const PORT = 3000;

async function start() {
  const bootstrapFile = path.resolve(process.cwd(), 'storage', 'BOOTSTRAP_ADMIN_KEYS.txt');
  const { app, bootstrapKeys } = await createServerApp({
    bootstrapKeysFilePath: bootstrapFile,
  });
  const isProd = process.env.NODE_ENV === 'production';

  if (Object.keys(bootstrapKeys).length > 0) {
    console.log(
      'Founder admin CSPRNG keys initialized once in restricted file storage/BOOTSTRAP_ADMIN_KEYS.txt (never logged; move to vault and delete file).'
    );
  }

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sentarika Archive server listening on http://0.0.0.0:${PORT}`);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
}

start().catch((err) => {
  console.error('Failed to start Sentarika Archive server:', err);
  process.exit(1);
});

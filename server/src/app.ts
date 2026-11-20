import Fastify from 'fastify';
import { z } from 'zod';
import { prisma } from './db.js';

export function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.get('/api/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      dependencies: z.object({ database: z.literal('ok') }).parse({ database: 'ok' }),
    };
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

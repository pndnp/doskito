import Fastify from 'fastify';
import { z } from 'zod';
import { getPrisma } from './db.js';
import { registerErrorHandler } from './errors.js';
import { registerSecurity } from './plugins/security.js';
import type { SecurityOptions } from './plugins/security.js';
import { registerBoardRoutes } from './routes/boards.js';
import { registerDraftRoutes } from './routes/drafts.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerSseRoutes } from './routes/sse.js';
import { registerCleanupSchedulers } from './services/scheduler.js';
import { closeBoardSubscribers } from './services/events.js';
import type { LLMProvider } from './services/llm.js';
import { defaultLLMProvider } from './services/llm.js';

export interface BuildAppOptions {
  security?: SecurityOptions;
  llm?: LLMProvider;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 500 * 1024,
  });

  registerErrorHandler(app);
  registerSecurity(app, options.security);
  registerBoardRoutes(app, options.llm ?? defaultLLMProvider);
  registerDraftRoutes(app);
  registerSseRoutes(app);
  registerAdminRoutes(app);
  registerCleanupSchedulers(app);

  app.get('/api/health', async () => {
    await getPrisma().$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      dependencies: z.object({ database: z.literal('ok') }).parse({ database: 'ok' }),
    };
  });

  app.addHook('onClose', async () => {
    closeBoardSubscribers();
    await getPrisma().$disconnect();
  });

  return app;
}

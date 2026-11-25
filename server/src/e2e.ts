import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app';
import { setPrismaClient } from './db';
import { normalizeLLMResponse } from './services/llm';
import type { LLMProvider } from './services/llm';

const directory = mkdtempSync(join(tmpdir(), 'doskito-e2e-'));
const url = `file:${join(directory, 'doskito.db')}`;
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  cwd: resolve(process.cwd()),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'pipe',
});
const prisma = new PrismaClient({ datasources: { db: { url } } });
setPrismaClient(prisma);
const llm = {
  isConfigured: () => true,
  parse: async () =>
    normalizeLLMResponse({
      title: 'Подготовить релиз',
      priority: 'high',
      dueDate: null,
      tags: ['релиз'],
      subTasks: [{ title: 'Написать ченджлог' }, { title: 'Согласовать релиз' }],
    }),
} as LLMProvider;
const app = buildApp({ llm });
await app.listen({ host: '127.0.0.1', port: Number(process.env.E2E_API_PORT ?? 3101) });
console.log('E2E API ready');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
    process.exit(0);
  });
}

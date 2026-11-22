import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

export interface TestDatabase {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

const instances: PrismaClient[] = [];

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(join(tmpdir(), 'doskito-test-'));
  const datasourceUrl = `file:${join(directory, 'doskito.db')}`;
  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: resolve(process.cwd()),
    env: { ...process.env, DATABASE_URL: datasourceUrl },
    stdio: 'pipe',
  });
  const prisma = new PrismaClient({ datasources: { db: { url: datasourceUrl } } });
  instances.push(prisma);
  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export async function createBoard(prisma: PrismaClient, slug = 'test0001') {
  return prisma.board.create({
    data: {
      slug,
      name: 'Тестовая доска',
      color: '#B69CFF',
      columns: JSON.stringify([
        { id: 'todo', title: 'Сделать', order: 0 },
        { id: 'progress', title: 'Делаю', order: 1 },
        { id: 'done', title: 'Готово', order: 2 },
      ]),
    },
  });
}

/** Отключает все созданные клиенты (fallback на случай пропущенного cleanup). */
export async function closeTestPrismaClients(): Promise<void> {
  await Promise.all(instances.map((client) => client.$disconnect().catch(() => undefined)));
  instances.length = 0;
}

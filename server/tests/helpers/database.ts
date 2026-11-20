import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

export function createTestDatabase(): { prisma: PrismaClient; cleanup: () => Promise<void> } {
  const directory = mkdtempSync(join(tmpdir(), 'doskito-test-'));
  const datasourceUrl = `file:${join(directory, 'doskito.db')}`;
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    cwd: resolve(process.cwd()),
    env: { ...process.env, DATABASE_URL: datasourceUrl },
    stdio: 'pipe',
  });
  const prisma = new PrismaClient({ datasourceUrl });

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

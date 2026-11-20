import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupInactiveBoards, softDeleteBoard } from '../../src/services/deletion.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

interface FakeBoard {
  id: string;
  slug: string;
  updatedAt: Date;
  deletedAt: Date | null;
  tasksDeleted?: boolean;
}

/** Фейк PrismaClient для softDeleteBoard/cleanupInactiveBoards. */
function createPrisma(boards: FakeBoard[]) {
  let cutoff: Date | null = null;
  const transaction = {
    board: {
      findUnique: async ({ where }: { where: { slug: string } }) =>
        boards.find((board) => board.slug === where.slug) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: { deletedAt: Date } }) => {
        const board = boards.find((item) => item.id === where.id);
        if (board) board.deletedAt = data.deletedAt;
        return board;
      },
    },
    task: {
      deleteMany: async ({ where }: { where: { boardId: string } }) => {
        const board = boards.find((item) => item.id === where.boardId);
        if (board) board.tasksDeleted = true;
        return { count: 1 };
      },
    },
    boardUser: {
      deleteMany: async () => ({ count: 1 }),
    },
    parsedDraft: {
      deleteMany: async () => ({ count: 1 }),
    },
  };
  return {
    boards,
    board: {
      findMany: async () =>
        boards.filter((board) => board.deletedAt === null && board.updatedAt < cutoff!),
    },
    $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) =>
      operation(transaction),
    setCutoff(value: Date) {
      cutoff = value;
    },
  };
}

test('softDeleteBoard помечает Board.deleted_at и удаляет связанные данные', async () => {
  const now = new Date('2026-11-19T12:00:00.000Z');
  const prisma = createPrisma([{ id: 'b1', slug: 'aaaaaaaa', updatedAt: now, deletedAt: null }]);
  const deleted = await softDeleteBoard(prisma as never, 'aaaaaaaa', 'manual', now);
  assert.deepEqual(deleted, { id: 'b1', slug: 'aaaaaaaa' });
  assert.equal(prisma.boards[0]?.deletedAt, now);
  assert.equal(prisma.boards[0]?.tasksDeleted, true);
});

test('softDeleteBoard возвращает null для missing или soft-deleted доски', async () => {
  const now = new Date('2026-11-19T12:00:00.000Z');
  const prisma = createPrisma([{ id: 'b1', slug: 'aaaaaaaa', updatedAt: now, deletedAt: now }]);
  assert.equal(await softDeleteBoard(prisma as never, 'aaaaaaaa', 'manual', now), null);
  assert.equal(await softDeleteBoard(prisma as never, 'missing99', 'manual', now), null);
});

test('cleanupInactiveBoards удаляет только доски старше 30-дневного cutoff', async () => {
  const now = new Date('2026-11-19T12:00:00.000Z');
  const cutoff = new Date(now.getTime() - 30 * DAY);
  const prisma = createPrisma([
    // Ровно на границе cutoff (updated_at == cutoff): не удаляется, строгое "меньше"
    { id: 'b1', slug: 'aaaa0001', updatedAt: cutoff, deletedAt: null },
    // Секунда после cutoff: не удаляется
    { id: 'b2', slug: 'aaaa0002', updatedAt: new Date(cutoff.getTime() + 1), deletedAt: null },
    // Секунда до cutoff: удаляется
    { id: 'b3', slug: 'aaaa0003', updatedAt: new Date(cutoff.getTime() - 1), deletedAt: null },
    // Удалённая доска не обрабатывается повторно
    { id: 'b4', slug: 'aaaa0004', updatedAt: new Date(cutoff.getTime() - DAY), deletedAt: now },
  ]);
  prisma.setCutoff(cutoff);
  const deleted = await cleanupInactiveBoards(prisma as never, now);
  assert.equal(deleted, 1);
  assert.equal(prisma.boards[0]?.deletedAt, null);
  assert.equal(prisma.boards[1]?.deletedAt, null);
  assert.equal(prisma.boards[2]?.deletedAt, now);
  assert.equal(prisma.boards[3]?.deletedAt, now); // не изменился
});

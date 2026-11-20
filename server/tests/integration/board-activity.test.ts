import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { createBoard, createTestDatabase } from '../helpers/database.js';
import { withBoardActivity } from '../../src/lib/board-activity.js';

let prisma: PrismaClient;
let cleanup: () => Promise<void>;

before(async () => {
  ({ prisma, cleanup } = createTestDatabase());
});

after(async () => {
  await cleanup();
});

test('мутация задачи и активность Board фиксируются в одной транзакции', async () => {
  const board = await createBoard(prisma, 'act0001');
  const previousActivity = board.updatedAt;
  const activityAt = new Date(previousActivity.getTime() + 60_000);

  const task = await withBoardActivity(
    prisma,
    board.id,
    (transaction) =>
      transaction.task.create({
        data: { boardId: board.id, title: 'Новая задача', tags: '[]', order: 0 },
      }),
    { now: activityAt },
  );

  assert.equal(task.title, 'Новая задача');
  assert.equal(
    (await prisma.board.findUniqueOrThrow({ where: { id: board.id } })).updatedAt.toISOString(),
    activityAt.toISOString(),
  );
});

test('ошибка операции откатывает и данные, и Board.updated_at', async () => {
  const board = await createBoard(prisma, 'act0002');
  await assert.rejects(
    withBoardActivity(prisma, board.id, async (transaction) => {
      await transaction.task.create({
        data: { boardId: board.id, title: 'Откаченная задача', tags: '[]', order: 0 },
      });
      throw new Error('Симуляция ошибки');
    }),
    /Симуляция ошибки/,
  );

  assert.equal(await prisma.task.count({ where: { boardId: board.id } }), 0);
  assert.equal(
    (await prisma.board.findUniqueOrThrow({ where: { id: board.id } })).updatedAt.toISOString(),
    board.updatedAt.toISOString(),
  );
});

test('touch: false применяется для чтения, draft PATCH, discard и повторного join', async () => {
  const board = await createBoard(prisma, 'act0003');
  const user = await withBoardActivity(
    prisma,
    board.id,
    async (transaction) => {
      const existing = await transaction.boardUser.findUnique({
        where: { boardId_name: { boardId: board.id, name: 'Аня' } },
      });
      return (
        existing ??
        transaction.boardUser.create({
          data: { boardId: board.id, name: 'Аня', color: 'hsl(42, 65%, 60%)' },
        })
      );
    },
    { touch: false },
  );
  assert.equal(user.name, 'Аня');
  assert.equal(
    (await prisma.board.findUniqueOrThrow({ where: { id: board.id } })).updatedAt.toISOString(),
    board.updatedAt.toISOString(),
  );
});

test('ошибка обновления активности откатывает созданную задачу', async () => {
  const board = await createBoard(prisma, 'act0005');
  await assert.rejects(
    withBoardActivity(prisma, 'missing-board', (transaction) =>
      transaction.task.create({
        data: { boardId: board.id, title: 'Откаченная задача', tags: '[]', order: 0 },
      }),
    ),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 404,
  );
  assert.equal(await prisma.task.count({ where: { boardId: board.id } }), 0);
});

test('активность soft-deleted доски нельзя обновить, операция откатывается', async () => {
  const board = await createBoard(prisma, 'act0004');
  await prisma.board.update({ where: { id: board.id }, data: { deletedAt: new Date() } });
  await assert.rejects(
    withBoardActivity(prisma, board.id, (transaction) =>
      transaction.task.create({
        data: { boardId: board.id, title: 'Недопустимая задача', tags: '[]', order: 0 },
      }),
    ),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 404,
  );
  assert.equal(await prisma.task.count({ where: { boardId: board.id } }), 0);
});

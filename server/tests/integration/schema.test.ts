import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Prisma, PrismaClient } from '@prisma/client';
import { createBoard, createTestDatabase } from '../helpers/database.js';

let prisma: PrismaClient;
let cleanup: () => Promise<void>;

before(async () => {
  ({ prisma, cleanup } = createTestDatabase());
});

after(async () => {
  await cleanup();
});

test('миграция создаёт SQLite БД со всеми моделями и без SubTask', async () => {
  const tables = await prisma.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `;
  const names = new Set(tables.map((table) => table.name));
  for (const name of ['boards', 'tasks', 'board_users', 'parsed_drafts']) {
    assert.ok(names.has(name), `Таблица ${name} не создана`);
  }
  assert.equal(
    [...names].some((name) => name.toLowerCase().includes('subtask')),
    false,
  );

  const board = await createBoard(prisma);
  assert.equal(board.slug, 'test0001');
  assert.ok(board.createdAt instanceof Date);
  assert.ok(board.updatedAt instanceof Date);

  const indexes = await prisma.$queryRaw<Array<{ name: string; sql: string }>>`
    SELECT name, sql FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL
  `;
  const indexDefinitions = indexes.map((index) => index.sql.replaceAll('"', ''));
  for (const expected of [
    'CREATE UNIQUE INDEX boards_slug_key ON boards(slug)',
    'CREATE INDEX tasks_board_id_status_order_idx ON tasks(board_id, status, order)',
    'CREATE INDEX tasks_board_id_id_idx ON tasks(board_id, id)',
    'CREATE UNIQUE INDEX board_users_board_id_name_key ON board_users(board_id, name)',
    'CREATE INDEX parsed_drafts_status_expires_at_idx ON parsed_drafts(status, expires_at)',
    'CREATE INDEX parsed_drafts_updated_at_idx ON parsed_drafts(updated_at)',
  ]) {
    assert.ok(indexDefinitions.includes(expected), `Индекс не найден: ${expected}`);
  }
});

test('slug доски и пара boardId/name участника уникальны', async () => {
  const board = await createBoard(prisma, 'uniq001');
  await assert.rejects(createBoard(prisma, 'uniq001'), (error: unknown) => {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  });

  await prisma.boardUser.create({
    data: { boardId: board.id, name: 'Аня', color: 'hsl(42, 65%, 60%)' },
  });
  await assert.rejects(
    prisma.boardUser.create({
      data: { boardId: board.id, name: 'Аня', color: 'hsl(42, 65%, 60%)' },
    }),
    (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
  );
});

test('каскадное удаление Board удаляет Task, BoardUser и ParsedDraft', async () => {
  const board = await createBoard(prisma, 'casc001');
  const timestamp = new Date('2026-11-19T12:00:00.000Z');
  await prisma.task.create({
    data: { boardId: board.id, title: 'Задача', tags: '[]', order: 0 },
  });
  await prisma.boardUser.create({
    data: { boardId: board.id, name: 'Иван', color: 'hsl(1, 65%, 60%)' },
  });
  await prisma.parsedDraft.create({
    data: {
      boardId: board.id,
      clientId: '9f43a510-eb58-4f95-a957-892bfc980a25',
      rawText: 'Подготовить релиз',
      parsedFields: JSON.stringify({ title: 'Подготовить релиз' }),
      expiresAt: timestamp,
      finalizedTaskIds: '[]',
    },
  });

  await prisma.board.delete({ where: { id: board.id } });
  assert.equal(await prisma.task.count({ where: { boardId: board.id } }), 0);
  assert.equal(await prisma.boardUser.count({ where: { boardId: board.id } }), 0);
  assert.equal(await prisma.parsedDraft.count({ where: { boardId: board.id } }), 0);
});

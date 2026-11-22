import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { setPrismaClient, resetPrismaClient } from '../../src/db.js';
import { subscribeBoardEvents, type BoardSseEvent } from '../../src/services/events.js';
import { createBoard, createTestDatabase } from '../helpers/database.js';

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let app: FastifyInstance;

before(async () => {
  ({ prisma, cleanup } = createTestDatabase());
  setPrismaClient(prisma);
  app = buildApp();
});

after(async () => {
  await app.close();
  await cleanup();
  resetPrismaClient();
});

test('создание принимает все статусы, применяет defaults и назначает order внутри колонки', async () => {
  const board = await createBoard(prisma, 'tasks001');
  const events: BoardSseEvent[] = [];
  const unsubscribe = subscribeBoardEvents(board.slug, (event) => {
    events.push(event);
  });
  const before = board.updatedAt;

  const first = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.slug}/tasks`,
    payload: { title: ' Первая задача ' },
  });
  assert.equal(first.statusCode, 201);
  assert.equal(first.json().title, 'Первая задача');
  assert.equal(first.json().status, 'todo');
  assert.equal(first.json().priority, 'medium');
  assert.equal(first.json().dueDate, null);
  assert.deepEqual(first.json().tags, []);
  assert.equal(first.json().order, 0);

  const second = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.slug}/tasks`,
    payload: { title: 'Вторая задача', status: 'todo' },
  });
  assert.equal(second.json().order, 1);
  for (const [index, status] of ['progress', 'done'].entries()) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.slug}/tasks`,
      payload: { title: `Задача ${index}`, status },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().status, status);
    assert.equal(response.json().order, 0);
  }
  unsubscribe();
  const taskEvents = events.filter((event) => event.type === 'task_created');
  assert.equal(taskEvents.length, 4);
  assert.deepEqual(taskEvents[0]?.payload, { task: first.json() });
  assert.ok((await prisma.board.findUniqueOrThrow({ where: { id: board.id } })).updatedAt > before);
});

test('PATCH изменяет все поля, сохраняет last-write-wins и публикует полную задачу', async () => {
  const board = await createBoard(prisma, 'tasks002');
  const created = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.slug}/tasks`,
    payload: { title: 'Задача' },
  });
  const events: BoardSseEvent[] = [];
  const unsubscribe = subscribeBoardEvents(board.slug, (event) => {
    events.push(event);
  });
  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/boards/${board.slug}/tasks/${created.json().id}`,
    payload: {
      title: 'Новое название',
      status: 'done',
      priority: 'critical',
      dueDate: '2026-11-20',
      tags: ['релиз', 'срочно'],
      order: 2.5,
    },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().title, 'Новое название');
  assert.equal(patched.json().status, 'done');
  assert.equal(patched.json().priority, 'critical');
  assert.equal(patched.json().dueDate, '2026-11-20');
  assert.deepEqual(patched.json().tags, ['релиз', 'срочно']);
  assert.equal(patched.json().order, 2.5);

  const last = await app.inject({
    method: 'PATCH',
    url: `/api/boards/${board.slug}/tasks/${created.json().id}`,
    payload: { status: 'progress', order: 1 },
  });
  assert.equal(last.json().status, 'progress');
  assert.equal(last.json().order, 1);
  assert.equal(last.json().title, 'Новое название');
  unsubscribe();
  assert.deepEqual(events.at(-1)?.payload, { task: last.json() });
  assert.ok(
    new Date(last.json().updatedAt).getTime() >= new Date(created.json().updatedAt).getTime(),
  );
});

test('DELETE возвращает 204, событие task_deleted и 404 для missing/чужой доски', async () => {
  const firstBoard = await createBoard(prisma, 'tasks003');
  const otherBoard = await createBoard(prisma, 'tasks004');
  const created = await app.inject({
    method: 'POST',
    url: `/api/boards/${firstBoard.slug}/tasks`,
    payload: { title: 'Задача' },
  });
  const taskId = created.json().id;
  const wrongBoard = await app.inject({
    method: 'DELETE',
    url: `/api/boards/${otherBoard.slug}/tasks/${taskId}`,
  });
  assert.equal(wrongBoard.statusCode, 404);

  const events: BoardSseEvent[] = [];
  const unsubscribe = subscribeBoardEvents(firstBoard.slug, (event) => {
    events.push(event);
  });
  const deleted = await app.inject({
    method: 'DELETE',
    url: `/api/boards/${firstBoard.slug}/tasks/${taskId}`,
  });
  assert.equal(deleted.statusCode, 204);
  unsubscribe();
  assert.deepEqual(events.at(-1)?.payload, { taskId });
  assert.equal(await prisma.task.count({ where: { id: taskId } }), 0);
  const repeat = await app.inject({
    method: 'DELETE',
    url: `/api/boards/${firstBoard.slug}/tasks/${taskId}`,
  });
  assert.equal(repeat.statusCode, 404);
});

test('невалидные title, enum, dueDate, tags и order возвращают 400 без изменений', async () => {
  const board = await createBoard(prisma, 'tasks005');
  const invalidPayloads: unknown[] = [
    {},
    { title: '' },
    { title: 'a'.repeat(201) },
    { title: 'Задача', status: 'unknown' },
    { title: 'Задача', priority: 'urgent' },
    { title: 'Задача', dueDate: '20.11.2026' },
    { title: 'Задача', dueDate: '2026-02-30' },
    { title: 'Задача', tags: Array.from({ length: 11 }, (_, i) => `${i}`) },
    { title: 'Задача', tags: ['один', 'один'] },
    { title: 'Задача', tags: [''] },
    { title: 'Задача', tags: ['a'.repeat(31)] },
    { title: 'Задача', subTasks: [] },
  ];
  for (const payload of invalidPayloads) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/boards/${board.slug}/tasks`,
      payload: payload as Record<string, unknown>,
    });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(await prisma.task.count({ where: { boardId: board.id } }), 0);

  const created = await app.inject({
    method: 'POST',
    url: `/api/boards/${board.slug}/tasks`,
    payload: { title: 'Задача' },
  });
  for (const payload of [{}, { order: -1 }, { order: Number.NaN }, { status: 'unknown' }]) {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/boards/${board.slug}/tasks/${created.json().id}`,
      payload,
    });
    assert.equal(response.statusCode, 400);
  }
});

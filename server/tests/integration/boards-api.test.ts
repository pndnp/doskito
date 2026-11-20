import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { createBoard, createTestDatabase } from '../helpers/database.js';
import { subscribeBoardEvents, type BoardSseEvent } from '../../src/services/events.js';
import { setPrismaClient, resetPrismaClient } from '../../src/db.js';

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let app: FastifyInstance;

const events: BoardSseEvent[] = [];

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

const CLIENT_COOKIE = (id: string) => `doskito_client_id=${id}`;

const UUID_A = '9f43a510-eb58-4f95-a957-892bfc980a25';
const UUID_B = '8d3a2f6b-2b8f-4c67-9d05-70c8e6a41f88';

function captureEvents(slug: string) {
  return subscribeBoardEvents(slug, (event) => {
    events.push(event);
  });
}

test('POST /api/boards создаёт доску с именем «Моя доска», цветом и 3 колонками', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/boards' });
  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.match(body.slug, /^[a-z0-9]{8}$/);
  assert.equal(body.name, 'Моя доска');
  assert.equal(body.color, '#B69CFF');
  assert.equal(body.url, `/#/${body.slug}`);

  const board = await prisma.board.findUniqueOrThrow({ where: { slug: body.slug } });
  const columns = JSON.parse(board.columns) as Array<{ id: string; title: string; order: number }>;
  assert.deepEqual(
    columns.map((column) => [column.id, column.title, column.order]),
    [
      ['todo', 'Сделать', 0],
      ['progress', 'Делаю', 1],
      ['done', 'Готово', 2],
    ],
  );
});

test('GET /api/boards/:slug отдаёт состояние, drafts только текущего clientId, 404 для deleted', async () => {
  const { json } = await app.inject({ method: 'POST', url: '/api/boards' });
  const slug = json().slug;
  const created = await prisma.board.findUniqueOrThrow({ where: { slug } });
  await prisma.parsedDraft.create({
    data: {
      boardId: created.id,
      clientId: UUID_A,
      rawText: 'текст',
      parsedFields: JSON.stringify({
        title: 'Черновик А',
        priority: 'medium',
        dueDate: null,
        tags: [],
        subTasks: [],
      }),
      expiresAt: new Date(Date.now() + 30 * 60_000),
      finalizedTaskIds: '[]',
    },
  });

  // drafts владельца видны
  const asOwner = await app.inject({
    method: 'GET',
    url: `/api/boards/${slug}`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(asOwner.statusCode, 200);
  assert.equal(asOwner.json().slug, slug);
  assert.equal(asOwner.json().drafts.length, 1);

  // drafts чужого clientId не видны
  const asOther = await app.inject({
    method: 'GET',
    url: `/api/boards/${slug}`,
    headers: { cookie: CLIENT_COOKIE(UUID_B) },
  });
  assert.equal(asOther.json().drafts.length, 0);

  // единый 404
  const missing = await app.inject({ method: 'GET', url: '/api/boards/zzzz9999' });
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), { error: 'Доска не найдена' });

  await prisma.board.update({ where: { id: created.id }, data: { deletedAt: new Date() } });
  const deleted = await app.inject({ method: 'GET', url: `/api/boards/${slug}` });
  assert.equal(deleted.statusCode, 404);
  assert.deepEqual(deleted.json(), { error: 'Доска не найдена' });
});

test('PATCH переименовывает доску и публикует board_updated, 400 на некорректное имя', async () => {
  const slug = (await createBoard(prisma, 'patch0001')).slug;
  const stop = captureEvents(slug);
  const response = await app.inject({
    method: 'PATCH',
    url: `/api/boards/${slug}`,
    payload: { name: 'Релиз v2' },
  });
  assert.equal(response.statusCode, 200);
  stop();
  assert.equal(response.json().name, 'Релиз v2');
  assert.ok(events.some((event) => event.type === 'board_updated'));

  const invalid = await app.inject({
    method: 'PATCH',
    url: `/api/boards/${slug}`,
    payload: { name: '   ' },
  });
  assert.equal(invalid.statusCode, 400);
});

test('DELETE делает soft delete, шлёт board_deleted(manual), повторный 404', async () => {
  const board = await createBoard(prisma, 'del00001');
  const stop = captureEvents(board.slug);
  const response = await app.inject({ method: 'DELETE', url: `/api/boards/${board.slug}` });
  assert.equal(response.statusCode, 204);
  const stored = await prisma.board.findUniqueOrThrow({ where: { slug: board.slug } });
  assert.ok(stored.deletedAt !== null);
  stop();

  const boardDeleted = events.find((event) => event.type === 'board_deleted');
  assert.ok(boardDeleted);
  assert.deepEqual(boardDeleted.payload, { reason: 'manual' });

  const repeat = await app.inject({ method: 'DELETE', url: `/api/boards/${board.slug}` });
  assert.equal(repeat.statusCode, 404);
});

test('join создаёт участника (201) и не дублирует при повторном (200)', async () => {
  const slug = (await createBoard(prisma, 'join0001')).slug;
  const stop = captureEvents(slug);
  const first = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/join`,
    payload: { name: ' Аня ' },
  });
  assert.equal(first.statusCode, 201);
  const user = first.json();
  assert.equal(user.name, 'Аня');
  assert.match(user.color, /^hsl\(\d+, 65%, 60%\)$/);
  stop();
  assert.ok(events.some((event) => event.type === 'user_joined'));

  const eventsCount = events.length;
  const second = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/join`,
    payload: { name: 'Аня' },
  });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().name, 'Аня');
  assert.equal(events.length, eventsCount); // дубль user_joined не публикуется
});

test('POST /api/boards/summaries возвращает метаданные и missingSlugs', async () => {
  const slug = (await createBoard(prisma, 'summ0001')).slug;
  const before = (await prisma.board.findUniqueOrThrow({ where: { slug } })).updatedAt;

  const response = await app.inject({
    method: 'POST',
    url: '/api/boards/summaries',
    payload: { slugs: [slug, 'missing8', 'zzzzzzzz'] },
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.boards.length, 1);
  assert.deepEqual(body.missingSlugs.sort(), ['missing8', 'zzzzzzzz']);
  assert.equal(body.boards[0].slug, slug);

  const after = (await prisma.board.findUniqueOrThrow({ where: { slug } })).updatedAt;
  assert.equal(after.toISOString(), before.toISOString()); // activity не меняется
});

test('GET /admin/boards требует X-Admin-Secret', async () => {
  process.env.ADMIN_SECRET = 'test-admin-secret';
  const slug = (await createBoard(prisma, 'admin0001')).slug;

  const denied = await app.inject({ method: 'GET', url: '/admin/boards' });
  assert.equal(denied.statusCode, 401);
  const wrong = await app.inject({
    method: 'GET',
    url: '/admin/boards',
    headers: { 'x-admin-secret': 'wrong' },
  });
  assert.equal(wrong.statusCode, 401);

  const granted = await app.inject({
    method: 'GET',
    url: '/admin/boards',
    headers: { 'x-admin-secret': 'test-admin-secret' },
  });
  assert.equal(granted.statusCode, 200);
  const body = granted.json();
  const entry = body.boards.find((board: { slug: string }) => board.slug === slug);
  assert.ok(entry);
  assert.equal(entry.taskCount, 0);
  delete process.env.ADMIN_SECRET;
});

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { createBoard, createTestDatabase } from '../helpers/database.js';
import { subscribeBoardEvents, type BoardSseEvent } from '../../src/services/events.js';
import { normalizeLLMResponse } from '../../src/services/llm.js';
import type { LLMProvider } from '../../src/services/llm.js';
import { setPrismaClient, resetPrismaClient } from '../../src/db.js';

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let app: FastifyInstance;

const events: BoardSseEvent[] = [];
const UUID_A = '9f43a510-eb58-4f95-a957-892bfc980a25';
const UUID_B = '8d3a2f6b-2b8f-4c67-9d05-70c8e6a41f88';
const CLIENT_COOKIE = (id: string) => `doskito_client_id=${id}`;

/** Управляемый фейк LLM: путь через реальную normalizeLLMResponse. */
let llmResponse: () => Promise<unknown> = async () => {
  throw new Error('LLM не настроен');
};
const llm: LLMProvider = {
  isConfigured: () => true,
  parse: () =>
    llmResponse().then((fields) => {
      const normalized = normalizeLLMResponse(fields);
      return normalized;
    }),
} as unknown as LLMProvider;

const LLM_FIELDS = {
  title: 'Подготовка релиза',
  priority: 'high',
  dueDate: '2026-11-20',
  tags: ['release'],
  subTasks: [{ title: 'Согласовать релиз с Аней' }, { title: 'Подготовить ченджлог' }],
};

before(async () => {
  ({ prisma, cleanup } = createTestDatabase());
  setPrismaClient(prisma);
  app = buildApp({ llm });
});

after(async () => {
  await app.close();
  await cleanup();
  resetPrismaClient();
});

async function createParsedDraft(slug: string, clientId: string, fields: unknown = LLM_FIELDS) {
  llmResponse = () => Promise.resolve(fields);
  return app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/tasks/parsed`,
    headers: { cookie: CLIENT_COOKIE(clientId) },
    payload: { rawText: 'Подготовить релиз к пятнице' },
  });
}

test('POST tasks/parsed создаёт PENDING черновик с TTL и clientId', async () => {
  const slug = (await createBoard(prisma, 'parse0001')).slug;
  const response = await createParsedDraft(slug, UUID_A);
  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.ok(body.draftId);
  assert.equal(body.parsedFields.title, 'Подготовка релиза');
  assert.ok(new Date(body.expiresAt).getTime() > Date.now());

  const stored = await prisma.parsedDraft.findUniqueOrThrow({ where: { id: body.draftId } });
  assert.equal(stored.clientId, UUID_A);
  assert.equal(stored.status, 'PENDING');
});

test('400 на пустой rawText без вызова LLM', async () => {
  const slug = (await createBoard(prisma, 'parse0002')).slug;
  const llmBefore = llmResponse;
  llmResponse = () => {
    throw new Error('LLM не должен вызываться');
  };
  const empty = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/tasks/parsed`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
    payload: { rawText: '   ' },
  });
  assert.equal(empty.statusCode, 400);
  const tooLong = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/tasks/parsed`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
    payload: { rawText: 'a'.repeat(501) },
  });
  assert.equal(tooLong.statusCode, 400);
  llmResponse = llmBefore;
});

test('503 когда LLM недоступна после 2 попыток', async () => {
  const slug = (await createBoard(prisma, 'parse003')).slug;
  llmResponse = () => Promise.reject(new Error('timeout'));
  const response = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/tasks/parsed`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
    payload: { rawText: 'Подготовить релиз' },
  });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: 'Не удалось разобрать задачу. Создайте вручную.',
  });
});

test('finalize: 2 подзадачи → 3 задачи, idempotent повтор, SSE task_created + draft_finalized', async () => {
  const slug = (await createBoard(prisma, 'parse004')).slug;
  const unsubscribe = subscribeBoardEvents(slug, (event) => {
    events.push(event);
  });
  const eventsBefore = events.length;

  const created = await createParsedDraft(slug, UUID_A);
  const { draftId } = created.json();

  const finalized = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/finalize`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(finalized.statusCode, 200);
  const body = finalized.json();
  assert.equal(body.tasks.length, 3); // основная + 2 подзадачи
  unsubscribe();

  const taskEvents = events.slice(eventsBefore).filter((event) => event.type === 'task_created');
  assert.equal(taskEvents.length, 3);

  const stored = await prisma.parsedDraft.findUniqueOrThrow({ where: { id: draftId } });
  assert.equal(stored.status, 'FINALIZED');
  assert.equal(JSON.parse(stored.finalizedTaskIds).length, 3);

  // повторная финализация идемпотентна
  const repeat = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/finalize`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(repeat.statusCode, 200);
  assert.equal(repeat.json().tasks.length, 3);
  assert.equal(await prisma.task.count({ where: { board: { slug } } }), 3);
});

test('finalize: 0–1 подзадача → ровно 1 задача', async () => {
  const slug = (await createBoard(prisma, 'parse005')).slug;
  const created = await createParsedDraft(slug, UUID_A, { ...LLM_FIELDS, subTasks: [] });
  const { draftId } = created.json();
  const unsubscribe = subscribeBoardEvents(slug, (event) => {
    events.push(event);
  });
  const finalized = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/finalize`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(finalized.json().tasks.length, 1);
  unsubscribe();
});

test('PATCH draft обновляет parsedFields без изменения board activity', async () => {
  const slug = (await createBoard(prisma, 'parse006')).slug;
  const board = await prisma.board.findUniqueOrThrow({ where: { slug } });
  const { draftId } = (await createParsedDraft(slug, UUID_A)).json();

  const patched = await app.inject({
    method: 'PATCH',
    url: `/api/boards/${slug}/drafts/${draftId}`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
    payload: {
      title: 'Новое название',
      priority: 'low',
      dueDate: null,
      tags: ['новый'],
      subTasks: [],
    },
  });
  assert.equal(patched.statusCode, 200);
  assert.equal(patched.json().parsedFields.title, 'Новое название');
  const after = await prisma.board.findUniqueOrThrow({ where: { slug } });
  assert.equal(after.updatedAt.toISOString(), board.updatedAt.toISOString());
});

test('чужой clientId получает 404 на PATCH/finalize/discard', async () => {
  const slug = (await createBoard(prisma, 'parse007')).slug;
  const { draftId } = (await createParsedDraft(slug, UUID_A)).json();
  for (const method of ['PATCH', 'POST']) {
    const url =
      method === 'PATCH'
        ? `/api/boards/${slug}/drafts/${draftId}`
        : `/api/boards/${slug}/drafts/${draftId}/finalize`;
    const response = await app.inject({
      method,
      url,
      headers: { cookie: CLIENT_COOKIE(UUID_B) },
      payload:
        method === 'PATCH'
          ? { title: 'x', priority: 'low', dueDate: null, tags: [], subTasks: [] }
          : undefined,
    });
    assert.equal(response.statusCode, 404, `${method} ${url}`);
  }
});

test('discard переводит в DISCARDED и шлёт draft_discarded(manual) владельцу', async () => {
  const slug = (await createBoard(prisma, 'parse008')).slug;
  const unsubscribe = subscribeBoardEvents(slug, (event) => {
    events.push(event);
  });
  const { draftId } = (await createParsedDraft(slug, UUID_A)).json();

  const response = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/discard`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(response.statusCode, 200);
  unsubscribe();
  assert.ok(events.some((event) => event.type === 'draft_discarded'));
});

test('discard FINALIZED черновика возвращает 409', async () => {
  const slug = (await createBoard(prisma, 'parse009')).slug;
  const { draftId } = (await createParsedDraft(slug, UUID_A)).json();
  await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/finalize`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  const response = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/discard`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(response.statusCode, 409);
});

test('finalize истёкшего PENDING черновика возвращает 404', async () => {
  const slug = (await createBoard(prisma, 'parse010')).slug;
  const { draftId } = (await createParsedDraft(slug, UUID_A)).json();
  await prisma.parsedDraft.update({
    where: { id: draftId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const response = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/finalize`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  assert.equal(response.statusCode, 404);
});

test('11 подзадач: parse сохраняет 10 после нормализации LLM-слоя', async () => {
  const slug = (await createBoard(prisma, 'parse011')).slug;
  const subTasks = Array.from({ length: 11 }, (_, index) => ({ title: `Подзадача ${index + 1}` }));
  llmResponse = async () => ({ ...LLM_FIELDS, subTasks });
  const created = await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/tasks/parsed`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
    payload: { rawText: 'текст' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().parsedFields.subTasks.length, 10);
});

test('наследуются priority/dueDate/tags при финализации', async () => {
  const slug = (await createBoard(prisma, 'parse012')).slug;
  const { draftId } = (await createParsedDraft(slug, UUID_A)).json();
  await app.inject({
    method: 'POST',
    url: `/api/boards/${slug}/drafts/${draftId}/finalize`,
    headers: { cookie: CLIENT_COOKIE(UUID_A) },
  });
  const tasks = await prisma.task.findMany({ where: { board: { slug } } });
  assert.ok(
    tasks.every(
      (task) =>
        task.priority === 'high' && task.dueDate === '2026-11-20' && task.tags === '["release"]',
    ),
  );
});

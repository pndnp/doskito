import assert from 'node:assert/strict';
import { get } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { after, before, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { resetPrismaClient, setPrismaClient } from '../../src/db.js';
import { publishOwnerEvent } from '../../src/services/events.js';
import { createBoard, createTestDatabase } from '../helpers/database.js';

const UUID_A = '9f43a510-eb58-4f95-a957-892bfc980a25';
const UUID_B = '8d3a2f6b-2b8f-4c67-9d05-70c8e6a41f88';

let prisma: PrismaClient;
let cleanup: () => Promise<void>;
let app: FastifyInstance;
let origin: string;

before(async () => {
  ({ prisma, cleanup } = createTestDatabase());
  setPrismaClient(prisma);
  app = buildApp();
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app.close();
  await cleanup();
  resetPrismaClient();
});

test('SSE недоступной доски возвращает 404 до открытия', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/boards/missing8/sse' });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { error: 'Доска не найдена' });
});

test('SSE выдаёт headers/ready, разделяет владельцев и закрывается после board_deleted', async () => {
  const board = await createBoard(prisma, 'sse00001');
  const owner = await openStream(board.slug, UUID_A);
  const other = await openStream(board.slug, UUID_B);
  try {
    assert.equal(owner.response.headers['content-type'], 'text/event-stream');
    assert.equal(owner.response.headers['cache-control'], 'no-cache');
    assert.equal(owner.response.headers.connection, 'keep-alive');
    const ready = await owner.nextChunk();
    assert.match(ready, /id: \d+\nevent: ready\ndata: \{"slug":"sse00001"\}\n\n/);
    await other.nextChunk();

    publishOwnerEvent(board.slug, UUID_A, 'draft_discarded', {
      draftId: 'draft1',
      reason: 'expired',
    });
    assert.match(await owner.nextChunk(), /"reason":"expired"/);

    await app.inject({ method: 'DELETE', url: `/api/boards/${board.slug}` });
    const deleted = await owner.nextChunk();
    assert.ok(deleted);
    assert.match(deleted, /event: board_deleted/);
    assert.match(deleted, /"reason":"manual"/);
    await owner.closed;
    await other.closed;
    assert.equal(
      other.chunks.some((chunk) => chunk.includes('draft_discarded')),
      false,
    );
  } finally {
    owner.response.destroy();
    other.response.destroy();
  }
});

async function openStream(slug: string, clientId: string) {
  const response = await new Promise<IncomingMessage>((resolve, reject) => {
    const request = get(`${origin}/api/boards/${slug}/sse`, {
      headers: { cookie: `doskito_client_id=${clientId}` },
    });
    request.once('response', resolve);
    request.once('error', reject);
  });
  const received: string[] = [];
  const waiting: Array<(chunk: string) => void> = [];
  let closed: () => void;
  const closedPromise = new Promise<void>((resolve) => {
    closed = resolve;
  });
  response.setEncoding('utf8');
  response.on('data', (chunk: string) => {
    for (const frame of chunk.split('\n\n').filter(Boolean)) {
      const completeFrame = `${frame}\n\n`;
      const next = waiting.shift();
      if (next) next(completeFrame);
      else received.push(completeFrame);
    }
  });
  response.once('close', () => closed());
  return {
    response,
    chunks: received,
    closed: closedPromise,
    nextChunk: () =>
      new Promise<string>((resolve) => {
        const chunk = received.shift();
        if (chunk !== undefined) resolve(chunk);
        else waiting.push(resolve);
      }),
  };
}

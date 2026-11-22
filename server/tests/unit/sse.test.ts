import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, test } from 'node:test';
import type { ServerResponse } from 'node:http';
import {
  addBoardSubscriber,
  createSseEvent,
  formatSseEvent,
  publishOwnerEvent,
  publishPublicEvent,
  resetEventBus,
  subscribeBoardEvents,
  writeEvent,
} from '../../src/services/events.js';
import { createTestSseClient } from '../helpers/sse.js';
import { registerSseRoutes } from '../../src/routes/sse.js';
import { resetPrismaClient, setPrismaClient } from '../../src/db.js';

afterEach(() => resetEventBus());

test('owner-only события получает владелец, публичные — все подключения доски', () => {
  const owner = createTestSseClient('owner');
  const other = createTestSseClient('other');
  addBoardSubscriber('board001', owner);
  addBoardSubscriber('board001', other);

  publishOwnerEvent('board001', 'owner', 'draft_discarded', {
    draftId: 'draft1',
    reason: 'manual',
  });
  publishPublicEvent('board001', 'board_updated', { name: 'Доска', color: '#B69CFF' });

  assert.equal(owner.chunks.length, 2);
  assert.equal(other.chunks.length, 1);
  assert.match(owner.chunks[0] ?? '', /event: draft_discarded/);
  assert.match(other.chunks[0] ?? '', /event: board_updated/);
  assert.match(other.chunks[0] ?? '', /"color":"#B69CFF"/);
});

test('id событий монотонны, JSON однострочный, board_deleted закрывает поток', () => {
  const client = createTestSseClient('owner');
  addBoardSubscriber('board001', client);
  const first = createSseEvent('task_updated', { task: { title: 'строка\nс переносом' } });
  const second = createSseEvent('board_deleted', { reason: 'manual' });
  assert.ok(second.id > first.id);
  assert.equal(
    formatSseEvent(first)
      .split('\n')
      .filter((line) => line.startsWith('data:')).length,
    1,
  );
  writeEvent(client.response as ServerResponse, first);
  publishPublicEvent('board001', 'board_deleted', { reason: 'manual' });
  assert.equal(client.closedByServer, true);
  assert.match(client.chunks.at(-1) ?? '', /event: board_deleted/);
});

test('ошибка записи удаляется из доставки и не мешает другому подписчику', () => {
  const broken = createTestSseClient('broken');
  const healthy = createTestSseClient('healthy');
  broken.response.write = () => {
    throw new Error('broken pipe');
  };
  addBoardSubscriber('board001', broken);
  addBoardSubscriber('board001', healthy);
  publishPublicEvent('board001', 'task_deleted', { taskId: 'task1' });
  publishPublicEvent('board001', 'task_deleted', { taskId: 'task2' });
  assert.equal(broken.closedByServer, true);
  assert.equal(healthy.chunks.length, 2);
});

test('тестовая подписка на шину получает аудиторию и owner-only payload', () => {
  const events: unknown[] = [];
  const unsubscribe = subscribeBoardEvents('board001', (event) => {
    events.push(event);
  });
  publishOwnerEvent('board001', 'owner', 'draft_finalized', {
    draftId: 'draft1',
    taskIds: ['task1'],
  });
  unsubscribe();
  publishPublicEvent('board001', 'user_joined', { name: 'Аня', color: 'hsl(1, 65%, 60%)' });
  assert.equal(events.length, 1);
  const event = events[0] as { type: string; payload: unknown; audience: unknown };
  assert.equal(event.type, 'draft_finalized');
});

test('heartbeat отправляется через 15 секунд и останавливается при close', async (context) => {
  let handler: ((request: unknown, reply: unknown) => Promise<void>) | undefined;
  const app = {
    get(_url: string, routeHandler: typeof handler) {
      handler = routeHandler;
    },
  };
  registerSseRoutes(app as never);
  assert.ok(handler);

  const written: string[] = [];
  const response = new EventEmitter() as EventEmitter & {
    write: (chunk: string) => boolean;
    writeHead: () => void;
    flushHeaders: () => void;
    destroyed: boolean;
    writableEnded: boolean;
  };
  Object.assign(response, {
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    writeHead: () => undefined,
    flushHeaders: () => undefined,
    destroyed: false,
    writableEnded: false,
  });
  let heartbeat: (() => void) | undefined;
  let timerCleared = false;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.setInterval = ((callback: () => void, ms: number) => {
    assert.equal(ms, 15_000);
    heartbeat = callback;
    return { unref: () => undefined };
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => {
    timerCleared = true;
  }) as unknown as typeof clearInterval;
  context.after(() => {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    resetPrismaClient();
  });

  setPrismaClient({
    board: {
      findUnique: async () => ({ id: 'board1', slug: 'board001', deletedAt: null }),
    },
  } as never);
  await handler(
    {
      params: { slug: 'board001' },
      raw: new EventEmitter(),
      headers: { cookie: 'doskito_client_id=9f43a510-eb58-4f95-a957-892bfc980a25' },
      protocol: 'http',
    },
    { hijack: () => undefined, raw: response, getHeader: () => undefined },
  );
  assert.match(written[0] ?? '', /event: ready/);
  heartbeat?.();
  assert.equal(written.at(-1), ': heartbeat\n\n');
  response.emit('close');
  assert.equal(timerCleared, true);
});

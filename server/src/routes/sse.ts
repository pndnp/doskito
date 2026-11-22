import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../db.js';
import { getActiveBoard } from '../services/boards.js';
import { ensureClientId } from '../plugins/security.js';
import { addBoardSubscriber, createSseEvent, writeEvent } from '../services/events.js';

export const SSE_HEARTBEAT_MS = 15_000;

export function registerSseRoutes(app: FastifyInstance): void {
  app.get('/api/boards/:slug/sse', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    await getActiveBoard(getPrisma(), slug);
    const clientId = ensureClientId(request, reply);
    const requestSocket = request.raw as unknown as EventEmitter;

    reply.hijack();
    const response = reply.raw;
    const cookie = reply.getHeader('Set-Cookie');
    response.writeHead(200, {
      ...(cookie === undefined ? {} : { 'Set-Cookie': cookie }),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();

    const remove = addBoardSubscriber(slug, { clientId, response });
    const heartbeat = setInterval(() => {
      if (response.destroyed || response.writableEnded) {
        cleanup();
        return;
      }
      try {
        response.write(': heartbeat\n\n');
      } catch {
        response.destroy();
      }
    }, SSE_HEARTBEAT_MS);
    heartbeat.unref();

    const cleanup = () => {
      clearInterval(heartbeat);
      remove();
    };
    requestSocket.once('close', cleanup);
    response.once('close', cleanup);
    response.once('error', cleanup);

    writeEvent(response, createSseEvent('ready', { slug }));
  });
}

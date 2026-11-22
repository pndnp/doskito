import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../db.js';
import { cleanupInactiveBoards } from './deletion.js';
import { cleanupExpiredDrafts } from './drafts.js';

export const DRAFT_CLEANUP_INTERVAL_MS = 60_000;
export const BOARD_CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;

export function registerCleanupSchedulers(app: FastifyInstance): void {
  const draftsTimer = setInterval(() => {
    void cleanupExpiredDrafts().catch((error: unknown) => {
      app.log.error(error, 'Не удалось очистить истёкшие черновики');
    });
  }, DRAFT_CLEANUP_INTERVAL_MS);
  const boardsTimer = setInterval(() => {
    void cleanupInactiveBoards(getPrisma()).catch((error: unknown) => {
      app.log.error(error, 'Не удалось очистить неактивные доски');
    });
  }, BOARD_CLEANUP_INTERVAL_MS);
  draftsTimer.unref();
  boardsTimer.unref();

  app.addHook('onClose', async () => {
    clearInterval(draftsTimer);
    clearInterval(boardsTimer);
  });
}

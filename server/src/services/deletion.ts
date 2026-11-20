import { Prisma, PrismaClient } from '@prisma/client';
import { publishPublicEvent } from './events.js';

export type BoardDeletedReason = 'manual' | 'inactivity';

export const INACTIVITY_DELETE_AFTER_DAYS = 30;

/**
 * Soft delete Board + hard delete связанных Task, BoardUser и ParsedDraft
 * в одной транзакции. Возвращает id удалённой доски или null, если она
 * уже недоступна (missing или soft-deleted).
 */
export async function softDeleteBoard(
  prisma: PrismaClient,
  slug: string,
  reason: BoardDeletedReason,
  now = new Date(),
): Promise<{ id: string; slug: string } | null> {
  const result = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const board = await transaction.board.findUnique({ where: { slug } });
    if (!board || board.deletedAt !== null) return null;
    await transaction.task.deleteMany({ where: { boardId: board.id } });
    await transaction.boardUser.deleteMany({ where: { boardId: board.id } });
    await transaction.parsedDraft.deleteMany({ where: { boardId: board.id } });
    await transaction.board.update({
      where: { id: board.id },
      data: { deletedAt: now },
    });
    return { id: board.id, slug: board.slug };
  });

  if (result) publishPublicEvent(slug, 'board_deleted', { reason });
  return result;
}

/** Суточная очистка неактивных досок (задача 4.7). */
export async function cleanupInactiveBoards(
  prisma: PrismaClient,
  now = new Date(),
  inactivityDays = INACTIVITY_DELETE_AFTER_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - inactivityDays * 24 * 60 * 60 * 1000);
  const stale = await prisma.board.findMany({
    where: { deletedAt: null, updatedAt: { lt: cutoff } },
    select: { slug: true },
  });

  let deleted = 0;
  for (const { slug } of stale) {
    if (await softDeleteBoard(prisma, slug, 'inactivity', now)) deleted += 1;
  }
  return deleted;
}

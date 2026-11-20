import type { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from '../errors.js';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

interface ActivityOptions {
  now?: Date;
  touch?: boolean;
}

/**
 * Выполняет изменение и обновление активности доски в одной транзакции.
 * Для read, SSE, PATCH draft, discard и повторного join передавать touch: false.
 */
export async function withBoardActivity<T>(
  database: PrismaClient,
  boardId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  options: ActivityOptions = {},
): Promise<T> {
  return database.$transaction(async (transaction) => {
    const result = await operation(transaction);
    if (options.touch ?? true) {
      const activity = await transaction.board.updateMany({
        where: { id: boardId, deletedAt: null },
        data: { updatedAt: options.now ?? new Date() },
      });
      if (activity.count !== 1) throw notFound('Доска не найдена');
    }
    return result;
  });
}

export async function touchBoard(
  database: DatabaseClient,
  boardId: string,
  now = new Date(),
): Promise<void> {
  const activity = await database.board.updateMany({
    where: { id: boardId, deletedAt: null },
    data: { updatedAt: now },
  });
  if (activity.count !== 1) throw notFound('Доска не найдена');
}

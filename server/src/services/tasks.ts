import type { Prisma, PrismaClient } from '@prisma/client';
import { notFound } from '../errors.js';
import { withBoardActivity } from '../lib/board-activity.js';
import type { ParsedFields } from '../schemas.js';
import { serializeTask } from './boards.js';
import { publishPublicEvent } from './events.js';

export async function nextTaskOrder(
  transaction: Prisma.TransactionClient,
  boardId: string,
  status: 'todo' | 'progress' | 'done',
): Promise<number> {
  const last = await transaction.task.findFirst({
    where: { boardId, status },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

export async function createTask(
  prisma: PrismaClient,
  boardId: string,
  slug: string,
  fields: Omit<ParsedFields, 'subTasks'> & {
    status: 'todo' | 'progress' | 'done';
  },
) {
  const task = await withBoardActivity(prisma, boardId, async (transaction) => {
    const order = await nextTaskOrder(transaction, boardId, fields.status);
    return transaction.task.create({
      data: {
        boardId,
        title: fields.title,
        status: fields.status,
        priority: fields.priority,
        dueDate: fields.dueDate,
        tags: JSON.stringify(fields.tags),
        order,
      },
    });
  });
  const serialized = serializeTask(task);
  publishPublicEvent(slug, 'task_created', { task: serialized });
  return serialized;
}

export async function updateTask(
  prisma: PrismaClient,
  boardId: string,
  slug: string,
  taskId: string,
  fields: Partial<Omit<ParsedFields, 'subTasks'> & { order: number }>,
) {
  const task = await withBoardActivity(prisma, boardId, async (transaction) => {
    const existing = await transaction.task.findFirst({ where: { id: taskId, boardId } });
    if (!existing) throw notFound('Задача не найдена');
    const { order, tags, ...mutableFields } = fields;
    return transaction.task.update({
      where: { id: existing.id },
      data: {
        ...mutableFields,
        ...(tags === undefined ? {} : { tags: JSON.stringify(tags) }),
        ...(order === undefined ? {} : { order }),
      },
    });
  });
  const serialized = serializeTask(task);
  publishPublicEvent(slug, 'task_updated', { task: serialized });
  return serialized;
}

export async function deleteTask(
  prisma: PrismaClient,
  boardId: string,
  slug: string,
  taskId: string,
): Promise<void> {
  await withBoardActivity(prisma, boardId, async (transaction) => {
    const deleted = await transaction.task.deleteMany({ where: { id: taskId, boardId } });
    if (deleted.count !== 1) throw notFound('Задача не найдена');
  });
  publishPublicEvent(slug, 'task_deleted', { taskId });
}

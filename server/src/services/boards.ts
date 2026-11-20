import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { notFound } from '../errors.js';
import { boardColumnSchema, parsedFieldsSchema, parseStoredJson } from '../schemas.js';

export const BOARD_DELETED_MESSAGE = 'Доска не найдена';

export const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'Сделать', order: 0 },
  { id: 'progress', title: 'Делаю', order: 1 },
  { id: 'done', title: 'Готово', order: 2 },
] as const;

export async function getActiveBoard(
  database: PrismaClient | Prisma.TransactionClient,
  slug: string,
) {
  const board = await database.board.findUnique({ where: { slug } });
  if (!board || board.deletedAt !== null) throw notFound(BOARD_DELETED_MESSAGE);
  return board;
}

export function serializeColumns(rawColumns: string) {
  return z.array(boardColumnSchema).parse(JSON.parse(rawColumns));
}

export function serializeTask(task: {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  tags: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    tags: parseStoredJson(task.tags, z.string().array()),
    order: task.order,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export type DraftPublic = ReturnType<typeof serializeDraft>;

export function serializeDraft(draft: {
  id: string;
  rawText: string;
  parsedFields: string;
  status: string;
  expiresAt: Date;
}) {
  return {
    draftId: draft.id,
    rawText: draft.rawText,
    parsedFields: parseStoredJson(draft.parsedFields, parsedFieldsSchema),
    status: draft.status,
    expiresAt: draft.expiresAt.toISOString(),
  };
}

export async function getBoardState(database: PrismaClient, slug: string, clientId: string) {
  const board = await getActiveBoard(database, slug);
  const [tasks, users, drafts] = await Promise.all([
    database.task.findMany({
      where: { boardId: board.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
    database.boardUser.findMany({
      where: { boardId: board.id },
      orderBy: { createdAt: 'asc' },
    }),
    database.parsedDraft.findMany({
      where: { boardId: board.id, clientId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    slug: board.slug,
    name: board.name,
    color: board.color,
    updatedAt: board.updatedAt.toISOString(),
    columns: serializeColumns(board.columns),
    tasks: tasks.map(serializeTask),
    users: users.map((user) => ({ name: user.name, color: user.color })),
    drafts: drafts.map(serializeDraft),
  };
}

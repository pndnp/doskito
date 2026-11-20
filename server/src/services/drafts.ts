import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { conflict, notFound } from '../errors.js';
import { withBoardActivity } from '../lib/board-activity.js';
import {
  parseStoredJson,
  parsedFieldsSchema,
  taskPrioritySchema,
  type ParsedFields,
} from '../schemas.js';
import { serializeDraft, type DraftPublic } from './boards.js';
import { publishOwnerEvent, publishPublicEvent } from './events.js';
import { getPrisma } from '../db.js';

export const DRAFT_TTL_MINUTES = 30;

const finalizedTaskIdsSchema = z.string().array();

export function serializeFinalizedTaskView(task: { id: string; title: string }) {
  return { id: task.id, title: task.title };
}

interface DraftRecord {
  id: string;
  boardId: string;
  clientId: string;
  rawText: string;
  parsedFields: string;
  status: 'PENDING' | 'FINALIZED' | 'DISCARDED';
  expiresAt: Date;
  finalizedTaskIds: string;
}

/** Загрузка черновика с проверками owner и доски. */
export async function loadDraft(
  slug: string,
  draftId: string,
  clientId: string,
): Promise<DraftRecord> {
  const prisma = getPrisma();
  const board = await prisma.board.findUnique({ where: { slug } });
  if (!board || board.deletedAt !== null) throw notFound('Доска не найдена');
  const draft = await prisma.parsedDraft.findUnique({ where: { id: draftId } });
  if (
    !draft ||
    draft.boardId !== board.id ||
    draft.clientId !== clientId ||
    draft.status === 'DISCARDED'
  ) {
    throw notFound('Черновик не найден');
  }
  return draft as unknown as DraftRecord;
}

export async function patchDraft(
  slug: string,
  draftId: string,
  clientId: string,
  fields: ParsedFields,
): Promise<DraftPublic> {
  const prisma = getPrisma();
  const draft = await prisma.parsedDraft.findUnique({ where: { id: draftId } });
  if (
    !draft ||
    draft.clientId !== clientId ||
    draft.status === 'DISCARDED' ||
    (draft.status === 'PENDING' && draft.expiresAt.getTime() <= Date.now())
  ) {
    throw notFound('Черновик не найден');
  }

  const updated = await prisma.parsedDraft.update({
    where: { id: draftId },
    data: { parsedFields: JSON.stringify(fields) },
  });
  return serializeDraft(updated);
}

export async function discardDraft(slug: string, draftId: string, clientId: string): Promise<void> {
  const draft = await loadDraft(slug, draftId, clientId);
  if (draft.status === 'FINALIZED') throw conflict('Черновик уже финализирован');
  await getPrisma().parsedDraft.update({
    where: { id: draftId },
    data: { status: 'DISCARDED' },
  });
  publishOwnerEvent(slug, clientId, 'draft_discarded', { draftId, reason: 'manual' });
}

/**
 * Идемпотентная финализация: PENDING → основная задача + 2–10
 * самостоятельных задач от подзадач; FINALIZED → возврат ранее созданных.
 */
export async function finalizeDraft(slug: string, draftId: string, clientId: string) {
  const prisma = getPrisma();
  const draft = await loadDraft(slug, draftId, clientId);
  if (draft.status === 'FINALIZED') {
    const taskIds = parseStoredJson(draft.finalizedTaskIds, finalizedTaskIdsSchema);
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } });
    return { draftId, tasks: tasks.map(serializeFinalizedTaskView) };
  }
  if (draft.expiresAt.getTime() <= Date.now()) throw notFound('Черновик не найден');

  const fields = parseStoredJson(draft.parsedFields, parsedFieldsSchema);
  const created = await withBoardActivity(prisma, draft.boardId, async (transaction) => {
    const order = await nextOrder(transaction, draft.boardId);
    const tasksData = buildFinalizedTasks(fields, draft.boardId, order);
    const tasks: Array<{ id: string; title: string }> = [];
    for (const data of tasksData) {
      const task = await transaction.task.create({ data });
      tasks.push({ id: task.id, title: task.title });
    }
    await transaction.parsedDraft.update({
      where: { id: draftId },
      data: { status: 'FINALIZED', finalizedTaskIds: JSON.stringify(tasks.map((t) => t.id)) },
    });
    return tasks;
  });

  for (const task of created) {
    publishPublicEvent(slug, 'task_created', task);
  }
  publishOwnerEvent(slug, clientId, 'draft_finalized', {
    draftId,
    taskIds: created.map((task) => task.id),
  });
  return { draftId, tasks: created.map(serializeFinalizedTaskView) };
}

function buildFinalizedTasks(
  fields: ParsedFields,
  boardId: string,
  startOrder: number,
): Array<{
  boardId: string;
  title: string;
  status: 'todo';
  priority: z.infer<typeof taskPrioritySchema>;
  dueDate: string | null;
  tags: string;
  order: number;
}> {
  const shared = {
    boardId,
    status: 'todo' as const,
    priority: fields.priority,
    dueDate: fields.dueDate,
    tags: JSON.stringify(fields.tags),
  };
  const items = [{ title: fields.title }, ...fields.subTasks];
  return items.map((item, index) => ({ ...shared, ...item, order: startOrder + index }));
}

async function nextOrder(transaction: Prisma.TransactionClient, boardId: string) {
  const last = await transaction.task.findFirst({
    where: { boardId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  return (last?.order ?? -1) + 1;
}

/** Минутный TTL cleanup: истёкшие PENDING → DISCARDED. */
export async function cleanupExpiredDrafts(now = new Date()) {
  const prisma = getPrisma();
  const expired = await prisma.parsedDraft.findMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    select: { id: true, clientId: true, board: { select: { slug: true } } },
  });
  for (const draft of expired) {
    await prisma.parsedDraft.update({
      where: { id: draft.id },
      data: { status: 'DISCARDED' },
    });
    publishOwnerEvent(draft.board.slug, draft.clientId, 'draft_discarded', {
      draftId: draft.id,
      reason: 'expired',
    });
  }
  return expired.length;
}

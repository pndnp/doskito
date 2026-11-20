import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../db.js';
import { notFound, serviceUnavailable } from '../errors.js';
import { generateUniqueSlug, hashColor } from '../lib/identity.js';
import { withBoardActivity, touchBoard } from '../lib/board-activity.js';
import { publishPublicEvent } from '../services/events.js';
import { getActiveBoard, getBoardState, DEFAULT_COLUMNS } from '../services/boards.js';
import { softDeleteBoard } from '../services/deletion.js';
import {
  renameBoardSchema,
  joinSchema,
  summariesSchema,
  parseTaskSchema,
} from '../schemas/requests.js';
import { ensureClientId } from '../plugins/security.js';
import type { LLMProvider } from '../services/llm.js';
import { DRAFT_TTL_MINUTES } from '../services/drafts.js';

export function registerBoardRoutes(app: FastifyInstance, llm: LLMProvider): void {
  const prisma = getPrisma();
  // POST /api/boards — создание доски (REQ-BM-1)
  app.post('/api/boards', async (_request, reply) => {
    let slug: string;
    try {
      slug = await generateUniqueSlug(async (candidate) =>
        Boolean(await prisma.board.findUnique({ where: { slug: candidate } })),
      );
    } catch {
      throw serviceUnavailable('Не удалось создать доску. Повторите попытку позже.');
    }

    const board = await prisma.board.create({
      data: {
        slug,
        name: 'Моя доска',
        color: '#B69CFF',
        columns: JSON.stringify(DEFAULT_COLUMNS),
      },
    });

    return reply.status(201).send({
      slug: board.slug,
      name: board.name,
      color: board.color,
      url: `/#/${board.slug}`,
    });
  });

  // POST /api/boards/summaries — метаданные для списка досок (REQ-BM-7)
  app.post('/api/boards/summaries', async (request, reply) => {
    const { slugs } = summariesSchema.parse(request.body ?? {});
    const boards: unknown[] = [];
    const missingSlugs: string[] = [];
    for (const slug of slugs) {
      try {
        const board = await getActiveBoard(prisma, slug);
        const [totalTasks, doneTasks] = await Promise.all([
          prisma.task.count({ where: { boardId: board.id } }),
          prisma.task.count({ where: { boardId: board.id, status: 'done' } }),
        ]);
        boards.push({
          slug: board.slug,
          name: board.name,
          color: board.color,
          updatedAt: board.updatedAt.toISOString(),
          totalTasks,
          doneTasks,
        });
      } catch {
        missingSlugs.push(slug);
      }
    }
    reply.header('Cache-Control', 'no-store');
    return { boards, missingSlugs };
  });

  // GET /api/boards/:slug — полное состояние (REQ-BM-2)
  app.get('/api/boards/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const clientId = ensureClientId(request, reply);
    return getBoardState(prisma, slug, clientId);
  });

  // PATCH /api/boards/:slug — переименование (REQ-BM-3)
  app.patch('/api/boards/:slug', async (request) => {
    const { slug } = request.params as { slug: string };
    const { name } = renameBoardSchema.parse(request.body ?? {});
    const board = await getActiveBoard(prisma, slug);
    await touchBoard(prisma, board.id);
    await prisma.board.update({ where: { id: board.id }, data: { name } });
    publishPublicEvent(slug, 'board_updated', { name });
    return { slug: board.slug, name };
  });

  // DELETE /api/boards/:slug — soft delete (REQ-BM-4)
  app.delete('/api/boards/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const deleted = await softDeleteBoard(prisma, slug, 'manual');
    if (!deleted) throw notFound('Доска не найдена');
    return reply.status(204).send();
  });

  // POST /api/boards/:slug/join — присоединение участника (REQ-BM-6)
  app.post('/api/boards/:slug/join', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { name } = joinSchema.parse(request.body ?? {});
    const board = await getActiveBoard(prisma, slug);

    const existing = await prisma.boardUser.findUnique({
      where: { boardId_name: { boardId: board.id, name } },
    });
    if (existing) {
      return reply.status(200).send({ name: existing.name, color: existing.color });
    }

    const user = await withBoardActivity(prisma, board.id, (transaction) =>
      transaction.boardUser.create({
        data: { boardId: board.id, name, color: hashColor(name) },
      }),
    );
    publishPublicEvent(slug, 'user_joined', { name: user.name, color: user.color });
    return reply.status(201).send({ name: user.name, color: user.color });
  });

  // POST /api/boards/:slug/tasks/parsed — AI Parse (REQ-TP-1)
  app.post('/api/boards/:slug/tasks/parsed', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { rawText } = parseTaskSchema.parse(request.body ?? {});
    const board = await getActiveBoard(prisma, slug);
    const clientId = ensureClientId(request, reply);

    if (!llm.isConfigured()) {
      throw serviceUnavailable('Не удалось разобрать задачу. Создайте вручную.');
    }
    const { fields, subTasksTruncated } = await llm.parse(rawText).catch(() => {
      throw serviceUnavailable('Не удалось разобрать задачу. Создайте вручную.');
    });

    const expiresAt = new Date(Date.now() + DRAFT_TTL_MINUTES * 60 * 1000);
    const draft = await prisma.parsedDraft.create({
      data: {
        boardId: board.id,
        clientId,
        rawText,
        parsedFields: JSON.stringify(fields),
        expiresAt,
        finalizedTaskIds: '[]',
      },
    });
    return reply.status(201).send({
      draftId: draft.id,
      parsedFields: fields,
      expiresAt: expiresAt.toISOString(),
      ...(subTasksTruncated ? { subTasksTruncated: true } : {}),
    });
  });
}

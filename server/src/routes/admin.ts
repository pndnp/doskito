import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../db.js';
import { unauthorized } from '../errors.js';

/** GET /admin/boards — активные и удалённые доски по X-Admin-Secret (REQ-BM-8). */
export function registerAdminRoutes(app: FastifyInstance): void {
  app.get('/admin/boards', async (request) => {
    const secret = process.env.ADMIN_SECRET;
    if (!secret || request.headers['x-admin-secret'] !== secret) {
      throw unauthorized();
    }

    const boards = await getPrisma().board.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { tasks: true } } },
    });
    return {
      boards: boards.map((board) => ({
        slug: board.slug,
        name: board.name,
        createdAt: board.createdAt.toISOString(),
        updatedAt: board.updatedAt.toISOString(),
        deletedAt: board.deletedAt?.toISOString() ?? null,
        taskCount: board._count.tasks,
      })),
    };
  });
}

import type { FastifyInstance } from 'fastify';
import { patchDraftSchema } from '../schemas/requests.js';
import { ensureClientId } from '../plugins/security.js';
import { discardDraft, finalizeDraft, patchDraft } from '../services/drafts.js';

export function registerDraftRoutes(app: FastifyInstance): void {
  // PATCH /api/boards/:slug/drafts/:draftId — редактирование черновика (REQ-TP-3)
  app.patch('/api/boards/:slug/drafts/:draftId', async (request, reply) => {
    const { slug, draftId } = request.params as { slug: string; draftId: string };
    const clientId = ensureClientId(request, reply);
    const fields = patchDraftSchema.parse(request.body ?? {});
    const draft = await patchDraft(slug, draftId, clientId, fields);
    reply.header('Cache-Control', 'no-store');
    return draft;
  });

  // POST /api/boards/:slug/drafts/:draftId/finalize (REQ-TP-4)
  app.post('/api/boards/:slug/drafts/:draftId/finalize', async (request, reply) => {
    const { slug, draftId } = request.params as { slug: string; draftId: string };
    const clientId = ensureClientId(request, reply);
    reply.header('Cache-Control', 'no-store');
    return finalizeDraft(slug, draftId, clientId);
  });

  // POST /api/boards/:slug/drafts/:draftId/discard (REQ-TP-5)
  app.post('/api/boards/:slug/drafts/:draftId/discard', async (request, reply) => {
    const { slug, draftId } = request.params as { slug: string; draftId: string };
    const clientId = ensureClientId(request, reply);
    await discardDraft(slug, draftId, clientId);
    return { ok: true };
  });
}

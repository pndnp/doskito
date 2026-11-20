import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { cleanupExpiredDrafts } from '../../src/services/drafts.js';
import { setPrismaClient, resetPrismaClient } from '../../src/db.js';

test('cleanupExpiredDrafts переводит истёкшие PENDING в DISCARDED', async () => {
  const now = new Date('2026-11-19T12:30:00.000Z');
  const expiredAt = new Date('2026-11-19T12:29:59.000Z');
  const activeAt = new Date('2026-11-19T12:30:01.000Z');
  const updates: Array<{ id: string; data: { status: string } }> = [];
  const drafts = [
    { id: 'expired-1', status: 'PENDING', expiresAt: expiredAt, board: { slug: 'aaaaaaaa' } },
    { id: 'expired-2', status: 'PENDING', expiresAt: now, board: { slug: 'aaaaaaaa' } },
    { id: 'active', status: 'PENDING', expiresAt: activeAt, board: { slug: 'aaaaaaaa' } },
    { id: 'finalized', status: 'FINALIZED', expiresAt: expiredAt, board: { slug: 'aaaaaaaa' } },
  ];
  const prisma = {
    parsedDraft: {
      findMany: async ({ where }: { where: { status: string; expiresAt: { lte: Date } } }) =>
        drafts.filter(
          (draft) => draft.status === where.status && draft.expiresAt <= where.expiresAt.lte,
        ),
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        updates.push({ id: where.id, data });
        return {};
      },
    },
  } as never;

  setPrismaClient(prisma);
  try {
    const count = await cleanupExpiredDrafts(now);
    assert.equal(count, 2);
    assert.deepEqual(updates.map((update) => update.id).sort(), ['expired-1', 'expired-2']);
    assert.equal(updates[0]?.data.status, 'DISCARDED');
  } finally {
    resetPrismaClient();
  }
});

after(async () => {
  resetPrismaClient();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

test('health endpoint responds with status ok', async () => {
  const app = buildApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok', dependencies: { database: 'ok' } });
  } finally {
    await app.close();
  }
});

test('body limit ограничен 500 КБ', async () => {
  const app = buildApp();
  app.post('/api/test-body-limit', async () => ({ ok: true }));
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/test-body-limit',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ text: 'a'.repeat(500 * 1024) }),
    });
    assert.equal(response.statusCode, 413);
    assert.deepEqual(response.json(), {
      error: 'Request body is too large',
    });
  } finally {
    await app.close();
  }
});

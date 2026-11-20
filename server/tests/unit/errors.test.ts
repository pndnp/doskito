import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import { AppError, registerErrorHandler } from '../../src/errors.js';

for (const [statusCode, name] of [
  [400, 'bad request'],
  [401, 'unauthorized'],
  [404, 'not found'],
  [409, 'conflict'],
  [503, 'unavailable'],
] as const) {
  test(`единый error handler возвращает ${statusCode} как { error }`, async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get(`/${name}`, async () => {
      throw new AppError(statusCode, name);
    });
    try {
      const response = await app.inject({ method: 'GET', url: `/${name}` });
      assert.equal(response.statusCode, statusCode);
      assert.deepEqual(response.json(), { error: name });
    } finally {
      await app.close();
    }
  });
}

test('ZodError преобразуется в 400 с безопасными details', async () => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.post('/', async () => z.object({ name: z.string() }).parse({}));
  try {
    const response = await app.inject({ method: 'POST', url: '/', payload: {} });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'Некорректные данные запроса');
    assert.ok(Array.isArray(response.json().details));
  } finally {
    await app.close();
  }
});

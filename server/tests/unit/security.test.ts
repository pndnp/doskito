import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import Fastify from 'fastify';
import { ensureClientId, parseCookies, registerSecurity } from '../../src/plugins/security.js';

test('parseCookies разбирает список cookie и декодирует значения', () => {
  assert.deepEqual(parseCookies('one=1; encoded=hello%20world; malformed'), {
    one: '1',
    encoded: 'hello world',
  });
});

test('ensureClientId сохраняет существующий clientId', () => {
  const clientId = randomUUID();
  const request = { headers: { cookie: `doskito_client_id=${clientId}` } };
  const reply = {
    header() {
      throw new Error('Cookie не должна перезаписываться');
    },
  };
  assert.equal(ensureClientId(request as never, reply as never), clientId);
});

test('ensureClientId выдаёт HttpOnly SameSite cookie новому клиенту', () => {
  const headers: Record<string, string> = {};
  const request = { headers: {}, protocol: 'http' };
  const reply = {
    header(name: string, value: string) {
      headers[name] = value;
    },
  };
  const clientId = ensureClientId(request as never, reply as never);

  assert.match(clientId, /^[0-9a-f-]{36}$/);
  assert.match(headers['Set-Cookie'] ?? '', /HttpOnly/);
  assert.match(headers['Set-Cookie'] ?? '', /SameSite=Lax/);
  assert.match(headers['Set-Cookie'] ?? '', /Path=\//);
});

test('CORS разрешает только whitelist и возвращает preflight 204', async () => {
  const app = Fastify({ logger: false });
  registerSecurity(app, { corsOrigin: 'http://localhost:5173' });
  app.get('/', async () => ({ ok: true }));
  try {
    const allowed = await app.inject({
      method: 'GET',
      url: '/',
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(allowed.headers['access-control-allow-credentials'], 'true');

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/',
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(preflight.statusCode, 204);

    const rejected = await app.inject({
      method: 'OPTIONS',
      url: '/',
      headers: { origin: 'https://untrusted.example' },
    });
    assert.equal(rejected.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('rate limit допускает 100 запросов в минуту на IP и сбрасывает окно', async () => {
  let now = 0;
  const app = Fastify({ logger: false });
  registerSecurity(app, { now: () => now });
  app.get('/', async () => ({ ok: true }));
  try {
    for (let requestNumber = 0; requestNumber < 100; requestNumber += 1) {
      const response = await app.inject({ method: 'GET', url: '/', remoteAddress: '10.0.0.1' });
      assert.equal(response.statusCode, 200);
    }
    const limited = await app.inject({ method: 'GET', url: '/', remoteAddress: '10.0.0.1' });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.headers['retry-after'], '60');

    now = 60_000;
    const nextWindow = await app.inject({ method: 'GET', url: '/', remoteAddress: '10.0.0.1' });
    assert.equal(nextWindow.statusCode, 200);
  } finally {
    await app.close();
  }
});

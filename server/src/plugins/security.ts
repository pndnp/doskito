import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

const CLIENT_ID_COOKIE = 'doskito_client_id';
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RATE_LIMIT = 100;
const RATE_WINDOW_MS = 60_000;

interface RateWindow {
  startedAt: number;
  count: number;
}

export interface SecurityOptions {
  corsOrigin?: string;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  now?: () => number;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function ensureClientId(request: FastifyRequest, reply: FastifyReply): string {
  const existingId = parseCookies(request.headers.cookie)[CLIENT_ID_COOKIE];
  if (existingId && CLIENT_ID_PATTERN.test(existingId)) return existingId;

  const clientId = randomUUID();
  const secure = request.protocol === 'https' ? '; Secure' : '';
  reply.header(
    'Set-Cookie',
    `${CLIENT_ID_COOKIE}=${clientId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
  );
  return clientId;
}

export function registerSecurity(app: FastifyInstance, options: SecurityOptions = {}): void {
  const allowedOrigins = new Set(
    (options.corsOrigin ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const rateLimitMax = options.rateLimitMax ?? RATE_LIMIT;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? RATE_WINDOW_MS;
  const now = options.now ?? Date.now;
  const requestsByIp = new Map<string, RateWindow>();

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      reply.headers({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      });
    }

    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.has(origin)) {
        throw new AppError(403, 'Origin не разрешён');
      }
      reply
        .headers({
          'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
          'Access-Control-Allow-Headers':
            request.headers['access-control-request-headers'] ?? 'Content-Type',
          'Access-Control-Max-Age': '600',
        })
        .status(204)
        .send();
      return;
    }

    const timestamp = now();
    const current = requestsByIp.get(request.ip);
    const window =
      !current || timestamp - current.startedAt >= rateLimitWindowMs
        ? { startedAt: timestamp, count: 0 }
        : current;
    window.count += 1;
    requestsByIp.set(request.ip, window);

    if (window.count > rateLimitMax) {
      reply.header('Retry-After', Math.max(1, Math.ceil(rateLimitWindowMs / 1000)));
      throw new AppError(429, 'Слишком много запросов. Повторите попытку позже.');
    }

    if (requestsByIp.size > 1_000) {
      for (const [ip, value] of requestsByIp) {
        if (timestamp - value.startedAt >= rateLimitWindowMs) requestsByIp.delete(ip);
      }
    }
  });

  app.addHook('onClose', async () => {
    requestsByIp.clear();
  });
}

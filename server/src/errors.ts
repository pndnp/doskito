import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    readonly statusCode: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message = 'Некорректные данные запроса') => new AppError(400, message);
export const unauthorized = (message = 'Доступ запрещён') => new AppError(401, message);
export const notFound = (message = 'Ресурс не найден') => new AppError(404, message);
export const conflict = (message = 'Конфликт состояния ресурса') => new AppError(409, message);
export const serviceUnavailable = (message = 'Сервис временно недоступен') =>
  new AppError(503, message);

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;

    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: 'Некорректные данные запроса',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    if (error instanceof AppError) {
      void reply.status(error.statusCode).send({ error: error.message });
      return;
    }

    const fastifyError = error as FastifyError;
    if (
      fastifyError.statusCode &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      const statusCode = fastifyError.statusCode;
      const message = statusCode === 404 ? 'Ресурс не найден' : fastifyError.message;
      void reply.status(statusCode).send({ error: message });
      return;
    }

    request.log.error(error);
    void reply.status(500).send({ error: 'Внутренняя ошибка сервера' });
  });
}

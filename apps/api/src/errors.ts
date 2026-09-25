import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { EnrichmentError, FolderError, PreferenceError } from '@preference-memory/core';

/** Maps domain errors to HTTP. Messages are user-facing (Russian); internals never leak. */
export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join('.') || 'запрос';
    return reply.status(400).send({ error: `Неверное поле «${field}»: ${issue?.message ?? ''}` });
  }
  if (err instanceof FolderError || err instanceof PreferenceError) {
    return reply.status(err.status).send({ error: err.message });
  }
  if (err instanceof EnrichmentError) {
    return reply.status(422).send({ error: err.message });
  }
  const fe = err as FastifyError;
  if (fe.statusCode && fe.statusCode < 500) {
    return reply.status(fe.statusCode).send({ error: fe.message });
  }
  req.log.error({ err: { message: err.message, name: err.name } }, 'request failed');
  return reply.status(502).send({ error: 'Внутренняя ошибка сервиса. Подробности — в логах api.' });
}

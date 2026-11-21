import type { FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'error',
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable.`, 'not_found');
export const forbidden = (msg = "Tu n'as pas accès à cette ressource.") => new HttpError(403, msg, 'forbidden');

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path.join('.') || 'requête';
    throw new HttpError(400, `Donnée invalide (${where}) : ${issue?.message ?? 'format incorrect'}`, 'validation', {
      issues: r.error.issues.map((i) => ({ path: i.path, message: i.message })),
    });
  }
  return r.data;
}

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export function getId(req: FastifyRequest, key = 'id'): number {
  const v = Number((req.params as Record<string, string>)[key]);
  if (!Number.isInteger(v) || v <= 0) throw new HttpError(400, 'Identifiant invalide.', 'validation');
  return v;
}

export function sendError(reply: FastifyReply, err: HttpError) {
  return reply.status(err.status).send({ error: err.code, message: err.message, ...err.extra });
}

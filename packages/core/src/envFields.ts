/** Построители полей env-схемы: обрезка, комментарии compose, значения по умолчанию, диапазоны. */
import { z } from 'zod';

/**
 * docker compose keeps "KEY=   # comment" as the literal value "# comment",
 * so a value that starts with "#" is a comment, i.e. empty.
 */
const clean = (v: unknown) => {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t.startsWith('#') ? '' : t;
};

export const trimmed = <T extends z.ZodType>(schema: T) => z.preprocess(clean, schema);

export const required = (hint: string) =>
  trimmed(z.string({ error: `заполните (${hint})` }).min(1, `заполните (${hint})`));

export const optionalString = (fallback: string) =>
  trimmed(z.string().optional()).transform((v) => (v ? v : fallback));

export const bool = (fallback: boolean) =>
  trimmed(z.enum(['true', 'false', '1', '0', 'yes', 'no', '']).optional()).transform((v) =>
    v === undefined || v === '' ? fallback : ['true', '1', 'yes'].includes(v),
  );

export const int = (fallback: number, min: number, max: number) =>
  trimmed(z.string().optional()).pipe(
    z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : fallback))
      .pipe(z.number().int(`должно быть целым числом`).min(min).max(max)),
  );

export const num = (fallback: number, min: number, max: number) =>
  trimmed(z.string().optional()).pipe(
    z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : fallback))
      .pipe(z.number({ error: 'должно быть числом' }).min(min).max(max)),
  );

export const url = (fallback: string) =>
  optionalString(fallback).pipe(z.url({ error: 'должно быть адресом вида http(s)://…' }));

/** Необязательная публичная ссылка: пусто — элемент интерфейса не показывается. */
export const optionalUrl = () =>
  optionalString('').pipe(
    z.union([z.literal(''), z.url({ error: 'должно быть адресом https://…' })]),
  );

/** Поле формы: eyebrow-подпись, контрол и необязательная подсказка (caption text-2) под ним. */
import type { ReactNode } from 'react';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-caption text-text-2">{hint}</span>}
    </label>
  );
}

export const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

export const splitPath = (s: string) =>
  s
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);

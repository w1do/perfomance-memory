/** Бейджи, ограничения и путь. Краски — роли из lib/roles (токены --role-*). Уровень правила — Level.tsx. */
import type { ReactNode } from 'react';
import type { Role } from '../lib/roles';
import type { Constraint, Polarity } from '../lib/types';
import { Icon } from './Icon';

export type { Role } from '../lib/roles';

const ROLE_CLASS: Record<Role, string> = {
  like: 'bg-like-soft text-like-ink border-like',
  dislike: 'bg-dislike-soft text-dislike-ink border-dislike',
  ui: 'bg-ui-soft text-ui-ink border-ui',
  ai: 'bg-ai-soft text-ai-ink border-ai',
  mcp: 'bg-mcp-soft text-mcp-ink border-mcp',
  service: 'bg-service-soft text-service-ink border-service',
  enrich: 'bg-enrich-soft text-enrich-ink border-enrich',
  net: 'bg-net-soft text-net-ink border-net',
};

export function Badge({
  role,
  children,
  mono,
}: {
  role: Role;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-medium ${ROLE_CLASS[role]} ${mono ? 'mono' : ''}`}
    >
      {children}
    </span>
  );
}

/** Нейтральная «пилюля» для тегов и меток: не спорит с цветными ролями. */
export function Tag({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-caption text-text-2 ring-1 ring-border ${mono ? 'mono' : ''}`}
    >
      {children}
    </span>
  );
}

export function PolarityBadge({ polarity }: { polarity: Polarity }) {
  return (
    <Badge role={polarity}>
      <Icon name={polarity === 'like' ? 'like' : 'dislike'} className="text-caption" />
      {polarity === 'like' ? 'люблю' : 'не люблю'}
    </Badge>
  );
}

export function formatConstraint(c: Constraint): string {
  return `${c.metric} ${c.operator} ${String(c.value)}${c.unit ? ` ${c.unit}` : ''}`;
}

export function ConstraintList({ items }: { items: Constraint[] }) {
  if (!items.length) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {items.map((c, i) => (
        <li
          key={i}
          className="mono rounded-sm border border-enrich bg-enrich-soft px-2 py-0.5 text-enrich-ink"
        >
          {formatConstraint(c)}
        </li>
      ))}
    </ul>
  );
}

export function PathLabel({ path, className = '' }: { path: string[]; className?: string }) {
  return <span className={`mono text-muted ${className}`}>{path.join(' / ')}</span>;
}

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Одна группа дублей: правила с выбором, какое оставить (по умолчанию — предложенное сервисом: строже и полнее),
 * причина от модели, «Слить» и «Не дубли». Остальные правила вливаются в выбранное и уходят в его историю.
 */
import { useState } from 'react';
import type { DuplicateGroup } from '../../lib/types';
import { PathLabel, PolarityBadge } from '../Badges';
import { Icon } from '../Icon';
import { LevelBadge } from '../Level';

export function DuplicateGroupCard({
  group,
  busy,
  onMerge,
  onDistinct,
}: {
  group: DuplicateGroup;
  busy: boolean;
  onMerge: (keep: string, remove: string[]) => void;
  onDistinct: (ids: string[]) => void;
}) {
  const [keep, setKeep] = useState(group.keep);
  const ids = group.preferences.map((p) => p.id);
  return (
    <section className="flex flex-col gap-sm rounded-md border border-border bg-surface-2 p-sm">
      <p className="m-0 text-caption text-text-2">{group.reason}</p>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-1">Какое оставить</legend>
        {group.preferences.map((p) => (
          <label
            key={p.id}
            data-role={p.polarity}
            className={`flex cursor-pointer items-start gap-3 rounded-md border p-2 ${keep === p.id ? 'border-accent bg-surface' : 'border-transparent'}`}
          >
            <input
              type="radio"
              name={`keep-${group.keep}`}
              className="mt-1"
              checked={keep === p.id}
              onChange={() => setKeep(p.id)}
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-semibold break-words">{p.statement}</span>
              {p.details && <span className="text-caption text-text-2">{p.details}</span>}
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
                <PolarityBadge polarity={p.polarity} />
                <LevelBadge level={p.level} />
                <PathLabel path={p.folder_path} className="text-caption" />
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={busy}
          onClick={() =>
            onMerge(
              keep,
              ids.filter((id) => id !== keep),
            )
          }
        >
          <Icon name="check" /> Слить в выбранное
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => onDistinct(ids)}
        >
          Не дубли
        </button>
      </div>
    </section>
  );
}

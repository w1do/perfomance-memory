/**
 * Поиск по смыслу и словам + чипы-фильтры из /api/facets (домен, кому, ограничения, теги, только жёсткие).
 * На <768 чипы — горизонтальная лента; подсказка Tip объясняет порядок «сначала фильтр, потом ранжирование».
 */
import type { Facets, Filters } from '../lib/types';
import { Icon } from './Icon';
import { Tip } from './ui/Tip';

const GROUPS: { key: 'domain' | 'applies_to' | 'tags' | 'metric'; facet: string; label: string }[] =
  [
    { key: 'domain', facet: 'domain', label: 'Домен' },
    { key: 'applies_to', facet: 'applies_to', label: 'Кому' },
    { key: 'metric', facet: 'constraint_metrics', label: 'Ограничения' },
    { key: 'tags', facet: 'tags', label: 'Теги' },
  ];

export function FilterBar({
  facets,
  filters,
  onChange,
  query,
  onQuery,
}: {
  facets: Facets | null;
  filters: Filters;
  onChange: (f: Filters) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const toggle = (key: (typeof GROUPS)[number]['key'], value: string) =>
    onChange({ ...filters, [key]: filters[key] === value ? undefined : value });
  const hard = filters.level === 'hard';

  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <label className="relative flex items-center">
        <Icon name="search" className="pointer-events-none absolute left-3.5 text-muted" />
        <input
          className="input pl-10"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Поиск по смыслу и словам…"
          aria-label="Поиск по правилам"
        />
      </label>
      <div
        className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto px-1 py-1 md:flex-wrap md:overflow-visible"
        role="group"
        aria-label="Фильтры"
      >
        <Tip content="Сначала фильтр по полям, потом поиск ранжирует">
          {(t) => (
            <span {...t} className="inline-flex shrink-0 rounded-full p-1 text-muted">
              <Icon name="filter" label="Фильтры" />
            </span>
          )}
        </Tip>
        <button
          className="chip shrink-0"
          aria-pressed={hard}
          title="Правила уровня «жёстко»: нарушение — дефект"
          onClick={() => onChange({ ...filters, level: hard ? undefined : 'hard' })}
        >
          только жёсткие
        </button>
        {GROUPS.map((g) =>
          (facets?.[g.facet] ?? []).slice(0, g.key === 'tags' ? 10 : 8).map((f) => (
            <button
              key={`${g.key}:${f.value}`}
              className="chip shrink-0"
              aria-pressed={filters[g.key] === f.value}
              onClick={() => toggle(g.key, f.value)}
              title={g.label}
            >
              <span className={g.key === 'metric' || g.key === 'applies_to' ? 'mono' : ''}>
                {g.key === 'tags' ? `#${f.value}` : f.value}
              </span>
              <span className="text-muted">{f.count}</span>
            </button>
          )),
        )}
      </div>
    </div>
  );
}

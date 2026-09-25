/**
 * Шапка экрана папок: Card роли service с 3D folders (lg), хлебные крошки (кнопки-префиксы),
 * заголовок папки, счётчики «люблю / не люблю» и FilterBar (поиск и чипы из /api/facets).
 */
import type { ComponentProps } from 'react';
import { Badge } from '../Badges';
import { FilterBar } from '../FilterBar';
import { Card } from '../ui/Card';

export function FolderHeaderCard({
  path,
  onSelect,
  counts,
  filterBar,
}: {
  path: string | null;
  onSelect: (path: string | null) => void;
  counts: { like: number; dislike: number };
  filterBar: ComponentProps<typeof FilterBar>;
}) {
  const parts = path ? path.split('/') : [];
  return (
    <Card tone="service" icon3d="folders" icon3dSize="lg" index={0} lift={false}>
      <div className="card-head flex flex-col gap-1">
        <div className="eyebrow">{path ? 'Папка' : 'Все папки'}</div>
        {parts.length > 0 && (
          <nav aria-label="Путь к папке" className="mono text-caption text-muted">
            <button className="hover:text-text hover:underline" onClick={() => onSelect(null)}>
              Все правила
            </button>
            {parts.map((seg, i) => {
              const last = i === parts.length - 1;
              return (
                <span key={i}>
                  <span aria-hidden="true"> › </span>
                  {last ? (
                    <span aria-current="page" className="text-text-2">
                      {seg}
                    </span>
                  ) : (
                    <button
                      className="hover:text-text hover:underline"
                      onClick={() => onSelect(parts.slice(0, i + 1).join('/'))}
                    >
                      {seg}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
        )}
        <h1 className="text-h2 break-words">{parts.at(-1) ?? 'Все правила'}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge role="like">люблю · {counts.like}</Badge>
          <Badge role="dislike">не люблю · {counts.dislike}</Badge>
        </div>
      </div>
      <div className="mt-md">
        <FilterBar {...filterBar} />
      </div>
    </Card>
  );
}

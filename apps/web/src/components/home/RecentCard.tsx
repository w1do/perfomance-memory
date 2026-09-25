/**
 * Последние записи (роль ui, 3D-часы): строки .row-item — точка полярности, фраза в одну строку,
 * дата и путь папки. Пусто — кнопка «К микрофону» (FOCUS_MIC_EVENT). Токены frost-01.
 */
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { emit, FOCUS_MIC_EVENT } from '../../lib/events';
import { formatDate } from '../Badges';
import { Card } from '../ui/Card';
import { CardHeader } from './CardHeader';

export function RecentCard({
  className = '',
  index = 4,
  onOpenFolder,
}: {
  className?: string;
  index?: number;
  onOpenFolder: (path: string) => void;
}) {
  const { data } = useAsync(() => api.list({ limit: 6 }), []);
  const items = data?.items ?? [];

  return (
    <Card
      tone="ui"
      icon3d="recent"
      icon3dSize="lg"
      index={index}
      lift
      className={`flex flex-col ${className}`}
      aria-labelledby="recent-title"
    >
      <CardHeader id="recent-title" eyebrow="Последние записи" title="Что вы сказали недавно" />
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-sm">
          <p className="m-0 text-text-2">Пока пусто. Скажите первую фразу — она появится здесь</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => emit(FOCUS_MIC_EVENT)}
          >
            К микрофону
          </button>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map(({ preference: p }) => (
            <li key={p.id}>
              <button
                type="button"
                className="row-item w-full items-start text-left"
                onClick={() => onOpenFolder(p.folder_path.join('/'))}
              >
                <span
                  aria-label={p.polarity === 'like' ? 'Люблю' : 'Не люблю'}
                  role="img"
                  className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                    p.polarity === 'like' ? 'bg-like' : 'bg-dislike'
                  }`}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-sm">
                    <span className="min-w-0 flex-1 truncate text-text">{p.statement}</span>
                    <span className="shrink-0 text-caption text-muted">
                      {formatDate(p.updated_at)}
                    </span>
                  </span>
                  <span className="mono truncate text-caption text-muted">
                    {p.folder_path.join(' / ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

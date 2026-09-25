/**
 * Статистика (роль like, 3D-сердце): число правил, полоса «люблю / не люблю» (draw),
 * счётчики папок и проектов, «Найти дубли» (HygieneModal), последняя запись. Карточка Card из фундамента, токены frost-01.
 */
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { api } from '../../lib/api';
import { formatDate } from '../Badges';
import { Icon } from '../Icon';
import { HygieneModal } from '../hygiene/HygieneModal';
import { Card } from '../ui/Card';
import { Tip } from '../ui/Tip';
import { plural, RULES } from './plural';

export function StatsCard({ className = '', index = 2 }: { className?: string; index?: number }) {
  const { data } = useAsync(api.stats, []);
  const total = data?.total ?? 0;
  const like = data?.like ?? 0;
  const dislike = data?.dislike ?? 0;
  const active = like + dislike;
  const likeShare = active ? (like / active) * 100 : 0;
  const [hygiene, setHygiene] = useState(false);

  return (
    <Card
      tone="like"
      icon3d="love"
      icon3dSize="md"
      index={index}
      lift
      className={`flex flex-col gap-md ${className}`}
      aria-labelledby="stats-title"
    >
      <div className="card-head">
        <div id="stats-title" className="eyebrow">
          Статистика
        </div>
        <p className="m-0 flex flex-wrap items-baseline gap-x-3">
          <span className="font-heading text-display font-bold tabular-nums">{total}</span>
          <span className="text-text-2">{plural(total, RULES)} в памяти</span>
        </p>
      </div>

      <div>
        <Tip content="Доля среди активных правил">
          {(t) => (
            <div
              {...t}
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-bg-deep"
              role="img"
              aria-label={`Люблю ${like}, не люблю ${dislike}`}
            >
              {like > 0 && (
                <span className="draw-x h-full bg-like" style={{ width: `${likeShare}%` }} />
              )}
              {dislike > 0 && <span className="draw-x h-full flex-1 bg-dislike" />}
            </div>
          )}
        </Tip>
        <div className="mt-2 flex justify-between text-caption font-medium">
          <span className="text-like-ink">люблю · {like}</span>
          <span className="text-dislike-ink">не люблю · {dislike}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-text-2">
          Папки <span className="mono text-text">{data?.folders ?? 0}</span> · Проекты{' '}
          <span className="mono text-text">{data?.projects ?? 0}</span>
        </p>
        <Tip content="Одинаковые по смыслу правила — слить в одно">
          {(t) => (
            <button
              {...t}
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={total < 2}
              onClick={() => setHygiene(true)}
            >
              <Icon name="search" /> Найти дубли
            </button>
          )}
        </Tip>
      </div>

      <div className="card-foot flex-col flex-nowrap gap-1">
        <div className="eyebrow">Последняя запись</div>
        <p className="m-0 flex min-w-0 items-center gap-2">
          <Icon name="clock" className="text-muted" />
          <span className="min-w-0 truncate text-text">
            {data?.last ? data.last.statement : '—'}
          </span>
        </p>
        {data?.last && (
          <span className="text-caption text-muted">{formatDate(data.last.updated_at)}</span>
        )}
      </div>
      {hygiene && <HygieneModal onClose={() => setHygiene(false)} />}
    </Card>
  );
}

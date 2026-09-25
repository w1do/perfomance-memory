/** История версий правила в .collapse[data-open] (раскрытие — переход grid-template-rows из controls.css). */
import type { HistoryEntry } from '../../lib/types';
import { formatDate } from '../Badges';

export function PreferenceHistory({
  id,
  open,
  items,
}: {
  id: string;
  open: boolean;
  items: HistoryEntry[];
}) {
  return (
    <div id={id} className="collapse" data-open={open} inert={!open}>
      <div>
        <ol className="m-0 flex list-none flex-col gap-2 border-t border-border pt-sm pl-0">
          {[...items].reverse().map((h, i) => (
            <li key={i} className="text-caption text-text-2">
              <span className="mono text-muted">{formatDate(h.changed_at)}</span> ·{' '}
              {h.polarity === 'like' ? 'люблю' : 'не люблю'}: {h.statement}
              {h.reason && <span className="text-muted"> — {h.reason}</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

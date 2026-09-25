/**
 * Карточка правила (только просмотр): Card в краске полярности; полярность показывает колонка, теги — нейтральные,
 * сила/путь/дата — одной тихой строкой; действия на hover; перетаскивание на папку; редактор и история — preference/*.
 */
import { useId, useState } from 'react';
import { api } from '../lib/api';
import type { Preference } from '../lib/types';
import { Badge, ConstraintList, PathLabel, StrengthDots, Tag, formatDate } from './Badges';
import { Icon } from './Icon';
import { PreferenceEditor } from './preference/PreferenceEditor';
import { PreferenceHistory } from './preference/PreferenceHistory';
import { useToast } from './Toasts';
import { Card } from './ui/Card';
import { Tip } from './ui/Tip';

export const DRAG_PREFERENCE = 'application/x-pm-preference';

export function PreferenceCard({ p, index = 0 }: { p: Preference; index?: number }) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [dragging, setDragging] = useState(false);
  const historyId = useId();
  const toast = useToast();

  const remove = async () => {
    if (!confirm(`Удалить правило «${p.statement}»?`)) return;
    try {
      await api.remove(p.id);
      toast('Правило удалено', 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  if (editing) return <PreferenceEditor p={p} onDone={() => setEditing(false)} />;

  return (
    <Card
      as="article"
      tone={p.polarity}
      className="pref-card flex flex-col gap-sm"
      index={Math.min(index, 8)}
      reveal={index < 8}
      lift
      draggable
      data-dragging={dragging || undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_PREFERENCE, p.id);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-lead font-semibold break-words">{p.statement}</h3>
        <span className="pref-card__actions -mt-1 -mr-2 flex shrink-0">
          <button className="btn-icon" onClick={() => setEditing(true)} aria-label="Редактировать">
            <Icon name="pencil" />
          </button>
          <button className="btn-icon" onClick={remove} aria-label="Удалить">
            <Icon name="trash" />
          </button>
        </span>
      </div>
      {p.details && <p className="m-0 text-[15px] leading-relaxed text-text-2">{p.details}</p>}
      <ConstraintList items={p.constraints} />
      {(p.applies_to.length > 0 || p.tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {p.applies_to.map((a) => (
            <Badge key={`a-${a}`} role="ai" mono>
              {a}
            </Badge>
          ))}
          {p.tags.map((t) => (
            <Tag key={`t-${t}`}>#{t}</Tag>
          ))}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-sm text-caption text-muted">
        <Tip content="Сила 1–5: насколько строго агент должен соблюдать">
          {(t) => (
            <span {...t} className="inline-flex rounded-full p-1">
              <StrengthDots value={p.strength} />
            </span>
          )}
        </Tip>
        <PathLabel path={p.folder_path} className="min-w-0 truncate text-caption" />
        <span className="ml-auto">{formatDate(p.updated_at)}</span>
        {p.history.length > 0 && (
          <button
            className="inline-flex items-center gap-1 text-caption text-muted hover:text-text"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            aria-controls={historyId}
          >
            <Icon name="clock" /> {p.history.length}
          </button>
        )}
      </div>
      {p.history.length > 0 && (
        <PreferenceHistory id={historyId} open={showHistory} items={p.history} />
      )}
    </Card>
  );
}

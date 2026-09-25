/** Редактор ограничений (metric operator value unit): поля input mono, оператор select, удаление btn-icon. */
import type { Constraint } from '../lib/types';
import { Icon } from './Icon';

const OPS: Constraint['operator'][] = ['<', '<=', '=', '!=', '>=', '>'];

export function ConstraintEditor({
  value,
  onChange,
}: {
  value: Constraint[];
  onChange: (v: Constraint[]) => void;
}) {
  const set = (i: number, patch: Partial<Constraint>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="flex flex-col gap-2">
      {value.map((c, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(0,2fr)_auto_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2"
        >
          <input
            className="input mono min-w-0"
            aria-label="Метрика"
            value={c.metric}
            onChange={(e) => set(i, { metric: e.target.value })}
            placeholder="file_lines"
          />
          <select
            className="input mono w-auto"
            aria-label="Оператор"
            value={c.operator}
            onChange={(e) => set(i, { operator: e.target.value as Constraint['operator'] })}
          >
            {OPS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          <input
            className="input mono min-w-0"
            aria-label="Значение"
            value={String(c.value)}
            onChange={(e) =>
              set(i, {
                value:
                  e.target.value !== '' && !Number.isNaN(Number(e.target.value))
                    ? Number(e.target.value)
                    : e.target.value,
              })
            }
            placeholder="150"
          />
          <input
            className="input mono min-w-0"
            aria-label="Единица"
            value={c.unit ?? ''}
            onChange={(e) => set(i, { unit: e.target.value || null })}
            placeholder="lines"
          />
          <button
            type="button"
            className="btn-icon"
            aria-label="Удалить ограничение"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm self-start"
        onClick={() => onChange([...value, { metric: '', operator: '<=', value: 0, unit: null }])}
      >
        <Icon name="plus" /> Ограничение
      </button>
    </div>
  );
}

/**
 * Уровень правила: «жёстко» (нарушение = дефект), «по умолчанию» (отступить можно, объяснив), «вкус».
 * В просмотре — шкала из трёх делений в цвете роли карточки (--r) и подпись; в правке — три чипа.
 */
import type { Level } from '../lib/types';

export const LEVELS: Level[] = ['hard', 'default', 'taste'];

export const LEVEL_LABEL: Record<Level, string> = {
  hard: 'жёстко',
  default: 'по умолчанию',
  taste: 'вкус',
};

export const LEVEL_HINT: Record<Level, string> = {
  hard: 'Соблюдать всегда: нарушение — дефект',
  default: 'Соблюдать; агент может отступить, только объяснив почему',
  taste: 'Мягкое предпочтение: учитывать, если нет причин иначе',
};

const BARS: Record<Level, number> = { hard: 3, default: 2, taste: 1 };

export function LevelBadge({ level }: { level: Level }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      aria-label={`Уровень: ${LEVEL_LABEL[level]}`}
    >
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`w-1 rounded-full ${n <= BARS[level] ? 'bg-[var(--r)]' : 'bg-border-strong'}`}
            style={{ height: `${4 + n * 3}px` }}
          />
        ))}
      </span>
      <span className={level === 'hard' ? 'font-semibold text-text-2' : ''}>
        {LEVEL_LABEL[level]}
      </span>
    </span>
  );
}

export function LevelPicker({ value, onChange }: { value: Level; onChange: (l: Level) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Уровень">
      <span className="eyebrow">Уровень</span>
      {LEVELS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          className="chip"
          aria-checked={value === l}
          aria-pressed={value === l}
          title={LEVEL_HINT[l]}
          onClick={() => onChange(l)}
        >
          {LEVEL_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

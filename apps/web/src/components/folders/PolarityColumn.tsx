/** Колонка «Люблю» или «Не люблю»: шапка .pref-col__head в краске полярности и сетка карточек (folders.css). */
import type { Polarity, Preference } from '../../lib/types';
import { Icon } from '../Icon';
import { PreferenceCard } from '../PreferenceCard';

export function PolarityColumn({ polarity, items }: { polarity: Polarity; items: Preference[] }) {
  const title = polarity === 'like' ? 'Люблю' : 'Не люблю';
  return (
    <section className="pref-col" data-role={polarity} aria-label={title}>
      <div className="pref-col__head">
        <Icon name={polarity} className="text-lead text-[var(--r-ink)]" />
        <h2 className="flex-1 text-h3">{title}</h2>
        <span className="mono text-text-2">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="m-0 px-md text-caption text-text-2">Здесь пока ничего</p>
      ) : (
        <div className="pref-col__list">
          {items.map((p, i) => (
            <PreferenceCard key={p.id} p={p} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

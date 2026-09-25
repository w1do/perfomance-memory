/**
 * Поля превью в две колонки (от 768): слева правило, пояснение, полярность, уровень, «почему» и «так / не так»; справа папка с datalist,
 * бейджи «папка есть / будет создана», похожие папки, домен, проект, applies_to, теги. Роли — токены --role-*.
 */
import type { Enrichment, Preview } from '../../lib/types';
import { Badge, PathLabel } from '../Badges';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { LevelPicker } from '../Level';
import { RationaleFields } from '../preference/Rationale';

export type MetaText = { path: string; tags: string; applies: string };

export function PreviewMetaSection({
  e,
  setE,
  meta,
  setMeta,
  paths,
  exists,
  similar,
}: {
  e: Enrichment;
  setE: (e: Enrichment) => void;
  meta: MetaText;
  setMeta: (m: MetaText) => void;
  paths: string[];
  exists: boolean;
  similar: Preview['similar_folders'];
}) {
  const set = (patch: Partial<Enrichment>) => setE({ ...e, ...patch });
  return (
    <>
      <section className="flex min-w-0 flex-col gap-sm">
        <Field label="Правило">
          <input
            className="input text-lead font-semibold"
            value={e.statement}
            onChange={(ev) => set({ statement: ev.target.value })}
          />
        </Field>
        <Field label="Пояснение">
          <textarea
            className="input"
            rows={3}
            value={e.details ?? ''}
            onChange={(ev) => set({ details: ev.target.value })}
          />
        </Field>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Полярность">
          {(['like', 'dislike'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="chip"
              aria-pressed={e.polarity === v}
              onClick={() => set({ polarity: v })}
            >
              <Icon name={v} className={v === 'like' ? 'text-like-ink' : 'text-dislike-ink'} />
              {v === 'like' ? 'Люблю' : 'Не люблю'}
            </button>
          ))}
        </div>
        <LevelPicker value={e.level} onChange={(level) => set({ level })} />
        <RationaleFields value={e} onChange={set} />
      </section>

      <section className="flex min-w-0 flex-col gap-sm">
        <Field label="Папка">
          <input
            className="input mono"
            list="pm-folder-paths"
            value={meta.path}
            onChange={(ev) => setMeta({ ...meta, path: ev.target.value })}
          />
          <datalist id="pm-folder-paths">
            {paths.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <div className="flex flex-wrap items-center gap-2 text-caption">
          {exists ? (
            <Badge role="service">папка есть</Badge>
          ) : (
            <Badge role="enrich">будет создана</Badge>
          )}
          {similar.map((f) => (
            <button
              key={f.path.join('/')}
              type="button"
              className="chip"
              onClick={() => setMeta({ ...meta, path: f.path.join(' / ') })}
            >
              <PathLabel path={f.path} />
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-sm">
          <Field label="Домен">
            <input
              className="input mono"
              value={e.domain}
              onChange={(ev) => set({ domain: ev.target.value })}
            />
          </Field>
          <Field label="Проект">
            <input
              className="input"
              value={e.project ?? ''}
              onChange={(ev) => set({ project: ev.target.value })}
            />
          </Field>
        </div>
        <Field label="К чему относится">
          <input
            className="input mono"
            value={meta.applies}
            onChange={(ev) => setMeta({ ...meta, applies: ev.target.value })}
          />
        </Field>
        <Field label="Теги через запятую">
          <input
            className="input"
            value={meta.tags}
            onChange={(ev) => setMeta({ ...meta, tags: ev.target.value })}
          />
        </Field>
      </section>
    </>
  );
}

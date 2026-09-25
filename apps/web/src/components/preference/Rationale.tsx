/**
 * «Почему» и пример «так / не так»: просмотр в карточке (только заполненное) и поля правки.
 * Модель заполняет их только со слов пользователя, поэтому чаще всего они пусты — и не показываются.
 */
import type { Rationale } from '../../lib/types';
import { Field } from '../Field';

export function RationaleView({ r }: { r: Rationale }) {
  if (!r.why && !r.example_good && !r.example_bad) return null;
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px] leading-relaxed">
      {r.why && (
        <>
          <dt className="eyebrow pt-0.5">почему</dt>
          <dd className="m-0 text-text-2">{r.why}</dd>
        </>
      )}
      {r.example_good && (
        <>
          <dt className="eyebrow pt-0.5 text-like-ink">так</dt>
          <dd className="m-0 text-text-2">{r.example_good}</dd>
        </>
      )}
      {r.example_bad && (
        <>
          <dt className="eyebrow pt-0.5 text-dislike-ink">не так</dt>
          <dd className="m-0 text-text-2">{r.example_bad}</dd>
        </>
      )}
    </dl>
  );
}

export function RationaleFields({
  value,
  onChange,
}: {
  value: Rationale;
  onChange: (patch: Partial<Rationale>) => void;
}) {
  return (
    <>
      <Field label="Почему" hint="Причина своими словами — агент поймёт, где правило важно">
        <textarea
          className="input"
          rows={2}
          value={value.why ?? ''}
          onChange={(e) => onChange({ why: e.target.value })}
        />
      </Field>
      <div className="grid gap-sm md:grid-cols-2">
        <Field label="Так">
          <input
            className="input"
            value={value.example_good ?? ''}
            onChange={(e) => onChange({ example_good: e.target.value })}
          />
        </Field>
        <Field label="Не так">
          <input
            className="input"
            value={value.example_bad ?? ''}
            onChange={(e) => onChange({ example_bad: e.target.value })}
          />
        </Field>
      </div>
    </>
  );
}

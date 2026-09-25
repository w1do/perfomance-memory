/** Редактор правила на месте карточки: Card opaque в краске полярности, поля Field, «Сохранить» / «Отмена». */
import { useState } from 'react';
import { api } from '../../lib/api';
import type { Constraint, Polarity, Preference } from '../../lib/types';
import { StrengthDots } from '../Badges';
import { ConstraintEditor } from '../ConstraintEditor';
import { Field, splitList, splitPath } from '../Field';
import { useToast } from '../Toasts';
import { Card } from '../ui/Card';

export function PreferenceEditor({ p, onDone }: { p: Preference; onDone: () => void }) {
  const toast = useToast();
  const [statement, setStatement] = useState(p.statement);
  const [details, setDetails] = useState(p.details ?? '');
  const [polarity, setPolarity] = useState<Polarity>(p.polarity);
  const [path, setPath] = useState(p.folder_path.join(' / '));
  const [tags, setTags] = useState(p.tags.join(', '));
  const [applies, setApplies] = useState(p.applies_to.join(', '));
  const [constraints, setConstraints] = useState<Constraint[]>(p.constraints);
  const [strength, setStrength] = useState(p.strength);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const folder_path = splitPath(path);
      await api.update(p.id, {
        statement,
        details: details.trim() || null,
        polarity,
        ...(folder_path.join('/') !== p.folder_path.join('/') ? { folder_path } : {}),
        tags: splitList(tags),
        applies_to: splitList(applies),
        constraints: constraints.filter((c) => c.metric.trim()),
        strength,
      });
      toast('Правило обновлено, векторы пересчитаны');
      onDone();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      as="article"
      variant="opaque"
      tone={polarity}
      reveal={false}
      lift={false}
      className="flex flex-col gap-sm"
      aria-label="Редактирование правила"
    >
      <Field label="Правило">
        <input className="input" value={statement} onChange={(e) => setStatement(e.target.value)} />
      </Field>
      <Field label="Пояснение">
        <textarea
          className="input"
          rows={2}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      </Field>
      <div className="flex gap-2" role="group" aria-label="Полярность">
        {(['like', 'dislike'] as const).map((v) => (
          <button
            key={v}
            type="button"
            className="chip"
            aria-pressed={polarity === v}
            onClick={() => setPolarity(v)}
          >
            {v === 'like' ? 'Люблю' : 'Не люблю'}
          </button>
        ))}
      </div>
      <Field label="Папка" hint="Путь через «/»; новой папки ещё нет — она будет создана">
        <input className="input mono" value={path} onChange={(e) => setPath(e.target.value)} />
      </Field>
      <Field label="Теги через запятую">
        <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <Field label="К чему относится">
        <input
          className="input mono"
          value={applies}
          onChange={(e) => setApplies(e.target.value)}
        />
      </Field>
      <span className="eyebrow">Ограничения</span>
      <ConstraintEditor value={constraints} onChange={setConstraints} />
      <div className="flex items-center gap-3">
        <span className="eyebrow">Сила</span>
        <StrengthDots value={strength} onChange={setStrength} />
      </div>
      <div className="card-foot">
        <button className="btn btn-primary" onClick={save} disabled={busy || !statement.trim()}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button className="btn btn-ghost" onClick={onDone}>
          Отмена
        </button>
      </div>
    </Card>
  );
}

/** Секция модалки превью на всю ширину: распознанный текст (правится) и «Разобрать заново» (плашка surface-2). */
import { Field } from '../Field';
import { Icon } from '../Icon';

export function PreviewTextSection({
  source,
  text,
  onText,
  onRedo,
  busy,
}: {
  source: 'voice' | 'text';
  text: string;
  onText: (v: string) => void;
  onRedo: () => void;
  busy: 'save' | 'redo' | null;
}) {
  return (
    <section className="flex flex-col gap-sm rounded-sm border border-border bg-surface-2 p-sm md:col-span-2 md:p-md">
      <Field
        label={source === 'voice' ? 'Распознанный текст (можно поправить)' : 'Текст'}
        hint="Поправили текст — нажмите «Разобрать заново», чтобы обновить поля ниже"
      >
        <textarea
          className="input"
          rows={2}
          value={text}
          onChange={(ev) => onText(ev.target.value)}
        />
      </Field>
      <button
        type="button"
        className="btn btn-ghost btn-sm self-start"
        onClick={onRedo}
        disabled={busy !== null || !text.trim()}
      >
        <Icon name="ai" className="text-ai-ink" />{' '}
        {busy === 'redo' ? 'Разбираю…' : 'Разобрать заново'}
      </button>
    </section>
  );
}

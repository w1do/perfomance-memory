/** Предпросмотр пакета: шапка, счётчики, дерево с галочками и формулировки правил с пометками дублей. */
import type { ImportNode, ImportPreview } from '../../lib/schemaTypes';
import { CheckTree, type CheckNode } from './CheckTree';

interface Props {
  preview: ImportPreview;
  all: boolean;
  onAll: (value: boolean) => void;
  checked: Set<string>;
  onToggle: (key: string) => void;
}

const STATUS_LABEL = { new: '', duplicate: 'дубль', conflict: 'противоречит вашему' } as const;

const toCheck = (nodes: ImportNode[]): CheckNode[] =>
  nodes.map((n) => ({
    key: n.key,
    name: n.name,
    meta: `${n.total}${n.skipped ? ` · пропуск ${n.skipped}` : ''}${n.exists ? '' : ' · новая'}`,
    children: toCheck(n.children),
    detail: n.items.length ? (
      <ul className="flex flex-col gap-1 py-1 ps-6">
        {n.items.map((it, i) => (
          <li key={i} className="text-caption">
            <span className={it.polarity === 'like' ? 'text-like-ink' : 'text-dislike-ink'}>
              {it.statement}
            </span>
            {it.status !== 'new' && (
              <span className="ms-2 text-muted">{STATUS_LABEL[it.status]}</span>
            )}
          </li>
        ))}
      </ul>
    ) : undefined,
  }));

export function ImportPreviewBody({ preview, all, onAll, checked, onToggle }: Props) {
  const c = preview.counts;
  const h = preview.header;
  return (
    <div className="flex flex-col gap-md">
      <div>
        <div className="text-h3 break-words">{h.name}</div>
        {h.author && <div className="text-caption text-text-2">Автор: {h.author}</div>}
        {h.description && <p className="mt-1 break-words">{h.description}</p>}
      </div>
      <p className="text-caption text-text-2 mono">
        Папок: {c.folders} (новых {c.new_folders}) · Правил: {c.rules} · Дословных дублей:{' '}
        {c.duplicates} · Противоречат вашим: {c.conflicts} · Ошибок: {c.invalid}
      </p>
      <p className="text-caption text-text-2">
        Правила из файла попадут в контекст ваших агентов. Просмотрите формулировки перед
        применением. Похожие по смыслу дубли проверятся при применении.
      </p>
      {preview.errors.length > 0 && (
        <ul className="flex flex-col gap-1 text-caption text-danger">
          {preview.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={all} onChange={() => onAll(!all)} />
        <span>Весь пакет</span>
      </label>
      <CheckTree
        nodes={toCheck(preview.tree)}
        checked={checked}
        implied={all}
        onToggle={onToggle}
      />
    </div>
  );
}

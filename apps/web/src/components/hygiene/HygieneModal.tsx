/**
 * «Гигиена памяти»: поиск старых дублей (формулировки похожи → модель подтверждает) и их слияние по группам.
 * Поиск идёт при открытии и может занять до минуты; решённые группы исчезают из списка.
 */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { DuplicateGroup } from '../../lib/types';
import { Modal } from '../Modal';
import { useToast } from '../Toasts';
import { DuplicateGroupCard } from './DuplicateGroupCard';

export function HygieneModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .duplicates()
      .then((r) => setGroups(r.groups))
      .catch((e: Error) => setError(e.message));
  }, []);

  const done = (key: string) => setGroups((g) => (g ?? []).filter((x) => x.keep !== key));
  const run = async (key: string, action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      done(key);
      toast(message);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Дубли в памяти" eyebrow="Гигиена" size="lg" onClose={onClose}>
      {error ? (
        <p className="m-0 text-dislike-ink">{error}</p>
      ) : groups === null ? (
        <p className="m-0 text-text-2" role="status">
          Ищу похожие правила и сверяю их моделью — до минуты…
        </p>
      ) : groups.length === 0 ? (
        <p className="m-0 text-text-2" role="status">
          Дублей не найдено — каждое правило записано один раз.
        </p>
      ) : (
        <div className="flex flex-col gap-md">
          <p className="m-0 text-text-2">
            Групп: {groups.length}. Слитые правила сохраняются в истории оставшегося; теги, цели и
            ограничения объединяются, уровень берётся строже.
          </p>
          {groups.map((g) => (
            <DuplicateGroupCard
              key={g.keep}
              group={g}
              busy={busy}
              onMerge={(keep, remove) =>
                run(g.keep, () => api.merge(keep, remove), 'Слито в одно правило')
              }
              onDistinct={(ids) =>
                run(g.keep, () => api.distinct(ids), 'Запомнил: это разные правила')
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

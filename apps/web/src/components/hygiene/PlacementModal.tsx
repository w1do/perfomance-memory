/**
 * «Распределить»: общие правила заново проходят выбор папки, как при сохранении. Список показывает, что куда
 * переедет (и смену области); переносятся только отмеченные, опустевшие папки удаляются. Правила проектов не трогаются.
 */
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Placement } from '../../lib/types';
import { PathLabel } from '../Badges';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { useToast } from '../Toasts';

export function PlacementModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<Placement[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .placements()
      .then((r) => {
        setPlan(r.placements);
        setPicked(new Set(r.placements.map((p) => p.id)));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    const moves = (plan ?? [])
      .filter((p) => picked.has(p.id))
      .map((p) => ({ id: p.id, to: p.to, domain: p.domain_to }));
    setBusy(true);
    try {
      const r = await api.place(moves);
      toast(`Перенесено правил: ${r.moved}, удалено пустых папок: ${r.folders_removed}`);
      onClose();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const footer = plan?.length ? (
    <button
      type="button"
      className="btn btn-primary"
      disabled={busy || picked.size === 0}
      onClick={() => void apply()}
    >
      <Icon name="check" /> Перенести выбранные ({picked.size})
    </button>
  ) : null;

  return (
    <Modal
      title="Распределить по папкам"
      eyebrow="Гигиена"
      size="lg"
      onClose={onClose}
      footer={footer}
    >
      {error ? (
        <p className="m-0 text-dislike-ink">{error}</p>
      ) : plan === null ? (
        <p className="m-0 text-text-2" role="status">
          Прохожу по общим правилам и заново выбираю для каждого папку — до пары минут…
        </p>
      ) : plan.length === 0 ? (
        <p className="m-0 text-text-2" role="status">
          Все общие правила на своих местах — переносить нечего.
        </p>
      ) : (
        <div className="flex flex-col gap-sm">
          <p className="m-0 text-text-2">
            Переносов: {plan.length}. Снимите отметку с тех, что оставить на месте; правила проектов
            не трогаются.
          </p>
          {plan.map((p) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-2 ${picked.has(p.id) ? 'border-accent bg-surface' : 'border-border bg-surface-2'}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={picked.has(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold break-words">{p.statement}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                  <PathLabel path={p.from} className="text-caption" />
                  <Icon name="chevron-right" />
                  <PathLabel path={p.to} className="text-caption text-text" />
                </span>
                {p.domain_from !== p.domain_to && (
                  <span className="text-caption text-muted">
                    область: {p.domain_from} → {p.domain_to}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

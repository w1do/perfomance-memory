/**
 * «Как пользоваться»: три шага, которые отмечаются сами (статистика, pm.visited.folders,
 * pm.mcp.copied). Card роли net, 3D лампочка → трофей, когда всё пройдено. Скрывается useHints.
 */
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { useHints } from '../../hooks/useHints';
import { api } from '../../lib/api';
import { emit, FOCUS_MIC_EVENT, MCP_OPEN_EVENT } from '../../lib/events';
import { usePref } from '../../lib/prefs';
import { Icon } from '../Icon';
import { Card } from '../ui/Card';

type Step = { text: string; done: boolean; action?: { label: string; run: () => void } };

export function HowToCard({ className = '', index = 3 }: { className?: string; index?: number }) {
  const { data: stats } = useAsync(api.stats, []);
  const visited = usePref('pm.visited.folders') === '1';
  const copied = usePref('pm.mcp.copied') === '1';
  const { hide } = useHints();
  const [open, setOpen] = useState(false);

  const steps: Step[] = [
    {
      text: 'Нажмите микрофон и скажите одну мысль — или напишите её',
      done: (stats?.total ?? 0) > 0,
      action: { label: 'К микрофону', run: () => emit(FOCUS_MIC_EVENT) },
    },
    { text: 'Откройте «Папки» — правила разложены по темам', done: visited },
    {
      text: 'Скопируйте адрес MCP сверху и подключите агента',
      done: copied,
      action: { label: 'К подключению ↑', run: () => emit(MCP_OPEN_EVENT) },
    },
  ];
  const allDone = steps.every((s) => s.done);

  return (
    <Card
      tone="net"
      icon3d={allDone ? 'stats' : 'tips'}
      icon3dSize="md"
      index={index}
      lift
      className={`flex flex-col ${className}`}
      aria-labelledby="howto-title"
    >
      <div className="card-head mb-sm">
        <div className="eyebrow">Как пользоваться</div>
        <h2 id="howto-title" className="text-h3">
          Три шага до <em className="text-accent not-italic">памяти</em>
        </h2>
      </div>
      {allDone ? (
        <p className="m-0 flex items-center gap-2 text-text-2">
          <Icon name="check" className="text-service-ink" />
          Всё готово: память наполняется, агент подключён
        </p>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm self-start md:hidden"
            aria-expanded={open}
            aria-controls="howto-steps"
            onClick={() => setOpen(!open)}
          >
            Как пользоваться ▾
          </button>
          <div id="howto-steps" className="collapse md:grid-rows-[1fr]" data-open={open}>
            <ol className="m-0 flex list-none flex-col gap-sm p-0 max-md:pt-sm">
              {steps.map((s, i) => (
                <li key={s.text} className="flex items-start gap-3">
                  <span className="mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-net-soft text-net-ink">
                    {s.done ? <Icon name="check" className="text-service-ink" /> : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className={s.done ? 'text-text-2' : 'text-text'}>{s.text}</span>
                    {s.action && !s.done && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={s.action.run}>
                        {s.action.label}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      <div className="card-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={hide}>
          Скрыть подсказки
        </button>
      </div>
    </Card>
  );
}
